import { SHEET_LIMITS, type SheetOperation } from '@forms-ai/contracts';
import type { SheetPlanRequest, SheetSummaryRequest, SpreadsheetContext } from '../../../domain/interfaces/ai-provider.js';
import { A1Notation } from '../../../domain/services/a1-notation.js';

interface RuleBasedSheetPlan {
  summary: string;
  operations: SheetOperation[];
  clarificationQuestion?: string;
}

const QUOTES = /^["“'‘]+|["”'’.]+$/g;
const TITLE_SUFFIX = /\s+(?:with|that has|having)\b.*$/i;
const DEFAULT_TAB = 'Sheet1';
const DEFAULT_READ_ROWS = 20;
const SUMMARY_REQUEST = /\b(summar\w*|analy[sz]\w*|insights?|overview)\b/i;
const COUNT_WORDS: Readonly<Record<string, number>> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const ROW_COUNT = /\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:data\s+)?rows?\b/i;
const FIRST_ROW = /\b(?:first|top)\s+(?:data\s+)?row\b/i;
const EVERY_ROW = /\b(?:all|every|entire|whole)\b(?:\s+(?:the|of\s+the))?\s+(?:rows?|data|sheet|spreadsheet|tab|records?)\b|\beverything\b/i;

function clean(text: string): string {
  return text.trim().replace(QUOTES, '').trim();
}

