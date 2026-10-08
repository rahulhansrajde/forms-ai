import type { SheetsGateway, SpreadsheetSnapshot, StructuralChange, ValueInputMode } from '../../src/domain/interfaces/sheets.js';
import { A1Notation } from '../../src/domain/services/a1-notation.js';
import { GoogleOAuthError, GoogleSheetsError } from '../../src/shared/errors/application-errors.js';

interface FakeTab {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
  cells: Map<string, string>;
}

interface FakeSpreadsheet {
  title: string;
  tabs: FakeTab[];
  nextSheetId: number;
}

export type FakeSheetsMethod = keyof SheetsGateway;

const DEFAULT_ROWS = 1000;
const DEFAULT_COLUMNS = 26;

export class FakeSheetsGateway implements SheetsGateway {
  readonly spreadsheets = new Map<string, FakeSpreadsheet>();
  readonly calls: Array<{ method: FakeSheetsMethod; accessToken: string }> = [];
  readonly structuralBatches: StructuralChange[][] = [];
  readonly failures = new Set<FakeSheetsMethod>();
  readonly forbidden = new Set<string>();
  scopeMissing = false;
  private readonly notation = new A1Notation();
  private counter = 0;

  async createSpreadsheet(accessToken: string, title: string, tabTitles: readonly string[]): Promise<SpreadsheetSnapshot> {
    this.record('createSpreadsheet', accessToken);
    this.counter += 1;
    const id = `1FakeSpreadsheet${String(this.counter).padStart(28, '0')}`;
    this.spreadsheets.set(id, {
      title,
      nextSheetId: tabTitles.length,
      tabs: tabTitles.map((tabTitle, index) => ({ sheetId: index, title: tabTitle, rowCount: DEFAULT_ROWS, columnCount: DEFAULT_COLUMNS, cells: new Map() })),
    });
    return this.snapshot(id);
  }

  async getSpreadsheet(accessToken: string, spreadsheetId: string): Promise<SpreadsheetSnapshot> {
    this.record('getSpreadsheet', accessToken);
    return this.snapshot(spreadsheetId);
  }

  async readValues(accessToken: string, spreadsheetId: string, range: string): Promise<string[][]> {
    this.record('readValues', accessToken);
    return this.read(spreadsheetId, range);
  }

  async readRanges(accessToken: string, spreadsheetId: string, ranges: readonly string[]): Promise<string[][][]> {
    this.record('readRanges', accessToken);
    return ranges.map((range) => this.read(spreadsheetId, range));
  }

  async writeValues(accessToken: string, spreadsheetId: string, range: string, values: string[][], _mode: ValueInputMode): Promise<void> {
    this.record('writeValues', accessToken);
    const { tab, bounds } = this.locate(spreadsheetId, range);
    values.forEach((row, rowOffset) =>
      row.forEach((value, columnOffset) => tab.cells.set(this.key(bounds.startRow + rowOffset, bounds.startColumn + columnOffset), value)),
    );
  }

  async appendValues(accessToken: string, spreadsheetId: string, range: string, values: string[][]): Promise<void> {
    this.record('appendValues', accessToken);
    const { tab } = this.locate(spreadsheetId, range);
    const lastRow = Math.max(-1, ...[...tab.cells.keys()].map((key) => Number(key.split(',')[0])));
    values.forEach((row, rowOffset) => row.forEach((value, column) => tab.cells.set(this.key(lastRow + 1 + rowOffset, column), value)));
  }

  async clearValues(accessToken: string, spreadsheetId: string, range: string): Promise<void> {
    this.record('clearValues', accessToken);
    const { tab, bounds } = this.locate(spreadsheetId, range);
    for (const key of [...tab.cells.keys()]) {
      const [row, column] = key.split(',').map(Number) as [number, number];
      if (row >= bounds.startRow && row < bounds.endRow && column >= bounds.startColumn && column < bounds.endColumn) {
        tab.cells.delete(key);
      }
    }
  }

  async applyStructuralChanges(accessToken: string, spreadsheetId: string, changes: readonly StructuralChange[]): Promise<void> {
    this.record('applyStructuralChanges', accessToken);
    this.structuralBatches.push([...changes]);
    const spreadsheet = this.require(spreadsheetId);
    for (const change of changes) {
      this.apply(spreadsheet, change);
    }
  }

  seed(spreadsheetId: string, title: string, tabs: ReadonlyArray<{ title: string; values: string[][] }>): string {
    this.spreadsheets.set(spreadsheetId, {
      title,
      nextSheetId: tabs.length + 100,
      tabs: tabs.map((tab, index) => ({
        sheetId: index + 100,
        title: tab.title,
        rowCount: Math.max(DEFAULT_ROWS, tab.values.length + 10),
        columnCount: DEFAULT_COLUMNS,
        cells: new Map(tab.values.flatMap((row, rowIndex) => row.map((value, column): [string, string] => [this.key(rowIndex, column), value]))),
      })),
    });
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  }

  valuesOf(spreadsheetId: string, tabTitle: string): string[][] {
    return this.read(spreadsheetId, this.notation.qualify(tabTitle, 'A1:Z50'));
  }

