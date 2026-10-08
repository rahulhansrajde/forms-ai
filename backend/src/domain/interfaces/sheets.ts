import type { HorizontalAlignment } from '@forms-ai/contracts';
import type { GridBounds } from '../services/a1-notation.js';

export interface SpreadsheetTabSnapshot {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

export interface SpreadsheetSnapshot {
  spreadsheetId: string;
  title: string;
  url: string;
  tabs: SpreadsheetTabSnapshot[];
}

export type ValueInputMode = 'RAW' | 'USER_ENTERED';

export type SheetDimension = 'ROWS' | 'COLUMNS';

export interface CellFormatChange {
  bold?: boolean;
  italic?: boolean;
  backgroundColor?: string;
  textColor?: string;
  horizontalAlignment?: HorizontalAlignment;
}

export type StructuralChange =
  | { kind: 'ADD_TAB'; title: string }
  | { kind: 'RENAME_TAB'; sheetId: number; title: string }
  | { kind: 'DELETE_TAB'; sheetId: number }
  | { kind: 'INSERT_DIMENSION'; sheetId: number; dimension: SheetDimension; startIndex: number; count: number }
  | { kind: 'APPEND_DIMENSION'; sheetId: number; dimension: SheetDimension; count: number }
  | { kind: 'DELETE_DIMENSION'; sheetId: number; dimension: SheetDimension; startIndex: number; count: number }
  | { kind: 'FORMAT_CELLS'; sheetId: number; bounds: GridBounds; format: CellFormatChange }
  | { kind: 'RESIZE_DIMENSION'; sheetId: number; dimension: SheetDimension; startIndex: number; count: number; pixelSize: number }
  | { kind: 'FREEZE_ROWS'; sheetId: number; count: number }
  | { kind: 'RENAME_SPREADSHEET'; title: string };

export interface SheetsGateway {
  createSpreadsheet(accessToken: string, title: string, tabTitles: readonly string[]): Promise<SpreadsheetSnapshot>;
  getSpreadsheet(accessToken: string, spreadsheetId: string): Promise<SpreadsheetSnapshot>;
  readValues(accessToken: string, spreadsheetId: string, range: string): Promise<string[][]>;
  readRanges(accessToken: string, spreadsheetId: string, ranges: readonly string[]): Promise<string[][][]>;
  writeValues(accessToken: string, spreadsheetId: string, range: string, values: string[][], mode: ValueInputMode): Promise<void>;
  appendValues(accessToken: string, spreadsheetId: string, range: string, values: string[][]): Promise<void>;
  clearValues(accessToken: string, spreadsheetId: string, range: string): Promise<void>;
  applyStructuralChanges(accessToken: string, spreadsheetId: string, changes: readonly StructuralChange[]): Promise<void>;
}
