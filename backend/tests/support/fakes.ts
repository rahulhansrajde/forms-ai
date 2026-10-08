import type { FormSchema } from '@forms-ai/contracts';
import type {
  GoogleFormSnapshot,
  GoogleFormsGateway,
  OAuthGateway,
  OAuthIdentity,
  OAuthTokenGrant,
} from '../../src/domain/interfaces/google.js';
import type { Logger } from '../../src/domain/interfaces/system.js';
import { GoogleFormItemNormalizer } from '../../src/infrastructure/google/google-form-item-normalizer.js';
import { GoogleFormRequestBuilder } from '../../src/infrastructure/google/google-form-request-builder.js';
import { GoogleFormsError, GoogleOAuthError } from '../../src/shared/errors/application-errors.js';

export class SilentLogger implements Logger {
  readonly entries: Array<{ level: string; message: string }> = [];

  info(message: string): void {
    this.entries.push({ level: 'info', message });
  }

  warn(message: string): void {
    this.entries.push({ level: 'warn', message });
  }

  error(message: string): void {
    this.entries.push({ level: 'error', message });
  }
}

export class FakeOAuthGateway implements OAuthGateway {
  grantedScopes = [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/forms.body',
    'https://www.googleapis.com/auth/spreadsheets',
  ];
  expiresInSeconds = 3600;
  refreshFailure: GoogleOAuthError | null = null;
  readonly exchangedCodes: string[] = [];
  readonly refreshedTokens: string[] = [];
  readonly revokedTokens: string[] = [];
  private issued = 0;

  buildAuthorizationUrl(state: string): string {
    return `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(state)}`;
  }

  async exchangeAuthorizationCode(code: string): Promise<OAuthTokenGrant> {
    if (code === 'invalid-code') {
      throw new GoogleOAuthError('GOOGLE_OAUTH_FAILED', 'Google authorization failed. Please try connecting again.');
    }
    this.exchangedCodes.push(code);
    this.issued += 1;
    return {
      accessToken: `access-${this.issued}`,
      refreshToken: `refresh-${this.issued}`,
      expiresInSeconds: this.expiresInSeconds,
      scopes: [...this.grantedScopes],
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenGrant> {
    if (this.refreshFailure) {
      throw this.refreshFailure;
    }
    this.refreshedTokens.push(refreshToken);
    this.issued += 1;
    return { accessToken: `access-${this.issued}`, refreshToken: null, expiresInSeconds: 3600, scopes: [...this.grantedScopes] };
  }

  async fetchIdentity(accessToken: string): Promise<OAuthIdentity> {
    return { accountId: 'google-account-1', email: `owner-of-${accessToken.split('-')[0]}@gmail.com` };
  }

  async revokeToken(token: string): Promise<void> {
    this.revokedTokens.push(token);
  }
}

export type FormsGatewayStep = 'createForm' | 'replaceItems' | 'applySettings' | 'readForm';

export class FakeGoogleFormsGateway implements GoogleFormsGateway {
  readonly createdForms: Array<{ formId: string; title: string; accessToken: string }> = [];
  readonly populatedSchemas: Array<{ formId: string; schema: FormSchema }> = [];
  readonly failures = new Set<FormsGatewayStep>();
  storeOnly: ((schema: FormSchema) => FormSchema) | null = null;
  private readonly stored = new Map<string, FormSchema>();
  private readonly requests = new GoogleFormRequestBuilder();
  private readonly normalizer = new GoogleFormItemNormalizer();
  private counter = 0;

  async createForm(accessToken: string, title: string): Promise<string> {
    this.failIfRequested('createForm');
    this.counter += 1;
    const formId = `google-form-${this.counter}`;
    this.createdForms.push({ formId, title, accessToken });
    return formId;
  }

  async replaceItems(_accessToken: string, formId: string, schema: FormSchema): Promise<void> {
    this.failIfRequested('replaceItems');
    this.populatedSchemas.push({ formId, schema });
    this.stored.set(formId, this.storeOnly ? this.storeOnly(schema) : schema);
  }

  async applySettings(): Promise<void> {
    this.failIfRequested('applySettings');
  }

  async readForm(_accessToken: string, formId: string): Promise<GoogleFormSnapshot> {
    this.failIfRequested('readForm');
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

  private failIfRequested(step: FormsGatewayStep): void {
    if (this.failures.has(step)) {
      throw new GoogleFormsError(`Google Forms could not complete ${step}. Please try again.`);
    }
  }
}
