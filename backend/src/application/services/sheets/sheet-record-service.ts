import type { ChatIntent, ResolvedRecordChange, UpdateRecordOperation } from '@forms-ai/contracts';
import { SheetRecordContext, type RememberedRecord } from '../../../domain/entities/sheet-record-context.js';
import type { Spreadsheet } from '../../../domain/entities/spreadsheet.js';
import type { SheetRecordContextRepository } from '../../../domain/interfaces/repositories.js';
import type { SheetsGateway, SpreadsheetTabSnapshot } from '../../../domain/interfaces/sheets.js';
import type { Clock } from '../../../domain/interfaces/system.js';
import type { A1Notation } from '../../../domain/services/a1-notation.js';
import type { HeaderMatcher } from '../../../domain/services/header-matcher.js';
import type { IdentifierStatement, RecordRequest, RecordRequestParser } from '../../../domain/services/record-request-parser.js';
import type { RecordLocation, RecordLookup, SheetGrid, SheetRecordLocator } from '../../../domain/services/sheet-record-locator.js';
import type { TextNormalizer } from '../../../domain/services/text-normalizer.js';
import { GoogleOAuthError, GoogleSheetsError, ValidationError } from '../../../shared/errors/application-errors.js';
import type { ChatTurnContext } from '../chat/chat-turn-context.js';
import type { GoogleCredentialService } from '../google/google-credential-service.js';
import type { SheetGridReader } from './sheet-grid-reader.js';

export type RecordPreparation = { kind: 'reply'; intent: ChatIntent; text: string } | { kind: 'ready'; operation: UpdateRecordOperation; note: string };

export interface RecordWrite {
  range: string;
  value: string;
}

export interface SheetRecordCollaborators {
  gateway: SheetsGateway;
  credentials: GoogleCredentialService;
  grids: SheetGridReader;
  parser: RecordRequestParser;
  locator: SheetRecordLocator;
  headers: HeaderMatcher;
  text: TextNormalizer;
  notation: A1Notation;
  contexts: SheetRecordContextRepository;
  clock: Clock;
}

interface OpenSpreadsheet {
  accessToken: string;
  tabs: SpreadsheetTabSnapshot[];
}

interface SearchResult {
  tab: string;
  grid: SheetGrid;
  location: RecordLocation;
}

const MAX_SEARCHED_TABS = 10;
const NEEDS_ACCESS =
  'To look up records, Forms AI needs your Google account with Google Sheets access. Open Settings → Google, allow Google Sheets, then ask again.';
const NOUN_STOP_WORDS = new Set(['id', 'name', 'number', 'no', 'code', 'email', 'mail', 'full', 'first', 'last', 'roll', 'e']);

function quoted(text: string): string {
  return `“${text}”`;
}

function clarify(text: string): RecordPreparation {
  return { kind: 'reply', intent: 'CLARIFICATION_REQUIRED', text };
}

export class SheetRecordService {
  constructor(private readonly collaborators: SheetRecordCollaborators) {}

  async prepareFromMessage(message: string, context: ChatTurnContext): Promise<RecordPreparation | null> {
    const spreadsheet = context.spreadsheet;
    if (!spreadsheet) {
      return null;
    }
    const { parser } = this.collaborators;
    const state = this.stateFor(context, spreadsheet);
    const headers = this.knownHeaders(spreadsheet);
    const identifier = parser.parseIdentifier(message, headers);
    if (identifier && state.pending) {
      const request: RecordRequest = { ...state.pending.request, subject: this.subjectOf(identifier) };
      return this.resolve(context, spreadsheet, request, state, state.pending.verifyName ? state.pending.label : null);
    }
    if (identifier && state.subject) {
      return this.confirmIdentity(context, spreadsheet, identifier, state, state.subject);
    }
    const request = parser.parse(message, headers);
    return request ? this.resolve(context, spreadsheet, request, state, null) : null;
  }

  async prepareOperation(operation: UpdateRecordOperation, context: ChatTurnContext): Promise<RecordPreparation> {
    const spreadsheet = context.spreadsheet;
    if (!spreadsheet) {
      return clarify('Connect or create a Google Sheet in this chat first.');
    }
    const request: RecordRequest = {
      ...(operation.sheet ? { sheet: operation.sheet } : {}),
      subject: this.collaborators.parser.subjectFor(operation.match.value, operation.match.column),
      changes: operation.changes.map((change) => ({ column: change.column, value: change.value, ...(change.from ? { from: change.from } : {}) })),
    };
    return this.resolve(context, spreadsheet, request, this.stateFor(context, spreadsheet), null);
  }

