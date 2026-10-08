import { z } from 'zod';
import type { OAuthGateway, OAuthIdentity, OAuthTokenGrant } from '../../domain/interfaces/google.js';
import type { Logger } from '../../domain/interfaces/system.js';
import { GoogleOAuthError } from '../../shared/errors/application-errors.js';
import { formEncoded, type HttpClient, type HttpResponse } from '../http/http-client.js';

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

export const GOOGLE_OAUTH_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/spreadsheets',
] as const;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().default(''),
});

const tokenErrorSchema = z.object({ error: z.string() });

const identityResponseSchema = z.object({
  sub: z.string().min(1),
  email: z.email(),
});

export interface GoogleOAuthClientSettings {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  configured: boolean;
}

export class GoogleOAuthHttpGateway implements OAuthGateway {
  constructor(
    private readonly settings: GoogleOAuthClientSettings,
    private readonly http: HttpClient,
    private readonly logger: Logger,
  ) {}

  buildAuthorizationUrl(state: string): string {
    this.assertConfigured();
    const parameters = new URLSearchParams({
      client_id: this.settings.clientId,
      redirect_uri: this.settings.redirectUri,
      response_type: 'code',
      scope: GOOGLE_OAUTH_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `${AUTHORIZATION_ENDPOINT}?${parameters.toString()}`;
  }

  async exchangeAuthorizationCode(code: string): Promise<OAuthTokenGrant> {
    this.assertConfigured();
    const response = await this.postToken({
      code,
      client_id: this.settings.clientId,
      client_secret: this.settings.clientSecret,
      redirect_uri: this.settings.redirectUri,
      grant_type: 'authorization_code',
    });
    if (response.status !== 200) {
      this.logFailure('authorization code exchange', response);
      throw new GoogleOAuthError('GOOGLE_OAUTH_FAILED', 'Google authorization failed. Please try connecting again.');
    }
    return this.toGrant(response.body);
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenGrant> {
    this.assertConfigured();
    const response = await this.postToken({
      refresh_token: refreshToken,
      client_id: this.settings.clientId,
      client_secret: this.settings.clientSecret,
      grant_type: 'refresh_token',
    });
    if (response.status === 400 && tokenErrorSchema.safeParse(response.body).data?.error === 'invalid_grant') {
      throw new GoogleOAuthError('GOOGLE_RECONNECT_REQUIRED', 'Your Google connection has expired. Please reconnect Google.');
    }
    if (response.status !== 200) {
      this.logFailure('access token refresh', response);
      throw new GoogleOAuthError('GOOGLE_OAUTH_FAILED', 'Google could not refresh your access. Please try again.');
    }
    return this.toGrant(response.body);
  }

  async fetchIdentity(accessToken: string): Promise<OAuthIdentity> {
    const response = await this.http.send({
      method: 'GET',
      url: USERINFO_ENDPOINT,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const identity = identityResponseSchema.safeParse(response.body);
    if (response.status !== 200 || !identity.success) {
      this.logFailure('identity lookup', response);
      throw new GoogleOAuthError('GOOGLE_OAUTH_FAILED', 'Your Google account details could not be read.');
    }
    return { accountId: identity.data.sub, email: identity.data.email };
  }

  async revokeToken(token: string): Promise<void> {
    const response = await this.http.send({
      method: 'POST',
      url: REVOKE_ENDPOINT,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formEncoded({ token }),
    });
    if (response.status !== 200) {
      this.logFailure('token revocation', response);
    }
  }

  private postToken(values: Record<string, string>): Promise<HttpResponse> {
    return this.http.send({
      method: 'POST',
      url: TOKEN_ENDPOINT,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formEncoded(values),
    });
  }

  private toGrant(body: unknown): OAuthTokenGrant {
    const parsed = tokenResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new GoogleOAuthError('GOOGLE_OAUTH_FAILED', 'Google returned an unexpected authorization response.');
    }
    return {
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token ?? null,
      expiresInSeconds: parsed.data.expires_in,
      scopes: parsed.data.scope.split(' ').filter((scope) => scope.length > 0),
    };
  }

  private assertConfigured(): void {
    if (!this.settings.configured) {
      throw new GoogleOAuthError('GOOGLE_OAUTH_FAILED', 'Google Forms connection is not configured on this server.');
    }
  }

  private logFailure(operation: string, response: HttpResponse): void {
    const error = tokenErrorSchema.safeParse(response.body);
    this.logger.warn('Google OAuth request failed', {
      operation,
      status: response.status,
      reason: error.success ? error.data.error : 'unknown',
    });
  }
}
