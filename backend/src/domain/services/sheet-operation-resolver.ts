import type { SheetOperation } from '@forms-ai/contracts';
import { ValidationError } from '../../shared/errors/application-errors.js';
import type { SpreadsheetTabSnapshot, StructuralChange, ValueInputMode } from '../interfaces/sheets.js';
import type { A1Notation } from './a1-notation.js';

export type ExecutionStep =
  | { kind: 'STRUCTURE'; change: StructuralChange }
  | { kind: 'WRITE'; range: string; values: string[][]; mode: ValueInputMode }
  | { kind: 'APPEND'; range: string; values: string[][] }
  | { kind: 'CLEAR'; range: string }
  | { kind: 'READ'; range: string }
  | { kind: 'INSPECT' };

const TAB_CHANGING_OPERATIONS = new Set<SheetOperation['type']>(['ADD_SHEET', 'RENAME_SHEET', 'DELETE_SHEET_TAB']);

export class SheetOperationResolver {
  constructor(private readonly notation: A1Notation) {}

  changesTabs(operation: SheetOperation): boolean {
    return TAB_CHANGING_OPERATIONS.has(operation.type);
  }

  resolve(operation: SheetOperation, tabs: readonly SpreadsheetTabSnapshot[]): ExecutionStep[] {
    switch (operation.type) {
      case 'CREATE_SPREADSHEET':
        throw new ValidationError('A spreadsheet can only be created once per action.');
      case 'LINK_EXISTING_SPREADSHEET':
        throw new ValidationError('A spreadsheet can only be connected by a connect action.');
      case 'UPDATE_RECORD':
        throw new ValidationError('A record can only be updated after it has been found in the spreadsheet data.');
      case 'GET_SPREADSHEET':
        return [{ kind: 'INSPECT' }];
      case 'READ_RANGE':
        return [{ kind: 'READ', range: this.notation.qualify(this.tab(tabs, operation.sheet).title, operation.range) }];
      case 'WRITE_RANGE':
      case 'UPDATE_RANGE':
        return [{ kind: 'WRITE', range: this.writeRange(this.tab(tabs, operation.sheet).title, operation.range, operation.values), values: operation.values, mode: 'RAW' }];
      case 'APPEND_ROWS':
        return [{ kind: 'APPEND', range: this.notation.qualify(this.tab(tabs, operation.sheet).title, 'A1'), values: operation.values }];
      case 'CLEAR_RANGE':
        return [{ kind: 'CLEAR', range: this.notation.qualify(this.tab(tabs, operation.sheet).title, operation.range) }];
      case 'ADD_SHEET':
        this.assertTitleFree(tabs, operation.title);
        return [{ kind: 'STRUCTURE', change: { kind: 'ADD_TAB', title: operation.title } }];
      case 'RENAME_SHEET': {
        const tab = this.tab(tabs, operation.sheet);
        if (tab.title !== operation.newTitle) {
          this.assertTitleFree(tabs.filter((other) => other.sheetId !== tab.sheetId), operation.newTitle);
        }
        return [{ kind: 'STRUCTURE', change: { kind: 'RENAME_TAB', sheetId: tab.sheetId, title: operation.newTitle } }];
      }
      case 'DELETE_SHEET_TAB': {
        const tab = this.tab(tabs, operation.sheet);
        if (tabs.length <= 1) {
          throw new ValidationError('A spreadsheet must keep at least one tab, so this tab cannot be deleted.');
        }
        return [{ kind: 'STRUCTURE', change: { kind: 'DELETE_TAB', sheetId: tab.sheetId } }];
      }
      case 'INSERT_ROWS': {
        const tab = this.tab(tabs, operation.sheet);
        return [
          {
            kind: 'STRUCTURE',
            change:
              operation.beforeRow === undefined
                ? { kind: 'APPEND_DIMENSION', sheetId: tab.sheetId, dimension: 'ROWS', count: operation.count }
                : { kind: 'INSERT_DIMENSION', sheetId: tab.sheetId, dimension: 'ROWS', startIndex: operation.beforeRow - 1, count: operation.count },
          },
        ];
      }
      case 'INSERT_COLUMNS': {
        const tab = this.tab(tabs, operation.sheet);
        return [
          {
            kind: 'STRUCTURE',
            change:
              operation.beforeColumn === undefined
                ? { kind: 'APPEND_DIMENSION', sheetId: tab.sheetId, dimension: 'COLUMNS', count: operation.count }
                : {
                    kind: 'INSERT_DIMENSION',
                    sheetId: tab.sheetId,
                    dimension: 'COLUMNS',
                    startIndex: this.notation.columnIndex(operation.beforeColumn),
                    count: operation.count,
                  },
          },
        ];
      }
      case 'DELETE_ROWS': {
        const tab = this.tab(tabs, operation.sheet);
        return [{ kind: 'STRUCTURE', change: { kind: 'DELETE_DIMENSION', sheetId: tab.sheetId, dimension: 'ROWS', startIndex: operation.startRow - 1, count: operation.count } }];
      }
      case 'DELETE_COLUMNS': {
        const tab = this.tab(tabs, operation.sheet);
        return [
          {
            kind: 'STRUCTURE',
            change: { kind: 'DELETE_DIMENSION', sheetId: tab.sheetId, dimension: 'COLUMNS', startIndex: this.notation.columnIndex(operation.startColumn), count: operation.count },
          },
        ];
      }
      case 'UPDATE_CELL_FORMAT': {
        const tab = this.tab(tabs, operation.sheet);
        const { bold, italic, backgroundColor, textColor, horizontalAlignment } = operation;
        return [
          {
            kind: 'STRUCTURE',
            change: {
              kind: 'FORMAT_CELLS',
              sheetId: tab.sheetId,
              bounds: this.notation.bounds(operation.range),
              format: { bold, italic, backgroundColor, textColor, horizontalAlignment },
            },
          },
        ];
      }
      case 'UPDATE_DIMENSION_SIZE': {
        const tab = this.tab(tabs, operation.sheet);
        const startIndex = operation.dimension === 'ROWS' ? Number(operation.start) - 1 : this.notation.columnIndex(operation.start);
        if (Number.isNaN(startIndex) || startIndex < 0) {
          throw new ValidationError('Use a row number for rows and a column letter for columns.');
        }
        return [
          {
            kind: 'STRUCTURE',
            change: { kind: 'RESIZE_DIMENSION', sheetId: tab.sheetId, dimension: operation.dimension, startIndex, count: operation.count, pixelSize: operation.pixelSize },
          },
        ];
      }
      case 'SET_HEADER_ROW': {
        const tab = this.tab(tabs, operation.sheet);
        const lastColumn = this.notation.columnLetters(operation.headers.length - 1);
        return [
          { kind: 'WRITE', range: this.notation.qualify(tab.title, `A1:${lastColumn}1`), values: [operation.headers], mode: 'RAW' },
          { kind: 'STRUCTURE', change: { kind: 'FORMAT_CELLS', sheetId: tab.sheetId, bounds: { startRowIndex: 0, endRowIndex: 1 }, format: { bold: true } } },
          { kind: 'STRUCTURE', change: { kind: 'FREEZE_ROWS', sheetId: tab.sheetId, count: 1 } },
        ];
      }
      case 'SET_FORMULA':
        return [{ kind: 'WRITE', range: this.notation.qualify(this.tab(tabs, operation.sheet).title, operation.cell), values: [[operation.formula]], mode: 'USER_ENTERED' }];
      case 'UPDATE_SPREADSHEET_TITLE':
        return [{ kind: 'STRUCTURE', change: { kind: 'RENAME_SPREADSHEET', title: operation.title } }];
    }
  }

