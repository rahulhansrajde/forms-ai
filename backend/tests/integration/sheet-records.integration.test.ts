import type { MessageView, SheetActionView } from '@forms-ai/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AIProvider } from '../../src/domain/interfaces/ai-provider.js';
import {
  createTestApplication,
  sendChat,
  signUpUser,
  startConversation,
  type SignedInUser,
  type TestApplication,
} from '../support/test-application.js';

const HEADERS = ['Student ID', 'Name', 'Email', 'Phone Number', 'Department', 'College', 'Year'];
const STUDENTS = [
  HEADERS,
  ['STU001', 'Rahul', 'rahul@example.com', '98765', 'ECE', 'ABC College', '3rd Year'],
  ['STU002', 'Priya', 'priya@example.com', '', 'CSE', 'XYZ College', '2nd Year'],
  ['STU003', 'Arjun', 'arjun@example.com', '', 'ME', 'ABC College', '1st Year'],
  ['STU004', 'Ananya', 'ananya1@example.com', '', 'CSE', 'ABC College', '2nd Year'],
  ['STU005', 'Ananya', 'ananya2@example.com', '', 'IT', 'XYZ College', '4th Year'],
];
const A1_RANGE = /\b[A-Z]{1,3}\d+(?::[A-Z]{1,3}\d*)?\b/;

function stateFrom(location: string): string {
  return new URL(location).searchParams.get('state') ?? '';
}

async function connectGoogle(signedIn: SignedInUser): Promise<void> {
  const start = await signedIn.agent.get('/auth/google').query({ returnTo: '/settings' }).expect(302);
  await signedIn.agent.get('/auth/google/callback').query({ code: 'authorization-code', state: stateFrom(start.headers.location ?? '') }).expect(302);
}

let sheetCounter = 0;

