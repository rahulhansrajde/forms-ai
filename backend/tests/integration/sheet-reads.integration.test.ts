import type { MessageView } from '@forms-ai/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FakeSheetsMethod } from '../support/fake-sheets-gateway.js';
import {
  createTestApplication,
  sendChat,
  signUpUser,
  startConversation,
  type SignedInUser,
  type TestApplication,
} from '../support/test-application.js';

const TITLE = 'Forms AI Rank List';
const HEADERS = ['Register Number', 'Name', 'Department', 'Rank'];
const RAHUL = ['STU001', 'Rahul Hansraj H', 'AIML', '185'];
const PRIYA = ['STU002', 'Priya Kumar', 'CSE', '72'];
const SECOND_RAHUL = ['STU003', 'Rahul Hansraj H', 'AIDS', '210'];
const CLASSMATES = Array.from({ length: 250 }, (_value, index) => [`STU${index + 100}`, `Classmate ${index + 1}`, 'ECE', String(index + 300)]);
const RANK_LIST = [HEADERS, RAHUL, PRIYA, ...CLASSMATES];
const DUPLICATED = [HEADERS, RAHUL, PRIYA, SECOND_RAHUL];

function stateFrom(location: string): string {
  return new URL(location).searchParams.get('state') ?? '';
}

async function connectGoogle(signedIn: SignedInUser): Promise<void> {
  const start = await signedIn.agent.get('/auth/google').query({ returnTo: '/settings' }).expect(302);
  await signedIn.agent.get('/auth/google/callback').query({ code: 'authorization-code', state: stateFrom(start.headers.location ?? '') }).expect(302);
}

let sheetCounter = 0;

