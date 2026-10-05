import type { FormSchema } from '@forms-ai/contracts';

export interface OAuthTokenGrant {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
  scopes: string[];
}

export interface OAuthIdentity {
  accountId: string;
  email: string;
}

export interface OAuthGateway {
  buildAuthorizationUrl(state: string): string;
  exchangeAuthorizationCode(code: string): Promise<OAuthTokenGrant>;
  refreshAccessToken(refreshToken: string): Promise<OAuthTokenGrant>;
  fetchIdentity(accessToken: string): Promise<OAuthIdentity>;
  revokeToken(token: string): Promise<void>;
}

export interface GoogleFormLinks {
  responderUrl: string;
  editUrl: string;
}

export interface GoogleFormsGateway {
  createForm(accessToken: string, title: string): Promise<string>;
  replaceItems(accessToken: string, formId: string, schema: FormSchema): Promise<void>;
  applySettings(accessToken: string, formId: string, schema: FormSchema): Promise<void>;
  fetchLinks(accessToken: string, formId: string): Promise<GoogleFormLinks>;
}