  async locateForWrite(accessToken: string, spreadsheetId: string, tabs: readonly SpreadsheetTabSnapshot[], operation: UpdateRecordOperation): Promise<RecordWrite[]> {
    const { grids, locator, headers, text, notation } = this.collaborators;
    const target = operation.target;
    if (!target) {
      throw new ValidationError('This record update was not prepared from the spreadsheet data, so it was not applied.');
    }
    const tab = this.findTab(tabs, operation.sheet);
    if (!tab) {
      throw new ValidationError(`The ${quoted(operation.sheet ?? 'first')} tab no longer exists, so ${target.label}'s record was not updated.`);
    }
    const grid = await grids.read(accessToken, spreadsheetId, tab);
    const location = locator.locate(grid, { ...(operation.match.column ? { column: operation.match.column } : {}), value: operation.match.value });
    if (location.kind !== 'FOUND' || !location.exact) {
      throw new ValidationError(`${target.label}'s record could not be found in ${quoted(tab.title)} any more, so it was not updated. Ask again to prepare a new update.`);
    }
    return target.changes.map((change) => {
      const column = headers.find(grid.headers, change.column);
      if (column === null) {
        throw new ValidationError(`The ${quoted(change.column)} column no longer exists in ${quoted(tab.title)}, so ${target.label}'s record was not updated.`);
      }
      const current = (location.record[column] ?? '').trim();
      if (text.comparable(current) !== text.comparable(change.from)) {
        throw new ValidationError(
          `${target.label}'s ${change.column} changed in Google Sheets since this update was prepared (it is now ${quoted(current || 'empty')}), so it was not updated. Ask again to prepare a new update.`,
        );
      }
      return { range: notation.qualify(tab.title, `${notation.columnLetters(column)}${location.row}`), value: change.to };
    });
  }

  private async resolve(
    context: ChatTurnContext,
    spreadsheet: Spreadsheet,
    request: RecordRequest,
    state: SheetRecordContext,
    expectedLabel: string | null,
  ): Promise<RecordPreparation> {
    const subject = this.lookupFor(request, state);
    if ('reply' in subject) {
      return subject.reply;
    }
    const opened = await this.open(context.userId, spreadsheet);
    if ('reply' in opened) {
      return opened.reply;
    }
    const search = await this.search(opened, spreadsheet, subject.lookup, request.sheet ?? subject.tab, request.changes.map((change) => change.column));
    if (!search) {
      return clarify(`${quoted(spreadsheet.title)} has no tabs to search.`);
    }
    const { tab, grid, location } = search;
    switch (location.kind) {
      case 'UNKNOWN_COLUMN':
        return clarify(this.unknownColumn(location.column, tab, grid.headers));
      case 'AMBIGUOUS':
        await this.awaitIdentifier(state, request, subject.display, grid, location.column);
        return clarify(this.ambiguous(location.rows.length, subject.display, tab, grid, location.column));
      case 'NOT_FOUND':
        await this.awaitIdentifier(state, request, subject.display, grid, location.column);
        return clarify(this.notFound(subject.lookup, subject.display, tab, grid, location.column));
      case 'FOUND':
        return this.prepareUpdate(request, state, search, location, subject.display, expectedLabel);
    }
  }

