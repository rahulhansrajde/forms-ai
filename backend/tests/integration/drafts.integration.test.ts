import type { DraftView } from '@forms-ai/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestApplication,
  sendChat,
  signUpUser,
  startConversation,
  type SignedInUser,
  type TestApplication,
} from '../support/test-application.js';

describe('draft versioning through the API', () => {
  let application: TestApplication;
  let owner: SignedInUser;

  beforeAll(async () => {
    application = await createTestApplication();
    owner = await signUpUser(application);
  });

  afterAll(async () => {
    await application.close();
  });

  async function createDraft(): Promise<DraftView> {
    const conversationId = await startConversation(owner);
    const result = await sendChat(owner, conversationId, 'Create a contact form.');
    return result.draft as DraftView;
  }

  it('creates a manual version for every meaningful edit and keeps history immutable', async () => {
    const draft = await createDraft();
    const firstQuestion = draft.currentVersion.schema.sections[0]?.questions[0];
    const edited = await owner.agent
      .post(`/drafts/${draft.id}/versions`)
      .send({
        baseVersionId: draft.currentVersion.id,
        operations: [
          { type: 'UPDATE_TITLE', title: 'Get in touch' },
          { type: 'UPDATE_QUESTION', questionId: firstQuestion?.id, changes: { type: 'DROPDOWN', options: ['A', 'B'] } },
        ],
      })
      .expect(201);

    expect(edited.body.draft.currentVersion.versionNumber).toBe(2);
    expect(edited.body.draft.currentVersion.source).toBe('MANUAL');
    expect(edited.body.draft.title).toBe('Get in touch');
    expect(edited.body.draft.currentVersion.schema.sections[0].questions[0]).toMatchObject({ type: 'DROPDOWN', options: ['A', 'B'] });

    const original = await owner.agent.get(`/drafts/${draft.id}/versions/${draft.currentVersion.id}`).expect(200);
    expect(original.body.version.schema).toEqual(draft.currentVersion.schema);
  });

  it('does not create a version when nothing changes', async () => {
    const draft = await createDraft();
    const response = await owner.agent
      .post(`/drafts/${draft.id}/versions`)
      .send({ baseVersionId: draft.currentVersion.id, operations: [{ type: 'UPDATE_TITLE', title: draft.currentVersion.schema.title }] })
      .expect(201);
    expect(response.body.draft.currentVersion.id).toBe(draft.currentVersion.id);
  });

  it('rejects edits based on a stale version', async () => {
    const draft = await createDraft();
    await owner.agent
      .post(`/drafts/${draft.id}/versions`)
      .send({ baseVersionId: draft.currentVersion.id, operations: [{ type: 'UPDATE_TITLE', title: 'First edit' }] })
      .expect(201);
    const stale = await owner.agent
      .post(`/drafts/${draft.id}/versions`)
      .send({ baseVersionId: draft.currentVersion.id, operations: [{ type: 'UPDATE_TITLE', title: 'Second edit' }] })
      .expect(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('restores an earlier version as a new version', async () => {
    const draft = await createDraft();
    const edited = await owner.agent
      .post(`/drafts/${draft.id}/versions`)
      .send({ baseVersionId: draft.currentVersion.id, operations: [{ type: 'UPDATE_TITLE', title: 'Changed' }] })
      .expect(201);
    const restored = await owner.agent
      .post(`/drafts/${draft.id}/versions`)
      .send({ baseVersionId: edited.body.draft.currentVersion.id, restoreVersionId: draft.currentVersion.id })
      .expect(201);
    expect(restored.body.draft.currentVersion.versionNumber).toBe(3);
    expect(restored.body.draft.currentVersion.schema).toEqual(draft.currentVersion.schema);
  });

  it('validates operations and rejects references to unknown questions', async () => {
    const draft = await createDraft();
    const invalidType = await owner.agent
      .post(`/drafts/${draft.id}/versions`)
      .send({ baseVersionId: draft.currentVersion.id, operations: [{ type: 'DROP_TABLE' }] })
      .expect(400);
    expect(invalidType.body.error.code).toBe('VALIDATION_FAILED');
    await owner.agent
      .post(`/drafts/${draft.id}/versions`)
      .send({ baseVersionId: draft.currentVersion.id, operations: [{ type: 'REMOVE_QUESTION', questionId: 'question_missing' }] })
      .expect(400);
    await owner.agent
      .post(`/drafts/${draft.id}/versions`)
      .send({
        baseVersionId: draft.currentVersion.id,
        operations: [{ type: 'ADD_QUESTION', question: { type: 'SHORT_ANSWER', title: '' } }],
      })
      .expect(400);
  });

  it('pages through version history', async () => {
    const draft = await createDraft();
    let current = draft;
    for (let index = 0; index < 4; index += 1) {
      const response = await owner.agent
        .post(`/drafts/${draft.id}/versions`)
        .send({ baseVersionId: current.currentVersion.id, operations: [{ type: 'UPDATE_DESCRIPTION', description: `Revision ${index}` }] })
        .expect(201);
      current = response.body.draft;
    }
    const firstPage = await owner.agent.get(`/drafts/${draft.id}/versions`).query({ limit: 3 }).expect(200);
    expect(firstPage.body.items.map((item: { versionNumber: number }) => item.versionNumber)).toEqual([5, 4, 3]);
    const secondPage = await owner.agent.get(`/drafts/${draft.id}/versions`).query({ limit: 3, cursor: firstPage.body.nextCursor }).expect(200);
    expect(secondPage.body.items.map((item: { versionNumber: number }) => item.versionNumber)).toEqual([2, 1]);
    expect(secondPage.body.nextCursor).toBeNull();
  });
});
