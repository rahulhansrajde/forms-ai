import type { SheetOperation } from '@forms-ai/contracts';
import { describe, expect, it } from 'vitest';
import { Spreadsheet } from '../../../src/domain/entities/spreadsheet.js';
import { A1Notation } from '../../../src/domain/services/a1-notation.js';
import { sheetOperationSchema, sheetPlanOutputSchema } from '../../../src/domain/services/sheet-operation-definitions.js';
import { SheetOperationDescriber } from '../../../src/domain/services/sheet-operation-describer.js';
import { SheetOperationResolver } from '../../../src/domain/services/sheet-operation-resolver.js';
import { SpreadsheetReferenceParser } from '../../../src/domain/services/spreadsheet-reference-parser.js';
import { ValidationError } from '../../../src/shared/errors/application-errors.js';

const notation = new A1Notation();
const resolver = new SheetOperationResolver(notation);
const TABS = [
  { sheetId: 0, title: 'Leads', rowCount: 1000, columnCount: 26 },
  { sheetId: 7, title: "Q1 'Notes'", rowCount: 100, columnCount: 10 },
];

describe('A1Notation', () => {
  it.each(['A1', 'B2:D20', 'A:A', '1:1', 'A2:B', 'AA10:ZZ99'])('accepts %s', (range) => {
    expect(notation.isRange(range)).toBe(true);
  });

  it.each(['', 'A0', 'ZZZZ1', 'A1:', 'Sheet1!A1', 'A1:B2:C3', '=A1', 'a1'])('rejects %s', (range) => {
    expect(notation.isRange(range)).toBe(false);
  });

  it('converts between column letters and indexes', () => {
    expect([0, 25, 26, 51, 701, 702].map((index) => notation.columnLetters(index))).toEqual(['A', 'Z', 'AA', 'AZ', 'ZZ', 'AAA']);
    expect(['A', 'Z', 'AA', 'AZ', 'ZZ', 'AAA'].map((letters) => notation.columnIndex(letters))).toEqual([0, 25, 26, 51, 701, 702]);
  });

  it('quotes tab titles and computes grid bounds', () => {
    expect(notation.qualify("Q1 'Notes'", 'A1:B2')).toBe("'Q1 ''Notes'''!A1:B2");
    expect(notation.bounds('B2:D20')).toEqual({ startRowIndex: 1, endRowIndex: 20, startColumnIndex: 1, endColumnIndex: 4 });
    expect(notation.bounds('1:1')).toEqual({ startRowIndex: 0, endRowIndex: 1 });
    expect(notation.bounds('C:C')).toEqual({ startColumnIndex: 2, endColumnIndex: 3 });
  });
});

