import type { MessageView, SheetActionView } from '@forms-ai/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOOGLE_SHEETS_SCOPE } from '../../src/domain/entities/google-account-connection.js';
import type { AIProvider } from '../../src/domain/interfaces/ai-provider.js';
import { GoogleOAuthError } from '../../src/shared/errors/application-errors.js';
import {
  createTestApplication,
  sendChat,
  signUpUser,
  startConversation,
  type SignedInUser,
  type TestApplication,
} from '../support/test-application.js';

function stateFrom(location: string): string {
  return new URL(location).searchParams.get('state') ?? '';
}

async function connectGoogle(signedIn: SignedInUser): Promise<string> {
  const start = await signedIn.agent.get('/auth/google').query({ returnTo: '/settings' }).expect(302);
  const callback = await signedIn.agent
    .get('/auth/google/callback')
    .query({ code: 'authorization-code', state: stateFrom(start.headers.location ?? '') })
    .expect(302);
  return callback.headers.location ?? '';
}

const CREATE_REQUEST = 'Create a spreadsheet called Event Leads with columns Name, Email, Phone';

describe('Google Sheets actions', () => {
  let application: TestApplication;

  beforeAll(async () => {
    application = await createTestApplication();
  });

  afterAll(async () => {
    await application.close();
  });

  async function propose(signedIn: SignedInUser, conversationId: string, content: string): Promise<SheetActionView> {
    const result = await sendChat(signedIn, conversationId, content);
    const message = result.assistantMessage as MessageView;
    expect(message.sheetAction).not.toBeNull();
    return message.sheetAction as SheetActionView;
  }

  async function execute(signedIn: SignedInUser, actionId: string, body: Record<string, unknown> = {}, status = 200) {
    return signedIn.agent.post(`/sheets/actions/${actionId}/execute`).send(body).expect(status);
  }

  async function createdSheet(signedIn: SignedInUser): Promise<{ conversationId: string; googleId: string; action: SheetActionView }> {
    const conversationId = await startConversation(signedIn);
    const proposal = await propose(signedIn, conversationId, CREATE_REQUEST);
    const response = await execute(signedIn, proposal.id);
    const url = response.body.action.spreadsheetUrl as string;
    return { conversationId, googleId: url.split('/d/')[1]!.split('/')[0]!, action: response.body.action };
  }

  it('prepares a spreadsheet from chat without calling Google until the user approves it', async () => {
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const conversationId = await startConversation(signedIn);
    const callsBefore = application.sheets.calls.length;

    const result = await sendChat(signedIn, conversationId, CREATE_REQUEST);

    expect(result.assistantMessage.intent).toBe('CREATE_SHEET');
    expect(result.assistantMessage.content).toContain('Create Google Sheet');
    expect(result.assistantMessage.sheetAction).toMatchObject({
      kind: 'CREATE',
      status: 'PENDING',
      spreadsheetTitle: 'Event Leads',
      destructive: false,
      spreadsheetUrl: null,
      table: null,
    });
    expect(result.assistantMessage.sheetAction.steps.length).toBeGreaterThan(0);
    expect(application.sheets.calls.length).toBe(callsBefore);
  });

  it('creates exactly the requested spreadsheet, announces it and never duplicates it', async () => {
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const conversationId = await startConversation(signedIn);
    const proposal = await propose(signedIn, conversationId, CREATE_REQUEST);
    const sizeBefore = application.sheets.spreadsheets.size;

    const response = await execute(signedIn, proposal.id);

    expect(response.body.action).toMatchObject({ id: proposal.id, status: 'SUCCEEDED', spreadsheetTitle: 'Event Leads', error: null });
    const url = response.body.action.spreadsheetUrl as string;
    expect(url).toMatch(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/.+\/edit$/);
    expect(response.body.message).toMatchObject({
      role: 'ASSISTANT',
      content: 'Google Sheet created successfully. “Event Leads” is ready.',
      sheetAction: { id: proposal.id, status: 'SUCCEEDED', spreadsheetUrl: url },
    });
    expect(application.sheets.spreadsheets.size).toBe(sizeBefore + 1);
    const googleId = url.split('/d/')[1]!.split('/')[0]!;
    expect(application.sheets.valuesOf(googleId, 'Sheet1')).toEqual([['Name', 'Email', 'Phone']]);
    expect(JSON.stringify(response.body)).not.toMatch(/access-\d|refresh-\d/);

    const rows = await application.container.database.query<{ user_id: string; google_spreadsheet_id: string; title: string; url: string }>(
      'SELECT user_id, google_spreadsheet_id, title, url FROM spreadsheets WHERE conversation_id = $1',
      [conversationId],
    );
    expect(rows).toEqual([{ user_id: signedIn.user.id, google_spreadsheet_id: googleId, title: 'Event Leads', url }]);

    const again = await execute(signedIn, proposal.id);
    expect(again.body.action.status).toBe('SUCCEEDED');
    expect(again.body.message).toBeNull();
    expect(application.sheets.spreadsheets.size).toBe(sizeBefore + 1);

    const page = await signedIn.agent.get(`/conversations/${conversationId}/messages`).expect(200);
    const withActions = (page.body.items as MessageView[]).filter((message) => message.sheetAction !== null);
    expect(withActions).toHaveLength(2);
    expect(withActions.every((message) => message.sheetAction?.status === 'SUCCEEDED')).toBe(true);
  });

  it('resumes the same spreadsheet when a create fails after Google created it', async () => {
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const conversationId = await startConversation(signedIn);
    const proposal = await propose(signedIn, conversationId, CREATE_REQUEST);
    const sizeBefore = application.sheets.spreadsheets.size;
    application.sheets.failures.add('writeValues');

    try {
      const failed = await execute(signedIn, proposal.id, {}, 502);
      expect(failed.body.error.code).toBe('GOOGLE_SHEETS_FAILED');
      expect(failed.body.error.details.action).toMatchObject({ status: 'FAILED' });
      expect(failed.body.error.details.message).toMatchObject({ sheetAction: null, content: expect.stringContaining('could not be completed') });
    } finally {
      application.sheets.failures.clear();
    }

    const retried = await execute(signedIn, proposal.id);
    expect(retried.body.action.status).toBe('SUCCEEDED');
    expect(application.sheets.spreadsheets.size).toBe(sizeBefore + 1);
    const rows = await application.container.database.query('SELECT id FROM spreadsheets WHERE conversation_id = $1', [conversationId]);
    expect(rows).toHaveLength(1);
  });

  it('modifies the spreadsheet created in the conversation', async () => {
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const { conversationId, googleId } = await createdSheet(signedIn);

    const addColumn = await propose(signedIn, conversationId, 'Add a column called Company after Email');
    expect(addColumn).toMatchObject({ kind: 'MODIFY', status: 'PENDING', destructive: false });
    const modified = await execute(signedIn, addColumn.id);
    expect(modified.body.message.content).toContain('Google Sheet updated successfully.');
    expect(application.sheets.valuesOf(googleId, 'Sheet1')).toEqual([['Name', 'Email', 'Company', 'Phone']]);

    const rename = await propose(signedIn, conversationId, 'Rename the tab Sheet1 to Leads');
    await execute(signedIn, rename.id);
    const addTab = await propose(signedIn, conversationId, 'Add a tab called Archive');
    await execute(signedIn, addTab.id);
    const addRows = await propose(signedIn, conversationId, 'Add 50 more rows');
    await execute(signedIn, addRows.id);
    const retitle = await propose(signedIn, conversationId, 'Rename the spreadsheet to Leads 2026');
    const retitled = await execute(signedIn, retitle.id);

    const snapshot = await application.sheets.getSpreadsheet('inspection', googleId);
    expect(snapshot.title).toBe('Leads 2026');
    expect(snapshot.tabs.map((tab) => [tab.title, tab.rowCount])).toEqual([
      ['Leads', 1050],
      ['Archive', 1000],
    ]);
    expect(retitled.body.action.spreadsheetTitle).toBe('Leads 2026');
    const stored = await application.container.database.query<{ title: string; tabs: Array<{ title: string; headers: string[] }> }>(
      'SELECT title, tabs FROM spreadsheets WHERE google_spreadsheet_id = $1',
      [googleId],
    );
    expect(stored[0]?.title).toBe('Leads 2026');
    expect(stored[0]?.tabs[0]).toMatchObject({ title: 'Leads', headers: ['Name', 'Email', 'Company', 'Phone'] });
  });

  it('requires explicit confirmation before destructive changes', async () => {
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const { conversationId, googleId } = await createdSheet(signedIn);
    await application.sheets.writeValues('seed', googleId, "'Sheet1'!A2:C3", [['Ada', 'ada@example.com', '1'], ['Alan', 'alan@example.com', '2']], 'RAW');

    const clear = await propose(signedIn, conversationId, 'Clear column B');
    expect(clear).toMatchObject({ kind: 'MODIFY', destructive: true });

    const refused = await execute(signedIn, clear.id, {}, 409);
    expect(refused.body.error.code).toBe('CONFIRMATION_REQUIRED');
    expect(application.sheets.valuesOf(googleId, 'Sheet1')[1]).toEqual(['Ada', 'ada@example.com', '1']);

    await execute(signedIn, clear.id, { confirmDestructive: true });
    expect(application.sheets.valuesOf(googleId, 'Sheet1')).toEqual([
      ['Name', 'Email', 'Phone'],
      ['Ada', '', '1'],
      ['Alan', '', '2'],
    ]);
  });

  it('reports invalid targets without touching the spreadsheet', async () => {
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const { conversationId, googleId } = await createdSheet(signedIn);
    const remove =await propose(signedIn, conversationId, 'Delete the tab Sheet1');
    const failed = await execute(signedIn, remove.id, { confirmDestructive: true }, 400);
    expect(failed.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: expect.stringContaining('at least one tab') });
    expect(failed.body.error.details.action.status).toBe('FAILED');
    expect(failed.body.error.details.message.content).toContain('at least one tab');

    const missing = await propose(signedIn, conversationId, 'Rename the tab Budget to Costs');
    const notFound = await execute(signedIn, missing.id, {}, 400);
    expect(notFound.body.error.message).toContain('There is no tab called “Budget”');
    const snapshot = await application.sheets.getSpreadsheet('inspection', googleId);
    expect(snapshot.tabs.map((tab) => tab.title)).toEqual(['Sheet1']);
    expect(application.sheets.valuesOf(googleId, 'Sheet1')).toEqual([['Name', 'Email', 'Phone']]);
  });

  it('reads bounded values and the spreadsheet structure', async () => {
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const { conversationId, googleId } = await createdSheet(signedIn);
    await application.sheets.writeValues('seed', googleId, "'Sheet1'!A2:C2", [['Ada', 'ada@example.com', '555']], 'RAW');

    const read = await propose(signedIn, conversationId, 'Show me the first 5 rows');
    expect(read).toMatchObject({ kind: 'READ', status: 'PENDING' });
    const response = await execute(signedIn, read.id);
    expect(response.body.action.table).toEqual({
      range: "'Sheet1'!A1:C6",
      values: [
        ['Name', 'Email', 'Phone'],
        ['Ada', 'ada@example.com', '555'],
      ],
      totalRows: 2,
      truncated: false,
      label: 'Sheet1 · 1 data row · header row included',
    });
    expect(response.body.message.content).toContain('Here is the data from “Event Leads”: 1 data row from “Sheet1” (header row included).');
    expect(response.body.message.sheetAction.table.values).toHaveLength(2);

    const structure = await propose(signedIn, conversationId, 'How many tabs does the spreadsheet have?');
    const structured = await execute(signedIn, structure.id);
    expect(structured.body.message.content).toContain('“Event Leads” has 1 tab.');
    expect(structured.body.action.table.values).toEqual([
      ['Tab', 'Rows', 'Columns', 'Header row'],
      ['Sheet1', '1000', '26', 'Name, Email, Phone'],
    ]);
  });

  it('never lets another user see or run an action', async () => {
    const owner = await signUpUser(application);
    await connectGoogle(owner);
    const conversationId = await startConversation(owner);
    const proposal = await propose(owner, conversationId, CREATE_REQUEST);
    const stranger = await signUpUser(application);
    await connectGoogle(stranger);
    const sizeBefore = application.sheets.spreadsheets.size;

    const response = await execute(stranger, proposal.id, {}, 404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    await stranger.agent.get(`/conversations/${conversationId}/messages`).expect(404);
    expect(application.sheets.spreadsheets.size).toBe(sizeBefore);
  });

  it('validates the request', async () => {
    const signedIn = await signUpUser(application);
    await signedIn.agent.post('/sheets/actions/not-a-uuid/execute').send({}).expect(400);
    const conversationId = await startConversation(signedIn);
    const proposal = await propose(signedIn, conversationId, CREATE_REQUEST);
    await signedIn.agent.post(`/sheets/actions/${proposal.id}/execute`).send({ confirmDestructive: 'yes' }).expect(400);
    await signedIn.agent.post(`/sheets/actions/${proposal.id}/execute`).send({ url: 'https://example.com' }).expect(400);
  });

  it('asks to connect Google before running an action', async () => {
    const signedIn = await signUpUser(application);
    const conversationId = await startConversation(signedIn);
    const proposal = await propose(signedIn, conversationId, CREATE_REQUEST);
    const response = await execute(signedIn, proposal.id, {}, 409);
    expect(response.body.error.code).toBe('GOOGLE_NOT_CONNECTED');
  });

  it('detects a connection without the Google Sheets scope and offers re-consent', async () => {
    const signedIn = await signUpUser(application);
    const original = [...application.oauth.grantedScopes];
    application.oauth.grantedScopes = original.filter((scope) => scope !== GOOGLE_SHEETS_SCOPE);
    try {
      expect(await connectGoogle(signedIn)).toContain('google=connected');
    } finally {
      application.oauth.grantedScopes = original;
    }
    const status = await signedIn.agent.get('/integrations/google/status').expect(200);
    expect(status.body.connection).toMatchObject({ connected: true, capabilities: { forms: true, sheets: false } });

    const conversationId = await startConversation(signedIn);
    const proposal = await propose(signedIn, conversationId, CREATE_REQUEST);
    const callsBefore = application.sheets.calls.length;
    const response = await execute(signedIn, proposal.id, {}, 409);
    expect(response.body.error.code).toBe('GOOGLE_SHEETS_ACCESS_REQUIRED');
    expect(application.sheets.calls.length).toBe(callsBefore);

    await connectGoogle(signedIn);
    const upgraded = await signedIn.agent.get('/integrations/google/status').expect(200);
    expect(upgraded.body.connection.capabilities).toEqual({ forms: true, sheets: true });
    expect((await execute(signedIn, proposal.id)).body.action.status).toBe('SUCCEEDED');
  });

  it('surfaces a scope revoked at Google as a re-consent requirement', async () => {
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const conversationId = await startConversation(signedIn);
    const proposal = await propose(signedIn, conversationId, CREATE_REQUEST);
    application.sheets.scopeMissing = true;
    try {
      const response = await execute(signedIn, proposal.id, {}, 409);
      expect(response.body.error.code).toBe('GOOGLE_SHEETS_ACCESS_REQUIRED');
    } finally {
      application.sheets.scopeMissing = false;
    }
    expect((await execute(signedIn, proposal.id)).body.action.status).toBe('SUCCEEDED');
  });

  it('refreshes an expired access token and asks to reconnect when refresh is revoked', async () => {
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const conversationId = await startConversation(signedIn);
    await application.container.database.query(
      "UPDATE connected_accounts SET token_expires_at = now() - interval '1 hour' WHERE user_id = $1",
      [signedIn.user.id],
    );
    const refreshedBefore = application.oauth.refreshedTokens.length;
    const proposal = await propose(signedIn, conversationId, CREATE_REQUEST);
    await execute(signedIn, proposal.id);
    expect(application.oauth.refreshedTokens.length).toBe(refreshedBefore + 1);
    expect(application.sheets.calls.at(-1)?.accessToken).not.toBe('access-1');

    await application.container.database.query(
      "UPDATE connected_accounts SET token_expires_at = now() - interval '1 hour' WHERE user_id = $1",
      [signedIn.user.id],
    );
    application.oauth.refreshFailure = new GoogleOAuthError('GOOGLE_RECONNECT_REQUIRED', 'Your Google connection has expired.');
    try {
      const read = await propose(signedIn, conversationId, 'Show me the first 5 rows');
      const response = await execute(signedIn, read.id, {}, 409);
      expect(response.body.error.code).toBe('GOOGLE_RECONNECT_REQUIRED');
    } finally {
      application.oauth.refreshFailure = null;
    }
  });

  it('removes spreadsheets and actions with the conversation without touching Google', async () => {
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const { conversationId, googleId } = await createdSheet(signedIn);
    await signedIn.agent.delete(`/conversations/${conversationId}`).expect(204);
    const spreadsheets = await application.container.database.query('SELECT id FROM spreadsheets WHERE conversation_id = $1', [conversationId]);
    const actions = await application.container.database.query('SELECT id FROM sheet_actions WHERE conversation_id = $1', [conversationId]);
    expect(spreadsheets).toEqual([]);
    expect(actions).toEqual([]);
    expect(application.sheets.spreadsheets.has(googleId)).toBe(true);
  });
});