describe('reading a connected Google Sheet in chat', () => {
  let application: TestApplication;

  beforeAll(async () => {
    application = await createTestApplication();
  });

  afterAll(async () => {
    await application.close();
  });

  function seed(title: string, tab: string, rows: string[][]): string {
    sheetCounter += 1;
    const sheetId = `1ReadFlowSheet${String(sheetCounter).padStart(28, '0')}`;
    application.sheets.seed(sheetId, title, [{ title: tab, values: rows.map((row) => [...row]) }]);
    return sheetId;
  }

  async function link(signedIn: SignedInUser, conversationId: string, sheetId: string): Promise<void> {
    const proposal = await chat(signedIn, conversationId, `Use this Google Sheet: https://docs.google.com/spreadsheets/d/${sheetId}/edit`);
    await signedIn.agent.post(`/sheets/actions/${proposal.sheetAction!.id}/execute`).send({}).expect(200);
  }

  async function linkedChat(rows: string[][] = RANK_LIST): Promise<{ signedIn: SignedInUser; conversationId: string }> {
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const conversationId = await startConversation(signedIn);
    await link(signedIn, conversationId, seed(TITLE, 'Students', rows));
    return { signedIn, conversationId };
  }

  async function chat(signedIn: SignedInUser, conversationId: string, content: string): Promise<MessageView> {
    return (await sendChat(signedIn, conversationId, content)).assistantMessage as MessageView;
  }

  // Sends a message and reports how often each Google Sheets method was called while answering it.
  async function measured(signedIn: SignedInUser, conversationId: string, content: string) {
    const before = application.sheets.calls.length;
    const turn = await sendChat(signedIn, conversationId, content);
    const calls = application.sheets.calls.slice(before);
    const count = (method: FakeSheetsMethod) => calls.filter((call) => call.method === method).length;
    return { reply: turn.assistantMessage as MessageView, userIntent: turn.userMessage.intent as string, calls: calls.length, count };
  }

  async function history(signedIn: SignedInUser, conversationId: string): Promise<MessageView[]> {
    return (await signedIn.agent.get(`/conversations/${conversationId}/messages`).expect(200)).body.items as MessageView[];
  }

  describe('ordinary reads run without an extra click', () => {
    it('answers row, count, column and whole-sheet reads in the same turn and reads each only once', async () => {
      const { signedIn, conversationId } = await linkedChat();

      const firstRow = await measured(signedIn, conversationId, 'Read first row.');
      expect(firstRow.userIntent).toBe('READ_SHEET');
      expect(firstRow.reply).toMatchObject({ intent: null, sheetAction: { kind: 'READ', status: 'SUCCEEDED', spreadsheetTitle: TITLE } });
      expect(firstRow.reply.sheetAction!.table).toMatchObject({ values: [HEADERS, RAHUL], label: 'Students · 1 data row · header row included' });
      expect(firstRow.reply.content).toContain(`Here is the data from “${TITLE}”: 1 data row from “Students” (header row included).`);
      expect(firstRow.reply.content).not.toContain('Click Read sheet');
      expect(firstRow.count('readValues')).toBe(1);

      const twoRows = await measured(signedIn, conversationId, 'Read 2 rows.');
      expect(twoRows.reply.sheetAction).toMatchObject({ status: 'SUCCEEDED' });
      expect(twoRows.reply.sheetAction!.table!.values).toEqual([HEADERS, RAHUL, PRIYA]);
      expect(twoRows.count('readValues')).toBe(1);

      const column = await measured(signedIn, conversationId, 'Show the department column.');
      const departments = column.reply.sheetAction!.table!;
      expect(departments.values[0]).toEqual(['Department']);
      expect(departments.values.slice(1, 3)).toEqual([['AIML'], ['CSE']]);
      expect(departments.values.every((row) => row.length === 1)).toBe(true);
      expect(departments).toMatchObject({ truncated: true, totalRows: RANK_LIST.length, label: `Students · first 199 of ${RANK_LIST.length - 1} data rows · header row included` });
      expect(column.count('readValues')).toBe(1);

      const everything = await measured(signedIn, conversationId, 'Read all rows.');
      expect(everything.reply.sheetAction!.table).toMatchObject({ truncated: true, totalRows: RANK_LIST.length });
      expect(everything.reply.sheetAction!.table!.values).toHaveLength(200);
      expect(everything.reply.content).toContain(`the first 199 of ${RANK_LIST.length - 1} data rows from “Students”`);
      expect(everything.count('readValues')).toBe(1);

      const before = application.sheets.calls.length;
      const again = await signedIn.agent.post(`/sheets/actions/${firstRow.reply.sheetAction!.id}/execute`).send({}).expect(200);
      expect(again.body).toMatchObject({ action: { status: 'SUCCEEDED' }, message: null });
      expect(application.sheets.calls.length).toBe(before);

      const messages = await history(signedIn, conversationId);
      expect(messages.filter((message) => /Click Read sheet|Click Connect Google Sheet/.test(message.content))).toHaveLength(1);
      expect(messages.filter((message) => message.role === 'USER')).toHaveLength(5);
      expect(messages.filter((message) => message.sheetAction?.kind === 'READ')).toHaveLength(4);
      expect(messages.filter((message) => message.sheetAction?.kind === 'LINK')).toHaveLength(2);
      const actions = await application.container.database.query<{ kind: string; status: string }>('SELECT kind, status FROM sheet_actions WHERE conversation_id = $1', [
        conversationId,
      ]);
      expect(actions.filter((action) => action.kind === 'LINK')).toHaveLength(1);
      expect(actions.filter((action) => action.kind === 'READ').every((action) => action.status === 'SUCCEEDED')).toBe(true);
    });

    it('reuses the sheet when the conversation is reopened and keeps other conversations separate', async () => {
      const { signedIn, conversationId } = await linkedChat();
      await chat(signedIn, conversationId, 'Read first row.');

      const other = await startConversation(signedIn);
      for (const question of ['Read first row.', "What is Rahul Hansraj H's rank?"]) {
        const isolated = await measured(signedIn, other, question);
        expect(isolated.reply.sheetAction).toBeNull();
        expect(isolated.userIntent).not.toBe('READ_SHEET');
        expect(isolated.calls).toBe(0);
      }

      const reopened = await history(signedIn, conversationId);
      expect(reopened.find((message) => message.sheetAction?.kind === 'READ')?.sheetAction?.table?.values).toEqual([HEADERS, RAHUL]);
      const later = await measured(signedIn, conversationId, 'Read 2 rows.');
      expect(later.reply.sheetAction).toMatchObject({ status: 'SUCCEEDED', spreadsheetTitle: TITLE });
      expect(later.reply.sheetAction!.table!.values).toEqual([HEADERS, RAHUL, PRIYA]);
    });

    it('keeps reading the current sheet until a different sheet is explicitly connected', async () => {
      const { signedIn, conversationId } = await linkedChat();
      const alumni = seed('Alumni Directory', 'Alumni', [
        ['Name', 'Batch'],
        ['Meera', '2019'],
      ]);

      const proposal = await chat(signedIn, conversationId, `Use this Google Sheet: https://docs.google.com/spreadsheets/d/${alumni}/edit`);
      expect(proposal).toMatchObject({ intent: 'LINK_SHEET', sheetAction: { kind: 'LINK', status: 'PENDING', spreadsheetTitle: 'Alumni Directory' } });
      expect((await chat(signedIn, conversationId, 'Read first row.')).sheetAction?.spreadsheetTitle).toBe(TITLE);

      await signedIn.agent.post(`/sheets/actions/${proposal.sheetAction!.id}/execute`).send({}).expect(200);
      const switched = await chat(signedIn, conversationId, 'Read first row.');
      expect(switched.sheetAction).toMatchObject({ status: 'SUCCEEDED', spreadsheetTitle: 'Alumni Directory' });
      expect(switched.sheetAction!.table!.values).toEqual([
        ['Name', 'Batch'],
        ['Meera', '2019'],
      ]);
    });

    it('reports a failed read honestly and lets the card retry it once', async () => {
      const { signedIn, conversationId } = await linkedChat();
      application.sheets.failures.add('readValues');
      let failed: MessageView;
      try {
        failed = await chat(signedIn, conversationId, 'Read first row.');
        const record = await chat(signedIn, conversationId, "What is Priya Kumar's department?");
        expect(record).toMatchObject({ intent: 'CLARIFICATION_REQUIRED', sheetAction: null });
        expect(record.content).toContain('Google Sheets could not complete readValues');
        expect(record.content).not.toContain('CSE');
      } finally {
        application.sheets.failures.clear();
      }
      expect(failed.intent).toBe('READ_SHEET');
      expect(failed.sheetAction).toMatchObject({ kind: 'READ', status: 'FAILED', table: null, error: expect.stringContaining('could not complete readValues') });
      expect(failed.content).toContain(`I couldn't read “${TITLE}”.`);
      expect(failed.content).not.toContain('Here is the data');

      const retried = await signedIn.agent.post(`/sheets/actions/${failed.sheetAction!.id}/execute`).send({}).expect(200);
      expect(retried.body.action).toMatchObject({ status: 'SUCCEEDED' });
      expect(retried.body.message.content).toContain('Here is the data');
      expect(retried.body.action.table.values).toEqual([HEADERS, RAHUL]);
    });

    it('still asks for a spreadsheet in a chat that has none', async () => {
      const signedIn = await signUpUser(application);
      await connectGoogle(signedIn);
      const conversationId = await startConversation(signedIn);
      const reply = await measured(signedIn, conversationId, 'Read first row.');
      expect(reply.reply.sheetAction).toBeNull();
      expect(reply.calls).toBe(0);
    });
  });

  describe('questions about one record', () => {
    async function ask(signedIn: SignedInUser, conversationId: string, question: string) {
      const answer = await measured(signedIn, conversationId, question);
      const shown = JSON.stringify(answer.reply);
      expect(shown, question).not.toContain('Classmate');
      expect(shown, question).not.toContain('Summary:');
      expect(answer.count('readValues'), question).toBe(1);
      return answer;
    }

    it('returns only the requested values or the matching row', async () => {
      const { signedIn, conversationId } = await linkedChat();

      const rank = await ask(signedIn, conversationId, "What is Rahul Hansraj H's rank?");
      expect(rank.userIntent).toBe('READ_SHEET');
      expect(rank.reply).toMatchObject({ intent: null, content: "Rahul Hansraj H's Rank is 185.", sheetAction: { kind: 'READ', status: 'SUCCEEDED', table: null } });
      expect(rank.reply.content).not.toContain('Priya');

      const department = await ask(signedIn, conversationId, "What is Priya Kumar's department?");
      expect(department.reply.content).toBe("Priya Kumar's Department is CSE.");
      expect(department.reply.content).not.toContain('Rahul');

      const byId = await ask(signedIn, conversationId, 'Find register number STU001.');
      expect(byId.reply.content).toBe("Register Number STU001 is Rahul Hansraj H. Here is Rahul Hansraj H's row from “Students”.");
      expect(byId.reply.sheetAction!.table).toMatchObject({ values: [HEADERS, RAHUL], label: 'Students · row 2' });

      const row = await ask(signedIn, conversationId, "Show Rahul Hansraj H's row.");
      expect(row.reply.content).toBe("Here is Rahul Hansraj H's row from “Students”.");
      expect(row.reply.sheetAction!.table!.values).toEqual([HEADERS, RAHUL]);

      const ofId = await ask(signedIn, conversationId, 'What is the department of STU002?');
      expect(ofId.reply.content).toBe("Register Number STU002 is Priya Kumar. Priya Kumar's Department is CSE.");

      const followUp = await ask(signedIn, conversationId, 'What is his rank?');
      expect(followUp.reply.content).toBe("Priya Kumar's Rank is 72.");

      const two = await ask(signedIn, conversationId, 'What department is Rahul Hansraj H in, and what is his rank?');
      expect(two.reply.content).toBe("Rahul Hansraj H's Department is AIML and Rank is 185.");

      const findAndShow = await ask(signedIn, conversationId, 'Find Rahul Hansraj H and show his rank.');
      expect(findAndShow.reply.content).toBe("Rahul Hansraj H's Rank is 185.");
      expect(findAndShow.reply.sheetAction!.table).toBeNull();
    });

    it.each([
      'find Rahul Hansraj H row and get mew that row details',
      'find Rahul Hansraj H row and get me that row details',
      'fnd rahul hansraj h row and give me the details',
      'can u get Rahul Hansraj H record pls',
      "show me Rahul Hansraj H's details",
      'Rahul Hansraj H row details',
      'get me the row of Rahul Hansraj H',
      'lookup Rahul Hansraj H detials',
      'who is Rahul Hansraj H?',
      'show me rahul hansraj h row alone',
      'show only the matching row for Rahul Hansraj H',
    ])('shows only Rahul’s row for “%s”', async (question) => {
      const { signedIn, conversationId } = await linkedChat();
      const answer = await ask(signedIn, conversationId, question);
      expect(answer.userIntent).toBe('READ_SHEET');
      expect(answer.reply).toMatchObject({ intent: null, sheetAction: { kind: 'READ', status: 'SUCCEEDED' } });
      expect(answer.reply.sheetAction!.table).toMatchObject({ values: [HEADERS, RAHUL], totalRows: 2, truncated: false, label: 'Students · row 2' });
      expect(answer.reply.content).toContain("Rahul Hansraj H's row from “Students”");
      expect(JSON.stringify(answer.reply)).not.toMatch(/Priya|STU002|data rows/);
    });

    it('asks for an identifier or reports no match for the same wording, and still reads the whole sheet on request', async () => {
      const duplicated = await linkedChat(DUPLICATED);
      const ambiguous = await chat(duplicated.signedIn, duplicated.conversationId, 'find Rahul Hansraj H row and get mew that row details');
      expect(ambiguous).toMatchObject({ intent: 'CLARIFICATION_REQUIRED', sheetAction: null });
      expect(ambiguous.content).toBe('I found 2 students named Rahul Hansraj H. Please provide the Register Number or row number.');

      const { signedIn, conversationId } = await linkedChat();
      const missing = await chat(signedIn, conversationId, 'find Arjun Mehta row and get me that row details');
      expect(missing).toMatchObject({ intent: 'CLARIFICATION_REQUIRED', sheetAction: null });
      expect(missing.content).toBe("I couldn't find a student named Arjun Mehta in the “Students” sheet. Please provide Arjun Mehta's Register Number or row number.");

      const everything = await chat(signedIn, conversationId, 'Read all rows.');
      expect(everything.sheetAction!.table).toMatchObject({ truncated: true, totalRows: RANK_LIST.length });
      expect(everything.sheetAction!.table!.values).toHaveLength(200);
    });

    it('reads the current value from Google Sheets each time', async () => {
      const { signedIn, conversationId } = await linkedChat();
      expect((await chat(signedIn, conversationId, "What is Priya Kumar's rank?")).content).toBe("Priya Kumar's Rank is 72.");
      const sheetId = `1ReadFlowSheet${String(sheetCounter).padStart(28, '0')}`;
      await application.sheets.writeValues('check', sheetId, "'Students'!D3", [['64']], 'RAW');
      expect((await chat(signedIn, conversationId, "What is Priya Kumar's rank?")).content).toBe("Priya Kumar's Rank is 64.");
    });

    it('says when nobody matches and asks for an identifier when a name repeats', async () => {
      const { signedIn, conversationId } = await linkedChat(DUPLICATED);

      const unknown = await chat(signedIn, conversationId, 'Find Arjun Mehta.');
      expect(unknown).toMatchObject({ intent: 'CLARIFICATION_REQUIRED', sheetAction: null });
      expect(unknown.content).toBe("I couldn't find a student named Arjun Mehta in the “Students” sheet. Please provide Arjun Mehta's Register Number or row number.");

      const ambiguous = await chat(signedIn, conversationId, 'Find Rahul Hansraj H');
      expect(ambiguous).toMatchObject({ intent: 'CLARIFICATION_REQUIRED', sheetAction: null });
      expect(ambiguous.content).toBe('I found 2 students named Rahul Hansraj H. Please provide the Register Number or row number.');
      expect(ambiguous.content).not.toMatch(/185|210|AIML|AIDS/);

      const unresolved = await chat(signedIn, conversationId, 'What is his rank?');
      expect(unresolved).toMatchObject({ intent: 'CLARIFICATION_REQUIRED', sheetAction: null });
      expect(unresolved.content).toBe("I still need Rahul Hansraj H's ID or row number to find the record.");

      const chosen = await chat(signedIn, conversationId, 'His register number is STU003');
      expect(chosen.content).toBe("Register Number STU003 is Rahul Hansraj H. Here is Rahul Hansraj H's row from “Students”.");
      expect(chosen.sheetAction!.table!.values).toEqual([HEADERS, SECOND_RAHUL]);

      expect((await chat(signedIn, conversationId, 'What is his rank?')).content).toBe("Rahul Hansraj H's Rank is 210.");
    });

    it('does not guess who "his" means without an identified person', async () => {
      const { signedIn, conversationId } = await linkedChat();
      const reply = await measured(signedIn, conversationId, 'What is his rank?');
      expect(reply.reply).toMatchObject({ intent: 'CLARIFICATION_REQUIRED', sheetAction: null, content: 'Who do you mean? Please name the person or give their ID.' });
      expect(reply.calls).toBe(0);
    });
  });

  describe('creation and changes are unchanged', () => {
    it('creates a sheet with the requested headers only after a click, then reads its title and headers', async () => {
      const signedIn = await signUpUser(application);
      await connectGoogle(signedIn);
      const conversationId = await startConversation(signedIn);

      const create = await measured(signedIn, conversationId, 'Create a spreadsheet called Course Feedback with columns Student Name, Course, Rating');
      expect(create.reply).toMatchObject({ intent: 'CREATE_SHEET', sheetAction: { kind: 'CREATE', status: 'PENDING', spreadsheetTitle: 'Course Feedback' } });
      expect(create.calls).toBe(0);
      const created = await signedIn.agent.post(`/sheets/actions/${create.reply.sheetAction!.id}/execute`).send({}).expect(200);
      expect(created.body.message.content).toBe('Google Sheet created successfully. “Course Feedback” is ready.');

      const read = await chat(signedIn, conversationId, 'Read first row.');
      expect(read.sheetAction).toMatchObject({ status: 'SUCCEEDED', spreadsheetTitle: 'Course Feedback' });
      expect(read.sheetAction!.table).toMatchObject({ values: [['Student Name', 'Course', 'Rating']], label: 'Sheet1 · header row only' });
      const structure = await chat(signedIn, conversationId, 'How many tabs does the spreadsheet have?');
      expect(structure.sheetAction!.table!.values[1]).toEqual(['Sheet1', '1000', '26', 'Student Name, Course, Rating']);

      const change = await measured(signedIn, conversationId, 'Add a column called Comments');
      expect(change.reply).toMatchObject({ intent: 'MODIFY_SHEET', sheetAction: { kind: 'MODIFY', status: 'PENDING' } });
      expect(change.calls).toBe(0);
      const googleId = (created.body.action.spreadsheetUrl as string).split('/d/')[1]!.split('/')[0]!;
      expect(application.sheets.valuesOf(googleId, 'Sheet1')).toEqual([['Student Name', 'Course', 'Rating']]);
      await signedIn.agent.post(`/sheets/actions/${change.reply.sheetAction!.id}/execute`).send({}).expect(200);
      expect(application.sheets.valuesOf(googleId, 'Sheet1')).toEqual([['Student Name', 'Course', 'Rating', 'Comments']]);

      const clear = await chat(signedIn, conversationId, 'Clear column B');
      expect(clear.sheetAction).toMatchObject({ kind: 'MODIFY', status: 'PENDING', destructive: true });
      await signedIn.agent.post(`/sheets/actions/${clear.sheetAction!.id}/execute`).send({}).expect(409);
    });
  });
});