describe('sheet operation validation', () => {
  it('normalises ranges and cell values', () => {
    const parsed = sheetOperationSchema.parse({ type: 'WRITE_RANGE', range: ' b2:c3 ', values: [[1, true, 'x']] });
    expect(parsed).toEqual({ type: 'WRITE_RANGE', range: 'B2:C3', values: [['1', 'true', 'x']] });
  });

  it.each([
    { type: 'READ_RANGE', range: 'Sheet1!A1:B2' },
    { type: 'CLEAR_RANGE', range: 'A1:B2; DROP TABLE' },
    { type: 'SET_FORMULA', cell: 'A1:B2', formula: '=1' },
    { type: 'SET_FORMULA', cell: 'A1', formula: 'IMPORTDATA' },
    { type: 'UPDATE_CELL_FORMAT', range: 'A1' },
    { type: 'UPDATE_CELL_FORMAT', range: 'A1', backgroundColor: 'red' },
    { type: 'SET_HEADER_ROW', headers: ['Name', ' '] },
    { type: 'INSERT_ROWS', count: 0 },
    { type: 'INSERT_COLUMNS', beforeColumn: '3', count: 1 },
    { type: 'DELETE_COLUMNS', startColumn: 'C', count: 101 },
    { type: 'UPDATE_DIMENSION_SIZE', dimension: 'ROWS', start: '0', count: 1, pixelSize: 20 },
    { type: 'UPDATE_DIMENSION_SIZE', dimension: 'ROWS', start: '1', count: 1, pixelSize: 5000 },
    { type: 'ADD_SHEET', title: 'Tab\u0000' },
    { type: 'CREATE_SPREADSHEET', title: 'x'.repeat(101), tabs: [{ title: 'Sheet1' }] },
    { type: 'CREATE_SPREADSHEET', title: 'Empty', tabs: [] },
    { type: 'WRITE_RANGE', range: 'A1', values: [] },
    { type: 'WRITE_RANGE', range: 'A1', values: [['x'.repeat(5001)]] },
    { type: 'APPEND_ROWS', values: Array.from({ length: 501 }, () => ['x']) },
    { type: 'ADD_SHEET', title: 'Leads', url: 'https://example.com' },
    { type: 'DELETE_SPREADSHEET' },
  ])('rejects %j', (operation) => {
    expect(sheetOperationSchema.safeParse(operation).success).toBe(false);
  });

  it('caps the number of operations in a plan', () => {
    const operations = Array.from({ length: 21 }, (_value, index) => ({ type: 'ADD_SHEET', title: `Tab ${index}` }));
    expect(sheetPlanOutputSchema.safeParse({ summary: 'x', operations }).success).toBe(false);
    expect(sheetPlanOutputSchema.safeParse({ summary: 'x', operations: operations.slice(0, 20) }).success).toBe(true);
  });
});

