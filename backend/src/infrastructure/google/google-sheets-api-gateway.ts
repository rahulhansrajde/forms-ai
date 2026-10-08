import { z } from 'zod';
import type { SheetsGateway, SpreadsheetSnapshot, StructuralChange, ValueInputMode } from '../../domain/interfaces/sheets.js';
import type { Logger } from '../../domain/interfaces/system.js';
import { GoogleOAuthError, GoogleSheetsError } from '../../shared/errors/application-errors.js';
import type { HttpClient, HttpResponse } from '../http/http-client.js';
import type { GoogleSheetsRequestBuilder } from './google-sheets-request-builder.js';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SPREADSHEET_FIELDS = 'spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title,sheetType,gridProperties(rowCount,columnCount))';
const MAX_GOOGLE_MESSAGE_LENGTH = 200;

const spreadsheetSchema = z.object({
  spreadsheetId: z.string().min(1),
  spreadsheetUrl: z.url(),
  properties: z.object({ title: z.string() }),
  sheets: z
    .array(
      z.object({
        properties: z.object({
          sheetId: z.number().int().default(0),
          title: z.string(),
          sheetType: z.string().default('GRID'),
          gridProperties: z.object({ rowCount: z.number().int().default(0), columnCount: z.number().int().default(0) }).default({ rowCount: 0, columnCount: 0 }),
        }),
      }),
    )
    .default([]),
});

const cellRowsSchema = z.array(z.array(z.union([z.string(), z.number(), z.boolean()]).transform(String))).default([]);
const valueRangeSchema = z.object({ values: cellRowsSchema });
const batchValuesSchema = z.object({ valueRanges: z.array(z.object({ values: cellRowsSchema })).default([]) });
const errorSchema = z.object({ error: z.object({ status: z.string().optional(), message: z.string().optional() }) });

export class GoogleSheetsApiGateway implements SheetsGateway {
  constructor(
    private readonly http: HttpClient,
    private readonly requests: GoogleSheetsRequestBuilder,
    private readonly logger: Logger,
  ) {}

  async createSpreadsheet(accessToken: string, title: string, tabTitles: readonly string[]): Promise<SpreadsheetSnapshot> {
    const response = await this.call(
      accessToken,
      'POST',
      `${SHEETS_API}?fields=${encodeURIComponent(SPREADSHEET_FIELDS)}`,
      { properties: { title }, sheets: tabTitles.map((tabTitle) => ({ properties: { title: tabTitle } })) },
      'create the spreadsheet',
    );
    return this.snapshot(response.body);
  }

  async getSpreadsheet(accessToken: string, spreadsheetId: string): Promise<SpreadsheetSnapshot> {
    const response = await this.call(accessToken, 'GET', `${this.spreadsheetUrl(spreadsheetId)}?fields=${encodeURIComponent(SPREADSHEET_FIELDS)}`, undefined, 'read the spreadsheet');
    return this.snapshot(response.body);
  }

  async readValues(accessToken: string, spreadsheetId: string, range: string): Promise<string[][]> {
    const response = await this.call(accessToken, 'GET', `${this.spreadsheetUrl(spreadsheetId)}/values/${encodeURIComponent(range)}`, undefined, 'read the range');
    return this.parse(valueRangeSchema, response.body).values;
  }

  async readRanges(accessToken: string, spreadsheetId: string, ranges: readonly string[]): Promise<string[][][]> {
    if (ranges.length === 0) {
      return [];
    }
    const query = ranges.map((range) => `ranges=${encodeURIComponent(range)}`).join('&');
    const response = await this.call(accessToken, 'GET', `${this.spreadsheetUrl(spreadsheetId)}/values:batchGet?${query}`, undefined, 'read the ranges');
    return this.parse(batchValuesSchema, response.body).valueRanges.map((valueRange) => valueRange.values);
  }

  async writeValues(accessToken: string, spreadsheetId: string, range: string, values: string[][], mode: ValueInputMode): Promise<void> {
    await this.call(
      accessToken,
      'PUT',
      `${this.spreadsheetUrl(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=${mode}`,
      { range, majorDimension: 'ROWS', values },
      'write the values',
    );
  }

