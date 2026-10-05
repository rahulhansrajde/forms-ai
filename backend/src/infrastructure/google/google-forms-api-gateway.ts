import type { FormSchema } from '@forms-ai/contracts';
import { z } from 'zod';
import type { GoogleFormLinks, GoogleFormsGateway } from '../../domain/interfaces/google.js';
import type { Logger } from '../../domain/interfaces/system.js';
import { GoogleFormsError, GoogleOAuthError } from '../../shared/errors/application-errors.js';
import type { HttpClient, HttpResponse } from '../http/http-client.js';
import type { GoogleFormRequestBuilder } from './google-form-request-builder.js';

const FORMS_API = 'https://forms.googleapis.com/v1/forms';

const createdFormSchema = z.object({ formId: z.string().min(1) });

const formDocumentSchema = z.object({
  formId: z.string().min(1),
  responderUri: z.url().optional(),
  items: z.array(z.unknown()).default([]),
});

export class GoogleFormsApiGateway implements GoogleFormsGateway {
  constructor(
    private readonly http: HttpClient,
    private readonly requests: GoogleFormRequestBuilder,
    private readonly logger: Logger,
  ) {}

  async createForm(accessToken: string, title: string): Promise<string> {
    const response = await this.call(accessToken, 'POST', FORMS_API, { info: { title, documentTitle: title } }, 'create form');
    const parsed = createdFormSchema.safeParse(response.body);
    if (!parsed.success) {
      throw new GoogleFormsError('Google Forms returned an unexpected response while creating the form.');
    }
    return parsed.data.formId;
  }

  async replaceItems(accessToken: string, formId: string, schema: FormSchema): Promise<void> {
    const existing = await this.fetchForm(accessToken, formId);
    const requests = [
      ...this.requests.buildDeleteItemRequests(existing.items.length),
      ...this.requests.buildCreateItemRequests(schema),
    ];
    if (requests.length > 0) {
      await this.batchUpdate(accessToken, formId, requests, 'add items');
    }
  }

  async applySettings(accessToken: string, formId: string, schema: FormSchema): Promise<void> {
    await this.batchUpdate(
      accessToken,
      formId,
      [{ updateFormInfo: { info: { title: schema.title, description: schema.description }, updateMask: 'title,description' } }],
      'apply settings',
    );
  }

  async fetchLinks(accessToken: string, formId: string): Promise<GoogleFormLinks> {
    const form = await this.fetchForm(accessToken, formId);
    return {
      responderUrl: form.responderUri ?? `https://docs.google.com/forms/d/${encodeURIComponent(formId)}/viewform`,
      editUrl: `https://docs.google.com/forms/d/${encodeURIComponent(formId)}/edit`,
    };
  }

  private async fetchForm(accessToken: string, formId: string): Promise<z.infer<typeof formDocumentSchema>> {
    const response = await this.call(accessToken, 'GET', `${FORMS_API}/${encodeURIComponent(formId)}`, undefined, 'read form');
    const parsed = formDocumentSchema.safeParse(response.body);
    if (!parsed.success) {
      throw new GoogleFormsError('Google Forms returned an unexpected form document.');
    }
    return parsed.data;
  }

  private async batchUpdate(accessToken: string, formId: string, requests: unknown[], operation: string): Promise<void> {
    await this.call(accessToken, 'POST', `${FORMS_API}/${encodeURIComponent(formId)}:batchUpdate`, { requests }, operation);
  }

  private async call(
    accessToken: string,
    method: 'GET' | 'POST',
    url: string,
    body: unknown,
    operation: string,
  ): Promise<HttpResponse> {
    const response = await this.http.send({
      method,
      url,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status >= 200 && response.status < 300) {
      return response;
    }
    this.logger.warn('Google Forms request failed', { operation, status: response.status });
    if (response.status === 401 || response.status === 403) {
      throw new GoogleOAuthError(
        'GOOGLE_RECONNECT_REQUIRED',
        'Google Forms access was denied. Please reconnect Google Forms and try again.',
      );
    }
    throw new GoogleFormsError(`Google Forms could not ${operation}. Please try again.`, { status: response.status });
  }
}