class ScriptedSheetsAI implements AIProvider {
  intent: unknown = { intent: 'NORMAL_CHAT' };
  plan: unknown = null;

  async classifyIntent(): Promise<unknown> {
    return this.intent;
  }

  async generateForm(): Promise<unknown> {
    return null;
  }

  async planFormOperations(): Promise<unknown> {
    return null;
  }

  async suggestQuestions(): Promise<unknown> {
    return null;
  }

  async selectSuggestions(): Promise<unknown> {
    return null;
  }

  async planSheetAction(): Promise<unknown> {
    return this.plan;
  }

  async summarizeSheetData(): Promise<string> {
    return '';
  }

  async reply(): Promise<string> {
    return 'Hello';
  }
}

describe('Google Sheets plans proposed by the AI', () => {
  const ai = new ScriptedSheetsAI();
  let application: TestApplication;
  let owner: SignedInUser;

  beforeAll(async () => {
    application = await createTestApplication({ aiProvider: ai });
    owner = await signUpUser(application);
    await connectGoogle(owner);
  });

  afterAll(async () => {
    await application.close();
  });

  async function proposal(conversationId: string, intent: string, plan: unknown): Promise<MessageView> {
    ai.intent = { intent };
    ai.plan = plan;
    return (await sendChat(owner, conversationId, 'Do the spreadsheet change')).assistantMessage as MessageView;
  }

  async function actionCount(conversationId: string): Promise<number> {
    const rows = await application.container.database.query<{ count: string }>('SELECT count(*) AS count FROM sheet_actions WHERE conversation_id = $1', [
      conversationId,
    ]);
    return Number(rows[0]?.count);
  }

  it('executes every supported operation against the spreadsheet', async () => {
    const conversationId = await startConversation(owner);
    const create = await proposal(conversationId, 'CREATE_SHEET', {
      summary: 'Create a budget.',
      operations: [
        {
          type: 'CREATE_SPREADSHEET',
          title: 'Budget',
          tabs: [{ title: 'Costs', headers: ['Item', 'Amount'], rows: [['Rent', 1000], ['Food', '250']] }, { title: 'Notes' }],
        },
      ],
    });
    const created = await owner.agent.post(`/sheets/actions/${create.sheetAction!.id}/execute`).send({}).expect(200);
    const googleId = (created.body.action.spreadsheetUrl as string).split('/d/')[1]!.split('/')[0]!;
    expect(application.sheets.valuesOf(googleId, 'Costs')).toEqual([
      ['Item', 'Amount'],
      ['Rent', '1000'],
      ['Food', '250'],
    ]);

    const modify = await proposal(conversationId, 'MODIFY_SHEET', {
      summary: 'Rework the budget.',
      operations: [
        { type: 'WRITE_RANGE', sheet: 'Costs', range: 'a4', values: [['Travel', '300']] },
        { type: 'UPDATE_RANGE', sheet: 'costs', range: 'B2', values: [['1100']] },
        { type: 'APPEND_ROWS', sheet: 'Costs', values: [['Misc', '50']] },
        { type: 'SET_FORMULA', sheet: 'Costs', cell: 'B7', formula: '=SUM(B2:B5)' },
        { type: 'UPDATE_CELL_FORMAT', sheet: 'Costs', range: 'A1:B1', backgroundColor: '#FFEEAA', horizontalAlignment: 'CENTER' },
        { type: 'UPDATE_DIMENSION_SIZE', sheet: 'Costs', dimension: 'COLUMNS', start: 'A', count: 1, pixelSize: 200 },
        { type: 'INSERT_ROWS', sheet: 'Costs', beforeRow: 2, count: 1 },
        { type: 'DELETE_ROWS', sheet: 'Costs', startRow: 2, count: 1 },
        { type: 'INSERT_COLUMNS', sheet: 'Costs', count: 2 },
        { type: 'DELETE_COLUMNS', sheet: 'Costs', startColumn: 'C', count: 1 },
        { type: 'SET_HEADER_ROW', sheet: 'Notes', headers: ['Date', 'Note'] },
        { type: 'ADD_SHEET', title: 'Summary' },
        { type: 'RENAME_SHEET', sheet: 'Summary', newTitle: 'Overview' },
        { type: 'DELETE_SHEET_TAB', sheet: 'Overview' },
        { type: 'UPDATE_SPREADSHEET_TITLE', title: 'Budget 2026' },
      ],
    });
    expect(modify.sheetAction).toMatchObject({ kind: 'MODIFY', destructive: true });
    expect(modify.sheetAction!.steps).toHaveLength(15);
    const modified = await owner.agent.post(`/sheets/actions/${modify.sheetAction!.id}/execute`).send({ confirmDestructive: true }).expect(200);
    expect(modified.body.action).toMatchObject({ status: 'SUCCEEDED', spreadsheetTitle: 'Budget 2026' });

    expect(application.sheets.valuesOf(googleId, 'Costs')).toEqual([
      ['Item', 'Amount'],
      ['Rent', '1100'],
      ['Food', '250'],
      ['Travel', '300'],
      ['Misc', '50'],
      [],
      ['', '=SUM(B2:B5)'],
    ]);
    expect(application.sheets.valuesOf(googleId, 'Notes')).toEqual([['Date', 'Note']]);
    const snapshot = await application.sheets.getSpreadsheet('inspection', googleId);
    expect(snapshot).toMatchObject({ title: 'Budget 2026' });
    expect(snapshot.tabs.map((tab) => [tab.title, tab.rowCount, tab.columnCount])).toEqual([
      ['Costs', 1000, 27],
      ['Notes', 1000, 26],
    ]);
    const changes = application.sheets.structuralBatches.flat();
    expect(changes).toContainEqual(
      expect.objectContaining({ kind: 'FORMAT_CELLS', format: expect.objectContaining({ backgroundColor: '#FFEEAA', horizontalAlignment: 'CENTER' }) }),
    );
    expect(changes).toContainEqual(expect.objectContaining({ kind: 'RESIZE_DIMENSION', dimension: 'COLUMNS', startIndex: 0, pixelSize: 200 }));
    expect(changes).toContainEqual(expect.objectContaining({ kind: 'FREEZE_ROWS', count: 1 }));

    const read = await proposal(conversationId, 'READ_SHEET', { summary: 'Read costs.', operations: [{ type: 'READ_RANGE', sheet: 'Costs', range: 'A1:B3' }] });
    const readResult = await owner.agent.post(`/sheets/actions/${read.sheetAction!.id}/execute`).send({}).expect(200);
    expect(readResult.body.action.table.values).toEqual([
      ['Item', 'Amount'],
      ['Rent', '1100'],
      ['Food', '250'],
    ]);
  });

  it.each([
    ['an unknown operation', { summary: 'x', operations: [{ type: 'HTTP_REQUEST', url: 'https://example.com' }] }],
    ['extra fields', { summary: 'x', operations: [{ type: 'ADD_SHEET', title: 'Leads', endpoint: 'https://example.com' }] }],
    ['an invalid range', { summary: 'x', operations: [{ type: 'CLEAR_RANGE', range: 'A0:ZZZZ9' }] }],
    ['a formula without =', { summary: 'x', operations: [{ type: 'SET_FORMULA', cell: 'B2', formula: 'SUM(A1:A2)' }] }],
    ['a creation inside a change', { summary: 'x', operations: [{ type: 'CREATE_SPREADSHEET', title: 'Other', tabs: [{ title: 'Sheet1' }] }] }],
    ['a read inside a change', { summary: 'x', operations: [{ type: 'READ_RANGE', range: 'A1:B2' }] }],
    ['too many operations', { summary: 'x', operations: Array.from({ length: 21 }, (_value, index) => ({ type: 'ADD_SHEET', title: `Tab ${index}` })) }],
    ['plain text', 'I will now delete your spreadsheet'],
  ])('rejects a change plan with %s without preparing anything', async (_label, plan) => {
    const conversationId = await startConversation(owner);
    const create = await proposal(conversationId, 'CREATE_SHEET', {
      summary: 'Create.',
      operations: [{ type: 'CREATE_SPREADSHEET', title: 'Safety', tabs: [{ title: 'Sheet1', headers: ['Name'] }] }],
    });
    await owner.agent.post(`/sheets/actions/${create.sheetAction!.id}/execute`).send({}).expect(200);
    const calls = application.sheets.calls.length;
    const countBefore = await actionCount(conversationId);

    const message = await proposal(conversationId, 'MODIFY_SHEET', plan);

    expect(message.intent).toBe('CLARIFICATION_REQUIRED');
    expect(message.sheetAction).toBeNull();
    expect(await actionCount(conversationId)).toBe(countBefore);
    expect(application.sheets.calls.length).toBe(calls);
  });

  it('rejects create plans that do not start with exactly one spreadsheet or repeat tab names', async () => {
    const conversationId = await startConversation(owner);
    const duplicateTabs = await proposal(conversationId, 'CREATE_SHEET', {
      summary: 'x',
      operations: [{ type: 'CREATE_SPREADSHEET', title: 'Dup', tabs: [{ title: 'Leads' }, { title: 'leads' }] }],
    });
    expect(duplicateTabs.intent).toBe('CLARIFICATION_REQUIRED');
    const noCreation = await proposal(conversationId, 'CREATE_SHEET', { summary: 'x', operations: [{ type: 'ADD_SHEET', title: 'Leads' }] });
    expect(noCreation.intent).toBe('CLARIFICATION_REQUIRED');
    expect(await actionCount(conversationId)).toBe(0);
  });

  it('asks a clarification question instead of inventing a plan', async () => {
    const conversationId = await startConversation(owner);
    const message = await proposal(conversationId, 'CREATE_SHEET', {
      summary: 'Need details.',
      operations: [],
      clarificationQuestion: 'Which columns should the spreadsheet have?',
    });
    expect(message).toMatchObject({ intent: 'CLARIFICATION_REQUIRED', content: 'Which columns should the spreadsheet have?', sheetAction: null });
  });

  it('asks for a spreadsheet before changing or reading one', async () => {
    const conversationId = await startConversation(owner);
    const change = await proposal(conversationId, 'MODIFY_SHEET', { summary: 'x', operations: [{ type: 'ADD_SHEET', title: 'Leads' }] });
    expect(change.intent).toBe('CLARIFICATION_REQUIRED');
    const read = await proposal(conversationId, 'READ_SHEET', { summary: 'x', operations: [{ type: 'GET_SPREADSHEET' }] });
    expect(read.intent).toBe('CLARIFICATION_REQUIRED');
    expect(await actionCount(conversationId)).toBe(0);
  });
});
