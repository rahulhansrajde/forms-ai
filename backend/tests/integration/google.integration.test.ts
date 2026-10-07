import { randomUUID } from 'node:crypto';
import type { DraftView, MessageView } from '@forms-ai/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GoogleOAuthError } from '../../src/shared/errors/application-errors.js';
import { technovaVersion1, technovaVersion2, technovaVersion3 } from '../support/technova-hackathon.js';
import {
  createTestApplication,
  FRONTEND_ORIGIN,
  sendChat,
  signUpUser,
  startConversation,
  type SignedInUser,
  type TestApplication,
} from '../support/test-application.js';

function stateFrom(location: string): string {
  return new URL(location).searchParams.get('state') ?? '';
}

async function connectGoogle(signedIn: SignedInUser, returnTo = '/settings'): Promise<string> {
  const start = await signedIn.agent.get('/auth/google').query({ returnTo }).expect(302);
  const callback = await signedIn.agent
    .get('/auth/google/callback')
    .query({ code: 'authorization-code', state: stateFrom(start.headers.location ?? '') })
    .expect(302);
  return callback.headers.location ?? '';
}

describe('Google OAuth and Google Forms publishing', () => {
  let application: TestApplication;

  beforeAll(async () => {
    application = await createTestApplication();
  });

  afterAll(async () => {
    await application.close();
  });

  async function draftFor(signedIn: SignedInUser): Promise<DraftView> {
    const conversationId = await startConversation(signedIn);
    return (await sendChat(signedIn, conversationId, 'Create a college hackathon registration form.')).draft as DraftView;
  }

  it('redirects unauthenticated users to login instead of starting OAuth', async () => {
    const response = await request(application.container.app).get('/auth/google').expect(302);
    expect(response.headers.location).toBe(`${FRONTEND_ORIGIN}/login`);
  });

  it('connects a Google account with state protection and stores tokens encrypted', async () => {
    const signedIn = await signUpUser(application);
    const start = await signedIn.agent.get('/auth/google').query({ returnTo: '/chat/abc' }).expect(302);
    expect(start.headers.location).toContain('accounts.google.com');
    const cookies = ([] as string[]).concat(start.headers['set-cookie'] ?? []);
    const stateCookie = cookies.find((cookie) => cookie.startsWith('forms_ai_google_oauth='));
    expect(stateCookie).toContain('HttpOnly');

    const location = await connectGoogle(signedIn, '/chat/abc');
    expect(location).toBe(`${FRONTEND_ORIGIN}/chat/abc?google=connected`);

    const status = await signedIn.agent.get('/integrations/google/status').expect(200);
    expect(status.body.connection).toMatchObject({ connected: true, email: 'owner-of-access@gmail.com' });
    expect(JSON.stringify(status.body)).not.toContain('refresh-');

    const rows = await application.container.database.query<{ access_token_encrypted: string; refresh_token_encrypted: string }>(
      'SELECT access_token_encrypted, refresh_token_encrypted FROM connected_accounts WHERE user_id = $1',
      [signedIn.user.id],
    );
    expect(rows[0]?.access_token_encrypted.startsWith('v1:')).toBe(true);
    expect(rows[0]?.access_token_encrypted).not.toContain('access-');
    expect(rows[0]?.refresh_token_encrypted).not.toContain('refresh-');
  });

  it('rejects callbacks with a forged state', async () => {
    const signedIn = await signUpUser(application);
    await signedIn.agent.get('/auth/google').expect(302);
    const callback = await signedIn.agent.get('/auth/google/callback').query({ code: 'authorization-code', state: 'forged' }).expect(302);
    expect(callback.headers.location).toBe(`${FRONTEND_ORIGIN}/settings?google=error`);
    const status = await signedIn.agent.get('/integrations/google/status').expect(200);
    expect(status.body.connection.connected).toBe(false);
  });

  it('handles a denied consent screen and unsafe return paths', async () => {
    const signedIn = await signUpUser(application);
    await signedIn.agent.get('/auth/google').query({ returnTo: '//evil.example.com' }).expect(302);
    const callback = await signedIn.agent.get('/auth/google/callback').query({ error: 'access_denied' }).expect(302);
    expect(callback.headers.location).toBe(`${FRONTEND_ORIGIN}/settings?google=denied`);
  });

  it('refuses connections that did not grant the Google Forms scope', async () => {
    const signedIn = await signUpUser(application);
    application.oauth.grantedScopes = ['openid'];
    try {
      const location = await connectGoogle(signedIn);
      expect(location).toContain('google=error');
    } finally {
      application.oauth.grantedScopes.push('https://www.googleapis.com/auth/forms.body');
    }
  });

  it('keeps each user’s Google tokens separate and disconnects without touching the account', async () => {
    const first = await signUpUser(application);
    const second = await signUpUser(application);
    await connectGoogle(first);
    const secondStatus = await second.agent.get('/integrations/google/status').expect(200);
    expect(secondStatus.body.connection.connected).toBe(false);

    await first.agent.delete('/integrations/google').expect(204);
    expect(application.oauth.revokedTokens.length).toBeGreaterThan(0);
    const status = await first.agent.get('/integrations/google/status').expect(200);
    expect(status.body.connection.connected).toBe(false);
    await first.agent.get('/auth/me').expect(200);
  });

  it('scenario 9: asks the user to connect Google Forms instead of publishing', async () => {
    const signedIn = await signUpUser(application);
    const draft = await draftFor(signedIn);
    const response = await signedIn.agent
      .post('/google-forms/publish')
      .send({ draftId: draft.id, versionId: draft.currentVersion.id })
      .expect(409);
    expect(response.body.error.code).toBe('GOOGLE_NOT_CONNECTED');
    const after = await signedIn.agent.get(`/drafts/${draft.id}`).expect(200);
    expect(after.body.draft.publication).toBeNull();
  });

  it('scenario 8: publishes the current version only through the explicit action', async () => {
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const draft = await draftFor(signedIn);
    const createdBefore = application.forms.createdForms.length;

    const response = await signedIn.agent
      .post('/google-forms/publish')
      .send({ draftId: draft.id, versionId: draft.currentVersion.id })
      .expect(200);

    expect(response.body.publication).toMatchObject({
      status: 'SUCCEEDED',
      currentStep: 'COMPLETED',
      versionId: draft.currentVersion.id,
      editUrl: expect.stringContaining('/edit'),
      responderUrl: expect.stringContaining('/viewform'),
    });
    expect(application.forms.createdForms).toHaveLength(createdBefore + 1);
    expect(application.forms.populatedSchemas.at(-1)?.schema).toEqual(draft.currentVersion.schema);

    const again = await signedIn.agent
      .post('/google-forms/publish')
      .send({ draftId: draft.id, versionId: draft.currentVersion.id })
      .expect(200);
    expect(again.body.publication.googleFormId).toBe(response.body.publication.googleFormId);
    expect(application.forms.createdForms).toHaveLength(createdBefore + 1);

    const reloaded = await signedIn.agent.get(`/drafts/${draft.id}`).expect(200);
    expect(reloaded.body.draft.status).toBe('PUBLISHED');
    expect(reloaded.body.draft.publication.status).toBe('SUCCEEDED');

    const rows = await application.container.database.query<{ google_form_id: string; status: string }>(
      'SELECT google_form_id, status FROM created_forms WHERE draft_id = $1',
      [draft.id],
    );
    expect(rows).toEqual([{ google_form_id: response.body.publication.googleFormId, status: 'CREATED' }]);
  });

  it('scenario 10: keeps the draft intact on failure and resumes the same Google Form on retry', async () => {
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const draft = await draftFor(signedIn);
    const createdBefore = application.forms.createdForms.length;
    application.forms.failures.add('replaceItems');

    const failed = await signedIn.agent
      .post('/google-forms/publish')
      .send({ draftId: draft.id, versionId: draft.currentVersion.id })
      .expect(502);
    expect(failed.body.error.code).toBe('PUBLISH_FAILED');
    expect(failed.body.error.details.publication).toMatchObject({ status: 'FAILED', currentStep: 'ADD_ITEMS' });

    const afterFailure = await signedIn.agent.get(`/drafts/${draft.id}`).expect(200);
    expect(afterFailure.body.draft.currentVersion).toEqual(draft.currentVersion);
    expect(afterFailure.body.draft.publication).toMatchObject({ status: 'FAILED', currentStep: 'ADD_ITEMS' });

    application.forms.failures.clear();
    const retried = await signedIn.agent
      .post('/google-forms/publish')
      .send({ draftId: draft.id, versionId: draft.currentVersion.id })
      .expect(200);
    expect(retried.body.publication.status).toBe('SUCCEEDED');
    expect(application.forms.createdForms).toHaveLength(createdBefore + 1);
    expect(retried.body.publication.googleFormId).toBe(application.forms.createdForms.at(-1)?.formId);

    const jobs = await application.container.database.query<{ status: string }>(
      'SELECT status FROM publish_jobs WHERE draft_id = $1 ORDER BY created_at',
      [draft.id],
    );
    expect(jobs.map((job) => job.status)).toEqual(['FAILED', 'SUCCEEDED']);
  });

  it('refreshes expired access tokens and asks to reconnect when refresh is revoked', async () => {
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    await application.container.database.query(
      "UPDATE connected_accounts SET token_expires_at = now() - interval '1 hour' WHERE user_id = $1",
      [signedIn.user.id],
    );
    const draft = await draftFor(signedIn);
    const refreshedBefore = application.oauth.refreshedTokens.length;
    await signedIn.agent.post('/google-forms/publish').send({ draftId: draft.id, versionId: draft.currentVersion.id }).expect(200);
    expect(application.oauth.refreshedTokens.length).toBe(refreshedBefore + 1);

    await application.container.database.query(
      "UPDATE connected_accounts SET token_expires_at = now() - interval '1 hour' WHERE user_id = $1",
      [signedIn.user.id],
    );
    application.oauth.refreshFailure = new GoogleOAuthError('GOOGLE_RECONNECT_REQUIRED', 'Your Google connection has expired.');
    try {
      const secondDraft = await draftFor(signedIn);
      const response = await signedIn.agent
        .post('/google-forms/publish')
        .send({ draftId: secondDraft.id, versionId: secondDraft.currentVersion.id })
        .expect(409);
      expect(response.body.error.code).toBe('GOOGLE_RECONNECT_REQUIRED');
      const status = await signedIn.agent.get('/integrations/google/status').expect(200);
      expect(status.body.connection.connected).toBe(false);
    } finally {
      application.oauth.refreshFailure = null;
    }
  });

  async function seedTechnovaDraft(signedIn: SignedInUser): Promise<{ conversationId: string; draftId: string; versionIds: string[] }> {
    const conversationId = await startConversation(signedIn);
    const database = application.container.database;
    const draftId = randomUUID();
    await database.query(
      "INSERT INTO form_drafts (id, user_id, conversation_id, title, status) VALUES ($1, $2, $3, 'TechNova Hackathon 2026', 'DRAFT')",
      [draftId, signedIn.user.id, conversationId],
    );
    const versionIds: string[] = [];
    for (const [index, schema] of [technovaVersion1, technovaVersion2, technovaVersion3].entries()) {
      const versionId = randomUUID();
      versionIds.push(versionId);
      await database.query(
        "INSERT INTO form_versions (id, draft_id, version_number, schema, source, created_at) VALUES ($1, $2, $3, $4, 'MANUAL', $5)",
        [versionId, draftId, index + 1, JSON.stringify(schema), new Date(Date.now() + index * 1000)],
      );
    }
    await database.query('UPDATE form_drafts SET current_version_id = $2 WHERE id = $1', [draftId, versionIds[2]]);
    return { conversationId, draftId, versionIds };
  }

  async function publicationMessages(signedIn: SignedInUser, conversationId: string): Promise<MessageView[]> {
    const page = await signedIn.agent.get(`/conversations/${conversationId}/messages`).expect(200);
    return (page.body.items as MessageView[]).filter((message) => message.publishedForm !== null);
  }

  it('publishes exactly version 3 with all 3 sections and 17 questions and announces it in chat', async () => {
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const { conversationId, draftId, versionIds } = await seedTechnovaDraft(signedIn);
    const draft = (await signedIn.agent.get(`/drafts/${draftId}`).expect(200)).body.draft as DraftView;
    expect(draft.currentVersion).toMatchObject({ id: versionIds[2], versionNumber: 3, schema: technovaVersion3 });
    const createdBefore = application.forms.createdForms.length;

    const response = await signedIn.agent.post('/google-forms/publish').send({ draftId, versionId: versionIds[2] }).expect(200);

    expect(response.body.publication).toMatchObject({ status: 'SUCCEEDED', currentStep: 'COMPLETED', versionId: versionIds[2] });
    const published = application.forms.populatedSchemas.at(-1)?.schema;
    expect(published).toEqual(technovaVersion3);
    expect(published?.sections.map((section) => section.questions.length)).toEqual([7, 4, 6]);
    expect(response.body.message).toMatchObject({
      role: 'ASSISTANT',
      content: 'Google Form created successfully. Your form is ready.',
      publishedForm: {
        title: 'TechNova Hackathon 2026',
        versionNumber: 3,
        responderUrl: response.body.publication.responderUrl,
        editUrl: response.body.publication.editUrl,
      },
    });

    const versions = await application.container.database.query<{ id: string; schema: unknown }>(
      'SELECT id, schema FROM form_versions WHERE draft_id = $1 ORDER BY version_number',
      [draftId],
    );
    expect(versions.map((version) => version.schema)).toEqual([technovaVersion1, technovaVersion2, technovaVersion3]);

    const persisted = await publicationMessages(signedIn, conversationId);
    expect(persisted).toEqual([response.body.message]);

    const again = await signedIn.agent.post('/google-forms/publish').send({ draftId, versionId: versionIds[2] }).expect(200);
    expect(again.body.publication.googleFormId).toBe(response.body.publication.googleFormId);
    expect(again.body.message).toBeNull();
    expect(application.forms.createdForms).toHaveLength(createdBefore + 1);
    expect(await publicationMessages(signedIn, conversationId)).toHaveLength(1);

    const chat = await sendChat(signedIn, conversationId, 'create the gform');
    expect(chat.assistantMessage.intent).toBe('CREATE_GOOGLE_FORM');
    expect(application.forms.createdForms).toHaveLength(createdBefore + 1);
  });

  it('treats a Google Form missing later sections as a failed publication and resumes the same form on retry', async () => {
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const { conversationId, draftId, versionIds } = await seedTechnovaDraft(signedIn);
    const createdBefore = application.forms.createdForms.length;
    application.forms.storeOnly = (schema) => ({ ...schema, sections: schema.sections.slice(0, 1) });

    try {
      const failed = await signedIn.agent.post('/google-forms/publish').send({ draftId, versionId: versionIds[2] }).expect(502);
      expect(failed.body.error.code).toBe('PUBLISH_FAILED');
      expect(failed.body.error.message).toContain('expected 3 sections and 17 questions, found 1 sections and 7 questions');
      expect(failed.body.error.details.publication).toMatchObject({
        status: 'FAILED',
        currentStep: 'VERIFY_FORM',
        responderUrl: null,
        editUrl: null,
      });
      expect(failed.body.error.details.message).toMatchObject({ role: 'ASSISTANT', publishedForm: null });
      expect(failed.body.error.details.message.content).toContain('could not be created');
    } finally {
      application.forms.storeOnly = null;
    }

    expect(await publicationMessages(signedIn, conversationId)).toEqual([]);
    const afterFailure = (await signedIn.agent.get(`/drafts/${draftId}`).expect(200)).body.draft as DraftView;
    expect(afterFailure).toMatchObject({ status: 'DRAFT', currentVersion: { id: versionIds[2], schema: technovaVersion3 } });
    const pending = await application.container.database.query<{ status: string }>('SELECT status FROM created_forms WHERE draft_id = $1', [draftId]);
    expect(pending).toEqual([{ status: 'CREATING' }]);

    const retried = await signedIn.agent.post('/google-forms/publish').send({ draftId, versionId: versionIds[2] }).expect(200);
    expect(retried.body.publication).toMatchObject({ status: 'SUCCEEDED', googleFormId: application.forms.createdForms.at(-1)?.formId });
    expect(application.forms.createdForms).toHaveLength(createdBefore + 1);
    expect(await publicationMessages(signedIn, conversationId)).toHaveLength(1);
  });

  it('never shows another user the publication result', async () => {
    const owner = await signUpUser(application);
    await connectGoogle(owner);
    const { conversationId, draftId, versionIds } = await seedTechnovaDraft(owner);
    await owner.agent.post('/google-forms/publish').send({ draftId, versionId: versionIds[2] }).expect(200);
    const stranger = await signUpUser(application);
    await stranger.agent.get(`/conversations/${conversationId}/messages`).expect(404);
    await stranger.agent.post('/google-forms/publish').send({ draftId, versionId: versionIds[2] }).expect(404);
  });

  it('refuses to publish a version that is no longer current', async () => {
    const signedIn = await signUpUser(application);
    await connectGoogle(signedIn);
    const draft = await draftFor(signedIn);
    await signedIn.agent
      .post(`/drafts/${draft.id}/versions`)
      .send({ baseVersionId: draft.currentVersion.id, operations: [{ type: 'UPDATE_TITLE', title: 'Edited' }] })
      .expect(201);
    const response = await signedIn.agent
      .post('/google-forms/publish')
      .send({ draftId: draft.id, versionId: draft.currentVersion.id })
      .expect(409);
    expect(response.body.error.code).toBe('VERSION_CONFLICT');
  });
});