function titleCase(text: string): string {
  return clean(text)
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => (word === word.toUpperCase() && word.length > 1 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

function list(text: string): string[] {
  return text
    .replace(/\.$/, '')
    .split(/\s*(?:,|\band\b)\s*/i)
    .map(clean)
    .filter((entry) => entry.length > 0);
}

export class RuleBasedSheetPlanner {
  private readonly notation = new A1Notation();

  plan(request: SheetPlanRequest): RuleBasedSheetPlan {
    const instruction = request.instruction.trim();
    if (request.kind === 'CREATE') {
      return this.create(instruction);
    }
    const spreadsheet = request.context.currentSpreadsheet ?? null;
    return request.kind === 'READ' ? this.read(instruction, spreadsheet) : this.modify(instruction, spreadsheet);
  }

  private create(instruction: string): RuleBasedSheetPlan {
    const columns = /\bcolumns?\b\s*(?:for|:|called|named|of|-)?\s*(.+)$/i.exec(instruction)?.[1];
    const headers = columns ? list(columns) : [];
    const tab = /\btab\s+(?:called|named)\s+(.+?)(?:\s+(?:with|and)\b|[,.]|$)/i.exec(instruction)?.[1];
    const title = this.spreadsheetTitle(instruction.replace(/\bcolumns?\b.*$/i, '').replace(/\b(?:with\s+)?(?:a\s+)?tab\s+(?:called|named)\b.*$/i, '')) ?? 'Untitled spreadsheet';
    const tabTitle = tab ? titleCase(tab) : DEFAULT_TAB;
    return {
      summary: `Create the spreadsheet “${title}”${headers.length ? ` with ${headers.length} columns` : ''}.`,
      operations: [{ type: 'CREATE_SPREADSHEET', title, tabs: [{ title: tabTitle, ...(headers.length ? { headers } : {}) }] }],
    };
  }

  private spreadsheetTitle(instruction: string): string | null {
    const named = /\b(?:called|named|titled)\s+(.+?)(?:\s+with\b|[,.]|$)/i.exec(instruction)?.[1];
    if (named) {
      return titleCase(named);
    }
    const purpose = /\bfor\s+(?:my|our|a|an|the)?\s*(.+?)(?:[,.]|$)/i.exec(instruction)?.[1];
    return purpose ? titleCase(purpose.replace(TITLE_SUFFIX, '')) : null;
  }

  private modify(instruction: string, spreadsheet: SpreadsheetContext | null): RuleBasedSheetPlan {
    const headers = spreadsheet?.tabs[0]?.headers ?? [];
    const spreadsheetTitle = /\b(?:rename|change)\s+(?:the\s+)?(?:title\s+of\s+the\s+)?spreadsheet(?:'s)?(?:\s+title)?\s+to\s+(.+)$/i.exec(instruction);
    if (spreadsheetTitle) {
      const title = titleCase(spreadsheetTitle[1]!);
      return { summary: `Renamed the spreadsheet to “${title}”.`, operations: [{ type: 'UPDATE_SPREADSHEET_TITLE', title }] };
    }
    const renameTab = /\brename\s+(?:the\s+)?(?:sheet|tab)\s+(.+?)\s+to\s+(.+)$/i.exec(instruction) ?? /\brename\s+(.+?)\s+(?:tab|sheet)\s+to\s+(.+)$/i.exec(instruction);
    if (renameTab) {
      const [sheet, newTitle] = [clean(renameTab[1]!), titleCase(renameTab[2]!)];
      return { summary: `Renamed the tab “${sheet}” to “${newTitle}”.`, operations: [{ type: 'RENAME_SHEET', sheet, newTitle }] };
    }
    const renameNamedTab = /\brename\s+(?:the\s+)?(.+?)\s+to\s+(.+)$/i.exec(instruction);
    const namedTab = renameNamedTab ? spreadsheet?.tabs.find((tab) => tab.title.toLowerCase() === clean(renameNamedTab[1]!).toLowerCase()) : undefined;
    if (renameNamedTab && namedTab) {
      const newTitle = titleCase(renameNamedTab[2]!);
      return { summary: `Renamed the tab “${namedTab.title}” to “${newTitle}”.`, operations: [{ type: 'RENAME_SHEET', sheet: namedTab.title, newTitle }] };
    }
    const renameFirst = /\brename\s+(?:the\s+)?(?:sheet|tab)\s+to\s+(.+)$/i.exec(instruction);
    if (renameFirst && spreadsheet?.tabs[0]) {
      const newTitle = titleCase(renameFirst[1]!);
      return { summary: `Renamed the tab to “${newTitle}”.`, operations: [{ type: 'RENAME_SHEET', sheet: spreadsheet.tabs[0].title, newTitle }] };
    }
    const addTab = /\b(?:add|create)\s+(?:a\s+)?(?:new\s+|another\s+)?(?:sheet|tab)\s+(?:called|named)\s+(.+)$/i.exec(instruction);
    if (addTab) {
      const title = titleCase(addTab[1]!);
      return { summary: `Added the tab “${title}”.`, operations: [{ type: 'ADD_SHEET', title }] };
    }
    const deleteTab = /\b(?:delete|remove)\s+(?:the\s+)?(?:sheet|tab)\s+(.+)$/i.exec(instruction);
    if (deleteTab) {
      const sheet = clean(deleteTab[1]!);
      return { summary: `Deleted the tab “${sheet}”.`, operations: [{ type: 'DELETE_SHEET_TAB', sheet }] };
    }
    const addRows = /\badd\s+(\d{1,4})\s+(?:more\s+|empty\s+|new\s+|blank\s+)?rows?\b/i.exec(instruction);
    if (addRows) {
      const count = Number(addRows[1]);
      return { summary: `Added ${count} empty rows.`, operations: [{ type: 'INSERT_ROWS', count }] };
    }
    const addColumn = /\badd\s+(?:a\s+)?(?:new\s+)?column\s+(?:called|named)\s+(.+?)(?:\s+after\s+(?:the\s+)?(.+?)(?:\s+column)?)?\.?$/i.exec(instruction);
    if (addColumn) {
      return this.addColumn(titleCase(addColumn[1]!), addColumn[2] ? clean(addColumn[2]) : null, headers);
    }
    const addNamedColumn = /\badd\s+(?:a|an)\s+(?:new\s+)?(.+?)\s+column(?:\s+after\s+(?:the\s+)?(.+?)(?:\s+column)?)?\.?$/i.exec(instruction);
    if (addNamedColumn && !/^(?:new|another|empty|blank|extra|more)$/i.test(clean(addNamedColumn[1]!))) {
      return this.addColumn(titleCase(addNamedColumn[1]!), addNamedColumn[2] ? clean(addNamedColumn[2]) : null, headers);
    }
    const renameHeader = /\b(?:rename|change)\s+(?:the\s+)?(.+?)\s+(?:column|header)(?:\s+header)?\s+to\s+(.+)$/i.exec(instruction);
    if (renameHeader) {
      const index = this.headerIndex(headers, clean(renameHeader[1]!));
      if (index >= 0) {
        const header = clean(renameHeader[2]!);
        const cell = `${this.notation.columnLetters(index)}1`;
        return { summary: `Renamed the “${headers[index]}” column to “${header}”.`, operations: [{ type: 'WRITE_RANGE', range: cell, values: [[header]] }] };
      }
    }
    const clearColumn = /\bclear\s+(?:the\s+values\s+in\s+)?column\s+([A-Z]{1,3})\b/i.exec(instruction);
    if (clearColumn) {
      const column = clearColumn[1]!.toUpperCase();
      return { summary: `Cleared the values in column ${column}.`, operations: [{ type: 'CLEAR_RANGE', range: `${column}2:${column}` }] };
    }
    const clearRange = /\bclear\s+(?:the\s+values\s+in\s+)?([A-Z]{1,3}\d+(?::[A-Z]{1,3}\d+)?)\b/i.exec(instruction);
    if (clearRange) {
      const range = clearRange[1]!.toUpperCase();
      return { summary: `Cleared the values in ${range}.`, operations: [{ type: 'CLEAR_RANGE', range }] };
    }
    if (/\bfirst row\b/i.test(instruction) && /\b(bold|header)/i.test(instruction)) {
      return { summary: 'Formatted the first row as a bold header.', operations: [{ type: 'UPDATE_CELL_FORMAT', range: '1:1', bold: true }] };
    }
    return {
      summary: 'No change prepared.',
      operations: [],
      clarificationQuestion: 'Which change should I make to the Google Sheet? For example: add a column called Phone, rename a tab, or add 20 rows.',
    };
  }

  private addColumn(title: string, after: string | null, headers: readonly string[]): RuleBasedSheetPlan {
    const anchor = after === null ? -1 : this.headerIndex(headers, after);
    if (anchor >= 0) {
      const column = this.notation.columnLetters(anchor + 1);
      return {
        summary: `Added the column “${title}” after “${headers[anchor]}”.`,
        operations: [
          { type: 'INSERT_COLUMNS', beforeColumn: column, count: 1 },
          { type: 'WRITE_RANGE', range: `${column}1`, values: [[title]] },
        ],
      };
    }
    const column = this.notation.columnLetters(headers.length);
    return { summary: `Added the column “${title}”.`, operations: [{ type: 'WRITE_RANGE', range: `${column}1`, values: [[title]] }] };
  }

  summarize(request: SheetSummaryRequest): string {
    const { table } = request;
    const [header = [], ...rows] = table.values;
    const coverage = table.truncated ? ` (only the first ${table.values.length} of ${table.totalRows} rows were read)` : '';
    const columns = header.map((name, index) => {
      const filled = rows.filter((row) => (row[index] ?? '').trim() !== '').length;
      return `${name.trim() || this.notation.columnLetters(index)}: ${filled} filled`;
    });
    return [
      `“${request.spreadsheetTitle}” has ${rows.length} row${rows.length === 1 ? '' : 's'} below the header row in ${table.label.split(' · ')[0]}${coverage}.`,
      columns.length > 0 ? `Values per column: ${columns.join(', ')}.` : '',
    ]
      .filter((line) => line.length > 0)
      .join(' ');
  }

  private read(instruction: string, spreadsheet: SpreadsheetContext | null): RuleBasedSheetPlan {
    const summarize = SUMMARY_REQUEST.test(instruction);
    const range = /\b([A-Z]{1,3}\d+:[A-Z]{1,3}\d+)\b/i.exec(instruction)?.[1];
    if (range) {
      return { summary: `Read ${range.toUpperCase()}.`, operations: [{ type: 'READ_RANGE', range: range.toUpperCase(), ...(summarize ? { summarize } : {}) }] };
    }
    if (!summarize && /\b(how many|what columns|which columns|columns does|tabs?|structure)\b/i.test(instruction)) {
      return { summary: 'Read the spreadsheet structure.', operations: [{ type: 'GET_SPREADSHEET' }] };
    }
    const headers = spreadsheet?.tabs[0]?.headers ?? [];
    const requested = this.requestedRows(instruction);
    const rows = requested ?? (summarize ? SHEET_LIMITS.maxReadRows : DEFAULT_READ_ROWS);
    const width = Math.max(1, spreadsheet?.tabs[0]?.headers.length ?? 26);
    const column = this.requestedColumn(instruction, headers);
    const [firstColumn, lastColumn] = column >= 0 ? [this.notation.columnLetters(column), this.notation.columnLetters(column)] : ['A', this.notation.columnLetters(Math.min(width, 26) - 1)];
    const everyRow = requested === null && !summarize && (column >= 0 || EVERY_ROW.test(instruction));
    const target = `${firstColumn}1:${lastColumn}${everyRow ? '' : rows + 1}`;
    const subject = column >= 0 ? `the “${headers[column]}” column` : everyRow ? 'every row' : `the first ${rows} rows`;
    return {
      summary: summarize ? `Read and summarized ${subject}.` : `Read ${subject}.`,
      operations: [{ type: 'READ_RANGE', range: target, ...(summarize ? { summarize } : {}) }],
    };
  }

  private requestedRows(instruction: string): number | null {
    const counted = ROW_COUNT.exec(instruction)?.[1];
    if (counted) {
      return COUNT_WORDS[counted.toLowerCase()] ?? Number(counted);
    }
    return FIRST_ROW.test(instruction) ? 1 : null;
  }

  private requestedColumn(instruction: string, headers: readonly string[]): number {
    const lowered = instruction.toLowerCase();
    const mentions = (header: string) => {
      const name = header.trim().toLowerCase();
      return name.length > 0 && (lowered.includes(`${name} column`) || lowered.includes(`column ${name}`) || lowered.includes(`${name} values`));
    };
    return headers.reduce((best, header, index) => (mentions(header) && (best < 0 || header.length > headers[best]!.length) ? index : best), -1);
  }

  private headerIndex(headers: readonly string[], name: string): number {
    const target = name.toLowerCase();
    return headers.findIndex((header) => header.toLowerCase() === target);
  }
}