describe('SheetOperationDescriber', () => {
  const describer = new SheetOperationDescriber(notation);
  const STUDENTS = [
    { title: 'Students', headers: ['Student ID', 'Name', 'Email', 'Department', 'College', 'Year'] },
    { title: 'Summary', headers: ['Department', 'Count'] },
  ];
  const texts = (operations: SheetOperation[]) => describer.describeAll(operations, STUDENTS).map((step) => step.text);
  const A1 = /\b[A-Z]{1,3}\d+(?::[A-Z]{1,3}\d*)?\b/;

  const HEADER = 'Header row included';

  it.each([
    ['A1:F3', 'Read the first 2 data rows from “Students”', HEADER],
    ['A1:F4', 'Read the first 3 data rows from “Students”', HEADER],
    ['A1:F6', 'Read the first 5 data rows from “Students”', HEADER],
    ['A1:F2', 'Read the first data row from “Students”', HEADER],
    ['A1:Z21', 'Read the first 20 data rows from “Students”', HEADER],
    ['A2:F5', 'Read rows 2 to 5 from “Students”', undefined],
    ['A5:F5', 'Read row 5 from “Students”', undefined],
    ['F2', 'Read the “Year” value in row 2 from “Students”', undefined],
    ['F1', 'Read the “Year” header from “Students”', undefined],
    ['D2:D', 'Read the “Department” values from “Students”', undefined],
    ['D3:D', 'Read the “Department” values from row 3 onward from “Students”', undefined],
    ['D2:D10', 'Read the “Department” values in rows 2 to 10 from “Students”', undefined],
    ['D1:D10', 'Read the first 9 “Department” values from “Students”', HEADER],
    ['D1:D2', 'Read the first “Department” value from “Students”', HEADER],
    ['D:D', 'Read the whole “Department” column from “Students”', undefined],
    ['D1:D', 'Read the whole “Department” column from “Students”', undefined],
    ['A1:F1', 'Read the header row from “Students”', undefined],
    ['1:1', 'Read the header row from “Students”', undefined],
    ['B1:C1', 'Read the “Name” and “Email” headers from “Students”', undefined],
    ['2:5', 'Read rows 2 to 5 from “Students”', undefined],
    ['A2:F', 'Read every row below the header from “Students”', undefined],
    ['A10:F', 'Read every row from row 10 onward from “Students”', undefined],
    ['A:F', 'Read every data row from “Students”', HEADER],
    ['A1:F', 'Read every data row from “Students”', HEADER],
    ['B1:C4', 'Read the first 3 data rows of the “Name” and “Email” columns from “Students”', HEADER],
    ['B2:D9', 'Read rows 2 to 9 of the “Name” to “Department” columns from “Students”', undefined],
  ])('describes reading %s semantically', (range, text, note) => {
    const [step] = describer.describeAll([{ type: 'READ_RANGE', sheet: 'Students', range }], STUDENTS);
    expect(step?.text).toBe(text);
    expect(step?.note).toBe(note);
    expect(step?.text).not.toMatch(A1);
  });

  it('counts physical rows when the tab has no header row', () => {
    const [step] = describer.describeAll([{ type: 'READ_RANGE', sheet: 'Blank', range: 'A1:C4' }], [{ title: 'Blank', headers: [] }]);
    expect(step).toEqual({ text: 'Read the first 4 rows from “Blank”', done: 'Read the first 4 rows from “Blank”', change: null });
  });

  it('keeps the user’s data-row count for “the first N rows” plans', () => {
    const [step] = describer.describeAll([{ type: 'READ_RANGE', sheet: 'Students', range: 'A1:F4' }], STUDENTS);
    expect(step).toEqual({
      text: 'Read the first 3 data rows from “Students”',
      done: 'Read the first 3 data rows from “Students”',
      change: null,
      note: 'Header row included',
    });
    expect(describer.resultSentence([step!])).toBe('Read the first 3 data rows from “Students” (header row included).');
  });

  it('describes other reads and summaries', () => {
    expect(texts([{ type: 'READ_RANGE', sheet: 'Students', range: 'A1:F4', summarize: true }, { type: 'GET_SPREADSHEET' }])).toEqual([
      'Read the first 3 data rows from “Students” and summarize them',
      'Look up the tabs and columns of the spreadsheet',
    ]);
  });

  it('keeps a range the user asked for explicitly', () => {
    expect(texts([{ type: 'READ_RANGE', sheet: 'Students', range: 'A1:F6', explicitRange: true }])).toEqual(['Read A1:F6 from “Students”']);
  });

  it('describes writes, appends and clears semantically', () => {
    const steps = texts([
      { type: 'WRITE_RANGE', sheet: 'Summary', range: 'A2:B5', values: [['CSE', '2'], ['ECE', '1'], ['ME', '1'], ['Total', '4']] },
      { type: 'APPEND_ROWS', sheet: 'Students', values: [['STU010', 'Kiran', 'kiran@example.com', 'ECE', 'ABC', '1st Year']] },
      { type: 'APPEND_ROWS', sheet: 'Summary', values: [['IT', '3'], ['EEE', '2']] },
      { type: 'WRITE_RANGE', sheet: 'Students', range: 'F2', values: [['4th Year']] },
      { type: 'WRITE_RANGE', sheet: 'Students', range: 'C1', values: [['Email Address']] },
      { type: 'CLEAR_RANGE', sheet: 'Students', range: 'D2:D' },
      { type: 'CLEAR_RANGE', sheet: 'Students', range: 'A2:F40' },
    ]);
    expect(steps).toEqual([
      'Write 4 rows of data to “Summary” (rows 2 to 5)',
      'Add Kiran\'s record to “Students”',
      'Add 2 rows to “Summary”',
      'Set “Year” in row 2 to “4th Year” on “Students”',
      'Rename the “Email” column to “Email Address” on “Students”',
      'Clear the “Department” values from “Students”',
      'Clear rows 2 to 40 from “Students”',
    ]);
    expect(steps.some((step) => /\b(?:F2|A2:B5|D2:D|A2:F40|C1)\b/.test(step))).toBe(false);
  });

  it.each<[SheetOperation, string]>([
    [{ type: 'WRITE_RANGE', sheet: 'Students', range: 'F2', values: [['4th Year']] }, 'Set “Year” in row 2 to “4th Year” on “Students”'],
    [{ type: 'WRITE_RANGE', sheet: 'Students', range: 'F2:F5', values: [['a'], ['b'], ['c'], ['d']] }, 'Update the “Year” values in rows 2 to 5 on “Students”'],
    [{ type: 'WRITE_RANGE', sheet: 'Students', range: 'B7', values: [['Kiran', 'k@x.io']] }, 'Update the “Name” and “Email” columns in row 7 on “Students”'],
    [
      { type: 'WRITE_RANGE', sheet: 'Students', range: 'A7', values: [['STU010', 'Kiran', 'k@x.io', 'ECE', 'ABC', '1st Year']] },
      'Write Kiran\'s record to row 7 of “Students”',
    ],
    [{ type: 'WRITE_RANGE', sheet: 'Summary', range: 'A1', values: [['Department', 'Count'], ['CSE', '2'], ['ECE', '1']] }, 'Write 2 data rows to “Summary”'],
    [{ type: 'WRITE_RANGE', sheet: 'Summary', range: 'A1:B1', values: [['Dept', 'Total']] }, 'Update the header row on “Summary”'],
    [{ type: 'UPDATE_RANGE', sheet: 'Summary', range: 'A2', values: [['CSE', '2']] }, 'Write 1 row of data to “Summary” (row 2)'],
    [{ type: 'APPEND_ROWS', sheet: 'Summary', values: [['IT', '3']] }, 'Add 1 row to “Summary”'],
    [{ type: 'CLEAR_RANGE', sheet: 'Students', range: 'A1:F4' }, 'Clear the first 3 data rows from “Students”'],
    [{ type: 'CLEAR_RANGE', sheet: 'Students', range: 'F2' }, 'Clear the “Year” value in row 2 from “Students”'],
    [{ type: 'UPDATE_CELL_FORMAT', sheet: 'Students', range: 'A1:F1', bold: true }, 'Format the header row on “Students” (bold)'],
    [{ type: 'UPDATE_CELL_FORMAT', sheet: 'Students', range: 'C2:C', textColor: '#112233' }, 'Format the “Email” values on “Students” (text color)'],
    [{ type: 'INSERT_COLUMNS', sheet: 'Students', beforeColumn: 'A', count: 1 }, 'Add a new column before “Student ID” on “Students”'],
    [{ type: 'INSERT_COLUMNS', sheet: 'Students', beforeColumn: 'F', count: 2 }, 'Add 2 new columns before “Year” on “Students”'],
    [{ type: 'INSERT_COLUMNS', sheet: 'Students', count: 3 }, 'Add 3 empty columns to “Students”'],
    [{ type: 'INSERT_ROWS', sheet: 'Students', beforeRow: 5, count: 2 }, 'Insert 2 empty rows above row 5 in “Students”'],
    [{ type: 'DELETE_ROWS', sheet: 'Students', startRow: 4, count: 2 }, 'Delete rows 4 to 5 from “Students”'],
    [{ type: 'DELETE_ROWS', sheet: 'Students', startRow: 4, count: 1 }, 'Delete row 4 from “Students”'],
    [{ type: 'DELETE_COLUMNS', sheet: 'Students', startColumn: 'D', count: 2 }, 'Delete the “Department” and “College” columns from “Students”'],
    [{ type: 'DELETE_COLUMNS', sheet: 'Students', startColumn: 'B', count: 3 }, 'Delete the “Name” to “Department” columns from “Students”'],
    [{ type: 'UPDATE_DIMENSION_SIZE', sheet: 'Students', dimension: 'COLUMNS', start: 'C', count: 2, pixelSize: 200 }, 'Resize the “Email” and “Department” columns on “Students”'],
    [{ type: 'UPDATE_DIMENSION_SIZE', sheet: 'Students', dimension: 'ROWS', start: '3', count: 2, pixelSize: 40 }, 'Resize rows 3 to 4 on “Students”'],
    [{ type: 'SET_FORMULA', sheet: 'Summary', cell: 'B10', formula: '=SUM(B2:B9)' }, 'Add the formula =SUM(B2:B9) to “Count” in row 10 on “Summary”'],
  ])('describes %j precisely', (operation, text) => {
    expect(texts([operation])).toEqual([text]);
  });

  it('uses column names when columns are inserted, deleted, formatted or resized', () => {
    expect(
      texts([
        { type: 'INSERT_COLUMNS', sheet: 'Students', beforeColumn: 'E', count: 1 },
        { type: 'WRITE_RANGE', sheet: 'Students', range: 'E1', values: [['Phone Number']] },
        { type: 'INSERT_COLUMNS', sheet: 'Students', beforeColumn: 'E', count: 1 },
        { type: 'DELETE_COLUMNS', sheet: 'Students', startColumn: 'C', count: 1 },
        { type: 'UPDATE_CELL_FORMAT', sheet: 'Students', range: '1:1', bold: true, backgroundColor: '#FFF2CC' },
        { type: 'UPDATE_DIMENSION_SIZE', sheet: 'Students', dimension: 'COLUMNS', start: 'B', count: 1, pixelSize: 200 },
        { type: 'ADD_SHEET', title: 'Analytics' },
        { type: 'DELETE_SHEET_TAB', sheet: 'Summary' },
      ]),
    ).toEqual([
      'Add a “Phone Number” column after “Department” on “Students”',
      'Add a new column before “College” on “Students”',
      'Delete the “Email” column from “Students”',
      'Format the header row on “Students” (bold, background color)',
      'Resize the “Name” column on “Students”',
      'Create a new sheet tab called “Analytics”',
      'Delete the “Summary” tab and everything in it',
    ]);
  });

  it('describes record updates with the old and new value', () => {
    const [step] = describer.describeAll([
      {
        type: 'UPDATE_RECORD',
        sheet: 'Students',
        match: { column: 'Name', value: 'Rahul' },
        changes: [{ column: 'Year', value: '4th Year', from: '3rd Year' }],
        target: { row: 2, label: 'Rahul', changes: [{ column: 'Year', from: '3rd Year', to: '4th Year' }] },
      },
    ]);
    expect(step).toEqual({ text: "Update Rahul's Year", done: "Updated Rahul's Year from “3rd Year” to “4th Year”", change: { from: '3rd Year', to: '4th Year' } });
  });

  it('summarizes results in the past tense', () => {
    const steps = describer.describeAll(
      [
        { type: 'APPEND_ROWS', sheet: 'Summary', values: [['a'], ['b'], ['c'], ['d']] },
        { type: 'UPDATE_CELL_FORMAT', sheet: 'Summary', range: 'A1:B1', bold: true },
        { type: 'ADD_SHEET', title: 'Charts' },
        { type: 'ADD_SHEET', title: 'Notes' },
      ],
      STUDENTS,
    );
    expect(describer.resultSentence(steps)).toBe(
      'Added 4 rows to “Summary”. Formatted the header row on “Summary” (bold). Created a new sheet tab called “Charts”. Plus 1 more change.',
    );
  });

  it('labels read results by rows unless a range was requested', () => {
    const table = { range: "'Students'!A1:F4", values: [['h'], ['1'], ['2'], ['3']], totalRows: 4, truncated: false };
    expect(describer.tableLabel(table)).toBe('Students · 3 data rows · header row included');
    expect(describer.tableSummary(table)).toBe('3 data rows from “Students” (header row included)');
    expect(describer.tableLabel({ ...table, values: [['h'], ['1']], totalRows: 2 })).toBe('Students · 1 data row · header row included');
    expect(describer.tableLabel({ ...table, values: [['h']], totalRows: 1 })).toBe('Students · header row only');
    expect(describer.tableSummary({ ...table, values: [['h']], totalRows: 1 })).toBe('only the header row from “Students”');
    expect(describer.tableLabel({ ...table, range: "'Students'!A2:F5" })).toBe('Students · 4 rows');
    expect(describer.tableSummary({ ...table, range: "'Students'!A2:F5" })).toBe('4 rows from “Students”');
    expect(describer.tableLabel({ ...table, explicitRange: true })).toBe('Students · A1:F4');
    expect(describer.tableSummary({ ...table, explicitRange: true })).toBe('A1:F4 from “Students”');
    expect(describer.tableLabel({ ...table, totalRows: 451, truncated: true })).toBe('Students · first 3 of 450 data rows · header row included');
    expect(describer.tableSummary({ ...table, totalRows: 451, truncated: true })).toBe('the first 3 of 450 data rows from “Students” (header row included)');
    expect(table).toEqual({ range: "'Students'!A1:F4", values: [['h'], ['1'], ['2'], ['3']], totalRows: 4, truncated: false });
    expect(describer.tableLabel({ ...table, range: 'Spreadsheet structure' })).toBe('All tabs');
  });
});

