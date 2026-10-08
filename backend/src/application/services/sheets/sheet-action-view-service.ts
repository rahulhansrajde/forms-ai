import type { SheetActionView } from '@forms-ai/contracts';
import type { SheetAction } from '../../../domain/entities/sheet-action.js';
import type { Spreadsheet } from '../../../domain/entities/spreadsheet.js';
import type { SheetActionRepository, SpreadsheetRepository } from '../../../domain/interfaces/repositories.js';
import type { SheetOperationDescriber } from '../../../domain/services/sheet-operation-describer.js';

const FALLBACK_TITLE = 'Google Sheet';

export class SheetActionViewService {
  constructor(
    private readonly actions: SheetActionRepository,
    private readonly spreadsheets: SpreadsheetRepository,
    private readonly describer: SheetOperationDescriber,
  ) {}

  async describeByIds(actionIds: readonly string[]): Promise<Map<string, SheetActionView>> {
    const unique = [...new Set(actionIds)];
    const actions = await this.actions.findByIds(unique);
    const spreadsheetIds = actions.map((action) => action.spreadsheetId).filter((id): id is string => id !== null);
    const spreadsheets = new Map((await this.spreadsheets.findByIds([...new Set(spreadsheetIds)])).map((spreadsheet) => [spreadsheet.id, spreadsheet]));
    return new Map(actions.map((action) => [action.id, this.describe(action, action.spreadsheetId ? (spreadsheets.get(action.spreadsheetId) ?? null) : null)]));
  }

  describe(action: SheetAction, spreadsheet: Spreadsheet | null): SheetActionView {
    const table = action.result?.table ?? null;
    return {
      id: action.id,
      kind: action.kind,
      status: action.status,
      spreadsheetTitle: spreadsheet?.title ?? action.plannedTitle() ?? FALLBACK_TITLE,
      summary: action.summary,
      steps: action.steps ?? this.describer.describeAll(action.operations, spreadsheet?.tabs ?? []),
      destructive: action.isDestructive(),
      spreadsheetUrl: spreadsheet?.url ?? null,
      spreadsheetOrigin: spreadsheet?.origin ?? null,
      tabs: spreadsheet ? spreadsheet.tabs.map((tab) => tab.title) : (action.linkTarget()?.tabs ?? []),
      error: action.error,
      table: table ? { ...table, label: this.describer.tableLabel(table) } : null,
      updatedAt: action.updatedAt.toISOString(),
    };
  }
}
