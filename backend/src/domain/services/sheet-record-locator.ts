import type { HeaderKind, HeaderMatcher } from './header-matcher.js';
import type { TextNormalizer } from './text-normalizer.js';

export interface SheetGrid {
  headers: string[];
  rows: string[][];
}

export type RecordLookup = { column?: string; value: string } | { row: number };

export type RecordLocation =
  | { kind: 'FOUND'; row: number; column: number | null; record: string[]; exact: boolean }
  | { kind: 'AMBIGUOUS'; rows: number[]; column: number }
  | { kind: 'NOT_FOUND'; column: number | null }
  | { kind: 'UNKNOWN_COLUMN'; column: string };

export interface RecordIdentity {
  header: string;
  value: string;
}

const FIRST_DATA_ROW = 2;
const VALUE_PRIORITY: Readonly<Record<'EMAIL' | 'IDENTIFIER' | 'NAME', readonly HeaderKind[]>> = {
  EMAIL: ['EMAIL', 'IDENTIFIER', 'NAME', 'OTHER'],
  IDENTIFIER: ['IDENTIFIER', 'EMAIL', 'NAME', 'OTHER'],
  NAME: ['NAME', 'IDENTIFIER', 'EMAIL', 'OTHER'],
};

export class SheetRecordLocator {
  constructor(
    private readonly text: TextNormalizer,
    private readonly headers: HeaderMatcher,
  ) {}

  locate(grid: SheetGrid, lookup: RecordLookup): RecordLocation {
    if ('row' in lookup) {
      const record = grid.rows[lookup.row - FIRST_DATA_ROW];
      return record && record.some((cell) => cell.trim().length > 0)
        ? { kind: 'FOUND', row: lookup.row, column: null, record, exact: true }
        : { kind: 'NOT_FOUND', column: null };
    }
    const value = this.text.comparable(this.text.stripPossessive(lookup.value));
    if (value.length === 0) {
      return { kind: 'NOT_FOUND', column: null };
    }
    const requested = lookup.column === undefined ? null : this.headers.find(grid.headers, lookup.column);
    if (lookup.column !== undefined && requested === null) {
      return { kind: 'UNKNOWN_COLUMN', column: lookup.column };
    }
    const columns = requested === null ? this.rankedColumns(grid.headers, value) : [requested];
    for (const column of columns) {
      const rows = this.matchingRows(grid, column, (cell) => this.text.comparable(cell) === value);
      if (rows.length > 0) {
        return this.outcome(grid, rows, column, true);
      }
    }
    const valueWords = this.text.words(value);
    for (const column of columns.filter((index) => this.headers.kind(grid.headers[index] ?? '') === 'NAME')) {
      const rows = this.matchingRows(grid, column, (cell) => this.containsWords(this.text.words(cell), valueWords));
      if (rows.length > 0) {
        return this.outcome(grid, rows, column, false);
      }
    }
    return { kind: 'NOT_FOUND', column: requested ?? this.firstOfKind(grid.headers, 'NAME') };
  }

  label(grid: SheetGrid, record: readonly string[], fallback: string): string {
    const name = this.firstOfKind(grid.headers, 'NAME');
    const value = name === null ? '' : (record[name] ?? '').trim();
    return value || this.text.stripPossessive(fallback);
  }

  identity(grid: SheetGrid, record: readonly string[], except: number | null): RecordIdentity | null {
    for (const kind of ['IDENTIFIER', 'EMAIL'] as const) {
      const index = grid.headers.findIndex((header, position) => position !== except && this.headers.kind(header) === kind && (record[position] ?? '').trim());
      if (index >= 0) {
        return { header: grid.headers[index]!, value: record[index]!.trim() };
      }
    }
    return null;
  }

  keyColumn(grid: SheetGrid, record: readonly string[]): number | null {
    for (const kind of ['IDENTIFIER', 'EMAIL', 'NAME', 'OTHER'] as const) {
      const index = grid.headers.findIndex((header, position) => this.headers.kind(header) === kind && (record[position] ?? '').trim());
      if (index >= 0) {
        return index;
      }
    }
    return null;
  }

  identifierHeader(headers: readonly string[], except: number | null): string | null {
    const index = headers.findIndex((header, position) => position !== except && this.headers.kind(header) === 'IDENTIFIER');
    return index >= 0 ? headers[index]! : null;
  }

  firstOfKind(headers: readonly string[], kind: HeaderKind): number | null {
    const index = headers.findIndex((header) => this.headers.kind(header) === kind);
    return index >= 0 ? index : null;
  }

  isNameColumn(headers: readonly string[], column: number | null): boolean {
    return column !== null && this.headers.kind(headers[column] ?? '') === 'NAME';
  }

  private rankedColumns(headers: readonly string[], value: string): number[] {
    const shape = value.includes('@') ? 'EMAIL' : /\d/.test(value) && /\p{L}/u.test(value) ? 'IDENTIFIER' : 'NAME';
    const order = VALUE_PRIORITY[shape];
    return headers
      .map((header, index) => ({ index, rank: order.indexOf(this.headers.kind(header)) }))
      .sort((first, second) => first.rank - second.rank || first.index - second.index)
      .map((entry) => entry.index);
  }

  private matchingRows(grid: SheetGrid, column: number, matches: (cell: string) => boolean): number[] {
    return grid.rows.flatMap((row, index) => {
      const cell = row[column] ?? '';
      return cell.trim().length > 0 && matches(cell) ? [index + FIRST_DATA_ROW] : [];
    });
  }

  private containsWords(cellWords: readonly string[], valueWords: readonly string[]): boolean {
    if (valueWords.length === 0 || valueWords.length >= cellWords.length) {
      return false;
    }
    return cellWords.some((_word, start) => valueWords.every((word, offset) => cellWords[start + offset] === word));
  }

  private outcome(grid: SheetGrid, rows: number[], column: number, exact: boolean): RecordLocation {
    if (rows.length > 1) {
      return { kind: 'AMBIGUOUS', rows, column };
    }
    const row = rows[0]!;
    return { kind: 'FOUND', row, column, record: grid.rows[row - FIRST_DATA_ROW]!, exact };
  }
}
