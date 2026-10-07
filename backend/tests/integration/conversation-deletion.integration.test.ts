import type { DraftView } from '@forms-ai/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApplication, sendChat, signUpUser, startConversation, type SignedInUser, type TestApplication } from '../support/test-application.js';

describe('conversation deletion', () => {
  let application: TestApplication;

  beforeAll(async () => {
    application = await createTestApplication();
  });

  afterAll(async () => {
    await application.close();
  });

  async function connectGoogle(signedIn: SignedInUser): Promise<void> {
    const start = await signedIn.agent.get('/auth/google').expect(302);
    const state = new URL(start.headers.location ?? '').searchParams.get('state') ?? '';
    await signedIn.agent.get('/auth/google/callback').query({ code: 'authorization-code', state }).expect(302);
  }

  async function countRows(table: string, column: string, id: string): Promise<number> {
    const rows = await application.container.database.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table} WHERE ${column} = $1`, [id]);
    return rows[0]?.count ?? 0;
  }

  it('lets the owner permanently delete a conversation with its messages, drafts, versions and publications', async () => {
    const owner = await signUpUser(application);
    await connectGoogle(owner);
    const conversationId = await startConversation(owner);
    const draft = (await sendChat(owner, conversationId, 'Create a college hackathon registration form.')).draft as DraftView;
    await sendChat(owner, conversationId, 'What else should I add?');
    await owner.agent.post('/google-forms/publish').send({ draftId: draft.id, versionId: draft.currentVersion.id }).expect(200);
    expect(await countRows('messages', 'conversation_id', conversationId)).toBeGreaterThan(0);
    expect(await countRows('created_forms', 'draft_id', draft.id)).toBe(1);

    await owner.agent.delete(`/conversations/${conversationId}`).expect(204);

    await owner.agent.get(`/conversations/${conversationId}`).expect(404);
    const list = await owner.agent.get('/conversations').expect(200);
    expect((list.body.items as Array<{ id: string }>).map((item) => item.id)).not.toContain(conversationId);
    expect(await countRows('conversations', 'id', conversationId)).toBe(0);
    expect(await countRows('messages', 'conversation_id', conversationId)).toBe(0);
    expect(await countRows('form_drafts', 'conversation_id', conversationId)).toBe(0);
    expect(await countRows('suggestion_sets', 'conversation_id', conversationId)).toBe(0);
    expect(await countRows('form_versions', 'draft_id', draft.id)).toBe(0);
    expect(await countRows('created_forms', 'draft_id', draft.id)).toBe(0);
    expect(await countRows('publish_jobs', 'draft_id', draft.id)).toBe(0);
  });

  it('never lets another user delete or detect a conversation they do not own', async () => {
    const owner = await signUpUser(application);
    const stranger = await signUpUser(application);
    const conversationId = await startConversation(owner);
    await sendChat(owner, conversationId, 'Create a feedback form.');

    const attempt = await stranger.agent.delete(`/conversations/${conversationId}`).expect(404);
    expect(attempt.body.error.code).toBe('NOT_FOUND');
    await owner.agent.get(`/conversations/${conversationId}`).expect(200);
    expect(await countRows('messages', 'conversation_id', conversationId)).toBeGreaterThan(0);
  });

  it('treats a repeated delete as not found and rejects unauthenticated requests', async () => {
    const owner = await signUpUser(application);
    const conversationId = await startConversation(owner);
    await owner.agent.delete(`/conversations/${conversationId}`).expect(204);
    await owner.agent.delete(`/conversations/${conversationId}`).expect(404);
    await request(application.container.app).delete(`/conversations/${conversationId}`).expect(401);
    await owner.agent.delete('/conversations/not-a-uuid').expect(400);
  });
});
