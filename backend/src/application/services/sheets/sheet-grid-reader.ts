import { SHEET_LIMITS } from '@forms-ai/contracts';
import type { SheetsGateway, SpreadsheetTabSnapshot } from '../../../domain/interfaces/sheets.js';
import type { A1Notation } from '../../../domain/services/a1-notation.js';
import type { SheetGrid } from '../../../domain/services/sheet-record-locator.js';

export class SheetGridReader {
  constructor(
    private readonly gateway: SheetsGateway,
    private readonly notation: A1Notation,
  ) {}

  async read(accessToken: string, spreadsheetId: string, tab: SpreadsheetTabSnapshot): Promise<SheetGrid> {
    const width = Math.min(Math.max(tab.columnCount, 1), SHEET_LIMITS.maxWriteColumns);
    const height = Math.max(tab.rowCount, 1);
    const range = this.notation.qualify(tab.title, `A1:${this.notation.columnLetters(width - 1)}${height}`);
    const [headers = [], ...rows] = await this.gateway.readValues(accessToken, spreadsheetId, range);
    return { headers: headers.map((header) => header.trim()), rows };
  }
}
