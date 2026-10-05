import { describe, expect, it } from 'vitest';
import { GeminiAIProvider } from '../../../src/infrastructure/ai/gemini/gemini-ai-provider.js';
import { GeminiClient } from '../../../src/infrastructure/ai/gemini/gemini-client.js';
import { GeminiSchemaAdapter } from '../../../src/infrastructure/ai/gemini/gemini-schema-adapter.js';
import { ModelFallbackInvoker } from '../../../src/infrastructure/ai/gemini/model-fallback-invoker.js';
import { AIPromptLibrary } from '../../../src/infrastructure/ai/prompts/ai-prompt-library.js';
import { STRUCTURED_OUTPUTS } from '../../../src/infrastructure/ai/prompts/structured-outputs.js';
import type { HttpClient, HttpRequest, HttpResponse } from '../../../src/infrastructure/http/http-client.js';
import { AIProviderError } from '../../../src/shared/errors/application-errors.js';
import { SilentLogger } from '../../support/fakes.js';

const MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];
const context = { recentTurns: [], currentForm: null, openSuggestions: [] };

function text(value: string, extraParts: Array<Record<string, unknown>> = []): HttpResponse {
  return { status: 200, body: { candidates: [{ content: { parts: [...extraParts, { text: value }] }, finishReason: 'STOP' }] } };
}

function failure(status: number, reason: string, message = 'failure'): HttpResponse {
  return { status, body: { error: { code: status, status: reason, message } } };
}

class ScriptedGeminiHttp implements HttpClient {
  readonly requests: HttpRequest[] = [];

  constructor(private readonly responses: Array<HttpResponse | Error>) {}

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    const next = this.responses.shift();
    if (!next) {
      throw new Error('No scripted response left');
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  }

  modelsCalled(): string[] {
    return this.requests.map((request) => decodeURIComponent(/models\/([^:]+):/.exec(request.url)?.[1] ?? ''));
  }
}

function provider(http: ScriptedGeminiHttp, logger = new SilentLogger(), now: () => number = Date.now) {
  return new GeminiAIProvider(
    new GeminiClient(http, 'test-key'),
    new ModelFallbackInvoker(MODELS, logger, now),
    new GeminiSchemaAdapter(),
    new AIPromptLibrary(),
  );
}

describe('GeminiAIProvider', () => {
  it('requests structured JSON with the API key in a header, never in the URL', async () => {
    const http = new ScriptedGeminiHttp([text('{"intent":"CREATE_FORM"}')]);
    expect(await provider(http).classifyIntent('Create a form', context)).toEqual({ intent: 'CREATE_FORM' });
    const request = http.requests[0]!;
    expect(request.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    expect(request.url).not.toContain('test-key');
    expect(request.headers?.['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(request.body ?? '{}');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseJsonSchema.properties.intent.enum).toContain('MODIFY_FORM');
    expect(body.systemInstruction.parts[0].text).toContain('Create GForm');
  });

  it('falls back through the configured models when a model is unavailable or overloaded', async () => {
    const logger = new SilentLogger();
    const http = new ScriptedGeminiHttp([
      failure(404, 'NOT_FOUND', 'models/gemini-3.8-flash is not found'),
      failure(503, 'UNAVAILABLE'),
      failure(429, 'RESOURCE_EXHAUSTED'),
      text('Hello there'),
    ]);
    expect(await provider(http, logger).reply('hi', context)).toBe('Hello there');
    expect(http.modelsCalled()).toEqual(MODELS);
    expect(logger.entries.filter((entry) => entry.level === 'warn')).toHaveLength(3);
  });

  it('skips a model that recently reported itself unavailable', async () => {
    const http = new ScriptedGeminiHttp([failure(404, 'NOT_FOUND'), text('first'), text('second')]);
    const gemini = provider(http);
    await gemini.reply('hi', context);
    await gemini.reply('again', context);
    expect(http.modelsCalled()).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.7-flash']);
  });

  it('retries the next model after network failures and empty responses', async () => {
    const http = new ScriptedGeminiHttp([new Error('socket hang up'), { status: 200, body: { candidates: [] } }, text('ok')]);
    expect(await provider(http).reply('hi', context)).toBe('ok');
    expect(http.modelsCalled()).toHaveLength(3);
  });

  it('stops immediately on permanent configuration errors such as an invalid key', async () => {
    const logger = new SilentLogger();
    const http = new ScriptedGeminiHttp([failure(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.')]);
    await expect(provider(http, logger).reply('hi', context)).rejects.toBeInstanceOf(AIProviderError);
    expect(http.requests).toHaveLength(1);
    expect(logger.entries).toContainEqual({ level: 'error', message: 'Gemini rejected the request' });
    const forbidden = new ScriptedGeminiHttp([failure(403, 'PERMISSION_DENIED')]);
    await expect(provider(forbidden).reply('hi', context)).rejects.toBeInstanceOf(AIProviderError);
    expect(forbidden.requests).toHaveLength(1);
  });

  it('reports an outage when every model fails', async () => {
    const http = new ScriptedGeminiHttp(MODELS.map(() => failure(503, 'UNAVAILABLE')));
    await expect(provider(http).reply('hi', context)).rejects.toThrow('The AI service is unavailable right now.');
  });

  it('ignores thought parts and fenced JSON', async () => {
    const http = new ScriptedGeminiHttp([text('```json\n{"acceptedIds":["suggestion_1"]}\n```', [{ text: 'thinking…', thought: true }])]);
    expect(await provider(http).selectSuggestions('add 1', [])).toEqual({ acceptedIds: ['suggestion_1'] });
  });

  it('returns unparseable output untouched so the application validator rejects it', async () => {
    const http = new ScriptedGeminiHttp([text('Sure! Here is your form: ...')]);
    expect(await provider(http).generateForm({ instruction: 'x', basis: null, context })).toBe('Sure! Here is your form: ...');
  });

  it('treats blocked prompts as permanent', async () => {
    const http = new ScriptedGeminiHttp([{ status: 200, body: { candidates: [], promptFeedback: { blockReason: 'SAFETY' } } }]);
    await expect(provider(http).reply('x', context)).rejects.toBeInstanceOf(AIProviderError);
    expect(http.requests).toHaveLength(1);
  });
});

describe('GeminiSchemaAdapter', () => {
  it('converts every structured output into the supported schema subset', () => {
    const adapter = new GeminiSchemaAdapter();
    const allowed = new Set(['type', 'properties', 'required', 'items', 'enum', 'anyOf', 'description']);
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
          expect(allowed.has(key)).toBe(true);
          if (key === 'properties') {
            Object.values(value as Record<string, unknown>).forEach(visit);
          } else {
            visit(value);
          }
        }
      }
    };
    for (const output of Object.values(STRUCTURED_OUTPUTS)) {
      visit(adapter.adapt(output.jsonSchema));
    }
    const operations = adapter.adapt(STRUCTURED_OUTPUTS.planOperations.jsonSchema) as {
      properties: { operations: { items: { anyOf: Array<{ properties: { type: { enum: string[] } } }> } } };
    };
    expect(operations.properties.operations.items.anyOf.map((variant) => variant.properties.type.enum[0])).toContain('REMOVE_QUESTION');
  });
});
