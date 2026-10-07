import { describe, expect, it } from 'vitest';
import { GoogleFormItemNormalizer } from '../../../src/infrastructure/google/google-form-item-normalizer.js';
import { GoogleFormRequestBuilder } from '../../../src/infrastructure/google/google-form-request-builder.js';
import { GoogleFormsApiGateway } from '../../../src/infrastructure/google/google-forms-api-gateway.js';
import { GOOGLE_OAUTH_SCOPES, GoogleOAuthHttpGateway } from '../../../src/infrastructure/google/google-oauth-http-gateway.js';
import type { HttpClient, HttpRequest, HttpResponse } from '../../../src/infrastructure/http/http-client.js';
import { GoogleFormsError, GoogleOAuthError } from '../../../src/shared/errors/application-errors.js';
import { sampleForm } from '../../support/domain-fixtures.js';
import { SilentLogger } from '../../support/fakes.js';

class ScriptedHttpClient implements HttpClient {
  readonly requests: HttpRequest[] = [];

  constructor(private readonly responses: HttpResponse[]) {}

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    const response = this.responses.shift();
    if (!response) {
      throw new Error('No scripted response left');
    }
    return response;
  }
}

const settings = { clientId: 'client', clientSecret: 'secret', redirectUri: 'http://localhost:5000/auth/google/callback', configured: true };

describe('GoogleFormRequestBuilder', () => {
  it('maps sections and question types to Google Forms items', () => {
    const form = sampleForm();
    form.sections[1]!.questions.push(
      { id: 'q6', type: 'LINEAR_SCALE', title: 'Excitement', description: 'How excited?', required: false, scale: { min: 1, max: 5, minLabel: 'Meh', maxLabel: 'Very' } },
      { id: 'q7', type: 'PARAGRAPH', title: 'Idea\nDetails', description: '', required: false },
      { id: 'q8', type: 'DATE', title: 'Arrival', description: '', required: true },
      { id: 'q9', type: 'TIME', title: 'Slot', description: '', required: false },
    );
    const requests = new GoogleFormRequestBuilder().buildCreateItemRequests(form);
    const items = requests.map((request) => request.createItem.item);
    expect(requests.map((request) => request.createItem.location.index)).toEqual(items.map((_item, index) => index));
    expect(items[0]).toEqual({ title: 'Participant Information', textItem: {} });
    expect(items[1]).toEqual({ title: 'Full Name', questionItem: { question: { required: true, textQuestion: { paragraph: false } } } });
    expect(items[4]).toEqual({ title: 'Team Details', pageBreakItem: {} });
    expect(items[6]?.questionItem?.question).toEqual({ required: true, choiceQuestion: { type: 'DROP_DOWN', options: [{ value: '1' }, { value: '2' }, { value: '3' }] } });
    expect(items[7]).toMatchObject({ description: 'How excited?', questionItem: { question: { scaleQuestion: { low: 1, high: 5, lowLabel: 'Meh', highLabel: 'Very' } } } });
    expect(items[8]?.title).toBe('Idea Details');
    expect(items[9]?.questionItem?.question).toMatchObject({ dateQuestion: { includeYear: true } });
    expect(items[10]?.questionItem?.question).toMatchObject({ timeQuestion: { duration: false } });
  });
});

