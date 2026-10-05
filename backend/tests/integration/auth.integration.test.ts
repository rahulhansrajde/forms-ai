import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApplication, FRONTEND_ORIGIN, signUpUser, type TestApplication } from '../support/test-application.js';

describe('application authentication', () => {
  let application: TestApplication;

  beforeAll(async () => {
    application = await createTestApplication();
  });

  afterAll(async () => {
    await application.close();
  });

  it('signs up a user, starts a session and never returns the password', async () => {
    const agent = request.agent(application.container.app);
    const response = await agent
      .post('/auth/signup')
      .send({ firstName: ' Grace ', lastName: 'Hopper', email: 'Grace@Example.com', password: 'Secret123', confirmPassword: 'Secret123' })
      .expect(201);

    expect(response.body.user).toMatchObject({ firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' });
    expect(JSON.stringify(response.body)).not.toContain('Secret123');
    expect(JSON.stringify(response.body)).not.toContain('password');
    const cookie = response.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('forms_ai_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');

    const me = await agent.get('/auth/me').expect(200);
    expect(me.body.user.email).toBe('grace@example.com');
  });

  it('stores only a scrypt hash of the password', async () => {
    await signUpUser(application, { email: 'hash-check@example.com' });
    const rows = await application.container.database.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE email = $1',
      ['hash-check@example.com'],
    );
    expect(rows[0]?.password_hash.startsWith('scrypt$')).toBe(true);
    expect(rows[0]?.password_hash).not.toContain('Secret123');
  });

  it('rejects duplicate email addresses', async () => {
    await signUpUser(application, { email: 'taken@example.com' });
    const response = await request(application.container.app)
      .post('/auth/signup')
      .send({ firstName: 'A', lastName: 'B', email: 'TAKEN@example.com', password: 'Secret123', confirmPassword: 'Secret123' })
      .expect(409);
    expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('rejects mismatched passwords with a clear validation error', async () => {
    const response = await request(application.container.app)
      .post('/auth/signup')
      .send({ firstName: 'A', lastName: 'B', email: 'mismatch@example.com', password: 'Secret123', confirmPassword: 'Secret124' })
      .expect(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: 'Passwords do not match.' });
  });

  it('rejects weak passwords', async () => {
    const response = await request(application.container.app)
      .post('/auth/signup')
      .send({ firstName: 'A', lastName: 'B', email: 'weak@example.com', password: 'short', confirmPassword: 'short' })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('logs in with valid credentials and uses a generic message for invalid ones', async () => {
    await signUpUser(application, { email: 'login@example.com' });
    const agent = request.agent(application.container.app);
    await agent.post('/auth/login').send({ email: 'LOGIN@example.com', password: 'Secret123' }).expect(200);
    await agent.get('/auth/me').expect(200);

    const wrongPassword = await request(application.container.app)
      .post('/auth/login')
      .send({ email: 'login@example.com', password: 'Wrong1234' })
      .expect(401);
    const unknownEmail = await request(application.container.app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'Wrong1234' })
      .expect(401);
    expect(wrongPassword.body.error).toEqual(unknownEmail.body.error);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('logs out and invalidates the session server side', async () => {
    const { agent } = await signUpUser(application);
    await agent.post('/auth/logout').expect(204);
    const response = await agent.get('/auth/me').expect(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('rejects expired sessions and clears the cookie', async () => {
    const { agent, user } = await signUpUser(application);
    await application.container.database.query("UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE user_id = $1", [user.id]);
    const response = await agent.get('/auth/me').expect(401);
    expect(response.headers['set-cookie']?.[0]).toContain('forms_ai_session=;');
  });

  it('protects authenticated routes', async () => {
    await request(application.container.app).get('/conversations').expect(401);
    await request(application.container.app).get('/integrations/google/status').expect(401);
  });

  it('updates the profile and changes the password', async () => {
    const { agent, user } = await signUpUser(application);
    const updated = await agent.patch('/auth/me').send({ firstName: 'Augusta', lastName: 'King' }).expect(200);
    expect(updated.body.user).toMatchObject({ firstName: 'Augusta', lastName: 'King' });

    await agent.post('/auth/password').send({ currentPassword: 'Wrong1234', newPassword: 'Better123', confirmPassword: 'Better123' }).expect(400);
    await agent.post('/auth/password').send({ currentPassword: 'Secret123', newPassword: 'Better123', confirmPassword: 'Better123' }).expect(204);
    await request(application.container.app).post('/auth/login').send({ email: user.email, password: 'Better123' }).expect(200);
  });

  it('blocks state-changing requests from foreign origins', async () => {
    const response = await request(application.container.app)
      .post('/auth/login')
      .set('Origin', 'https://evil.example.com')
      .send({ email: 'x@example.com', password: 'Secret123' })
      .expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    await request(application.container.app)
      .post('/auth/login')
      .set('Origin', FRONTEND_ORIGIN)
      .send({ email: 'x@example.com', password: 'Secret123' })
      .expect(401);
  });

  it('returns safe errors for malformed JSON', async () => {
    const response = await request(application.container.app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });
});