  tab(tabs: readonly SpreadsheetTabSnapshot[], title: string | undefined): SpreadsheetTabSnapshot {
    if (title === undefined) {
      const first = tabs[0];
      if (!first) {
        throw new ValidationError('This spreadsheet has no tabs.');
      }
      return first;
    }
    const match = tabs.find((tab) => tab.title === title) ?? tabs.find((tab) => tab.title.toLowerCase() === title.toLowerCase());
    if (!match) {
      throw new ValidationError(`There is no tab called “${title}” in this spreadsheet.`);
    }
    return match;
  }

  private assertTitleFree(tabs: readonly SpreadsheetTabSnapshot[], title: string): void {
    if (tabs.some((tab) => tab.title.toLowerCase() === title.toLowerCase())) {
      throw new ValidationError(`A tab called “${title}” already exists.`);
    }
  }

  private writeRange(sheetTitle: string, range: string, values: readonly string[][]): string {
    const bounds = this.notation.bounds(range);
    const startColumn = bounds.startColumnIndex ?? 0;
    const startRow = (bounds.startRowIndex ?? 0) + 1;
    const width = Math.max(1, ...values.map((row) => row.length));
    const start = `${this.notation.columnLetters(startColumn)}${startRow}`;
    const end = `${this.notation.columnLetters(startColumn + width - 1)}${startRow + values.length - 1}`;
    return this.notation.qualify(sheetTitle, `${start}:${end}`);
  }
}
