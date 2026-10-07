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

export type PublishedItemKind = 'QUESTION' | 'PAGE_BREAK' | 'TEXT' | 'OTHER';

export interface PublishedQuestion {
  kind: string;
  required: boolean;
  options: string[];
  scale: { low: number; high: number; lowLabel: string; highLabel: string } | null;
}

export interface PublishedFormItem {
  kind: PublishedItemKind;
  title: string;
  description: string;
  question: PublishedQuestion | null;
}

export interface GoogleFormSnapshot {
  formId: string;
  title: string;
  description: string;
  links: GoogleFormLinks;
  items: PublishedFormItem[];
}

export interface PublishedFormCounts {
  sections: number;
  questions: number;
}

export interface PublishedFormVerification {
  expected: PublishedFormCounts;
  actual: PublishedFormCounts;
  mismatches: string[];
}

export interface PublishedFormVerifier {
  verify(schema: FormSchema, snapshot: GoogleFormSnapshot): PublishedFormVerification;
}

export interface GoogleFormsGateway {
  createForm(accessToken: string, title: string): Promise<string>;
  replaceItems(accessToken: string, formId: string, schema: FormSchema): Promise<void>;
  applySettings(accessToken: string, formId: string, schema: FormSchema): Promise<void>;
  readForm(accessToken: string, formId: string): Promise<GoogleFormSnapshot>;
}