  async appendValues(accessToken: string, spreadsheetId: string, range: string, values: string[][]): Promise<void> {
    await this.call(
      accessToken,
      'POST',
      `${this.spreadsheetUrl(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { majorDimension: 'ROWS', values },
      'append the rows',
    );
  }

  async clearValues(accessToken: string, spreadsheetId: string, range: string): Promise<void> {
    await this.call(accessToken, 'POST', `${this.spreadsheetUrl(spreadsheetId)}/values/${encodeURIComponent(range)}:clear`, {}, 'clear the range');
  }

  async applyStructuralChanges(accessToken: string, spreadsheetId: string, changes: readonly StructuralChange[]): Promise<void> {
    if (changes.length === 0) {
      return;
    }
    await this.call(
      accessToken,
      'POST',
      `${this.spreadsheetUrl(spreadsheetId)}:batchUpdate`,
      { requests: changes.map((change) => this.requests.build(change)) },
      'update the spreadsheet',
    );
  }

  private spreadsheetUrl(spreadsheetId: string): string {
    return `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}`;
  }

  private snapshot(body: unknown): SpreadsheetSnapshot {
    const parsed = this.parse(spreadsheetSchema, body);
    return {
      spreadsheetId: parsed.spreadsheetId,
      title: parsed.properties.title,
      url: parsed.spreadsheetUrl,
      tabs: parsed.sheets.filter((sheet) => sheet.properties.sheetType === 'GRID').map((sheet) => ({
        sheetId: sheet.properties.sheetId,
        title: sheet.properties.title,
        rowCount: sheet.properties.gridProperties.rowCount,
        columnCount: sheet.properties.gridProperties.columnCount,
      })),
    };
  }

  private parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new GoogleSheetsError('Google Sheets returned an unexpected response.');
    }
    return parsed.data;
  }

  private async call(accessToken: string, method: 'GET' | 'POST' | 'PUT', url: string, body: unknown, operation: string): Promise<HttpResponse> {
    let response: HttpResponse;
    try {
      response = await this.http.send({
        method,
        url,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new GoogleSheetsError('Google Sheets could not be reached. Check your connection and try again.');
    }
    if (response.status >= 200 && response.status < 300) {
      return response;
    }
    throw this.failure(response, operation);
  }

  private failure(response: HttpResponse, operation: string): Error {
    const parsed = errorSchema.safeParse(response.body);
    const status = parsed.success ? (parsed.data.error.status ?? '') : '';
    const message = parsed.success ? (parsed.data.error.message ?? '') : '';
    this.logger.warn('Google Sheets request failed', { operation, status: response.status, reason: status || 'unknown' });
    if (response.status === 401) {
      return new GoogleOAuthError('GOOGLE_RECONNECT_REQUIRED', 'Your Google connection has expired. Please reconnect Google.');
    }
    if (response.status === 403 && /insufficient.*scope/i.test(message)) {
      return new GoogleOAuthError('GOOGLE_SHEETS_ACCESS_REQUIRED', 'Allow Forms AI to use Google Sheets, then try again.');
    }
    if (response.status === 403) {
      return new GoogleSheetsError('Your Google account does not have permission to change this spreadsheet.', { status: response.status });
    }
    if (response.status === 404) {
      return new GoogleSheetsError('This spreadsheet no longer exists or your Google account can no longer open it.', { status: response.status });
    }
    if (response.status === 429) {
      return new GoogleSheetsError('Google Sheets is receiving too many requests. Please wait a minute and try again.', { status: response.status });
    }
    if (response.status === 400) {
      const detail = message ? `: ${message.slice(0, MAX_GOOGLE_MESSAGE_LENGTH)}` : '.';
      return new GoogleSheetsError(`Google Sheets could not ${operation}${detail}`, { status: response.status });
    }
    return new GoogleSheetsError(`Google Sheets could not ${operation}. Please try again.`, { status: response.status });
  }
}