describe('SheetOperationResolver', () => {
  function resolve(operation: SheetOperation) {
    return resolver.resolve(operation, TABS);
  }

  it('targets the first tab by default and matches tab names case-insensitively', () => {
    expect(resolve({ type: 'READ_RANGE', range: 'A1:B2' })).toEqual([{ kind: 'READ', range: "'Leads'!A1:B2" }]);
    expect(resolve({ type: 'CLEAR_RANGE', sheet: "q1 'notes'", range: 'B2:B' })).toEqual([{ kind: 'CLEAR', range: "'Q1 ''Notes'''!B2:B" }]);
  });

  it('sizes writes from the values and keeps them RAW', () => {
    expect(resolve({ type: 'WRITE_RANGE', range: 'B3', values: [['a', 'b', 'c'], ['d']] })).toEqual([
      { kind: 'WRITE', range: "'Leads'!B3:D4", values: [['a', 'b', 'c'], ['d']], mode: 'RAW' },
    ]);
    expect(resolve({ type: 'SET_FORMULA', cell: 'C5', formula: '=A5*2' })).toEqual([
      { kind: 'WRITE', range: "'Leads'!C5", values: [['=A5*2']], mode: 'USER_ENTERED' },
    ]);
  });

  it('turns a header row into a write, a bold format and a frozen row', () => {
    const steps = resolve({ type: 'SET_HEADER_ROW', headers: ['Name', 'Email', 'Phone'] });
    expect(steps[0]).toEqual({ kind: 'WRITE', range: "'Leads'!A1:C1", values: [['Name', 'Email', 'Phone']], mode: 'RAW' });
    expect(steps.slice(1).map((step) => (step.kind === 'STRUCTURE' ? step.change.kind : step.kind))).toEqual(['FORMAT_CELLS', 'FREEZE_ROWS']);
  });

  it('maps structural operations to sheet ids and zero-based indexes', () => {
    expect(resolve({ type: 'INSERT_COLUMNS', sheet: "Q1 'Notes'", beforeColumn: 'C', count: 2 })).toEqual([
      { kind: 'STRUCTURE', change: { kind: 'INSERT_DIMENSION', sheetId: 7, dimension: 'COLUMNS', startIndex: 2, count: 2 } },
    ]);
    expect(resolve({ type: 'INSERT_ROWS', count: 5 })).toEqual([
      { kind: 'STRUCTURE', change: { kind: 'APPEND_DIMENSION', sheetId: 0, dimension: 'ROWS', count: 5 } },
    ]);
    expect(resolve({ type: 'DELETE_ROWS', startRow: 4, count: 2 })).toEqual([
      { kind: 'STRUCTURE', change: { kind: 'DELETE_DIMENSION', sheetId: 0, dimension: 'ROWS', startIndex: 3, count: 2 } },
    ]);
    expect(resolve({ type: 'UPDATE_DIMENSION_SIZE', dimension: 'ROWS', start: '3', count: 2, pixelSize: 40 })).toEqual([
      { kind: 'STRUCTURE', change: { kind: 'RESIZE_DIMENSION', sheetId: 0, dimension: 'ROWS', startIndex: 2, count: 2, pixelSize: 40 } },
    ]);
  });

  it('refuses missing tabs, duplicate titles and deleting the last tab', () => {
    expect(() => resolve({ type: 'READ_RANGE', sheet: 'Budget', range: 'A1' })).toThrow(ValidationError);
    expect(() => resolve({ type: 'ADD_SHEET', title: 'leads' })).toThrow('already exists');
    expect(() => resolve({ type: 'RENAME_SHEET', sheet: 'Leads', newTitle: "Q1 'Notes'" })).toThrow('already exists');
    expect(() => resolver.resolve({ type: 'DELETE_SHEET_TAB', sheet: 'Leads' }, TABS.slice(0, 1))).toThrow('at least one tab');
    expect(() => resolve({ type: 'UPDATE_DIMENSION_SIZE', dimension: 'ROWS', start: 'B', count: 1, pixelSize: 40 })).toThrow(ValidationError);
    expect(() => resolve({ type: 'CREATE_SPREADSHEET', title: 'x', tabs: [{ title: 'y' }] })).toThrow(ValidationError);
  });
});

