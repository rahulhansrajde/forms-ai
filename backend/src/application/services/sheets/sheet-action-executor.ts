import { SHEET_LIMITS, type CreateSpreadsheetOperation, type SheetOperation, type SheetTableView } from '@forms-ai/contracts';
import type { SheetAction } from '../../../domain/entities/sheet-action.js';
import { Spreadsheet, type SpreadsheetTab } from '../../../domain/entities/spreadsheet.js';
import type { SheetActionRepository, SpreadsheetRepository } from '../../../domain/interfaces/repositories.js';
import type { SheetsGateway, SpreadsheetTabSnapshot, StructuralChange } from '../../../domain/interfaces/sheets.js';
import type { Clock, IdentifierGenerator, TransactionRunner } from '../../../domain/interfaces/system.js';
import type { ExecutionStep, SheetOperationResolver } from '../../../domain/services/sheet-operation-resolver.js';
import { NotFoundError, ValidationError } from '../../../shared/errors/application-errors.js';
import type { SpreadsheetReferenceParser } from '../../../domain/services/spreadsheet-reference-parser.js';
import type { SheetActionVerifier, WrittenRange } from './sheet-action-verifier.js';
import type { SpreadsheetAccessChecker } from './spreadsheet-access-checker.js';
import type { SpreadsheetInspector } from './spreadsheet-inspector.js';

export interface SheetExecutionOutcome {
  action: SheetAction;
  spreadsheet: Spreadsheet;
  table: SheetTableView | null;
}

interface RunState {
  googleSpreadsheetId: string;
  tabs: SpreadsheetTabSnapshot[];
  pending: StructuralChange[];
  writes: WrittenRange[];
  table: SheetTableView | null;
  inspect: boolean;
}

const POSITION_SHIFTING_OPERATIONS = new Set<SheetOperation['type']>(['CLEAR_RANGE', 'INSERT_ROWS', 'INSERT_COLUMNS', 'DELETE_ROWS', 'DELETE_COLUMNS']);

export class SheetActionExecutor {
  constructor(
    private readonly gateway: SheetsGateway,
    private readonly resolver: SheetOperationResolver,
    private readonly inspector: SpreadsheetInspector,
    private readonly verifier: SheetActionVerifier,
    private readonly spreadsheets: SpreadsheetRepository,
    private readonly actions: SheetActionRepository,
    private readonly transactions: TransactionRunner,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
    private readonly access: SpreadsheetAccessChecker,
    private readonly references: SpreadsheetReferenceParser,
  ) {}

  async execute(accessToken: string, action: SheetAction): Promise<SheetExecutionOutcome> {
    if (action.kind === 'LINK') {
      return this.link(accessToken, action);
    }
    const { action: current, spreadsheet } = action.kind === 'CREATE' ? await this.ensureCreated(accessToken, action) : await this.loadTarget(action);
    const operations = this.executableOperations(current.operations);
    const state: RunState = {
      googleSpreadsheetId: spreadsheet.googleSpreadsheetId,
      tabs: (await this.gateway.getSpreadsheet(accessToken, spreadsheet.googleSpreadsheetId)).tabs,
      pending: [],
      writes: [],
      table: null,
      inspect: false,
    };
    for (const operation of operations) {
      await this.run(accessToken, operation, state);
    }
    await this.flush(accessToken, state);
    const inspected = await this.inspector.inspect(accessToken, spreadsheet.googleSpreadsheetId);
    await this.verifier.verify(accessToken, spreadsheet.googleSpreadsheetId, current.operations, inspected, state.writes);
    const synchronized = spreadsheet.synchronize(inspected.snapshot.title, inspected.snapshot.url, inspected.tabs, this.clock.now());
    await this.spreadsheets.update(synchronized);
    return { action: current, spreadsheet: synchronized, table: state.inspect ? this.structureTable(inspected.tabs) : state.table };
  }

  private async run(accessToken: string, operation: SheetOperation, state: RunState): Promise<void> {
    if (POSITION_SHIFTING_OPERATIONS.has(operation.type)) {
      state.writes = [];
    }
    for (const step of this.resolver.resolve(operation, state.tabs)) {
      if (step.kind === 'STRUCTURE') {
        state.pending.push(step.change);
      } else {
        await this.flush(accessToken, state);
        await this.perform(accessToken, step, state);
      }
    }
    if (this.resolver.changesTabs(operation)) {
      await this.flush(accessToken, state);
      state.tabs = (await this.gateway.getSpreadsheet(accessToken, state.googleSpreadsheetId)).tabs;
    }
  }

  private async perform(accessToken: string, step: Exclude<ExecutionStep, { kind: 'STRUCTURE' }>, state: RunState): Promise<void> {
    const id = state.googleSpreadsheetId;
    switch (step.kind) {
      case 'WRITE':
        await this.gateway.writeValues(accessToken, id, step.range, step.values, step.mode);
        if (step.mode === 'RAW') {
          state.writes.push({ range: step.range, values: step.values });
        }
        return;
      case 'APPEND':
        await this.gateway.appendValues(accessToken, id, step.range, step.values);
        return;
      case 'CLEAR':
        await this.gateway.clearValues(accessToken, id, step.range);
        return;
      case 'READ':
        state.table = this.boundedTable(step.range, await this.gateway.readValues(accessToken, id, step.range));
        return;
      case 'INSPECT':
        state.inspect = true;
        return;
    }
  }