  private async prepareUpdate(
    request: RecordRequest,
    state: SheetRecordContext,
    search: SearchResult,
    location: Extract<RecordLocation, { kind: 'FOUND' }>,
    display: string,
    expectedLabel: string | null,
  ): Promise<RecordPreparation> {
    const { locator, headers, text, contexts, clock } = this.collaborators;
    const { tab, grid } = search;
    const label = locator.label(grid, location.record, display);
    if (expectedLabel && !this.sameEntity(grid, location.record, expectedLabel)) {
      return clarify(`In ${quoted(tab)}, ${this.lookupText(location, grid, display)} belongs to ${label}, not ${expectedLabel}. Please check it and try again.`);
    }
    const remembered = this.remember(tab, grid, location, label);
    await contexts.save(state.remember(remembered, clock.now()));
    const changes: ResolvedRecordChange[] = [];
    const unchanged: string[] = [];
    const notes: string[] = [];
    for (const change of request.changes) {
      const column = headers.find(grid.headers, change.column);
      if (column === null) {
        return clarify(this.unknownColumn(change.column, tab, grid.headers));
      }
      const header = grid.headers[column]!;
      const current = (location.record[column] ?? '').trim();
      if (change.value === null) {
        return clarify(`What should ${label}'s ${header} be? It is currently ${current ? quoted(current) : 'empty'}.`);
      }
      if (text.comparable(current) === text.comparable(change.value)) {
        unchanged.push(`${label}'s ${header} is already ${quoted(current)}.`);
        continue;
      }
      if (change.from !== undefined && text.comparable(change.from) !== text.comparable(current)) {
        notes.push(`${label}'s ${header} is currently ${quoted(current || 'empty')}, not ${quoted(change.from)}.`);
      }
      changes.push({ column: header, from: current, to: change.value });
    }
    if (changes.length === 0) {
      return { kind: 'reply', intent: 'MODIFY_SHEET', text: `${unchanged.join(' ')} Nothing needs to change.` };
    }
    const identity = this.identitySentence(location, grid, display, label);
    const matched = location.exact ? null : `I matched ${quoted(display)} to ${quoted((location.record[location.column ?? 0] ?? '').trim())}.`;
    return {
      kind: 'ready',
      operation: {
        type: 'UPDATE_RECORD',
        sheet: tab,
        match: { column: remembered.column, value: remembered.value },
        changes: changes.map((change) => ({ column: change.column, value: change.to, from: change.from })),
        target: { row: location.row, label, changes },
      },
      note: [identity, matched, 'I found the record and prepared the update.', ...notes, ...unchanged].filter((part): part is string => Boolean(part)).join(' '),
    };
  }

  private async confirmIdentity(
    context: ChatTurnContext,
    spreadsheet: Spreadsheet,
    identifier: IdentifierStatement,
    state: SheetRecordContext,
    subject: RememberedRecord,
  ): Promise<RecordPreparation> {
    const opened = await this.open(context.userId, spreadsheet);
    if ('reply' in opened) {
      return opened.reply;
    }
    const lookup: RecordLookup = identifier.kind === 'ROW' ? { row: identifier.row } : { column: identifier.column, value: identifier.value };
    const search = await this.search(opened, spreadsheet, lookup, subject.tab, []);
    if (!search) {
      return clarify(`${quoted(spreadsheet.title)} has no tabs to search.`);
    }
    const { tab, grid, location } = search;
    const asked = identifier.kind === 'ROW' ? `row ${identifier.row}` : `${identifier.column} ${identifier.value}`;
    if (location.kind === 'UNKNOWN_COLUMN') {
      return clarify(this.unknownColumn(location.column, tab, grid.headers));
    }
    if (location.kind !== 'FOUND') {
      return clarify(location.kind === 'AMBIGUOUS' ? `More than one row in ${quoted(tab)} has ${asked}.` : `I couldn't find ${asked} in ${quoted(tab)}.`);
    }
    const label = this.collaborators.locator.label(grid, location.record, subject.label);
    if (tab !== subject.tab || location.row !== subject.row) {
      return clarify(`In ${quoted(tab)}, ${asked} belongs to ${label}, not ${subject.label}.`);
    }
    await this.collaborators.contexts.save(state.remember(this.remember(tab, grid, location, label), this.collaborators.clock.now()));
    return { kind: 'reply', intent: 'MODIFY_SHEET', text: `Got it — ${subject.label} is ${identifier.kind === 'ROW' ? `in row ${identifier.row}` : asked} in ${quoted(tab)}.` };
  }

  private lookupFor(
    request: RecordRequest,
    state: SheetRecordContext,
  ): { lookup: RecordLookup; display: string; tab?: string } | { reply: RecordPreparation } {
    const { subject } = request;
    switch (subject.kind) {
      case 'ROW':
        return { lookup: { row: subject.row }, display: `row ${subject.row}` };
      case 'VALUE':
        return {
          lookup: { ...(subject.column ? { column: subject.column } : {}), value: subject.value },
          display: this.collaborators.text.stripPossessive(subject.value),
        };
      case 'PRONOUN':
        if (state.pending) {
          return { reply: clarify(`I still need ${state.pending.label}'s ID or row number to find the record.`) };
        }
        if (!state.subject) {
          return { reply: clarify('Who do you mean? Please name the person or give their ID.') };
        }
        return { lookup: { column: state.subject.column, value: state.subject.value }, display: state.subject.label, tab: state.subject.tab };
    }
  }

