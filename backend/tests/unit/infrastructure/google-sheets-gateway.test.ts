import { describe, expect, it } from 'vitest';
import { GoogleSheetsApiGateway } from '../../../src/infrastructure/google/google-sheets-api-gateway.js';
import { GoogleSheetsRequestBuilder } from '../../../src/infrastructure/google/google-sheets-request-builder.js';
import { GOOGLE_OAUTH_SCOPES } from '../../../src/infrastructure/google/google-oauth-http-gateway.js';
import type { HttpClient, HttpRequest, HttpResponse } from '../../../src/infrastructure/http/http-client.js';
import { GoogleOAuthError, GoogleSheetsError } from '../../../src/shared/errors/application-errors.js';
import { SilentLogger } from '../../support/fakes.js';

class ScriptedHttpClient implements HttpClient {
  readonly requests: HttpRequest[] = [];

  constructor(private readonly responses: Array<HttpResponse | Error>) {}

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    const response = this.responses.shift();
    if (!response) {
      throw new Error('No scripted response left');
    }
    if (response instanceof Error) {
      throw response;
    }
    return response;
  }
}

const SPREADSHEET = {
  spreadsheetId: 'abc',
  spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/abc/edit',
  properties: { title: 'Leads' },
  sheets: [{ properties: { sheetId: 0, title: 'Sheet1', gridProperties: { rowCount: 1000, columnCount: 26 } } }],
};

function gateway(http: ScriptedHttpClient, logger = new SilentLogger()): GoogleSheetsApiGateway {
  return new GoogleSheetsApiGateway(http, new GoogleSheetsRequestBuilder(), logger);
}

describe('Google OAuth scopes', () => {
  it('asks for Google Sheets next to Google Forms and the identity scopes only', () => {
    expect([...GOOGLE_OAUTH_SCOPES].sort()).toEqual(
      [
        'openid',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/forms.body',
        'https://www.googleapis.com/auth/spreadsheets',
      ].sort(),
    );
  });
});