  private async flush(accessToken: string, state: RunState): Promise<void> {
    if (state.pending.length === 0) {
      return;
    }
    const changes = state.pending;
    state.pending = [];
    await this.gateway.applyStructuralChanges(accessToken, state.googleSpreadsheetId, changes);
  }

  private async ensureCreated(accessToken: string, action: SheetAction): Promise<{ action: SheetAction; spreadsheet: Spreadsheet }> {
    if (action.spreadsheetId) {
      return this.loadTarget(action);
    }
    const creation = this.creation(action.operations);
    const snapshot = await this.gateway.createSpreadsheet(
      accessToken,
      creation.title,
      creation.tabs.map((tab) => tab.title),
    );
    const now = this.clock.now();
    const spreadsheet = Spreadsheet.register(
      {
        id: this.identifiers.generate(),
        userId: action.userId,
        conversationId: action.conversationId,
        googleSpreadsheetId: snapshot.spreadsheetId,
        url: snapshot.url,
        title: snapshot.title,
        tabs: snapshot.tabs.map((tab): SpreadsheetTab => ({ ...tab, headers: [] })),
      },
      now,
    );
    const attached = action.attachSpreadsheet(spreadsheet.id, now);
    await this.transactions.runInTransaction(async () => {
      await this.spreadsheets.insert(spreadsheet);
      await this.actions.update(attached);
    });
    return { action: attached, spreadsheet };
  }

  private async link(accessToken: string, action: SheetAction): Promise<SheetExecutionOutcome> {
    const target = action.linkTarget();
    if (!target || !this.references.isValidId(target.spreadsheetId)) {
      throw new ValidationError('This action does not describe a Google Sheet to connect.');
    }
    const inspected = await this.access.open(accessToken, target.spreadsheetId);
    const googleSpreadsheetId = inspected.snapshot.spreadsheetId;
    const url = this.references.canonicalUrl(googleSpreadsheetId);
    const now = this.clock.now();
    const existing = await this.spreadsheets.findInConversation(action.conversationId, googleSpreadsheetId);
    const spreadsheet = existing
      ? existing.synchronize(inspected.snapshot.title, url, inspected.tabs, now).activate(now)
      : Spreadsheet.link(
          {
            id: this.identifiers.generate(),
            userId: action.userId,
            conversationId: action.conversationId,
            googleSpreadsheetId,
            url,
            title: inspected.snapshot.title,
            tabs: inspected.tabs,
          },
          now,
        );
    const attached = action.attachSpreadsheet(spreadsheet.id, now);
    await this.transactions.runInTransaction(async () => {
      await (existing ? this.spreadsheets.update(spreadsheet) : this.spreadsheets.insert(spreadsheet));
      await this.actions.update(attached);
    });
    return { action: attached, spreadsheet, table: null };
  }

  private async loadTarget(action: SheetAction): Promise<{ action: SheetAction; spreadsheet: Spreadsheet }> {
    const spreadsheet = action.spreadsheetId ? await this.spreadsheets.findOwned(action.spreadsheetId, action.userId) : null;
    if (!spreadsheet) {
      throw new NotFoundError('The Google Sheet for this action');
    }
    return { action, spreadsheet };
  }

  private creation(operations: readonly SheetOperation[]): CreateSpreadsheetOperation {
    const creation = operations.find((operation): operation is CreateSpreadsheetOperation => operation.type === 'CREATE_SPREADSHEET');
    if (!creation) {
      throw new ValidationError('This action does not describe a spreadsheet to create.');
    }
    return creation;
  }

  private executableOperations(operations: readonly SheetOperation[]): SheetOperation[] {
    return operations.flatMap((operation): SheetOperation[] => {
      if (operation.type !== 'CREATE_SPREADSHEET') {
        return [operation];
      }
      return operation.tabs.flatMap((tab): SheetOperation[] => [
        ...(tab.headers?.length ? [{ type: 'SET_HEADER_ROW' as const, sheet: tab.title, headers: tab.headers }] : []),
        ...(tab.rows?.length ? [{ type: 'APPEND_ROWS' as const, sheet: tab.title, values: tab.rows }] : []),
      ]);
    });
  }

  private boundedTable(range: string, values: string[][]): SheetTableView {
    const rows = values.slice(0, SHEET_LIMITS.maxReadRows).map((row) => row.slice(0, SHEET_LIMITS.maxReadColumns));
    const widest = Math.max(0, ...values.map((row) => row.length));
    return {
      range,
      values: rows,
      totalRows: values.length,
      truncated: values.length > SHEET_LIMITS.maxReadRows || widest > SHEET_LIMITS.maxReadColumns,
    };
  }

  private structureTable(tabs: readonly SpreadsheetTab[]): SheetTableView {
    return {
      range: 'Spreadsheet structure',
      values: [['Tab', 'Rows', 'Columns', 'Header row'], ...tabs.map((tab) => [tab.title, String(tab.rowCount), String(tab.columnCount), tab.headers.join(', ')])],
      totalRows: tabs.length + 1,
      truncated: false,
    };
  }
}
