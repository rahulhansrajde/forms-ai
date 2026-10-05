import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { ApplicationContainer, type ContainerOverrides } from '../../src/composition/application-container.js';
import { ConfigurationLoader } from '../../src/infrastructure/configuration/app-config.js';
import type { Database } from '../../src/infrastructure/database/connection/database.js';
import { DatabaseFactory } from '../../src/infrastructure/database/connection/database-factory.js';
import { PGliteDatabase } from '../../src/infrastructure/database/connection/pglite-database.js';
import { FakeGoogleFormsGateway, FakeOAuthGateway, SilentLogger } from './fakes.js';

export const FRONTEND_ORIGIN = 'http://localhost:3000';

export interface TestApplication {
  container: ApplicationContainer;
  oauth: FakeOAuthGateway;
  forms: FakeGoogleFormsGateway;
  logger: SilentLogger;
  close(): Promise<void>;
}

function openTestDatabase(): Promise<Database> {
  const postgresUrl = process.env.TEST_DATABASE_URL;
  return postgresUrl
    ? new DatabaseFactory().create({ url: postgresUrl, maxConnections: 5, ssl: false })
    : PGliteDatabase.open(null);
}

export async function createTestApplication(overrides: ContainerOverrides = {}): Promise<TestApplication> {
  const config = new ConfigurationLoader().load({
    NODE_ENV: 'test',
    DATABASE_URL: 'pglite://memory',
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    FRONTEND_ORIGIN,
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    AI_PROVIDER: 'rule-based',
  });
  const oauth = new FakeOAuthGateway();
  const forms = new FakeGoogleFormsGateway();
  const logger = new SilentLogger();
  const container = await ApplicationContainer.create(config, {
    database: await openTestDatabase(),
    oauthGateway: oauth,
    formsGateway: forms,
    logger,
    ...overrides,
  });
  await container.migrate();
  return { container, oauth, forms, logger, close: () => container.close() };
}

export interface SignedInUser {
  agent: ReturnType<typeof request.agent>;
  user: { id: string; email: string; firstName: string; lastName: string };
}

let userCounter = 0;

export async function signUpUser(application: TestApplication, overrides: Partial<Record<string, string>> = {}): Promise<SignedInUser> {
  userCounter += 1;
  const agent = request.agent(application.container.app);
  const response = await agent
    .post('/auth/signup')
    .send({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: `ada${userCounter}-${Date.now()}@example.com`,
      password: 'Secret123',
      confirmPassword: 'Secret123',
      ...overrides,
    })
    .expect(201);
  return { agent, user: response.body.user };
}

export async function startConversation(signedIn: SignedInUser): Promise<string> {
  const response = await signedIn.agent.post('/conversations').send({}).expect(201);
  return response.body.conversation.id as string;
}

export async function sendChat(signedIn: SignedInUser, conversationId: string, content: string) {
  const response = await signedIn.agent.post(`/conversations/${conversationId}/messages`).send({ content }).expect(200);
  return response.body;
}