describe('natural-language record updates in Google Sheets', () => {
  let application: TestApplication;

  beforeAll(async () => {
    application = await createTestApplication();
  });

  afterAll(async () => {
    await application.close();
  });

  async function studentsChat(rows: string[][] = STUDENTS): Promise<{ signedIn: SignedInUser; conversationId: string; sheetId: string }> {
    sheetCounter += 1;
    const sheetId = `1StudentRegistration${String(sheetCounter).padStart(24, '0')}`;
    application.sheets.seed(sheetId, 'Forms AI Student Registration', [
      { title: 'Students', values: rows.map((row) => [...row]) },
      { title: 'Summary', values: [['Department', 'Count']] },
    ]);
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const conversationId = await startConversation(signedIn);
    const proposal = await chat(signedIn, conversationId, `Use this Google Sheet: https://docs.google.com/spreadsheets/d/${sheetId}/edit`);
    await execute(signedIn, proposal.sheetAction!);
    return { signedIn, conversationId, sheetId };
  }

  async function chat(signedIn: SignedInUser, conversationId: string, content: string): Promise<MessageView> {
    return (await sendChat(signedIn, conversationId, content)).assistantMessage as MessageView;
  }

  async function execute(signedIn: SignedInUser, action: SheetActionView, status = 200) {
    return signedIn.agent.post(`/sheets/actions/${action.id}/execute`).send(action.destructive ? { confirmDestructive: true } : {}).expect(status);
  }

  function cell(sheetId: string, row: number, header: string): string {
    return application.sheets.valuesOf(sheetId, 'Students')[row - 1]?.[HEADERS.indexOf(header)] ?? '';
  }

  it("changes Rahul's Year after finding his row in the real data", async () => {
    const { signedIn, conversationId, sheetId } = await studentsChat();
    const reply = await chat(signedIn, conversationId, "Change Rahul's Year from 3rd Year to 4th Year.");

    expect(reply.intent).toBe('MODIFY_SHEET');
    expect(reply.content).toContain('Rahul is Student ID STU001. I found the record and prepared the update.');
    expect(reply.sheetAction?.steps).toEqual([{ text: "Update Rahul's Year", done: "Updated Rahul's Year from “3rd Year” to “4th Year”", change: { from: '3rd Year', to: '4th Year' } }]);
    expect(JSON.stringify(reply.sheetAction?.steps)).not.toMatch(A1_RANGE);
    expect(cell(sheetId, 2, 'Year')).toBe('3rd Year');

    const result = await execute(signedIn, reply.sheetAction!);
    expect(result.body.message.content).toBe('Google Sheet updated successfully. Updated Rahul\'s Year from “3rd Year” to “4th Year”.');
    expect(cell(sheetId, 2, 'Year')).toBe('4th Year');
    expect(STUDENTS.slice(2).map((_row, index) => cell(sheetId, index + 3, 'Year'))).toEqual(STUDENTS.slice(2).map((row) => row[6]));
  });

  it.each([
    ['Change Rahul’s Year from 3rd Year to 4th Year.', 2, 'Year', '4th Year'],
    ["Set Rahul's Year to 4th Year.", 2, 'Year', '4th Year'],
    ["change RAHUL's year to 4th Year", 2, 'Year', '4th Year'],
    ["  Change   rahul's   Department   to CSE ", 2, 'Department', 'CSE'],
    ["Change Priya's department to ECE.", 3, 'Department', 'ECE'],
    ["Change STU003's Year to 2nd Year.", 4, 'Year', '2nd Year'],
    ["Update rahul@example.com's Department to CSE", 2, 'Department', 'CSE'],
    ['Change Rahul Year from 3rd Year to 4th Year', 2, 'Year', '4th Year'],
  ])('resolves “%s”', async (message, row, header, value) => {
    const { signedIn, conversationId, sheetId } = await studentsChat();
    const reply = await chat(signedIn, conversationId, message);
    expect(reply.sheetAction, reply.content).not.toBeNull();
    await execute(signedIn, reply.sheetAction!);
    expect(cell(sheetId, row, header)).toBe(value);
  });

  it('explains how the record was identified', async () => {
    const { signedIn, conversationId } = await studentsChat();
    expect((await chat(signedIn, conversationId, "Change STU001's Year to 4th Year.")).content).toContain('Student ID STU001 is Rahul.');
    expect((await chat(signedIn, conversationId, "Update rahul@example.com's Department to CSE")).content).toContain('Email rahul@example.com is Rahul.');
  });

  it('asks for the new value and shows the current one', async () => {
    const { signedIn, conversationId } = await studentsChat();
    const reply = await chat(signedIn, conversationId, "Update Rahul's phone number.");
    expect(reply).toMatchObject({ intent: 'CLARIFICATION_REQUIRED', sheetAction: null });
    expect(reply.content).toBe('What should Rahul\'s Phone Number be? It is currently “98765”.');
  });

  it('names the missing column instead of guessing', async () => {
    const { signedIn, conversationId } = await studentsChat(STUDENTS.map((row) => row.filter((_cell, index) => index !== 3)));
    const reply = await chat(signedIn, conversationId, "Update Rahul's phone number to 12345.");
    expect(reply.sheetAction).toBeNull();
    expect(reply.content).toBe('There is no “phone number” column in “Students”. The columns are Student ID, Name, Email, Department, College, Year.');
  });

  it('says when nothing needs to change and when the stated old value differs', async () => {
    const { signedIn, conversationId } = await studentsChat();
    const same = await chat(signedIn, conversationId, "Set Arjun's Year to 1st Year.");
    expect(same).toMatchObject({ intent: 'MODIFY_SHEET', sheetAction: null });
    expect(same.content).toContain('Arjun\'s Year is already “1st Year”. Nothing needs to change.');
    const different = await chat(signedIn, conversationId, "Change Arjun's Year from 3rd Year to 4th Year.");
    expect(different.content).toContain('Arjun\'s Year is currently “1st Year”, not “3rd Year”.');
    expect(different.sheetAction?.steps[0]?.change).toEqual({ from: '1st Year', to: '4th Year' });
  });

  it('reports a person who is not in the sheet after looking them up', async () => {
    const { signedIn, conversationId } = await studentsChat();
    const reply = await chat(signedIn, conversationId, "Change Rohan's Year to 2nd Year.");
    expect(reply).toMatchObject({ intent: 'CLARIFICATION_REQUIRED', sheetAction: null });
    expect(reply.content).toBe("I couldn't find a student named Rohan in the “Students” sheet. Please provide Rohan's Student ID or row number.");
  });

  it('asks which student is meant when a name is duplicated, then uses the ID the user gives', async () => {
    const { signedIn, conversationId, sheetId } = await studentsChat();
    const ambiguous = await chat(signedIn, conversationId, "Change Ananya's Year to 3rd Year.");
    expect(ambiguous).toMatchObject({ intent: 'CLARIFICATION_REQUIRED', sheetAction: null });
    expect(ambiguous.content).toBe('I found 2 students named Ananya. Please provide the Student ID or row number.');

    const wrong = await chat(signedIn, conversationId, 'Her student id is STU001');
    expect(wrong.sheetAction).toBeNull();
    expect(wrong.content).toContain('Student ID STU001 belongs to Rahul, not Ananya');

    const resolved = await chat(signedIn, conversationId, 'Her student id is stu005');
    expect(resolved.content).toContain('Student ID STU005 is Ananya.');
    await execute(signedIn, resolved.sheetAction!);
    expect(cell(sheetId, 6, 'Year')).toBe('3rd Year');
    expect(cell(sheetId, 5, 'Year')).toBe('2nd Year');
  });

  it('accepts a row number for a duplicated name', async () => {
    const { signedIn, conversationId, sheetId } = await studentsChat();
    await chat(signedIn, conversationId, "Change Ananya's Department to EEE.");
    const resolved = await chat(signedIn, conversationId, "It's row 5");
    await execute(signedIn, resolved.sheetAction!);
    expect(cell(sheetId, 5, 'Department')).toBe('EEE');
    expect(cell(sheetId, 6, 'Department')).toBe('IT');
  });

  it('keeps the person in context for follow-up questions', async () => {
    const { signedIn, conversationId, sheetId } = await studentsChat();
    const first = await chat(signedIn, conversationId, "Change Rahul's Year from 3rd Year to 4th Year.");
    await execute(signedIn, first.sheetAction!);

    const confirmed = await chat(signedIn, conversationId, 'His student id is STU001');
    expect(confirmed).toMatchObject({ intent: 'MODIFY_SHEET', sheetAction: null });
    expect(confirmed.content).toBe('Got it — Rahul is Student ID STU001 in “Students”.');

    const followUp = await chat(signedIn, conversationId, 'Change his Department to CSE.');
    expect(followUp.sheetAction?.steps[0]).toMatchObject({ text: "Update Rahul's Department", change: { from: 'ECE', to: 'CSE' } });
    await execute(signedIn, followUp.sheetAction!);
    expect(cell(sheetId, 2, 'Department')).toBe('CSE');

    const mismatch = await chat(signedIn, conversationId, 'His student id is STU002');
    expect(mismatch.content).toBe('In “Students”, Student ID STU002 belongs to Priya, not Rahul.');
  });

  it('does not resolve a pronoun without an established person', async () => {
    const { signedIn, conversationId } = await studentsChat();
    const reply = await chat(signedIn, conversationId, 'Change his Year to 4th Year.');
    expect(reply.sheetAction ?? null).toBeNull();
  });

  it('finds the record far beyond the first rows of a large sheet', async () => {
    const rows = [HEADERS, ...Array.from({ length: 1500 }, (_value, index) => [`STU${String(index + 10).padStart(4, '0')}`, `Student ${index}`, '', '', 'CSE', 'ABC', '1st Year'])];
    rows.push(['STU9999', 'Rahul', 'rahul@example.com', '', 'ECE', 'ABC', '3rd Year']);
    const { signedIn, conversationId, sheetId } = await studentsChat(rows);
    const reply = await chat(signedIn, conversationId, "Change Rahul's Year to 4th Year.");
    await execute(signedIn, reply.sheetAction!);
    expect(application.sheets.valuesOf(sheetId, 'Students').length).toBeLessThan(rows.length);
    const values = await application.sheets.readValues('check', sheetId, "'Students'!A1:G1600");
    expect(values[1501]?.[6]).toBe('4th Year');
  });

  it('re-locates the record if rows moved, and refuses to overwrite a value that changed', async () => {
    const { signedIn, conversationId, sheetId } = await studentsChat();
    const moved = await chat(signedIn, conversationId, "Change Rahul's Year to 4th Year.");
    await application.sheets.applyStructuralChanges('check', sheetId, [{ kind: 'INSERT_DIMENSION', sheetId: 100, dimension: 'ROWS', startIndex: 1, count: 1 }]);
    await execute(signedIn, moved.sheetAction!);
    expect(cell(sheetId, 3, 'Year')).toBe('4th Year');

    const stale = await chat(signedIn, conversationId, "Change Priya's Year to 3rd Year.");
    await application.sheets.writeValues('check', sheetId, "'Students'!G4", [['1st Year']], 'RAW');
    const failed = await execute(signedIn, stale.sheetAction!, 400);
    expect(failed.body.error.message).toContain('Priya\'s Year changed in Google Sheets since this update was prepared (it is now “1st Year”)');
    expect(cell(sheetId, 4, 'Year')).toBe('1st Year');
  });

  it('never lets another user run a record update', async () => {
    const { signedIn, conversationId, sheetId } = await studentsChat();
    const reply = await chat(signedIn, conversationId, "Change Rahul's Year to 4th Year.");
    const stranger = await signUpUser(application);
    await connectGoogle(stranger);
    await execute(stranger, reply.sheetAction!, 404);
    expect(cell(sheetId, 2, 'Year')).toBe('3rd Year');
  });

  it('describes reads without A1 ranges unless the user asked for one', async () => {
    const { signedIn, conversationId } = await studentsChat();
    const read = await chat(signedIn, conversationId, 'Show me the first 3 rows from Students');
    expect(read.sheetAction?.steps).toEqual([
      {
        text: 'Read the first 3 data rows from “Students”',
        done: 'Read the first 3 data rows from “Students”',
        change: null,
        note: 'Header row included',
      },
    ]);
    expect(read.sheetAction?.table?.range).toBe("'Students'!A1:G4");
    expect(read.sheetAction?.table?.values).toHaveLength(4);
    expect(read.sheetAction?.table?.totalRows).toBe(4);
    expect(read.sheetAction?.table?.label).toBe('Students · 3 data rows · header row included');
    expect(read.content).toBe(
      'Here is the data from “Forms AI Student Registration”: 3 data rows from “Students” (header row included). The table below shows the exact values from Google Sheets.',
    );
    expect(read.content).not.toMatch(A1_RANGE);

    const explicit = await chat(signedIn, conversationId, 'Read A1:F6');
    expect(explicit.sheetAction?.steps.map((step) => step.text)).toEqual(['Read A1:F6 from “Students”']);
    expect(explicit.sheetAction?.table?.label).toBe('Students · A1:F6');
  });

  it('describes column changes by name', async () => {
    const { signedIn, conversationId } = await studentsChat();
    const reply = await chat(signedIn, conversationId, 'Add a column called Section after Department');
    expect(reply.sheetAction?.steps.map((step) => step.text)).toEqual(['Add a “Section” column after “Department” on “Students”']);
    const result = await execute(signedIn, reply.sheetAction!);
    expect(result.body.message.content).toBe('Google Sheet updated successfully. Added a “Section” column after “Department” on “Students”.');
  });
});

