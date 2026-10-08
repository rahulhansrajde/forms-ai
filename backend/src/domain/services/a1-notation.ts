const CELL = '[A-Z]{1,3}[1-9]\\d{0,6}';
const COLUMN = '[A-Z]{1,3}';
const ROW = '[1-9]\\d{0,6}';
const ENDPOINT = `(?:${CELL}|${COLUMN}|${ROW})`;
const RANGE_PATTERN = new RegExp(`^${ENDPOINT}(?::${ENDPOINT})?$`);
const CELL_PATTERN = new RegExp(`^${CELL}$`);
const COLUMN_PATTERN = new RegExp(`^${COLUMN}$`);
const ENDPOINT_PARTS = /^([A-Z]{0,3})(\d*)$/;

export interface GridBounds {
  startRowIndex?: number;
  endRowIndex?: number;
  startColumnIndex?: number;
  endColumnIndex?: number;
}

interface Endpoint {
  column: number | null;
  row: number | null;
}

export class A1Notation {
  isRange(value: string): boolean {
    return RANGE_PATTERN.test(value);
  }

  isCell(value: string): boolean {
    return CELL_PATTERN.test(value);
  }

  isColumn(value: string): boolean {
    return COLUMN_PATTERN.test(value);
  }

  columnIndex(letters: string): number {
    return [...letters].reduce((total, letter) => total * 26 + (letter.charCodeAt(0) - 64), 0) - 1;
  }

  columnLetters(index: number): string {
    let remaining = index + 1;
    let letters = '';
    while (remaining > 0) {
      const offset = (remaining - 1) % 26;
      letters = String.fromCharCode(65 + offset) + letters;
      remaining = Math.floor((remaining - 1) / 26);
    }
    return letters;
  }

  qualify(sheetTitle: string, range: string): string {
    return `'${sheetTitle.replace(/'/g, "''")}'!${range}`;
  }

  bounds(range: string): GridBounds {
    const [first = '', second] = range.split(':');
    const start = this.endpoint(first);
    const end = second === undefined ? start : this.endpoint(second);
    return {
      ...(start.row !== null ? { startRowIndex: start.row - 1 } : {}),
      ...(end.row !== null ? { endRowIndex: end.row } : {}),
      ...(start.column !== null ? { startColumnIndex: start.column } : {}),
      ...(end.column !== null ? { endColumnIndex: end.column + 1 } : {}),
    };
  }

  private endpoint(text: string): Endpoint {
    const match = ENDPOINT_PARTS.exec(text);
    const letters = match?.[1] ?? '';
    const digits = match?.[2] ?? '';
    return {
      column: letters.length > 0 ? this.columnIndex(letters) : null,
      row: digits.length > 0 ? Number(digits) : null,
    };
  }
}