  private apply(spreadsheet: FakeSpreadsheet, change: StructuralChange): void {
    const tabOf = (sheetId: number) => {
      const tab = spreadsheet.tabs.find((candidate) => candidate.sheetId === sheetId);
      if (!tab) {
        throw new GoogleSheetsError(`Google Sheets could not update the spreadsheet: no sheet ${sheetId}.`, { status: 400 });
      }
      return tab;
    };
    switch (change.kind) {
      case 'ADD_TAB':
        spreadsheet.tabs.push({ sheetId: spreadsheet.nextSheetId++, title: change.title, rowCount: DEFAULT_ROWS, columnCount: DEFAULT_COLUMNS, cells: new Map() });
        return;
      case 'RENAME_TAB':
        tabOf(change.sheetId).title = change.title;
        return;
      case 'DELETE_TAB':
        spreadsheet.tabs = spreadsheet.tabs.filter((tab) => tab.sheetId !== change.sheetId);
        return;
      case 'APPEND_DIMENSION': {
        const tab = tabOf(change.sheetId);
        if (change.dimension === 'ROWS') {
          tab.rowCount += change.count;
        } else {
          tab.columnCount += change.count;
        }
        return;
      }
      case 'INSERT_DIMENSION':
      case 'DELETE_DIMENSION': {
        const tab = tabOf(change.sheetId);
        const shift = change.kind === 'INSERT_DIMENSION' ? change.count : -change.count;
        const shifted = new Map<string, string>();
        for (const [key, value] of tab.cells) {
          const [row, column] = key.split(',').map(Number) as [number, number];
          const position = change.dimension === 'ROWS' ? row : column;
          const deleted = change.kind === 'DELETE_DIMENSION' && position >= change.startIndex && position < change.startIndex + change.count;
          if (deleted) {
            continue;
          }
          const moved = position >= change.startIndex ? position + shift : position;
          shifted.set(change.dimension === 'ROWS' ? this.key(moved, column) : this.key(row, moved), value);
        }
        tab.cells = shifted;
        if (change.dimension === 'ROWS') {
          tab.rowCount += shift;
        } else {
          tab.columnCount += shift;
        }
        return;
      }
      case 'RENAME_SPREADSHEET':
        spreadsheet.title = change.title;
        return;
      default:
        return;
    }
  }

  private read(spreadsheetId: string, range: string): string[][] {
    const { tab, bounds } = this.locate(spreadsheetId, range);
    const rows: string[][] = [];
    for (let row = bounds.startRow; row < Math.min(bounds.endRow, tab.rowCount); row += 1) {
      const values: string[] = [];
      for (let column = bounds.startColumn; column < Math.min(bounds.endColumn, tab.columnCount); column += 1) {
        values.push(tab.cells.get(this.key(row, column)) ?? '');
      }
      while (values.length > 0 && values[values.length - 1] === '') {
        values.pop();
      }
      rows.push(values);
    }
    while (rows.length > 0 && rows[rows.length - 1]!.length === 0) {
      rows.pop();
    }
    return rows;
  }

  private locate(spreadsheetId: string, qualified: string): { tab: FakeTab; bounds: { startRow: number; endRow: number; startColumn: number; endColumn: number } } {
    const separator = qualified.lastIndexOf('!');
    const title = qualified.slice(1, separator - 1).replace(/''/g, "'");
    const range = qualified.slice(separator + 1);
    const tab = this.require(spreadsheetId).tabs.find((candidate) => candidate.title === title);
    if (!tab) {
      throw new GoogleSheetsError(`Google Sheets could not read the range: Unable to parse range: ${qualified}`, { status: 400 });
    }
    const grid = this.notation.bounds(range);
    return {
      tab,
      bounds: {
        startRow: grid.startRowIndex ?? 0,
        endRow: grid.endRowIndex ?? tab.rowCount,
        startColumn: grid.startColumnIndex ?? 0,
        endColumn: grid.endColumnIndex ?? tab.columnCount,
      },
    };
  }

  private snapshot(spreadsheetId: string): SpreadsheetSnapshot {
    const spreadsheet = this.require(spreadsheetId);
    return {
      spreadsheetId,
      title: spreadsheet.title,
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      tabs: spreadsheet.tabs.map(({ sheetId, title, rowCount, columnCount }) => ({ sheetId, title, rowCount, columnCount })),
    };
  }

  private require(spreadsheetId: string): FakeSpreadsheet {
    if (this.forbidden.has(spreadsheetId)) {
      throw new GoogleSheetsError('Your Google account does not have permission to change this spreadsheet.', { status: 403 });
    }
    const spreadsheet = this.spreadsheets.get(spreadsheetId);
    if (!spreadsheet) {
      throw new GoogleSheetsError('This spreadsheet no longer exists or your Google account can no longer open it.', { status: 404 });
    }
    return spreadsheet;
  }

  private record(method: FakeSheetsMethod, accessToken: string): void {
    this.calls.push({ method, accessToken });
    if (this.scopeMissing) {
      throw new GoogleOAuthError('GOOGLE_SHEETS_ACCESS_REQUIRED', 'Allow Forms AI to use Google Sheets, then try again.');
    }
    if (this.failures.has(method)) {
      throw new GoogleSheetsError(`Google Sheets could not complete ${method}. Please try again.`, { status: 503 });
    }
  }

  private key(row: number, column: number): string {
    return `${row},${column}`;
  }
}
