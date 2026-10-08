import { SHEET_LIMITS } from '@forms-ai/contracts';
import type { SpreadsheetTab } from '../../../domain/entities/spreadsheet.js';
import type { SheetsGateway, SpreadsheetSnapshot } from '../../../domain/interfaces/sheets.js';
import type { A1Notation } from '../../../domain/services/a1-notation.js';

export interface InspectedSpreadsheet {
  snapshot: SpreadsheetSnapshot;
  tabs: SpreadsheetTab[];
}

export class SpreadsheetInspector {
  constructor(
    private readonly gateway: SheetsGateway,
    private readonly notation: A1Notation,
  ) {}

  async inspect(accessToken: string, spreadsheetId: string): Promise<InspectedSpreadsheet> {
    const snapshot = await this.gateway.getSpreadsheet(accessToken, spreadsheetId);
    const lastColumn = this.notation.columnLetters(SHEET_LIMITS.maxWriteColumns - 1);
    const headerRows = await this.gateway.readRanges(
      accessToken,
      spreadsheetId,
      snapshot.tabs.map((tab) => this.notation.qualify(tab.title, `A1:${lastColumn}1`)),
    );
    return {
      snapshot,
      tabs: snapshot.tabs.map((tab, index) => ({ ...tab, headers: (headerRows[index]?.[0] ?? []).map((cell) => cell.trim()) })),
    };
  }
}
