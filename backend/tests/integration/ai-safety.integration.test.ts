import type { DraftView } from '@forms-ai/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AIProvider } from '../../src/domain/interfaces/ai-provider.js';
import { AIProviderError } from '../../src/shared/errors/application-errors.js';
import {
  createTestApplication,
  sendChat,
  signUpUser,
  startConversation,
  type SignedInUser,
  type TestApplication,
} from '../support/test-application.js';

type Scripted = unknown | (() => unknown);

class ScriptedAIProvider implements AIProvider {
  intent: Scripted = { intent: 'NORMAL_CHAT' };
  form: Scripted = null;
  operations: Scripted = null;
  suggestions: Scripted = null;
  selection: Scripted = null;
  replyText: Scripted = 'Hello';

  private resolve(value: Scripted): unknown {
    return typeof value === 'function' ? (value as () => unknown)() : value;
  }

  async classifyIntent(): Promise<unknown> {
    return this.resolve(this.intent);
  }

  async generateForm(): Promise<unknown> {
    return this.resolve(this.form);
  }

  async planFormOperations(): Promise<unknown> {
    return this.resolve(this.operations);
  }

  async suggestQuestions(): Promise<unknown> {
    return this.resolve(this.suggestions);
  }

  async selectSuggestions(): Promise<unknown> {
    return this.resolve(this.selection);
  }

  async reply(): Promise<string> {
    return String(this.resolve(this.replyText));
  }
}

const VALID_FORM = {
  title: 'Safety Form',
  sections: [{ questions: [{ type: 'SHORT_ANSWER', title: 'Name', required: true }, { type: 'EMAIL', title: 'Email' }] }],
};

describe('AI output can only change drafts through validated operations', () => {
  const ai = new ScriptedAIProvider();
  let application: TestApplication;
  let owner: SignedInUser;
  let conversationId: string;
  let draft: DraftView;

  beforeAll(async () => {
    application = await createTestApplication({ aiProvider: ai });
    owner = await signUpUser(application);
  });

  afterAll(async () => {
    await application.close();
  });

  beforeEach(async () => {
    conversationId = await startConversation(owner);
    ai.intent = { intent: 'CREATE_FORM' };
    ai.form = VALID_FORM;
    draft = (await sendChat(owner, conversationId, 'Create a safety form')).draft as DraftView;
  });

  async function versionCount(): Promise<number> {
    const rows = await application.container.database.query<{ count: string }>('SELECT count(*) AS count FROM form_versions WHERE draft_id = $1', [
      draft.id,
    ]);
    return Number(rows[0]?.count);
  }

  async function currentDraft(): Promise<DraftView> {
    return (await owner.agent.get(`/drafts/${draft.id}`).expect(200)).body.draft as DraftView;
  }

  it.each([
    ['plain text instead of JSON', 'Sure! Here is your form.'],
    ['an unsupported question type', { title: 'Bad', sections: [{ questions: [{ type: 'FILE_UPLOAD', title: 'CV' }] }] }],
    ['injected extra fields', { ...VALID_FORM, sections: [{ questions: [{ type: 'SHORT_ANSWER', title: 'x', script: 'rm -rf /' }] }] }],
    ['an empty form', { title: '', sections: [] }],
  ])('rejects a generated form with %s without creating a draft', async (_label, output) => {
    const otherConversation = await startConversation(owner);
    ai.form = output;
    const result = await sendChat(owner, otherConversation, 'Create another form');
    expect(result.assistantMessage.intent).toBe('CLARIFICATION_REQUIRED');
    expect(result.draftChanged).toBe(false);
    expect((await owner.agent.get(`/conversations/${otherConversation}`).expect(200)).body.conversation.activeDraftId).toBeNull();
  });

  it.each([
    ['an unknown operation type', { operations: [{ type: 'DROP_DATABASE' }] }],
    ['a reference to a question that does not exist', { operations: [{ type: 'REMOVE_QUESTION', questionId: 'question_ghost' }] }],
    ['a malformed operation list', { operations: 'remove everything' }],
    ['a partially valid batch', { operations: [{ type: 'UPDATE_TITLE', title: 'Changed' }, { type: 'REMOVE_SECTION', sectionId: 'section_ghost' }] }],
  ])('ignores planned changes with %s', async (_label, output) => {
    ai.intent = { intent: 'MODIFY_FORM' };
    ai.operations = output;
    const result = await sendChat(owner, conversationId, 'Change the form');
    expect(result.draftChanged).toBe(false);
    expect(result.assistantMessage.intent).toBe('CLARIFICATION_REQUIRED');
    expect(await versionCount()).toBe(1);
    expect((await currentDraft()).currentVersion.schema).toEqual(draft.currentVersion.schema);
  });

  it('applies approved operations and records them as an AI version', async () => {
    ai.intent = { intent: 'MODIFY_FORM' };
    const nameQuestion = draft.currentVersion.schema.sections[0]!.questions[0]!;
    ai.operations = { operations: [{ type: 'UPDATE_QUESTION', questionId: nameQuestion.id, changes: { title: 'Full Name' } }] };
    const result = await sendChat(owner, conversationId, 'Rename name to full name');
    expect(result.draftChanged).toBe(true);
    expect(result.draft.currentVersion).toMatchObject({ versionNumber: 2, source: 'AI' });
    expect(await versionCount()).toBe(2);
  });

  it('treats unknown intents as a request for clarification', async () => {
    ai.intent = { intent: 'PUBLISH_NOW' };
    const result = await sendChat(owner, conversationId, 'Do it');
    expect(result.assistantMessage.intent).toBe('CLARIFICATION_REQUIRED');
    expect(await versionCount()).toBe(1);
  });

  it('never publishes to Google Forms from chat, even when the AI asks to', async () => {
    ai.intent = { intent: 'CREATE_GOOGLE_FORM' };
    const result = await sendChat(owner, conversationId, 'Publish it now');
    expect(result.assistantMessage.intent).toBe('CREATE_GOOGLE_FORM');
    expect(application.forms.createdForms).toHaveLength(0);
    const jobs = await application.container.database.query('SELECT id FROM publish_jobs WHERE draft_id = $1', [draft.id]);
    expect(jobs).toHaveLength(0);
  });

  it('keeps the draft intact when the AI provider is unavailable', async () => {
    ai.intent = () => {
      throw new AIProviderError('The AI service is unavailable right now.');
    };
    const result = await sendChat(owner, conversationId, 'Remove email');
    expect(result.assistantMessage.content).toContain('trouble reaching the AI service');
    expect(result.draftChanged).toBe(false);
    expect(await versionCount()).toBe(1);
  });

  it('only accepts suggestion ids that were actually proposed', async () => {
    ai.intent = { intent: 'SUGGEST_QUESTIONS' };
    ai.suggestions = { formTitle: 'Safety Form', suggestions: [{ type: 'SHORT_ANSWER', title: 'Phone' }] };
    await sendChat(owner, conversationId, 'Suggest more');
    ai.intent = { intent: 'ACCEPT_SUGGESTIONS' };
    ai.selection = { acceptedIds: ['suggestion_99', '../../etc/passwd'] };
    const result = await sendChat(owner, conversationId, 'add those');
    expect(result.assistantMessage.intent).toBe('CLARIFICATION_REQUIRED');
    expect(await versionCount()).toBe(1);
  });
});
