export const SHEET_OPERATION_TYPES = [
  'CREATE_SPREADSHEET',
  'GET_SPREADSHEET',
  'READ_RANGE',
  'WRITE_RANGE',
  'APPEND_ROWS',
  'UPDATE_RANGE',
  'CLEAR_RANGE',
  'ADD_SHEET',
  'RENAME_SHEET',
  'DELETE_SHEET_TAB',
  'INSERT_ROWS',
  'INSERT_COLUMNS',
  'DELETE_ROWS',
  'DELETE_COLUMNS',
  'UPDATE_CELL_FORMAT',
  'UPDATE_DIMENSION_SIZE',
  'SET_HEADER_ROW',
  'SET_FORMULA',
  'UPDATE_SPREADSHEET_TITLE',
  'LINK_EXISTING_SPREADSHEET',
  'UPDATE_RECORD',
] as const;

export type SheetOperationType = (typeof SHEET_OPERATION_TYPES)[number];

export const DESTRUCTIVE_SHEET_OPERATIONS: readonly SheetOperationType[] = ['CLEAR_RANGE', 'DELETE_SHEET_TAB', 'DELETE_ROWS', 'DELETE_COLUMNS'];

export const READ_SHEET_OPERATIONS: readonly SheetOperationType[] = ['GET_SPREADSHEET', 'READ_RANGE'];

export interface SheetTabBlueprint {
  title: string;
  headers?: string[];
  rows?: string[][];
}

export interface CreateSpreadsheetOperation {
  type: 'CREATE_SPREADSHEET';
  title: string;
  tabs: SheetTabBlueprint[];
}

export interface GetSpreadsheetOperation {
  type: 'GET_SPREADSHEET';
}

export interface ReadRangeOperation {
  type: 'READ_RANGE';
  sheet?: string;
  range: string;
  summarize?: boolean;
  explicitRange?: boolean;
}

export interface WriteRangeOperation {
  type: 'WRITE_RANGE' | 'UPDATE_RANGE';
  sheet?: string;
  range: string;
  values: string[][];
}

export interface AppendRowsOperation {
  type: 'APPEND_ROWS';
  sheet?: string;
  values: string[][];
}

export interface ClearRangeOperation {
  type: 'CLEAR_RANGE';
  sheet?: string;
  range: string;
}

export interface AddSheetOperation {
  type: 'ADD_SHEET';
  title: string;
}

export interface RenameSheetOperation {
  type: 'RENAME_SHEET';
  sheet: string;
  newTitle: string;
}

export interface DeleteSheetTabOperation {
  type: 'DELETE_SHEET_TAB';
  sheet: string;
}

export interface InsertRowsOperation {
  type: 'INSERT_ROWS';
  sheet?: string;
  beforeRow?: number;
  count: number;
}

export interface InsertColumnsOperation {
  type: 'INSERT_COLUMNS';
  sheet?: string;
  beforeColumn?: string;
  count: number;
}

export interface DeleteRowsOperation {
  type: 'DELETE_ROWS';
  sheet?: string;
  startRow: number;
  count: number;
}

export interface DeleteColumnsOperation {
  type: 'DELETE_COLUMNS';
  sheet?: string;
  startColumn: string;
  count: number;
}

export type HorizontalAlignment = 'LEFT' | 'CENTER' | 'RIGHT';

export interface UpdateCellFormatOperation {
  type: 'UPDATE_CELL_FORMAT';
  sheet?: string;
  range: string;
  bold?: boolean;
  italic?: boolean;
  backgroundColor?: string;
  textColor?: string;
  horizontalAlignment?: HorizontalAlignment;
}

export interface UpdateDimensionSizeOperation {
  type: 'UPDATE_DIMENSION_SIZE';
  sheet?: string;
  dimension: 'ROWS' | 'COLUMNS';
  start: string;
  count: number;
  pixelSize: number;
}

export interface SetHeaderRowOperation {
  type: 'SET_HEADER_ROW';
  sheet?: string;
  headers: string[];
}

export interface SetFormulaOperation {
  type: 'SET_FORMULA';
  sheet?: string;
  cell: string;
  formula: string;
}

export interface UpdateSpreadsheetTitleOperation {
  type: 'UPDATE_SPREADSHEET_TITLE';
  title: string;
}

export interface LinkExistingSpreadsheetOperation {
  type: 'LINK_EXISTING_SPREADSHEET';
  spreadsheetId: string;
  title: string | null;
  tabs: string[];
}

export interface RecordFieldChange {
  column: string;
  value: string;
  from?: string;
}

export interface ResolvedRecordChange {
  column: string;
  from: string;
  to: string;
}

export interface RecordTarget {
  row: number;
  label: string;
  changes: ResolvedRecordChange[];
}

export interface UpdateRecordOperation {
  type: 'UPDATE_RECORD';
  sheet?: string;
  match: { column?: string; value: string };
  changes: RecordFieldChange[];
  target?: RecordTarget;
}

export type SheetOperation =
  | CreateSpreadsheetOperation
  | GetSpreadsheetOperation
  | ReadRangeOperation
  | WriteRangeOperation
  | AppendRowsOperation
  | ClearRangeOperation
  | AddSheetOperation
  | RenameSheetOperation
  | DeleteSheetTabOperation
  | InsertRowsOperation
  | InsertColumnsOperation
  | DeleteRowsOperation
  | DeleteColumnsOperation
  | UpdateCellFormatOperation
  | UpdateDimensionSizeOperation
  | SetHeaderRowOperation
  | SetFormulaOperation
  | UpdateSpreadsheetTitleOperation
  | LinkExistingSpreadsheetOperation
  | UpdateRecordOperation;

export const SHEET_ACTION_KINDS = ['CREATE', 'MODIFY', 'READ', 'LINK'] as const;

export type SheetActionKind = (typeof SHEET_ACTION_KINDS)[number];

export type SheetPlanKind = Exclude<SheetActionKind, 'LINK'>;

export const SPREADSHEET_ORIGINS = ['CREATED_BY_FORMS_AI', 'LINKED_EXISTING'] as const;

export type SpreadsheetOrigin = (typeof SPREADSHEET_ORIGINS)[number];

export const SHEET_ACTION_STATUSES = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'] as const;

export type SheetActionStatus = (typeof SHEET_ACTION_STATUSES)[number];

export const SHEET_LIMITS = {
  titleMaxLength: 100,
  cellMaxLength: 5000,
  maxWriteRows: 500,
  maxWriteColumns: 50,
  maxInsertRows: 1000,
  maxInsertColumns: 100,
  maxOperations: 20,
  maxReadRows: 200,
  maxReadColumns: 26,
  minPixelSize: 10,
  maxPixelSize: 1000,
} as const;

export interface SheetTableData {
  range: string;
  values: string[][];
  totalRows: number;
  truncated: boolean;
  explicitRange?: boolean;
  record?: { row: number };
}

export interface SheetTableView extends SheetTableData {
  label: string;
}

export interface SheetActionStep {
  text: string;
  done: string;
  change: { from: string; to: string } | null;
  note?: string;
}

export interface SheetActionView {
  id: string;
  kind: SheetActionKind;
  status: SheetActionStatus;
  spreadsheetTitle: string;
  summary: string;
  steps: SheetActionStep[];
  destructive: boolean;
  spreadsheetUrl: string | null;
  spreadsheetOrigin: SpreadsheetOrigin | null;
  tabs: string[];
  error: string | null;
  table: SheetTableView | null;
  updatedAt: string;
}
