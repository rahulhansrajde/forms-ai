import type { MessageView, SheetActionView } from '@forms-ai/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOOGLE_SHEETS_SCOPE } from '../../src/domain/entities/google-account-connection.js';
import { GoogleOAuthError } from '../../src/shared/errors/application-errors.js';
import {
  createTestApplication,
  sendChat,
  signUpUser,
  startConversation,
  type SignedInUser,
  type TestApplication,
} from '../support/test-application.js';

const EXISTING_ID = '1HackathonRegistrations0123456789abcdefXYZ';
const EXISTING_URL = `https://docs.google.com/spreadsheets/d/${EXISTING_ID}/edit`;
const REGISTRATIONS = [
  ['Name', 'Email', 'College'],
  ['Ada Lovelace', 'ada@example.com', 'Analytical College'],
  ['Alan Turing', 'alan@example.com', 'Bletchley'],
];

function stateFrom(location: string): string {
  return new URL(location).searchParams.get('state') ?? '';
}

async function connectGoogle(signedIn: SignedInUser): Promise<void> {
  const start = await signedIn.agent.get('/auth/google').query({ returnTo: '/settings' }).expect(302);
  await signedIn.agent
    .get('/auth/google/callback')
    .query({ code: 'authorization-code', state: stateFrom(start.headers.location ?? '') })
    .expect(302);
}