class PlannedRecordAI implements AIProvider {
  plan: unknown = null;

  async classifyIntent(): Promise<unknown> {
    return { intent: 'MODIFY_SHEET' };
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
    return '';
  }
}

describe('record updates planned by the AI', () => {
  const ai = new PlannedRecordAI();
  let application: TestApplication;
  let owner: SignedInUser;
  let conversationId: string;
  const sheetId = '1PlannedRecordsSheet0000000000000000000000';

  beforeAll(async () => {
    application = await createTestApplication({ aiProvider: ai });
    application.sheets.seed(sheetId, 'Students AI', [{ title: 'Students', values: STUDENTS.map((row) => [...row]) }]);
    owner = await signUpUser(application);
    await connectGoogle(owner);
    conversationId = await startConversation(owner);
    const link = (await sendChat(owner, conversationId, `Use this Google Sheet: https://docs.google.com/spreadsheets/d/${sheetId}/edit`)).assistantMessage as MessageView;
    await owner.agent.post(`/sheets/actions/${link.sheetAction!.id}/execute`).send({}).expect(200);
  });

  afterAll(async () => {
    await application.close();
  });

  it('resolves the row from the data, not from the AI', async () => {
    ai.plan = {
      summary: 'Update the year.',
      operations: [{ type: 'UPDATE_RECORD', match: { value: 'Priya' }, changes: [{ column: 'Year', value: '3rd Year' }] }],
    };
    const reply = (await sendChat(owner, conversationId, 'Priya moved up a year, she is in 3rd Year now')).assistantMessage as MessageView;
    expect(reply.sheetAction?.steps[0]).toMatchObject({ text: "Update Priya's Year", change: { from: '2nd Year', to: '3rd Year' } });
    await owner.agent.post(`/sheets/actions/${reply.sheetAction!.id}/execute`).send({}).expect(200);
    expect(application.sheets.valuesOf(sheetId, 'Students')[2]?.[6]).toBe('3rd Year');
  });

  it('rejects a plan that tries to choose the row itself', async () => {
    ai.plan = {
      summary: 'Update the year.',
      operations: [{ type: 'UPDATE_RECORD', match: { value: 'Priya' }, changes: [{ column: 'Year', value: '4th Year' }], target: { row: 2, label: 'Priya', changes: [] } }],
    };
    const reply = (await sendChat(owner, conversationId, 'Priya is in 4th Year now')).assistantMessage as MessageView;
    expect(reply).toMatchObject({ intent: 'CLARIFICATION_REQUIRED', sheetAction: null });
  });
});
