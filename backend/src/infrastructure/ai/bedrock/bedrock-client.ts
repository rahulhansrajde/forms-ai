import { z } from 'zod';
import type { HttpClient, HttpResponse } from '../../http/http-client.js';

export type BedrockFailureKind = 'model-unavailable' | 'retryable' | 'permanent';

export class BedrockRequestError extends Error {
  constructor(
    readonly kind: BedrockFailureKind,
    readonly status: number,
    readonly reason: string,
  ) {
    super(`Bedrock request failed (${status} ${reason})`);
    this.name = 'BedrockRequestError';
  }
}

export interface BedrockStructuredFormat {
  name: string;
  schema: Record<string, unknown>;
}

export interface BedrockGenerationRequest {
  system: string;
  prompt: string;
  responseFormat?: BedrockStructuredFormat;
  maxOutputTokens: number;
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const MODEL_UNAVAILABLE_CODES = new Set(['not_found_error', 'model_not_found']);

const errorBodySchema = z.object({
  error: z.object({ code: z.string().nullable().optional(), type: z.string().nullable().optional() }),
});

const completionBodySchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable().optional() }).optional(),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

export class BedrockClient {
  constructor(
    private readonly http: HttpClient,
    private readonly apiKey: string,
    private readonly region: string,
  ) {}

  async generate(model: string, request: BedrockGenerationRequest): Promise<string> {
    const response = await this.send(model, request);
    if (response.status !== 200) {
      throw this.classify(response);
    }
    return this.extractText(response.body);
  }

  private async send(model: string, request: BedrockGenerationRequest): Promise<HttpResponse> {
    try {
      return await this.http.send({
        method: 'POST',
        url: `https://bedrock-mantle.${this.region}.api.aws/v1/chat/completions`,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(this.body(model, request)),
      });
    } catch {
      throw new BedrockRequestError('retryable', 0, 'NETWORK_ERROR');
    }
  }

  private body(model: string, request: BedrockGenerationRequest): Record<string, unknown> {
    return {
      model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.prompt },
      ],
      temperature: 0.2,
      max_tokens: request.maxOutputTokens,
      ...(request.responseFormat
        ? { response_format: { type: 'json_schema', json_schema: { name: request.responseFormat.name, schema: request.responseFormat.schema } } }
        : {}),
    };
  }

  private classify(response: HttpResponse): BedrockRequestError {
    const error = errorBodySchema.safeParse(response.body);
    const reason = error.success ? (error.data.error.code ?? error.data.error.type ?? 'UNKNOWN') : 'UNKNOWN';
    if (response.status === 404 || MODEL_UNAVAILABLE_CODES.has(reason)) {
      return new BedrockRequestError('model-unavailable', response.status, reason);
    }
    if (RETRYABLE_STATUSES.has(response.status)) {
      return new BedrockRequestError('retryable', response.status, reason);
    }
    return new BedrockRequestError('permanent', response.status, reason);
  }

  private extractText(body: unknown): string {
    const parsed = completionBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BedrockRequestError('retryable', 200, 'MALFORMED_RESPONSE');
    }
    const choice = parsed.data.choices[0];
    if (choice?.finish_reason === 'content_filter') {
      throw new BedrockRequestError('permanent', 200, 'BLOCKED_CONTENT_FILTER');
    }
    const text = choice?.message?.content ?? '';
    if (text.trim().length === 0) {
      throw new BedrockRequestError('retryable', 200, `EMPTY_${(choice?.finish_reason ?? 'RESPONSE').toUpperCase()}`);
    }
    return text;
  }
}