  private async open(userId: string, spreadsheet: Spreadsheet): Promise<OpenSpreadsheet | { reply: RecordPreparation }> {
    const { credentials, gateway } = this.collaborators;
    try {
      const accessToken = await credentials.accessTokenFor(userId);
      const snapshot = await gateway.getSpreadsheet(accessToken, spreadsheet.googleSpreadsheetId);
      return { accessToken, tabs: snapshot.tabs };
    } catch (error) {
      if (error instanceof GoogleOAuthError) {
        return { reply: clarify(NEEDS_ACCESS) };
      }
      if (error instanceof GoogleSheetsError) {
        return { reply: clarify(error.message) };
      }
      throw error;
    }
  }

  private async search(
    opened: OpenSpreadsheet,
    spreadsheet: Spreadsheet,
    lookup: RecordLookup,
    tabHint: string | undefined,
    columns: readonly string[],
  ): Promise<SearchResult | null> {
    const hinted = tabHint ? this.findTab(opened.tabs, tabHint) : undefined;
    const candidates = hinted ? [hinted] : this.rankTabs(opened.tabs, spreadsheet, columns).slice(0, MAX_SEARCHED_TABS);
    let first: SearchResult | null = null;
    for (const tab of candidates) {
      const grid = await this.collaborators.grids.read(opened.accessToken, spreadsheet.googleSpreadsheetId, tab);
      const result = { tab: tab.title, grid, location: this.collaborators.locator.locate(grid, lookup) };
      if (result.location.kind === 'FOUND' || result.location.kind === 'AMBIGUOUS') {
        return result;
      }
      first ??= result;
    }
    return first;
  }

  private rankTabs(tabs: readonly SpreadsheetTabSnapshot[], spreadsheet: Spreadsheet, columns: readonly string[]): SpreadsheetTabSnapshot[] {
    const known = new Map(spreadsheet.tabs.map((tab) => [tab.title, tab.headers]));
    const covers = (tab: SpreadsheetTabSnapshot) => columns.every((column) => this.collaborators.headers.find(known.get(tab.title) ?? [], column) !== null);
    return [...tabs.filter(covers), ...tabs.filter((tab) => !covers(tab))];
  }

  private async awaitIdentifier(state: SheetRecordContext, request: RecordRequest, display: string, grid: SheetGrid, column: number | null): Promise<void> {
    if (request.subject.kind !== 'VALUE') {
      return;
    }
    const verifyName = this.collaborators.locator.isNameColumn(grid.headers, column);
    await this.collaborators.contexts.save(state.awaitIdentifier({ request, label: display, verifyName }, this.collaborators.clock.now()));
  }

  private remember(tab: string, grid: SheetGrid, location: Extract<RecordLocation, { kind: 'FOUND' }>, label: string): RememberedRecord {
    const { locator, headers } = this.collaborators;
    const column = location.column ?? locator.keyColumn(grid, location.record) ?? 0;
    const identifiers = Object.fromEntries(
      grid.headers.flatMap((header, index) => {
        const value = (location.record[index] ?? '').trim();
        return value && headers.kind(header) !== 'OTHER' ? [[header, value]] : [];
      }),
    );
    return { tab, column: grid.headers[column] ?? '', value: (location.record[column] ?? '').trim(), label, row: location.row, identifiers };
  }

  private sameEntity(grid: SheetGrid, record: readonly string[], expected: string): boolean {
    const { locator, text } = this.collaborators;
    const name = locator.firstOfKind(grid.headers, 'NAME');
    if (name === null) {
      return true;
    }
    const cell = text.words(record[name] ?? '');
    const wanted = text.words(expected);
    return wanted.length > 0 && cell.some((_word, start) => wanted.every((word, offset) => cell[start + offset] === word));
  }

  private identitySentence(location: Extract<RecordLocation, { kind: 'FOUND' }>, grid: SheetGrid, display: string, label: string): string | null {
    const { locator } = this.collaborators;
    if (locator.isNameColumn(grid.headers, location.column)) {
      const identity = locator.identity(grid, location.record, location.column);
      return identity ? `${label} is ${identity.header} ${identity.value}.` : null;
    }
    const lookup = this.lookupText(location, grid, display);
    return label.toLowerCase() === display.toLowerCase() ? null : `${lookup.charAt(0).toUpperCase()}${lookup.slice(1)} is ${label}.`;
  }