describe('linking existing Google Sheets', () => {
  let application: TestApplication;

  beforeAll(async () => {
    application = await createTestApplication();
  });

  afterAll(async () => {
    await application.close();
  });

  function seedExisting(id = EXISTING_ID): void {
    application.sheets.seed(id, 'Hackathon Registrations', [
      { title: 'Registrations', values: REGISTRATIONS.map((row) => [...row]) },
      { title: 'Analytics', values: [] },
    ]);
  }

  async function chat(signedIn: SignedInUser, conversationId: string, content: string): Promise<MessageView> {
    return (await sendChat(signedIn, conversationId, content)).assistantMessage as MessageView;
  }

  async function execute(signedIn: SignedInUser, action: SheetActionView, status = 200, confirmDestructive = false) {
    return signedIn.agent.post(`/sheets/actions/${action.id}/execute`).send(confirmDestructive ? { confirmDestructive } : {}).expect(status);
  }

  async function linkExisting(signedIn: SignedInUser, conversationId: string) {
    const proposal = await chat(signedIn, conversationId, `Use this Google Sheet: ${EXISTING_URL}`);
    return execute(signedIn, proposal.sheetAction!);
  }

  async function spreadsheetRows(conversationId: string) {
    return application.container.database.query<{ user_id: string; google_spreadsheet_id: string; origin: string; title: string; url: string }>(
      'SELECT user_id, google_spreadsheet_id, origin, title, url FROM spreadsheets WHERE conversation_id = $1 ORDER BY created_at',
      [conversationId],
    );
  }

  it('finds an existing sheet from its URL and only connects it after the button is clicked', async () => {
    seedExisting();
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const conversationId = await startConversation(signedIn);
    const callsBefore = application.sheets.calls.length;

    const proposal = await chat(signedIn, conversationId, `Use this Google Sheet: ${EXISTING_URL}`);

    expect(proposal.intent).toBe('LINK_SHEET');
    expect(proposal.content).toContain('Google Sheet found: “Hackathon Registrations”');
    expect(proposal.sheetAction).toMatchObject({
      kind: 'LINK',
      status: 'PENDING',
      spreadsheetTitle: 'Hackathon Registrations',
      tabs: ['Registrations', 'Analytics'],
      spreadsheetUrl: null,
      spreadsheetOrigin: null,
      destructive: false,
    });
    expect(application.sheets.calls.slice(callsBefore).map((call) => call.method)).toEqual(['getSpreadsheet', 'readRanges']);
    expect(await spreadsheetRows(conversationId)).toEqual([]);

    const connected = await execute(signedIn, proposal.sheetAction!);
    expect(connected.body.action).toMatchObject({ status: 'SUCCEEDED', spreadsheetUrl: EXISTING_URL, spreadsheetOrigin: 'LINKED_EXISTING' });
    expect(connected.body.message.content).toContain('Google Sheet connected successfully. “Hackathon Registrations” is now the active spreadsheet');
    expect(connected.body.message.sheetAction.spreadsheetUrl).toBe(EXISTING_URL);
    expect(await spreadsheetRows(conversationId)).toEqual([
      { user_id: signedIn.user.id, google_spreadsheet_id: EXISTING_ID, origin: 'LINKED_EXISTING', title: 'Hackathon Registrations', url: EXISTING_URL },
    ]);
    expect(application.sheets.valuesOf(EXISTING_ID, 'Registrations')).toEqual(REGISTRATIONS);

    const again = await execute(signedIn, proposal.sheetAction!);
    expect(again.body.message).toBeNull();
    expect(await spreadsheetRows(conversationId)).toHaveLength(1);

    const repeat = await chat(signedIn, conversationId, `Work with this spreadsheet ${EXISTING_URL}`);
    expect(repeat).toMatchObject({ intent: 'LINK_SHEET', sheetAction: null });
    expect(repeat.content).toContain('already the active Google Sheet');
  });

  it('accepts an explicit spreadsheet ID', async () => {
    seedExisting();
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const conversationId = await startConversation(signedIn);
    const proposal = await chat(signedIn, conversationId, `Use spreadsheet ID ${EXISTING_ID}`);
    expect(proposal.sheetAction).toMatchObject({ kind: 'LINK', spreadsheetTitle: 'Hackathon Registrations' });
  });

  it('reads, changes and summarizes the linked sheet instead of the sheet created earlier in the chat', async () => {
    seedExisting();
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const conversationId = await startConversation(signedIn);
    const create = await chat(signedIn, conversationId, 'Create a spreadsheet called Event Leads with columns Name, Email');
    const created = await execute(signedIn, create.sheetAction!);
    const createdId = (created.body.action.spreadsheetUrl as string).split('/d/')[1]!.split('/')[0]!;

    await linkExisting(signedIn, conversationId);

    const read = await chat(signedIn, conversationId, 'Show me the first 20 rows');
    expect(read.sheetAction).toMatchObject({ kind: 'READ', status: 'SUCCEEDED', spreadsheetTitle: 'Hackathon Registrations' });
    expect(read.sheetAction!.table!.values).toEqual(REGISTRATIONS);
    expect(read.sheetAction!.spreadsheetUrl).toBe(EXISTING_URL);

    const addColumn = await chat(signedIn, conversationId, 'Add a Phone Number column after Email');
    expect(addColumn.sheetAction).toMatchObject({ kind: 'MODIFY', spreadsheetTitle: 'Hackathon Registrations' });
    await execute(signedIn, addColumn.sheetAction!);
    expect(application.sheets.valuesOf(EXISTING_ID, 'Registrations')[0]).toEqual(['Name', 'Email', 'Phone Number', 'College']);
    expect(application.sheets.valuesOf(createdId, 'Sheet1')).toEqual([['Name', 'Email']]);

    const rename = await chat(signedIn, conversationId, 'Rename Registrations to Signups');
    await execute(signedIn, rename.sheetAction!);
    const addTab = await chat(signedIn, conversationId, 'Create another tab called Insights');
    await execute(signedIn, addTab.sheetAction!);
    const snapshot = await application.sheets.getSpreadsheet('inspection', EXISTING_ID);
    expect(snapshot.tabs.map((tab) => tab.title)).toEqual(['Signups', 'Analytics', 'Insights']);

    const clear = await chat(signedIn, conversationId, 'Clear column D');
    expect(clear.sheetAction).toMatchObject({ destructive: true, spreadsheetTitle: 'Hackathon Registrations' });
    await execute(signedIn, clear.sheetAction!, 409);
    await execute(signedIn, clear.sheetAction!, 200, true);
    expect(application.sheets.valuesOf(EXISTING_ID, 'Signups').map((row) => row[3] ?? '')).toEqual(['College', '', '']);

    const summary = await sendChat(signedIn, conversationId, 'Read the data and summarize it');
    expect(summary.userMessage, summary.assistantMessage.content).toMatchObject({ intent: 'READ_SHEET' });
    expect(summary.assistantMessage.content).toContain('Summary: “Hackathon Registrations” has 2 rows below the header row');
    expect(summary.assistantMessage.content).toContain('Name: 2 filled');
  });

  it('switches back to a sheet from the same chat by name', async () => {
    seedExisting();
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const conversationId = await startConversation(signedIn);
    const create = await chat(signedIn, conversationId, 'Create a spreadsheet called Event Leads with columns Name, Email');
    await execute(signedIn, create.sheetAction!);
    await linkExisting(signedIn, conversationId);

    const unspecified = await chat(signedIn, conversationId, 'Use another sheet instead');
    expect(unspecified).toMatchObject({ intent: 'CLARIFICATION_REQUIRED', sheetAction: null });
    expect(unspecified.content).toContain('Paste its link');

    const back = await chat(signedIn, conversationId, 'Switch to my Event Leads sheet');
    expect(back.sheetAction).toMatchObject({ kind: 'LINK', spreadsheetTitle: 'Event Leads' });
    await execute(signedIn, back.sheetAction!);
    const read = await chat(signedIn, conversationId, 'Show me the first 5 rows');
    expect(read.sheetAction?.spreadsheetTitle).toBe('Event Leads');
    const rows = await spreadsheetRows(conversationId);
    expect(rows.map((row) => row.origin)).toEqual(['CREATED_BY_FORMS_AI', 'LINKED_EXISTING']);
  });

  it.each([
    ['a Google Docs link', 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit', 'not a Google Sheet'],
    ['a published link', 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQabcdefghijklmnopqrstuvwxyz/pubhtml', 'Publish to the web'],
    ['a truncated link', 'https://docs.google.com/spreadsheets/d/abc123/edit', 'does not contain a valid spreadsheet ID'],
    ['a malformed ID', 'Use spreadsheet ID abc$%^', 'is not a valid Google Sheets spreadsheet ID'],
  ])('rejects %s without calling Google', async (_label, message, reason) => {
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const conversationId = await startConversation(signedIn);
    const callsBefore = application.sheets.calls.length;
    const reply = await chat(signedIn, conversationId, message.startsWith('http') ? `Use this sheet ${message}` : message);
    expect(reply).toMatchObject({ intent: 'CLARIFICATION_REQUIRED', sheetAction: null });
    expect(reply.content).toContain(reason);
    expect(application.sheets.calls.length).toBe(callsBefore);
  });

  it('never claims a sheet is connected when the Google account cannot open it', async () => {
    const forbiddenId = '1SomeoneElsesPrivateSheet0123456789abcdef';
    application.sheets.seed(forbiddenId, 'Private', [{ title: 'Sheet1', values: [['Secret']] }]);
    application.sheets.forbidden.add(forbiddenId);
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const conversationId = await startConversation(signedIn);

    for (const id of [forbiddenId, '1ThisSpreadsheetDoesNotExist0123456789ab']) {
      const reply = await chat(signedIn, conversationId, `Open this spreadsheet https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`);
      expect(reply).toMatchObject({ intent: 'CLARIFICATION_REQUIRED', sheetAction: null });
      expect(reply.content).toContain('Your Google account cannot open this Google Sheet');
      expect(reply.content).not.toMatch(/status|PERMISSION_DENIED|403|404/);
    }
    expect(await spreadsheetRows(conversationId)).toEqual([]);
  });

  it('fails the connection safely when access is lost after the preview', async () => {
    const revokedId = '1AccessLostAfterPreview0123456789abcdefgh';
    application.sheets.seed(revokedId, 'Soon Private', [{ title: 'Sheet1', values: [['A']] }]);
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const conversationId = await startConversation(signedIn);
    const proposal = await chat(signedIn, conversationId, `Use this Google Sheet https://docs.google.com/spreadsheets/d/${revokedId}/edit`);
    application.sheets.forbidden.add(revokedId);
    const failed = await execute(signedIn, proposal.sheetAction!, 502);
    expect(failed.body.error.message).toContain('Your Google account cannot open this Google Sheet');
    expect(failed.body.error.details.action.status).toBe('FAILED');
    expect(failed.body.error.details.message.content).not.toContain('connected successfully');
    expect(await spreadsheetRows(conversationId)).toEqual([]);
  });

  it('keeps linked sheets private to the user who linked them', async () => {
    seedExisting();
    const owner = await signUpUser(application);
    await connectGoogle(owner);
    const conversationId = await startConversation(owner);
    const proposal = await chat(owner, conversationId, `Use this Google Sheet: ${EXISTING_URL}`);
    const stranger = await signUpUser(application);
    await connectGoogle(stranger);

    expect((await execute(stranger, proposal.sheetAction!, 404)).body.error.code).toBe('NOT_FOUND');
    await execute(owner, proposal.sheetAction!);
    await stranger.agent.get(`/conversations/${conversationId}/messages`).expect(404);
    await stranger.agent.post(`/conversations/${conversationId}/messages`).send({ content: 'Show me the first 5 rows' }).expect(404);

    const strangerConversation = await startConversation(stranger);
    const strangerRead = await chat(stranger, strangerConversation, 'Show me the first 5 rows');
    expect(strangerRead.sheetAction).toBeNull();
    expect(strangerRead.intent).not.toBe('READ_SHEET');
  });

  it('asks to connect Google, then links after the user connects', async () => {
    seedExisting();
    const signedIn = await signUpUser(application);
    const conversationId = await startConversation(signedIn);
    const proposal = await chat(signedIn, conversationId, `Use this Google Sheet: ${EXISTING_URL}`);
    expect(proposal.content).toContain('needs your Google account with Google Sheets access');
    expect(proposal.sheetAction).toMatchObject({ kind: 'LINK', spreadsheetTitle: 'Google Sheet', tabs: [] });

    expect((await execute(signedIn, proposal.sheetAction!, 409)).body.error.code).toBe('GOOGLE_NOT_CONNECTED');
    await connectGoogle(signedIn);
    const connected = await execute(signedIn, proposal.sheetAction!);
    expect(connected.body.action).toMatchObject({ status: 'SUCCEEDED', spreadsheetTitle: 'Hackathon Registrations', tabs: ['Registrations', 'Analytics'] });
  });

  it('asks for Google Sheets access when the connection lacks the scope', async () => {
    seedExisting();
    const signedIn = await signUpUser(application);
    const original = [...application.oauth.grantedScopes];
    application.oauth.grantedScopes = original.filter((scope) => scope !== GOOGLE_SHEETS_SCOPE);
    try {
      await connectGoogle(signedIn);
    } finally {
      application.oauth.grantedScopes = original;
    }
    const conversationId = await startConversation(signedIn);
    const callsBefore = application.sheets.calls.length;
    const proposal = await chat(signedIn, conversationId, `Use this Google Sheet: ${EXISTING_URL}`);
    expect(application.sheets.calls.length).toBe(callsBefore);
    expect((await execute(signedIn, proposal.sheetAction!, 409)).body.error.code).toBe('GOOGLE_SHEETS_ACCESS_REQUIRED');
  });

  it('refreshes an expired token for the preview and reports a revoked refresh token', async () => {
    seedExisting();
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const conversationId = await startConversation(signedIn);
    const expire = () =>
      application.container.database.query("UPDATE connected_accounts SET token_expires_at = now() - interval '1 hour' WHERE user_id = $1", [signedIn.user.id]);
    await expire();
    const refreshedBefore = application.oauth.refreshedTokens.length;
    const proposal = await chat(signedIn, conversationId, `Use this Google Sheet: ${EXISTING_URL}`);
    expect(proposal.sheetAction?.spreadsheetTitle).toBe('Hackathon Registrations');
    expect(application.oauth.refreshedTokens.length).toBe(refreshedBefore + 1);

    await expire();
    application.oauth.refreshFailure = new GoogleOAuthError('GOOGLE_RECONNECT_REQUIRED', 'Your Google connection has expired.');
    try {
      expect((await execute(signedIn, proposal.sheetAction!, 409)).body.error.code).toBe('GOOGLE_RECONNECT_REQUIRED');
    } finally {
      application.oauth.refreshFailure = null;
    }
  });

  it('lists linked results with the canonical URL when the chat is reopened', async () => {
    seedExisting();
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const conversationId = await startConversation(signedIn);
    await linkExisting(signedIn, conversationId);
    const page = await signedIn.agent.get(`/conversations/${conversationId}/messages`).expect(200);
    const linked = (page.body.items as MessageView[]).filter((message) => message.sheetAction?.kind === 'LINK');
    expect(linked).toHaveLength(2);
    expect(linked.every((message) => message.sheetAction?.spreadsheetUrl === EXISTING_URL && message.sheetAction.spreadsheetOrigin === 'LINKED_EXISTING')).toBe(true);
  });
});
