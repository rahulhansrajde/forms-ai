import { countQuestions, type DraftView, type FormSchema } from '@forms-ai/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestApplication,
  sendChat,
  signUpUser,
  startConversation,
  type SignedInUser,
  type TestApplication,
} from '../support/test-application.js';

function questionTitles(schema: FormSchema): string[] {
  return schema.sections.flatMap((section) => section.questions.map((question) => question.title));
}

function findQuestion(schema: FormSchema, title: string) {
  return schema.sections.flatMap((section) => section.questions).find((question) => question.title === title);
}

describe('chat behaviour scenarios', () => {
  let application: TestApplication;
  let owner: SignedInUser;

  beforeAll(async () => {
    application = await createTestApplication();
    owner = await signUpUser(application);
  });

  afterAll(async () => {
    await application.close();
  });

  it('scenario 1: answers general questions without creating a draft', async () => {
    const conversationId = await startConversation(owner);
    const result = await sendChat(owner, conversationId, 'What is Google Forms?');
    expect(result.assistantMessage.intent).toBe('NORMAL_CHAT');
    expect(result.assistantMessage.content).toContain('Google Forms');
    expect(result.draftChanged).toBe(false);
    const conversation = await owner.agent.get(`/conversations/${conversationId}`).expect(200);
    expect(conversation.body.conversation.activeDraftId).toBeNull();
  });

  it('scenario 2: creates a draft from a description without publishing anything', async () => {
    const conversationId = await startConversation(owner);
    const result = await sendChat(owner, conversationId, 'Create a college hackathon registration form.');
    expect(result.assistantMessage.intent).toBe('CREATE_FORM');
    expect(result.userMessage.intent).toBe('CREATE_FORM');
    expect(result.draftChanged).toBe(true);
    const draft = result.draft as DraftView;
    expect(draft.currentVersion.versionNumber).toBe(1);
    expect(draft.currentVersion.source).toBe('AI');
    expect(draft.currentVersion.schema.title).toBe('College Hackathon Registration');
    expect(questionTitles(draft.currentVersion.schema)).toContain('Phone Number');
    expect(application.forms.createdForms).toHaveLength(0);
    expect(result.conversation.title).toBe('Create a college hackathon registration form.');
  });

  it('scenarios 3 to 7: modifies, suggests, accepts, regenerates and refuses to publish from chat', async () => {
    const conversationId = await startConversation(owner);
    await sendChat(owner, conversationId, 'Create a college hackathon registration form.');

    const removal = await sendChat(owner, conversationId, 'Remove phone number.');
    expect(removal.assistantMessage.intent).toBe('MODIFY_FORM');
    expect(removal.draft.currentVersion.versionNumber).toBe(2);
    expect(questionTitles(removal.draft.currentVersion.schema)).not.toContain('Phone Number');
    expect(removal.assistantMessage.content).toContain('Removed “Phone Number”');

    const required = await sendChat(owner, conversationId, 'Make email mandatory and add a dropdown for year of study');
    expect(required.draft.currentVersion.versionNumber).toBe(3);

    const beforeSuggestions = required.draft as DraftView;
    const suggestions = await sendChat(owner, conversationId, 'What else can I ask?');
    expect(suggestions.assistantMessage.intent).toBe('SUGGEST_QUESTIONS');
    expect(suggestions.draftChanged).toBe(false);
    expect(suggestions.assistantMessage.content).toContain('1.');
    const unchanged = await owner.agent.get(`/drafts/${beforeSuggestions.id}`).expect(200);
    expect(unchanged.body.draft.currentVersion.id).toBe(beforeSuggestions.currentVersion.id);

    const accepted = await sendChat(owner, conversationId, 'Add those questions.');
    expect(accepted.assistantMessage.intent).toBe('ACCEPT_SUGGESTIONS');
    expect(accepted.draft.currentVersion.source).toBe('SUGGESTION_ACCEPTANCE');
    expect(countQuestions(accepted.draft.currentVersion.schema)).toBeGreaterThan(
      countQuestions(beforeSuggestions.currentVersion.schema),
    );

    const regenerated = await sendChat(owner, conversationId, 'Regenerate this with fewer questions.');
    expect(regenerated.assistantMessage.intent).toBe('REGENERATE_FORM');
    expect(regenerated.draft.currentVersion.source).toBe('REGENERATION');
    expect(countQuestions(regenerated.draft.currentVersion.schema)).toBeLessThan(
      countQuestions(accepted.draft.currentVersion.schema),
    );
    const versions = await owner.agent.get(`/drafts/${regenerated.draft.id}/versions`).expect(200);
    expect(versions.body.items.map((item: { versionNumber: number }) => item.versionNumber)).toEqual([5, 4, 3, 2, 1]);

    const publishAttempt = await sendChat(owner, conversationId, 'Create it in Google Forms.');
    expect(publishAttempt.assistantMessage.intent).toBe('CREATE_GOOGLE_FORM');
    expect(publishAttempt.assistantMessage.content).toContain('Create GForm');
    expect(publishAttempt.draftChanged).toBe(false);
    expect(application.forms.createdForms).toHaveLength(0);
  });

  it('applies requirement and type edits through explicit operations', async () => {
    const conversationId = await startConversation(owner);
    await sendChat(owner, conversationId, 'Create a college hackathon registration form.');
    const result = await sendChat(owner, conversationId, 'Make email mandatory and add a dropdown for year of study');
    const schema = result.draft.currentVersion.schema as FormSchema;
    expect(findQuestion(schema, 'Email Address')?.required).toBe(true);
    const yearOfStudy = schema.sections.flatMap((section) => section.questions).filter((question) => question.title === 'Year of Study');
    expect(yearOfStudy.at(-1)?.type).toBe('DROPDOWN');
    expect(yearOfStudy.at(-1)?.options).toContain('2nd Year');
  });

  it('asks for clarification on a bare acknowledgement and only then accepts suggestions', async () => {
    const conversationId = await startConversation(owner);
    await sendChat(owner, conversationId, 'Create a feedback form for students.');
    const suggestions = await sendChat(owner, conversationId, 'Can you suggest more questions?');
    expect(suggestions.assistantMessage.intent).toBe('SUGGEST_QUESTIONS');

    const ambiguous = await sendChat(owner, conversationId, 'Okay');
    expect(ambiguous.assistantMessage.intent).toBe('CLARIFICATION_REQUIRED');
    expect(ambiguous.draftChanged).toBe(false);

    const confirmed = await sendChat(owner, conversationId, 'yes');
    expect(confirmed.assistantMessage.intent).toBe('ACCEPT_SUGGESTIONS');
    expect(confirmed.draftChanged).toBe(true);
  });

  it('supports partial acceptance, revision and continuation without touching the draft', async () => {
    const conversationId = await startConversation(owner);
    const proposal = await sendChat(
      owner,
      conversationId,
      'I need a GForm for a college hackathon. I have these four questions: full name, email, team name and project title. What else can I ask?',
    );
    expect(proposal.assistantMessage.intent).toBe('SUGGEST_QUESTIONS');
    expect(proposal.draftChanged).toBe(false);
    expect(proposal.assistantMessage.content).toContain('College Name');
    expect(proposal.assistantMessage.content).toContain('Team Size');

    const revised = await sendChat(owner, conversationId, "I don't think these are useful. Give me different ones.");
    expect(revised.assistantMessage.intent).toBe('SUGGEST_QUESTIONS');
    expect(revised.assistantMessage.content).not.toContain('College Name');
    expect(revised.draftChanged).toBe(false);

    const conversation = await owner.agent.get(`/conversations/${conversationId}`).expect(200);
    expect(conversation.body.conversation.activeDraftId).toBeNull();

    const secondConversation = await startConversation(owner);
    await sendChat(
      owner,
      secondConversation,
      'I need a GForm for a college hackathon. I have these four questions: full name, email, team name and project title. What else can I ask?',
    );
    const partial = await sendChat(owner, secondConversation, 'Use college name, phone, skills but skip team size.');
    expect(partial.assistantMessage.intent).toBe('ACCEPT_SUGGESTIONS');
    const titles = questionTitles(partial.draft.currentVersion.schema);
    expect(titles).toEqual(expect.arrayContaining(['Full Name', 'Email', 'Team Name', 'Project Title', 'College Name', 'Phone Number', 'Skills']));
    expect(titles).not.toContain('Team Size');
    expect(partial.draft.currentVersion.source).toBe('SUGGESTION_ACCEPTANCE');
  });

  it('asks for clarification when a change refers to a missing draft', async () => {
    const conversationId = await startConversation(owner);
    const result = await sendChat(owner, conversationId, 'Remove phone number.');
    expect(result.assistantMessage.intent).toBe('CLARIFICATION_REQUIRED');
    expect(result.draftChanged).toBe(false);
  });

  it('scenario 12 and 13: loads only the selected conversation and pages older messages', async () => {
    const conversationId = await startConversation(owner);
    for (let index = 0; index < 30; index += 1) {
      await sendChat(owner, conversationId, `Hello number ${index}`);
    }
    const latest = await owner.agent.get(`/conversations/${conversationId}/messages`).expect(200);
    expect(latest.body.items).toHaveLength(50);
    expect(latest.body.items.at(-1).role).toBe('ASSISTANT');
    expect(latest.body.items.at(-2).content).toBe('Hello number 29');
    expect(latest.body.nextCursor).toEqual(expect.any(String));

    const older = await owner.agent
      .get(`/conversations/${conversationId}/messages`)
      .query({ cursor: latest.body.nextCursor })
      .expect(200);
    expect(older.body.items).toHaveLength(10);
    expect(older.body.items[0].content).toBe('Hello number 0');
    expect(older.body.nextCursor).toBeNull();
    const allIds = new Set([...latest.body.items, ...older.body.items].map((message: { id: string }) => message.id));
    expect(allIds.size).toBe(60);
  });

  it('lists conversation metadata newest first with pagination', async () => {
    const signedIn = await signUpUser(application);
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const id = await startConversation(signedIn);
      ids.push(id);
      await sendChat(signedIn, id, `Conversation ${index}`);
    }
    const firstPage = await signedIn.agent.get('/conversations').query({ limit: 2 }).expect(200);
    expect(firstPage.body.items.map((item: { id: string }) => item.id)).toEqual([ids[2], ids[1]]);
    expect(Object.keys(firstPage.body.items[0]).sort()).toEqual(['id', 'title', 'updatedAt']);
    const secondPage = await signedIn.agent.get('/conversations').query({ limit: 2, cursor: firstPage.body.nextCursor }).expect(200);
    expect(secondPage.body.items.map((item: { id: string }) => item.id)).toEqual([ids[0]]);
    expect(secondPage.body.nextCursor).toBeNull();
  });

  it('prevents access to another user’s conversations and drafts', async () => {
    const conversationId = await startConversation(owner);
    const created = await sendChat(owner, conversationId, 'Create a contact form.');
    const intruder = await signUpUser(application);
    await intruder.agent.get(`/conversations/${conversationId}`).expect(404);
    await intruder.agent.get(`/conversations/${conversationId}/messages`).expect(404);
    await intruder.agent.post(`/conversations/${conversationId}/messages`).send({ content: 'Remove email' }).expect(404);
    await intruder.agent.get(`/drafts/${created.draft.id}`).expect(404);
    await intruder.agent.get(`/drafts/${created.draft.id}/versions`).expect(404);
    await intruder.agent
      .post(`/drafts/${created.draft.id}/versions`)
      .send({ baseVersionId: created.draft.currentVersion.id, operations: [{ type: 'UPDATE_TITLE', title: 'Hacked' }] })
      .expect(404);
    await intruder.agent.post('/google-forms/publish').send({ draftId: created.draft.id, versionId: created.draft.currentVersion.id }).expect(404);
  });

  it('validates identifiers and message content', async () => {
    await owner.agent.get('/conversations/not-a-uuid/messages').expect(400);
    const conversationId = await startConversation(owner);
    await owner.agent.post(`/conversations/${conversationId}/messages`).send({ content: '   ' }).expect(400);
    await owner.agent.get('/conversations').query({ cursor: 'garbage' }).expect(400);
  });
});