describe('SpreadsheetReferenceParser', () => {
  const parser = new SpreadsheetReferenceParser();
  const ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';

  it.each([
    `https://docs.google.com/spreadsheets/d/${ID}/edit`,
    `Use this Google Sheet: https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0.`,
    `https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`,
    `https://docs.google.com/spreadsheets/u/1/d/${ID}/edit`,
    `(https://docs.google.com/spreadsheets/d/${ID})`,
    `Use spreadsheet ID ${ID}`,
    `the sheet id is "${ID}"`,
    `https://docs.google.com/spreadsheets/d/${ID}/edit and again https://docs.google.com/spreadsheets/d/${ID}/view`,
  ])('extracts the spreadsheet ID from %s', (text) => {
    expect(parser.parse(text)).toEqual({ kind: 'FOUND', spreadsheetId: ID });
  });

  it.each([
    ['https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit', 'not a Google Sheet'],
    ['https://docs.google.com/forms/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit', 'not a Google Sheet'],
    ['https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/view', 'not a Google Sheet'],
    ['https://docs.google.com/spreadsheets/d/e/2PACX-1vQabcdefghijklmnopqrstuvwxyz/pubhtml', 'Publish to the web'],
    ['https://docs.google.com/spreadsheets/d/short/edit', 'does not contain a valid spreadsheet ID'],
    ['https://docs.google.com/spreadsheets/', 'does not contain a valid spreadsheet ID'],
    ['https://docs.google.com/spreadsheets/d/<script>alert(1)</script>/edit', 'does not contain a valid spreadsheet ID'],
    [`https://docs.google.com/spreadsheets/d/${ID}/edit https://docs.google.com/spreadsheets/d/${ID.replace('1', '2')}/edit`, 'more than one'],
    ['spreadsheet ID ../../etc/passwd', 'is not a valid Google Sheets spreadsheet ID'],
  ])('rejects %s', (text, reason) => {
    const result = parser.parse(text);
    expect(result.kind).toBe('INVALID');
    expect(result.kind === 'INVALID' ? result.reason : '').toContain(reason);
  });

  it.each(['Show me the first 20 rows', 'https://example.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit', 'https://docs.google.com.evil.example/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit'])(
    'finds nothing in %s',
    (text) => {
      expect(parser.parse(text)).toEqual({ kind: 'NONE' });
    },
  );

  it('builds only canonical URLs from valid IDs', () => {
    expect(parser.canonicalUrl(ID)).toBe(`https://docs.google.com/spreadsheets/d/${ID}/edit`);
    expect(() => parser.canonicalUrl('bad/id')).toThrow();
  });
});

describe('Spreadsheet origin and activation', () => {
  it('distinguishes created and linked spreadsheets and moves activation forward', () => {
    const base = { id: 's', userId: 'u', conversationId: 'c', googleSpreadsheetId: 'g', url: 'https://docs.google.com/spreadsheets/d/g/edit', title: 'T', tabs: [] };
    const created = Spreadsheet.register(base, new Date('2026-01-01T00:00:00Z'));
    const linked = Spreadsheet.link(base, new Date('2026-01-02T00:00:00Z'));
    expect(created.origin).toBe('CREATED_BY_FORMS_AI');
    expect(linked.origin).toBe('LINKED_EXISTING');
    const later = new Date('2026-01-03T00:00:00Z');
    expect(created.activate(later).activatedAt).toEqual(later);
    expect(created.activate(later).origin).toBe('CREATED_BY_FORMS_AI');
  });
});
