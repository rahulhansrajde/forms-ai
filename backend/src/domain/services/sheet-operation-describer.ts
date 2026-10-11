import type { SheetActionStep, SheetOperation, SheetTableData, UpdateCellFormatOperation } from '@forms-ai/contracts';
import type { A1Notation } from './a1-notation.js';

export interface DescribedTab {
  title: string;
  headers: string[];
}

interface RowSpan {
  first: number;
  last: number | null;
}

interface ColumnSpan {
  first: number;
  last: number;
}

interface RangeText {
  text: string;
  note: string;
}

const MAX_LISTED_HEADERS = 8;
const MAX_RESULT_SENTENCES = 3;
const STRUCTURE_RANGE = 'Spreadsheet structure';
const QUALIFIED_RANGE = /^'((?:[^']|'')*)'!(.+)$/;
const NAME_HEADER = /\bname\b/i;
const HEADER_NOTE = 'Header row included';
const PAST_TENSE: Readonly<Record<string, string>> = {
  Add: 'Added',
  Clear: 'Cleared',
  Connect: 'Connected',
  Create: 'Created',
  Delete: 'Deleted',
  Format: 'Formatted',
  Insert: 'Inserted',
  'Look up': 'Looked up',
  Read: 'Read',
  Rename: 'Renamed',
  Resize: 'Resized',
  Set: 'Set',
  Update: 'Updated',
  Use: 'Used',
  Write: 'Wrote',
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function quoted(text: string): string {
  return `“${text}”`;
}

export class SheetOperationDescriber {
  constructor(private readonly notation: A1Notation) {}

  describeAll(operations: readonly SheetOperation[], tabs: readonly DescribedTab[] = []): SheetActionStep[] {
    const steps: SheetActionStep[] = [];
    for (let index = 0; index < operations.length; index += 1) {
      const merged = this.newColumn(operations[index]!, operations[index + 1], tabs);
      if (merged) {
        steps.push(merged);
        index += 1;
        continue;
      }
      steps.push(...this.describe(operations[index]!, tabs));
    }
    return steps;
  }

  resultSentence(steps: readonly SheetActionStep[]): string {
    const shown = steps.slice(0, MAX_RESULT_SENTENCES).map((step) => `${step.done}${step.note ? ` (${step.note.toLowerCase()})` : ''}.`);
    const hidden = steps.length - shown.length;
    return [...shown, ...(hidden > 0 ? [`Plus ${plural(hidden, 'more change')}.`] : [])].join(' ');
  }

  tableLabel(table: SheetTableData): string {
    if (table.range === STRUCTURE_RANGE) {
      return 'All tabs';
    }
    const { title, range } = this.split(table.range);
    if (table.record) {
      return `${title} · row ${table.record.row}`;
    }
    if (table.explicitRange) {
      return `${title} · ${range}`;
    }
    if (this.startsWithHeader(table, range) && table.values.length === 1) {
      return `${title} · header row only`;
    }
    const counted = this.countedRows(table, range);
    return counted.header ? `${title} · ${counted.rows} · ${HEADER_NOTE.toLowerCase()}` : `${title} · ${counted.rows}`;
  }

  tableSummary(table: SheetTableData): string {
    if (table.range === STRUCTURE_RANGE) {
      return 'every tab with its size and header row';
    }
    const { title, range } = this.split(table.range);
    if (table.record) {
      return `row ${table.record.row} from ${quoted(title)}`;
    }
    if (table.explicitRange) {
      return `${range} from ${quoted(title)}`;
    }
    if (this.startsWithHeader(table, range) && table.values.length === 1) {
      return `only the header row from ${quoted(title)}`;
    }
    const counted = this.countedRows(table, range);
    return `${table.truncated ? 'the ' : ''}${counted.rows} from ${quoted(title)}${counted.header ? ` (${HEADER_NOTE.toLowerCase()})` : ''}`;
  }

  private countedRows(table: SheetTableData, range: string): { rows: string; header: boolean } {
    const header = this.startsWithHeader(table, range);
    const noun = header ? 'data row' : 'row';
    const offset = header ? 1 : 0;
    const shown = table.values.length - offset;
    return {
      rows: table.truncated ? `first ${shown} of ${table.totalRows - offset} ${noun}s` : plural(shown, noun),
      header,
    };
  }

  private describe(operation: SheetOperation, tabs: readonly DescribedTab[]): SheetActionStep[] {
    switch (operation.type) {
      case 'CREATE_SPREADSHEET':
        return [
          this.step('Create', `the spreadsheet ${quoted(operation.title)}`),
          ...operation.tabs.map((tab) => {
            const columns = tab.headers?.length ? ` with columns ${this.list(tab.headers)}` : '';
            const rows = tab.rows?.length ? ` and ${plural(tab.rows.length, 'row')} of data` : '';
            return this.step('Add', `the tab ${quoted(tab.title)}${columns}${rows}`);
          }),
        ];
      case 'GET_SPREADSHEET':
        return [this.step('Look up', 'the tabs and columns of the spreadsheet')];
      case 'READ_RANGE': {
        const tab = this.tab(tabs, operation.sheet);
        const summary = operation.summarize ? ' and summarize them' : '';
        if (operation.explicitRange) {
          return [this.step('Read', `${operation.range} from ${quoted(tab.title)}${summary}`)];
        }
        const range = this.rangeText(operation.range, tab);
        return [this.step('Read', `${range.text} from ${quoted(tab.title)}${summary}`, range.note)];
      }
      case 'WRITE_RANGE':
      case 'UPDATE_RANGE':
        return [this.write(operation.range, operation.values, this.tab(tabs, operation.sheet))];
      case 'APPEND_ROWS':
        return [this.append(operation.values, this.tab(tabs, operation.sheet))];
      case 'CLEAR_RANGE': {
        const tab = this.tab(tabs, operation.sheet);
        const range = this.rangeText(operation.range, tab);
        return [this.step('Clear', `${range.text} from ${quoted(tab.title)}`, range.note)];
      }
      case 'ADD_SHEET':
        return [this.step('Create', `a new sheet tab called ${quoted(operation.title)}`)];
      case 'RENAME_SHEET':
        return [this.step('Rename', `the ${quoted(operation.sheet)} tab to ${quoted(operation.newTitle)}`)];
      case 'DELETE_SHEET_TAB':
        return [this.step('Delete', `the ${quoted(operation.sheet)} tab and everything in it`)];
      case 'INSERT_ROWS': {
        const tab = this.tab(tabs, operation.sheet);
        return [
          operation.beforeRow === undefined
            ? this.step('Add', `${plural(operation.count, 'empty row')} to ${quoted(tab.title)}`)
            : this.step('Insert', `${plural(operation.count, 'empty row')} above row ${operation.beforeRow} in ${quoted(tab.title)}`),
        ];
      }
      case 'INSERT_COLUMNS': {
        const tab = this.tab(tabs, operation.sheet);
        if (operation.beforeColumn === undefined) {
          return [this.step('Add', `${operation.count === 1 ? 'an empty column' : plural(operation.count, 'empty column')} to ${quoted(tab.title)}`)];
        }
        const before = this.header(tab, this.notation.columnIndex(operation.beforeColumn));
        const noun = operation.count === 1 ? 'a new column' : `${operation.count} new columns`;
        return [this.step('Add', `${noun}${before ? ` before ${quoted(before)}` : ''} on ${quoted(tab.title)}`)];
      }
      case 'DELETE_ROWS': {
        const tab = this.tab(tabs, operation.sheet);
        return [this.step('Delete', `${this.rowList(operation.startRow, operation.count)} from ${quoted(tab.title)}`)];
      }
      case 'DELETE_COLUMNS': {
        const tab = this.tab(tabs, operation.sheet);
        const start = this.notation.columnIndex(operation.startColumn);
        const names = this.columnNames(tab, { first: start, last: start + operation.count - 1 });
        return [this.step('Delete', `${names ? `the ${names}` : plural(operation.count, 'column')} from ${quoted(tab.title)}`)];
      }
      case 'UPDATE_CELL_FORMAT': {
        const tab = this.tab(tabs, operation.sheet);
        const range = this.rangeText(operation.range, tab);
        return [this.step('Format', `${range.text} on ${quoted(tab.title)} (${this.formatting(operation)})`, range.note)];
      }
      case 'UPDATE_DIMENSION_SIZE': {
        const tab = this.tab(tabs, operation.sheet);
        if (operation.dimension === 'COLUMNS') {
          const start = this.notation.columnIndex(operation.start);
          const names = this.columnNames(tab, { first: start, last: start + operation.count - 1 });
          return [this.step('Resize', `${names ? `the ${names}` : plural(operation.count, 'column')} on ${quoted(tab.title)}`)];
        }
        return [this.step('Resize', `${this.rowList(Number(operation.start), operation.count)} on ${quoted(tab.title)}`)];
      }
      case 'SET_HEADER_ROW':
        return [this.step('Set', `the header row on ${quoted(this.tab(tabs, operation.sheet).title)} to ${this.list(operation.headers)}`)];
      case 'SET_FORMULA': {
        const tab = this.tab(tabs, operation.sheet);
        const bounds = this.notation.bounds(operation.cell);
        const column = this.header(tab, bounds.startColumnIndex ?? 0);
        const row = (bounds.startRowIndex ?? 0) + 1;
        return [this.step('Add', `the formula ${operation.formula} to ${column ? quoted(column) : 'a cell'} in row ${row} on ${quoted(tab.title)}`)];
      }
      case 'UPDATE_SPREADSHEET_TITLE':
        return [this.step('Rename', `the spreadsheet to ${quoted(operation.title)}`)];
      case 'LINK_EXISTING_SPREADSHEET':
        return [
          this.step('Connect', `${operation.title ? `the existing Google Sheet ${quoted(operation.title)}` : 'the existing Google Sheet'} to this chat`),
          this.step('Use', 'it for the next Google Sheets requests in this chat'),
        ];
      case 'UPDATE_RECORD': {
        if (operation.target) {
          const label = operation.target.label;
          return operation.target.changes.map((change) => ({
            text: `Update ${label}'s ${change.column}`,
            done: `Updated ${label}'s ${change.column} from ${quoted(change.from || 'empty')} to ${quoted(change.to)}`,
            change: { from: change.from, to: change.to },
          }));
        }
        return [this.step('Update', `${operation.match.value}'s ${operation.changes.map((change) => change.column).join(' and ')}`)];
      }
    }
  }

  private newColumn(operation: SheetOperation, next: SheetOperation | undefined, tabs: readonly DescribedTab[]): SheetActionStep | null {
    if (operation.type !== 'INSERT_COLUMNS' || operation.count !== 1 || operation.beforeColumn === undefined) {
      return null;
    }
    if (!next || (next.type !== 'WRITE_RANGE' && next.type !== 'UPDATE_RANGE') || next.sheet !== operation.sheet) {
      return null;
    }
    const bounds = this.notation.bounds(next.range);
    const column = this.notation.columnIndex(operation.beforeColumn);
    const title = next.values[0]?.[0];
    if (bounds.startRowIndex !== 0 || bounds.startColumnIndex !== column || next.values.length !== 1 || next.values[0]!.length !== 1 || !title) {
      return null;
    }
    const tab = this.tab(tabs, operation.sheet);
    const after = column > 0 ? this.header(tab, column - 1) : null;
    const before = this.header(tab, column);
    const position = after ? ` after ${quoted(after)}` : before ? ` before ${quoted(before)}` : '';
    return this.step('Add', `a ${quoted(title)} column${position} on ${quoted(tab.title)}`);
  }

  private write(range: string, values: readonly string[][], tab: DescribedTab): SheetActionStep {
    const bounds = this.notation.bounds(range);
    const startRow = (bounds.startRowIndex ?? 0) + 1;
    const startColumn = bounds.startColumnIndex ?? 0;
    const height = values.length;
    const width = Math.max(1, ...values.map((row) => row.length));
    const lastRow = startRow + height - 1;
    const columns = { first: startColumn, last: startColumn + width - 1 };
    if (startRow === 1 && height === 1 && width === 1) {
      const current = this.header(tab, startColumn);
      const next = values[0]![0] ?? '';
      return current
        ? { ...this.step('Rename', `the ${quoted(current)} column to ${quoted(next)} on ${quoted(tab.title)}`), change: { from: current, to: next } }
        : this.step('Add', `a ${quoted(next)} column on ${quoted(tab.title)}`);
    }
    if (startRow === 1 && height === 1) {
      return this.step('Update', `the header row on ${quoted(tab.title)}`);
    }
    if (startRow === 1) {
      return this.step('Write', `${plural(height - 1, 'data row')} to ${quoted(tab.title)}`, HEADER_NOTE);
    }
    if (height === 1 && width === 1) {
      const column = this.header(tab, startColumn);
      return this.step('Set', `${column ? quoted(column) : 'one cell'} in row ${startRow} to ${quoted(values[0]![0] ?? '')} on ${quoted(tab.title)}`);
    }
    const rows = height === 1 ? `row ${startRow}` : `rows ${startRow} to ${lastRow}`;
    if (width === 1) {
      const column = this.header(tab, startColumn);
      return this.step('Update', `${column ? `the ${quoted(column)} values` : plural(height, 'cell')} in ${rows} on ${quoted(tab.title)}`);
    }
    if (startColumn === 0 && this.coversAllColumns(tab, columns)) {
      const name = height === 1 ? this.recordName(values[0]!, tab) : '';
      return name
        ? this.step('Write', `${name}'s record to row ${startRow} of ${quoted(tab.title)}`)
        : this.step('Write', `${plural(height, 'row')} of data to ${quoted(tab.title)} (${rows})`);
    }
    const names = this.columnNames(tab, columns);
    return this.step('Update', `${names ? `the ${names}` : plural(height * width, 'cell')} in ${rows} on ${quoted(tab.title)}`);
  }

  private append(values: readonly string[][], tab: DescribedTab): SheetActionStep {
    const name = values.length === 1 ? this.recordName(values[0]!, tab) : '';
    return name ? this.step('Add', `${name}'s record to ${quoted(tab.title)}`) : this.step('Add', `${plural(values.length, 'row')} to ${quoted(tab.title)}`);
  }

  private rangeText(range: string, tab: DescribedTab): RangeText {
    const bounds = this.notation.bounds(range);
    const rows: RowSpan | null = bounds.startRowIndex === undefined ? null : { first: bounds.startRowIndex + 1, last: bounds.endRowIndex ?? null };
    const columns: ColumnSpan | null =
      bounds.startColumnIndex === undefined || bounds.endColumnIndex === undefined ? null : { first: bounds.startColumnIndex, last: bounds.endColumnIndex - 1 };
    const header = this.hasHeaders(tab);
    const includesHeader = header && (rows === null || rows.first === 1);
    if (columns && columns.first === columns.last) {
      const counted = rows !== null && rows.first === 1 && rows.last !== null && rows.last > 1;
      return { text: this.singleColumn(rows, this.header(tab, columns.first), header), note: includesHeader && counted ? HEADER_NOTE : '' };
    }
    if (rows && rows.first === 1 && rows.last === 1) {
      const headers = columns && !this.coversAllColumns(tab, columns) ? this.columnNames(tab, columns, 'header') : null;
      return { text: headers ? `the ${headers}` : 'the header row', note: '' };
    }
    const names = columns && !this.coversAllColumns(tab, columns) ? this.columnNames(tab, columns) : null;
    const text = this.rowsText(rows, header);
    return { text: names ? `${text} of the ${names}` : text, note: includesHeader ? HEADER_NOTE : '' };
  }

  private singleColumn(rows: RowSpan | null, name: string | null, header: boolean): string {
    const values = name ? `the ${quoted(name)} values` : 'the values in one column';
    if (!rows || (rows.first === 1 && rows.last === null)) {
      return name ? `the whole ${quoted(name)} column` : 'a whole column';
    }
    if (rows.last === rows.first) {
      if (rows.first === 1) {
        return name ? `the ${quoted(name)} header` : 'one cell in row 1';
      }
      return name ? `the ${quoted(name)} value in row ${rows.first}` : `one cell in row ${rows.first}`;
    }
    if (rows.last === null) {
      return rows.first === 2 ? values : `${values} from row ${rows.first} onward`;
    }
    if (rows.first === 1 && header) {
      const count = rows.last - 1;
      return name ? `the first ${count === 1 ? '' : `${count} `}${quoted(name)} value${count === 1 ? '' : 's'}` : `the first ${plural(count, 'value')} in one column`;
    }
    return `${values} in rows ${rows.first} to ${rows.last}`;
  }

  private rowsText(rows: RowSpan | null, header: boolean): string {
    if (!rows || (rows.first === 1 && rows.last === null)) {
      return header ? 'every data row' : 'every row';
    }
    if (rows.last === null) {
      return rows.first === 2 ? 'every row below the header' : `every row from row ${rows.first} onward`;
    }
    if (rows.first === 1) {
      return header ? this.firstDataRows(rows.last - 1) : `the first ${plural(rows.last, 'row')}`;
    }
    return rows.first === rows.last ? `row ${rows.first}` : `rows ${rows.first} to ${rows.last}`;
  }

  private firstDataRows(count: number): string {
    return count === 1 ? 'the first data row' : `the first ${count} data rows`;
  }

  private rowList(first: number, count: number): string {
    return count === 1 ? `row ${first}` : `rows ${first} to ${first + count - 1}`;
  }

  private columnNames(tab: DescribedTab, columns: ColumnSpan, noun: 'column' | 'header' = 'column'): string | null {
    const names: string[] = [];
    for (let index = columns.first; index <= columns.last; index += 1) {
      const header = this.header(tab, index);
      if (!header) {
        return null;
      }
      names.push(header);
    }
    if (names.length === 1) {
      return `${quoted(names[0]!)} ${noun}`;
    }
    return names.length === 2
      ? `${quoted(names[0]!)} and ${quoted(names[1]!)} ${noun}s`
      : `${quoted(names[0]!)} to ${quoted(names[names.length - 1]!)} ${noun}s`;
  }

  private coversAllColumns(tab: DescribedTab, columns: ColumnSpan): boolean {
    return !this.hasHeaders(tab) || (columns.first === 0 && columns.last >= tab.headers.length - 1);
  }

  private hasHeaders(tab: DescribedTab): boolean {
    return tab.headers.some((header) => header.trim().length > 0);
  }

  private recordName(row: readonly string[], tab: DescribedTab): string {
    const column = tab.headers.findIndex((header) => NAME_HEADER.test(header));
    return column >= 0 ? (row[column] ?? '').trim() : '';
  }

  private startsWithHeader(table: SheetTableData, range: string): boolean {
    return table.values.length > 0 && this.notation.bounds(range).startRowIndex === 0;
  }

  private split(qualified: string): { title: string; range: string } {
    const match = QUALIFIED_RANGE.exec(qualified);
    return match ? { title: match[1]!.replace(/''/g, "'"), range: match[2]! } : { title: 'Sheet', range: qualified };
  }

  private tab(tabs: readonly DescribedTab[], title: string | undefined): DescribedTab {
    const match =
      title === undefined ? tabs[0] : (tabs.find((tab) => tab.title === title) ?? tabs.find((tab) => tab.title.toLowerCase() === title.toLowerCase()));
    return match ?? { title: title ?? 'the first tab', headers: [] };
  }

  private header(tab: DescribedTab, index: number): string | null {
    const header = tab.headers[index]?.trim();
    return header ? header : null;
  }

  private step(verb: string, object: string, note = ''): SheetActionStep {
    return { text: `${verb} ${object}`, done: `${PAST_TENSE[verb] ?? verb} ${object}`, change: null, ...(note ? { note } : {}) };
  }

  private formatting(operation: UpdateCellFormatOperation): string {
    return [
      operation.bold === undefined ? null : operation.bold ? 'bold' : 'not bold',
      operation.italic === undefined ? null : operation.italic ? 'italic' : 'not italic',
      operation.backgroundColor ? 'background color' : null,
      operation.textColor ? 'text color' : null,
      operation.horizontalAlignment ? `${operation.horizontalAlignment.toLowerCase()} aligned` : null,
    ]
      .filter((part): part is string => part !== null)
      .join(', ');
  }

  private list(values: readonly string[]): string {
    const shown = values.slice(0, MAX_LISTED_HEADERS).join(', ');
    return values.length > MAX_LISTED_HEADERS ? `${shown} and ${values.length - MAX_LISTED_HEADERS} more` : shown;
  }
}
