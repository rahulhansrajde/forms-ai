import type { SheetOperation } from '@forms-ai/contracts';

const MAX_LISTED_HEADERS = 8;

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function quoted(text: string): string {
  return `“${text}”`;
}

export class SheetOperationDescriber {
  describeAll(operations: readonly SheetOperation[]): string[] {
    return operations.flatMap((operation) => this.describe(operation));
  }

  private describe(operation: SheetOperation): string[] {
    switch (operation.type) {
      case 'CREATE_SPREADSHEET':
        return [
          `Create the spreadsheet ${quoted(operation.title)}`,
          ...operation.tabs.map((tab) => {
            const columns = tab.headers?.length ? ` with columns ${this.list(tab.headers)}` : '';
            const rows = tab.rows?.length ? ` and ${plural(tab.rows.length, 'row')} of data` : '';
            return `Add the tab ${quoted(tab.title)}${columns}${rows}`;
          }),
        ];
      case 'GET_SPREADSHEET':
        return ['Read the spreadsheet tabs, sizes and header rows'];
      case 'READ_RANGE':
        return [`Read ${operation.range}${this.on(operation.sheet)}${operation.summarize ? ' and summarize it' : ''}`];
      case 'WRITE_RANGE':
      case 'UPDATE_RANGE':
        return [`Write ${plural(operation.values.length, 'row')} into ${operation.range}${this.on(operation.sheet)}`];
      case 'APPEND_ROWS':
        return [`Add ${plural(operation.values.length, 'row')} of data after the last row${this.on(operation.sheet)}`];
      case 'CLEAR_RANGE':
        return [`Clear the values in ${operation.range}${this.on(operation.sheet)}`];
      case 'ADD_SHEET':
        return [`Add a new tab ${quoted(operation.title)}`];
      case 'RENAME_SHEET':
        return [`Rename the tab ${quoted(operation.sheet)} to ${quoted(operation.newTitle)}`];
      case 'DELETE_SHEET_TAB':
        return [`Delete the tab ${quoted(operation.sheet)} and everything in it`];
      case 'INSERT_ROWS':
        return [
          operation.beforeRow === undefined
            ? `Add ${plural(operation.count, 'empty row')} at the end${this.on(operation.sheet)}`
            : `Insert ${plural(operation.count, 'empty row')} before row ${operation.beforeRow}${this.on(operation.sheet)}`,
        ];
      case 'INSERT_COLUMNS':
        return [
          operation.beforeColumn === undefined
            ? `Add ${plural(operation.count, 'empty column')} at the end${this.on(operation.sheet)}`
            : `Insert ${plural(operation.count, 'empty column')} before column ${operation.beforeColumn}${this.on(operation.sheet)}`,
        ];
      case 'DELETE_ROWS':
        return [`Delete ${plural(operation.count, 'row')} starting at row ${operation.startRow}${this.on(operation.sheet)}`];
      case 'DELETE_COLUMNS':
        return [`Delete ${plural(operation.count, 'column')} starting at column ${operation.startColumn}${this.on(operation.sheet)}`];
      case 'UPDATE_CELL_FORMAT':
        return [`Format ${operation.range}${this.on(operation.sheet)}: ${this.formatting(operation)}`];
      case 'UPDATE_DIMENSION_SIZE':
        return [
          `Set ${plural(operation.count, operation.dimension === 'ROWS' ? 'row' : 'column')} from ${operation.start} to ${operation.pixelSize}px${this.on(operation.sheet)}`,
        ];
      case 'SET_HEADER_ROW':
        return [`Set the header row to ${this.list(operation.headers)}${this.on(operation.sheet)}`];
      case 'SET_FORMULA':
        return [`Set ${operation.cell} to the formula ${operation.formula}${this.on(operation.sheet)}`];
      case 'UPDATE_SPREADSHEET_TITLE':
        return [`Rename the spreadsheet to ${quoted(operation.title)}`];
      case 'LINK_EXISTING_SPREADSHEET':
        return [
          `Connect the existing Google Sheet ${operation.title ? quoted(operation.title) : operation.spreadsheetId} to this chat`,
          'Use it for the next Google Sheets requests in this chat',
        ];
    }
  }

  private formatting(operation: Extract<SheetOperation, { type: 'UPDATE_CELL_FORMAT' }>): string {
    return [
      operation.bold === undefined ? null : operation.bold ? 'bold' : 'not bold',
      operation.italic === undefined ? null : operation.italic ? 'italic' : 'not italic',
      operation.backgroundColor ? `background ${operation.backgroundColor}` : null,
      operation.textColor ? `text colour ${operation.textColor}` : null,
      operation.horizontalAlignment ? `${operation.horizontalAlignment.toLowerCase()} aligned` : null,
    ]
      .filter((part): part is string => part !== null)
      .join(', ');
  }

  private list(values: readonly string[]): string {
    const shown = values.slice(0, MAX_LISTED_HEADERS).join(', ');
    return values.length > MAX_LISTED_HEADERS ? `${shown} and ${values.length - MAX_LISTED_HEADERS} more` : shown;
  }

  private on(sheet: string | undefined): string {
    return sheet ? ` on ${quoted(sheet)}` : '';
  }
}
