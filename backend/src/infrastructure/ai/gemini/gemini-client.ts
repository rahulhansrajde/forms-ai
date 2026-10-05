import { z } from 'zod';
import type { HttpClient, HttpResponse } from '../../http/http-client.js';

export type GeminiFailureKind = 'model-unavailable' | 'retryable' | 'permanent';

export class GeminiRequestError extends Error {
  constructor(
    readonly kind: GeminiFailureKind,
    readonly status: number,
    readonly reason: string,
  ) {
    super(`Gemini request failed (${status} ${reason})`);
    this.name = 'GeminiRequestError';
  }
}

export interface GeminiGenerationRequest {
  system: string;
  prompt: string;
  responseSchema?: Record<string, unknown>;
  maxOutputTokens: number;
}

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const MODEL_UNAVAILABLE_HINT = /model|not found|not supported|unsupported/i;

const errorBodySchema = z.object({ error: z.object({ status: z.string().optional(), message: z.string().optional() }) });

const generationBodySchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })).default([]) }).optional(),
        finishReason: z.string().optional(),
      }),
    )
    .default([]),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
});

export class GeminiClient {
  constructor(
    private readonly http: HttpClient,
    private readonly apiKey: string,
  ) {}

  async generate(model: string, request: GeminiGenerationRequest): Promise<string> {
    const response = await this.send(model, request);
    if (response.status !== 200) {
      throw this.classify(response);
    }
    return this.extractText(response.body);
  }

  private async send(model: string, request: GeminiGenerationRequest): Promise<HttpResponse> {
    try {
      return await this.http.send({
        method: 'POST',
        url: `${GEMINI_API}/models/${encodeURIComponent(model)}:generateContent`,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(this.body(request)),
      });
    } catch {
      throw new GeminiRequestError('retryable', 0, 'NETWORK_ERROR');
    }
  }

  private body(request: GeminiGenerationRequest): Record<string, unknown> {
    return {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: request.maxOutputTokens,
        ...(request.responseSchema ? { responseMimeType: 'application/json', responseJsonSchema: request.responseSchema } : {}),
      },
    };
  }

  private classify(response: HttpResponse): GeminiRequestError {
    const error = errorBodySchema.safeParse(response.body);
    const reason = error.success ? (error.data.error.status ?? 'UNKNOWN') : 'UNKNOWN';
    const message = error.success ? (error.data.error.message ?? '') : '';
    if (response.status === 404 || (response.status === 400 && reason === 'NOT_FOUND')) {
      return new GeminiRequestError('model-unavailable', response.status, reason);
    }
    if (response.status === 400 && reason === 'INVALID_ARGUMENT' && MODEL_UNAVAILABLE_HINT.test(message) && !/key/i.test(message)) {
      return new GeminiRequestError('model-unavailable', response.status, reason);
    }
    if (RETRYABLE_STATUSES.has(response.status)) {
      return new GeminiRequestError('retryable', response.status, reason);
    }
    return new GeminiRequestError('permanent', response.status, reason);
  }

  private extractText(body: unknown): string {
    const parsed = generationBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new GeminiRequestError('retryable', 200, 'MALFORMED_RESPONSE');
    }
    if (parsed.data.promptFeedback?.blockReason) {
      throw new GeminiRequestError('permanent', 200, `BLOCKED_${parsed.data.promptFeedback.blockReason}`);
    }
    const candidate = parsed.data.candidates[0];
    const text = (candidate?.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? '')
      .join('');
    if (text.trim().length === 0) {
      throw new GeminiRequestError('retryable', 200, `EMPTY_${candidate?.finishReason ?? 'RESPONSE'}`);
    }
    return text;
  }
}
