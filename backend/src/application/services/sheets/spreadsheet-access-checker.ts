import { GoogleSheetsError } from '../../../shared/errors/application-errors.js';
import type { InspectedSpreadsheet, SpreadsheetInspector } from './spreadsheet-inspector.js';

const NO_ACCESS_STATUSES = new Set([403, 404]);
const NO_ACCESS =
  'Your Google account cannot open this Google Sheet. Check that the link is correct and that the spreadsheet is shared with your Google account, then try again.';

function statusOf(error: GoogleSheetsError): number | null {
  const status = error.details?.status;
  return typeof status === 'number' ? status : null;
}

export class SpreadsheetAccessChecker {
  constructor(private readonly inspector: SpreadsheetInspector) {}

  async open(accessToken: string, spreadsheetId: string): Promise<InspectedSpreadsheet> {
    try {
      return await this.inspector.inspect(accessToken, spreadsheetId);
    } catch (error) {
      if (error instanceof GoogleSheetsError && NO_ACCESS_STATUSES.has(statusOf(error) ?? 0)) {
        throw new GoogleSheetsError(NO_ACCESS, { status: statusOf(error) }, { cause: error });
      }
      throw error;
    }
  }
}
