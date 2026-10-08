import { randomBytes } from 'node:crypto';
import type { FormSchema } from '@forms-ai/contracts';
import { ApplicationContainer } from '../../../backend/src/composition/application-container.js';
import type {
  GoogleFormSnapshot,
  GoogleFormsGateway,
  OAuthGateway,
  OAuthIdentity,
  OAuthTokenGrant,
} from '../../../backend/src/domain/interfaces/google.js';
import { ConfigurationLoader } from '../../../backend/src/infrastructure/configuration/app-config.js';
import { GoogleFormItemNormalizer } from '../../../backend/src/infrastructure/google/google-form-item-normalizer.js';
import { GoogleFormRequestBuilder } from '../../../backend/src/infrastructure/google/google-form-request-builder.js';
import { GoogleFormsError } from '../../../backend/src/shared/errors/application-errors.js';
import { FakeSheetsGateway } from '../../../backend/tests/support/fake-sheets-gateway.js';

const API_ORIGIN = 'http://localhost:5000';
const FAIL_ONCE_MARKER = 'Flaky';

class ConsentFreeOAuthGateway implements OAuthGateway {
  buildAuthorizationUrl(state: string): string {
    return `${API_ORIGIN}/auth/google/callback?code=e2e-code&state=${encodeURIComponent(state)}`;
  }

  async exchangeAuthorizationCode(): Promise<OAuthTokenGrant> {
    return {
      accessToken: 'e2e-access',
      refreshToken: 'e2e-refresh',
      expiresInSeconds: 3600,
      scopes: ['openid', 'https://www.googleapis.com/auth/forms.body', 'https://www.googleapis.com/auth/spreadsheets'],
    };
  }

  async refreshAccessToken(): Promise<OAuthTokenGrant> {
    return this.exchangeAuthorizationCode();
  }

  async fetchIdentity(): Promise<OAuthIdentity> {
    return { accountId: 'e2e-account', email: 'forms.ai.e2e@gmail.com' };
  }

  async revokeToken(): Promise<void> {}
}

class RecordingFormsGateway implements GoogleFormsGateway {
  private created = 0;
  private readonly failedOnce = new Set<string>();
  private readonly stored = new Map<string, FormSchema>();
  private readonly requests = new GoogleFormRequestBuilder();
  private readonly normalizer = new GoogleFormItemNormalizer();

  async createForm(): Promise<string> {
    this.created += 1;
    return `e2e-form-${this.created}`;
  }

  async replaceItems(_accessToken: string, formId: string, schema: FormSchema): Promise<void> {
    if (schema.title.includes(FAIL_ONCE_MARKER) && !this.failedOnce.has(formId)) {
      this.failedOnce.add(formId);
      throw new GoogleFormsError('Google Forms could not add items. Please try again.');
    }
    this.stored.set(formId, schema);
  }

  async applySettings(): Promise<void> {}

  async readForm(_accessToken: string, formId: string): Promise<GoogleFormSnapshot> {
    const schema = this.stored.get(formId);
    return {
      formId,
      title: schema?.title.trim() ?? '',
      description: schema?.description.trim() ?? '',
      links: {
        responderUrl: `https://docs.google.com/forms/d/e/${formId}/viewform`,
        editUrl: `https://docs.google.com/forms/d/${formId}/edit`,
      },
      items: schema ? this.requests.buildCreateItemRequests(schema).map((request) => this.normalizer.normalize(request.createItem.item)) : [],
    };
  }
}

function existingSheets(): FakeSheetsGateway {
  const sheets = new FakeSheetsGateway();
  sheets.seed('1HackathonRegistrations0123456789abcdefXYZ', 'Hackathon Registrations', [
    {
      title: 'Registrations',
      values: [
        ['Name', 'Email', 'College'],
        ['Ada Lovelace', 'ada@example.com', 'Analytical College'],
        ['Alan Turing', 'alan@example.com', 'Bletchley'],
      ],
    },
    { title: 'Analytics', values: [] },
  ]);
  return sheets;
}

async function start(): Promise<void> {
  const config = new ConfigurationLoader().load({
    NODE_ENV: 'test',
    PORT: '5000',
    DATABASE_URL: 'pglite://memory',
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    FRONTEND_ORIGIN: 'http://localhost:3000',
    GOOGLE_CLIENT_ID: 'e2e-client',
    GOOGLE_CLIENT_SECRET: 'e2e-placeholder',
    AI_PROVIDER: 'rule-based',
  });
  const container = await ApplicationContainer.create(config, {
    oauthGateway: new ConsentFreeOAuthGateway(),
    formsGateway: new RecordingFormsGateway(),
    sheetsGateway: existingSheets(),
  });
  await container.migrate();
  container.app.listen(config.port, () => {
    process.stdout.write(`Forms AI end-to-end API listening on ${config.port}\n`);
  });
}

void start();