  private lookupText(location: Extract<RecordLocation, { kind: 'FOUND' }>, grid: SheetGrid, display: string): string {
    return location.column === null ? display : `${grid.headers[location.column]} ${(location.record[location.column] ?? display).trim()}`;
  }

  private ambiguous(count: number, display: string, tab: string, grid: SheetGrid, column: number): string {
    const { locator } = this.collaborators;
    const noun = this.noun(grid.headers, column, tab);
    const identifier = locator.identifierHeader(grid.headers, column);
    const phrase = locator.isNameColumn(grid.headers, column) ? `named ${display}` : `with ${grid.headers[column]} ${display}`;
    return `I found ${count} ${this.plural(noun)} ${phrase}. Please provide the ${identifier ? `${identifier} or ` : ''}row number.`;
  }

  private notFound(lookup: RecordLookup, display: string, tab: string, grid: SheetGrid, column: number | null): string {
    const { locator } = this.collaborators;
    if ('row' in lookup) {
      return `Row ${lookup.row} in the ${quoted(tab)} sheet is empty or doesn't exist. Please check the row number.`;
    }
    const noun = this.noun(grid.headers, column, tab);
    if (column === null) {
      return `I couldn't find ${quoted(display)} in the ${quoted(tab)} sheet. Please provide the ID or row number.`;
    }
    if (locator.isNameColumn(grid.headers, column)) {
      const identifier = locator.identifierHeader(grid.headers, column);
      return `I couldn't find a ${noun} named ${display} in the ${quoted(tab)} sheet. Please provide ${display}'s ${identifier ?? 'ID'} or row number.`;
    }
    const header = grid.headers[column]!;
    return `I couldn't find a ${noun} with ${header} ${display} in the ${quoted(tab)} sheet. Please check the ${header} or give the row number.`;
  }

  private unknownColumn(column: string, tab: string, headers: readonly string[]): string {
    const listed = headers.filter((header) => header.length > 0);
    return `There is no ${quoted(column)} column in ${quoted(tab)}.${listed.length > 0 ? ` The columns are ${listed.join(', ')}.` : ''}`;
  }

  private noun(headers: readonly string[], column: number | null, tab: string): string {
    const { text, locator } = this.collaborators;
    const header = column === null ? null : headers[column];
    const fromHeader = [header, locator.identifierHeader(headers, null)]
      .filter((value): value is string => Boolean(value))
      .flatMap((value) => text.words(value).filter((word) => !NOUN_STOP_WORDS.has(word) && /^\p{L}+$/u.test(word)));
    if (fromHeader[0]) {
      return fromHeader[0];
    }
    const title = text.comparable(tab);
    return /^\p{L}+$/u.test(title) && !/^sheet$/.test(title) ? title.replace(/(?<=\p{L}{3})s$/u, '') : 'record';
  }

  private plural(noun: string): string {
    return /[^aeiou]y$/.test(noun) ? `${noun.slice(0, -1)}ies` : `${noun}s`;
  }

  private subjectOf(identifier: IdentifierStatement): RecordRequest['subject'] {
    return identifier.kind === 'ROW' ? { kind: 'ROW', row: identifier.row } : { kind: 'VALUE', column: identifier.column, value: identifier.value };
  }

  private stateFor(context: ChatTurnContext, spreadsheet: Spreadsheet): SheetRecordContext {
    const existing = context.sheetRecords;
    return existing && existing.appliesTo(spreadsheet.id)
      ? existing
      : SheetRecordContext.start(context.conversation.id, context.userId, spreadsheet.id, this.collaborators.clock.now());
  }

  private knownHeaders(spreadsheet: Spreadsheet): string[] {
    return [...new Set(spreadsheet.tabs.flatMap((tab) => tab.headers).filter((header) => header.trim().length > 0))];
  }

  private findTab(tabs: readonly SpreadsheetTabSnapshot[], title: string | undefined): SpreadsheetTabSnapshot | undefined {
    if (title === undefined) {
      return tabs[0];
    }
    return tabs.find((tab) => tab.title === title) ?? tabs.find((tab) => tab.title.toLowerCase() === title.toLowerCase());
  }
}