describe('GoogleSheetsRequestBuilder', () => {
  const builder = new GoogleSheetsRequestBuilder();

  it('builds formatting requests with an exact field mask', () => {
    expect(
      builder.build({
        kind: 'FORMAT_CELLS',
        sheetId: 3,
        bounds: { startRowIndex: 0, endRowIndex: 1 },
        format: { bold: true, backgroundColor: '#FF8000', horizontalAlignment: 'CENTER' },
      }),
    ).toEqual({
      repeatCell: {
        range: { sheetId: 3, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            backgroundColor: { red: 1, green: 128 / 255, blue: 0 },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(textFormat.bold,backgroundColor,horizontalAlignment)',
      },
    });
  });

  it('builds dimension, tab and title requests', () => {
    expect(builder.build({ kind: 'INSERT_DIMENSION', sheetId: 1, dimension: 'COLUMNS', startIndex: 2, count: 3 })).toEqual({
      insertDimension: { range: { sheetId: 1, dimension: 'COLUMNS', startIndex: 2, endIndex: 5 }, inheritFromBefore: true },
    });
    expect(builder.build({ kind: 'DELETE_DIMENSION', sheetId: 1, dimension: 'ROWS', startIndex: 0, count: 1 })).toEqual({
      deleteDimension: { range: { sheetId: 1, dimension: 'ROWS', startIndex: 0, endIndex: 1 } },
    });
    expect(builder.build({ kind: 'APPEND_DIMENSION', sheetId: 1, dimension: 'ROWS', count: 10 })).toEqual({
      appendDimension: { sheetId: 1, dimension: 'ROWS', length: 10 },
    });
    expect(builder.build({ kind: 'RENAME_TAB', sheetId: 1, title: 'New' })).toEqual({
      updateSheetProperties: { properties: { sheetId: 1, title: 'New' }, fields: 'title' },
    });
    expect(builder.build({ kind: 'DELETE_TAB', sheetId: 1 })).toEqual({ deleteSheet: { sheetId: 1 } });
    expect(builder.build({ kind: 'ADD_TAB', title: 'More' })).toEqual({ addSheet: { properties: { title: 'More' } } });
    expect(builder.build({ kind: 'FREEZE_ROWS', sheetId: 1, count: 1 })).toEqual({
      updateSheetProperties: { properties: { sheetId: 1, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' },
    });
    expect(builder.build({ kind: 'RESIZE_DIMENSION', sheetId: 1, dimension: 'COLUMNS', startIndex: 0, count: 2, pixelSize: 150 })).toEqual({
      updateDimensionProperties: { range: { sheetId: 1, dimension: 'COLUMNS', startIndex: 0, endIndex: 2 }, properties: { pixelSize: 150 }, fields: 'pixelSize' },
    });
    expect(builder.build({ kind: 'RENAME_SPREADSHEET', title: 'Renamed' })).toEqual({
      updateSpreadsheetProperties: { properties: { title: 'Renamed' }, fields: 'title' },
    });
  });
});

describe('GoogleSheetsApiGateway', () => {
  it('creates spreadsheets with the requested tabs and returns the real URL', async () => {
    const http = new ScriptedHttpClient([{ status: 200, body: SPREADSHEET }]);
    const snapshot = await gateway(http).createSpreadsheet('token', 'Leads', ['Sheet1']);
    expect(snapshot).toEqual({
      spreadsheetId: 'abc',
      title: 'Leads',
      url: 'https://docs.google.com/spreadsheets/d/abc/edit',
      tabs: [{ sheetId: 0, title: 'Sheet1', rowCount: 1000, columnCount: 26 }],
    });
    expect(http.requests[0]).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer token' } });
    expect(http.requests[0]?.url).toMatch(/^https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\?fields=/);
    expect(JSON.parse(http.requests[0]?.body ?? '{}')).toEqual({ properties: { title: 'Leads' }, sheets: [{ properties: { title: 'Sheet1' } }] });
  });

  it('uses the values endpoints with encoded ranges', async () => {
    const http = new ScriptedHttpClient([
      { status: 200, body: { values: [['Name', 3, true]] } },
      { status: 200, body: {} },
      { status: 200, body: {} },
      { status: 200, body: {} },
      { status: 200, body: { valueRanges: [{ values: [['a']] }, {}] } },
      { status: 200, body: {} },
    ]);
    const sheets = gateway(http);
    expect(await sheets.readValues('t', 'abc', "'My Tab'!A1:C2")).toEqual([['Name', '3', 'true']]);
    await sheets.writeValues('t', 'abc', "'My Tab'!A1:B1", [['x', 'y']], 'RAW');
    await sheets.appendValues('t', 'abc', "'My Tab'!A1", [['z']]);
    await sheets.clearValues('t', 'abc', "'My Tab'!B2:B");
    expect(await sheets.readRanges('t', 'abc', ["'My Tab'!A1:B1", "'Other'!A1"])).toEqual([[['a']], []]);
    await sheets.applyStructuralChanges('t', 'abc', [{ kind: 'ADD_TAB', title: 'More' }]);

    const encoded = encodeURIComponent("'My Tab'!A1:C2");
    expect(http.requests.map((request) => `${request.method} ${request.url.replace('https://sheets.googleapis.com/v4/spreadsheets/abc', '')}`)).toEqual([
      `GET /values/${encoded}`,
      `PUT /values/${encodeURIComponent("'My Tab'!A1:B1")}?valueInputOption=RAW`,
      `POST /values/${encodeURIComponent("'My Tab'!A1")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      `POST /values/${encodeURIComponent("'My Tab'!B2:B")}:clear`,
      `GET /values:batchGet?ranges=${encodeURIComponent("'My Tab'!A1:B1")}&ranges=${encodeURIComponent("'Other'!A1")}`,
      'POST :batchUpdate',
    ]);
    expect(JSON.parse(http.requests[5]?.body ?? '{}')).toEqual({ requests: [{ addSheet: { properties: { title: 'More' } } }] });
  });

  it('lists only grid tabs so chart sheets in existing spreadsheets are ignored', async () => {
    const http = new ScriptedHttpClient([
      {
        status: 200,
        body: {
          ...SPREADSHEET,
          sheets: [...SPREADSHEET.sheets, { properties: { sheetId: 9, title: 'Chart1', sheetType: 'OBJECT' } }],
        },
      },
    ]);
    const snapshot = await gateway(http).getSpreadsheet('t', 'abc');
    expect(snapshot.tabs.map((tab) => tab.title)).toEqual(['Sheet1']);
    expect(decodeURIComponent(http.requests[0]?.url ?? '')).toContain('sheetType');
  });

  it('skips empty batches', async () => {
    const http = new ScriptedHttpClient([]);
    await gateway(http).applyStructuralChanges('t', 'abc', []);
    expect(await gateway(http).readRanges('t', 'abc', [])).toEqual([]);
    expect(http.requests).toHaveLength(0);
  });

  it.each([
    [401, {}, 'GOOGLE_RECONNECT_REQUIRED'],
    [403, { error: { status: 'PERMISSION_DENIED', message: 'Request had insufficient authentication scopes.' } }, 'GOOGLE_SHEETS_ACCESS_REQUIRED'],
  ])('maps HTTP %i to a reconnect requirement', async (status, body, code) => {
    const error = await gateway(new ScriptedHttpClient([{ status, body }])).getSpreadsheet('t', 'abc').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GoogleOAuthError);
    expect(error).toMatchObject({ code });
  });

  it.each([
    [403, { error: { message: 'The caller does not have permission' } }, 'does not have permission'],
    [404, {}, 'no longer exists'],
    [429, {}, 'too many requests'],
    [400, { error: { status: 'INVALID_ARGUMENT', message: 'Unable to parse range: Nope!A1' } }, 'could not read the range: Unable to parse range: Nope!A1'],
    [500, {}, 'Please try again'],
  ])('maps HTTP %i to a readable Google Sheets error', async (status, body, message) => {
    const error = await gateway(new ScriptedHttpClient([{ status, body }])).readValues('t', 'abc', "'Nope'!A1").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GoogleSheetsError);
    expect((error as Error).message).toContain(message);
  });

  it('reports network failures and malformed responses without leaking tokens to the log', async () => {
    const logger = new SilentLogger();
    await expect(gateway(new ScriptedHttpClient([new Error('ECONNRESET')]), logger).getSpreadsheet('secret-token', 'abc')).rejects.toThrow('could not be reached');
    await expect(gateway(new ScriptedHttpClient([{ status: 200, body: { nope: true } }]), logger).getSpreadsheet('secret-token', 'abc')).rejects.toThrow(
      'unexpected response',
    );
    await gateway(new ScriptedHttpClient([{ status: 500, body: {} }]), logger)
      .getSpreadsheet('secret-token', 'abc')
      .catch(() => undefined);
    expect(JSON.stringify(logger.entries)).not.toContain('secret-token');
  });
});
