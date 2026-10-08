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
  it('describes every step in plain language', () => {
    const steps = new SheetOperationDescriber().describeAll([
      { type: 'CREATE_SPREADSHEET', title: 'Leads', tabs: [{ title: 'Sheet1', headers: ['Name', 'Email'], rows: [['Ada', 'a@x.io']] }] },
      { type: 'DELETE_SHEET_TAB', sheet: 'Old' },
      { type: 'INSERT_ROWS', count: 1 },
      { type: 'UPDATE_CELL_FORMAT', range: 'A1:B1', bold: true, backgroundColor: '#FFEEAA' },
      { type: 'SET_FORMULA', sheet: 'Totals', cell: 'B10', formula: '=SUM(B2:B9)' },
    ]);
    expect(steps).toEqual([
      'Create the spreadsheet “Leads”',
      'Add the tab “Sheet1” with columns Name, Email and 1 row of data',
      'Delete the tab “Old” and everything in it',
      'Add 1 empty row at the end',
      'Format A1:B1: bold, background #FFEEAA',
      'Set B10 to the formula =SUM(B2:B9) on “Totals”',
    ]);
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