describe('GoogleOAuthHttpGateway', () => {
  it('builds an offline consent URL with only the configured scopes', () => {
    const url = new URL(new GoogleOAuthHttpGateway(settings, new ScriptedHttpClient([]), new SilentLogger()).buildAuthorizationUrl('state-1'));
    expect(url.searchParams.get('scope')?.split(' ')).toEqual([...GOOGLE_OAUTH_SCOPES]);
    expect(url.searchParams.get('scope')).not.toContain('drive');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('redirect_uri')).toBe(settings.redirectUri);
    expect(url.searchParams.get('state')).toBe('state-1');
  });

  it('exchanges codes and parses granted scopes', async () => {
    const http = new ScriptedHttpClient([
      { status: 200, body: { access_token: 'a', refresh_token: 'r', expires_in: 3599, scope: 'openid https://www.googleapis.com/auth/forms.body' } },
    ]);
    const grant = await new GoogleOAuthHttpGateway(settings, http, new SilentLogger()).exchangeAuthorizationCode('code');
    expect(grant).toEqual({ accessToken: 'a', refreshToken: 'r', expiresInSeconds: 3599, scopes: ['openid', 'https://www.googleapis.com/auth/forms.body'] });
    expect(http.requests[0]?.body).toContain('grant_type=authorization_code');
  });

  it('maps a revoked refresh token to a reconnect requirement', async () => {
    const http = new ScriptedHttpClient([{ status: 400, body: { error: 'invalid_grant' } }]);
    await expect(new GoogleOAuthHttpGateway(settings, http, new SilentLogger()).refreshAccessToken('r')).rejects.toMatchObject({
      code: 'GOOGLE_RECONNECT_REQUIRED',
    });
  });

  it('refuses to run when not configured', () => {
    const gateway = new GoogleOAuthHttpGateway({ ...settings, configured: false }, new ScriptedHttpClient([]), new SilentLogger());
    expect(() => gateway.buildAuthorizationUrl('s')).toThrow(GoogleOAuthError);
  });
});

describe('GoogleFormsApiGateway', () => {
  it('replaces existing items so retries never duplicate questions', async () => {
    const http = new ScriptedHttpClient([
      { status: 200, body: { formId: 'f1', items: [{}, {}] } },
      { status: 200, body: {} },
    ]);
    await formsGateway(http).replaceItems('token', 'f1', sampleForm());
    const batch = JSON.parse(http.requests[1]?.body ?? '{}') as { requests: Array<Record<string, unknown>> };
    expect(batch.requests.slice(0, 2)).toEqual([{ deleteItem: { location: { index: 0 } } }, { deleteItem: { location: { index: 0 } } }]);
    expect(batch.requests[2]).toHaveProperty('createItem');
    expect(http.requests[1]?.url).toBe('https://forms.googleapis.com/v1/forms/f1:batchUpdate');
    expect(http.requests[1]?.headers?.Authorization).toBe('Bearer token');
  });

  it('maps API failures to typed errors', async () => {
    const gateway = (status: number) => formsGateway(new ScriptedHttpClient([{ status, body: { error: { message: 'internal detail' } } }]));
    await expect(gateway(500).createForm('token', 'Title')).rejects.toBeInstanceOf(GoogleFormsError);
    await expect(gateway(403).createForm('token', 'Title')).rejects.toMatchObject({ code: 'GOOGLE_RECONNECT_REQUIRED' });
  });

  it('reads the published form back with its links, info and normalized items', async () => {
    const http = new ScriptedHttpClient([
      {
        status: 200,
        body: {
          formId: 'f1',
          responderUri: 'https://docs.google.com/forms/d/e/x/viewform',
          info: { title: ' Title ', description: 'About' },
          items: [
            { title: 'Name', questionItem: { question: { required: true, textQuestion: {} } } },
            { title: 'Part two', pageBreakItem: {} },
            { title: 'Pick', questionItem: { question: { choiceQuestion: { type: 'DROP_DOWN', options: [{ value: 'A' }, { value: 'B' }] } } } },
          ],
        },
      },
    ]);
    const snapshot = await formsGateway(http).readForm('token', 'f1');
    expect(snapshot.links).toEqual({ responderUrl: 'https://docs.google.com/forms/d/e/x/viewform', editUrl: 'https://docs.google.com/forms/d/f1/edit' });
    expect(snapshot).toMatchObject({ title: 'Title', description: 'About' });
    expect(snapshot.items.map((item) => item.kind)).toEqual(['QUESTION', 'PAGE_BREAK', 'QUESTION']);
    expect(snapshot.items[0]?.question).toMatchObject({ kind: 'TEXT', required: true });
    expect(snapshot.items[2]?.question).toMatchObject({ kind: 'CHOICE_DROP_DOWN', required: false, options: ['A', 'B'] });
  });
});

function formsGateway(http: ScriptedHttpClient): GoogleFormsApiGateway {
  return new GoogleFormsApiGateway(http, new GoogleFormRequestBuilder(), new GoogleFormItemNormalizer(), new SilentLogger());
}
