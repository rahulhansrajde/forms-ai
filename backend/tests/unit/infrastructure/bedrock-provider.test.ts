import { describe, expect, it } from 'vitest';
import { BedrockAIProvider } from '../../../src/infrastructure/ai/bedrock/bedrock-ai-provider.js';
import { BedrockClient } from '../../../src/infrastructure/ai/bedrock/bedrock-client.js';
import { BedrockSchemaAdapter } from '../../../src/infrastructure/ai/bedrock/bedrock-schema-adapter.js';
import { ModelFallbackInvoker } from '../../../src/infrastructure/ai/bedrock/model-fallback-invoker.js';
import { AIPromptLibrary } from '../../../src/infrastructure/ai/prompts/ai-prompt-library.js';
import { STRUCTURED_OUTPUTS } from '../../../src/infrastructure/ai/prompts/structured-outputs.js';
import type { HttpClient, HttpRequest, HttpResponse } from '../../../src/infrastructure/http/http-client.js';
import { AIProviderError } from '../../../src/shared/errors/application-errors.js';
import { SilentLogger } from '../../support/fakes.js';

const MODELS = ['zai.glm-5', 'backup.model-a', 'backup.model-b', 'backup.model-c'];
const context = { recentTurns: [], currentForm: null, openSuggestions: [] };

function text(value: string | null, finishReason = 'stop'): HttpResponse {
  return { status: 200, body: { choices: [{ index: 0, message: { role: 'assistant', content: value }, finish_reason: finishReason }] } };
}

function failure(status: number, code: string, message = 'failure'): HttpResponse {
  return { status, body: { error: { code, message, param: null, type: 'invalid_request_error' } } };
}

class ScriptedBedrockHttp implements HttpClient {
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
    return this.requests.map((request) => (JSON.parse(request.body ?? '{}') as { model: string }).model);
  }
}

function provider(http: ScriptedBedrockHttp, logger = new SilentLogger(), now: () => number = Date.now) {
  return new BedrockAIProvider(
    new BedrockClient(http, 'test-key', 'ap-south-1'),
    new ModelFallbackInvoker(MODELS, logger, now),
    new BedrockSchemaAdapter(),
    new AIPromptLibrary(),
  );
}

describe('BedrockAIProvider', () => {
  it('requests structured JSON from the regional endpoint with the API key as a bearer token, never in the URL', async () => {
    const http = new ScriptedBedrockHttp([text('{"intent":"CREATE_FORM"}')]);
    expect(await provider(http).classifyIntent('Create a form', context)).toEqual({ intent: 'CREATE_FORM' });
    const request = http.requests[0]!;
    expect(request.url).toBe('https://bedrock-mantle.ap-south-1.api.aws/v1/chat/completions');
    expect(request.url).not.toContain('test-key');
    expect(request.headers?.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(request.body ?? '{}');
    expect(body.model).toBe('zai.glm-5');
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.name).toBe('intent_classification');
    expect(body.response_format.json_schema.schema.properties.intent.enum).toContain('MODIFY_FORM');
    expect(body.messages[0]).toMatchObject({ role: 'system' });
    expect(body.messages[0].content).toContain('Create GForm');
    expect(body.messages[1]).toMatchObject({ role: 'user' });
  });

  it('sends plain replies without a response format', async () => {
    const http = new ScriptedBedrockHttp([text('Hello there')]);
    expect(await provider(http).reply('hi', context)).toBe('Hello there');
    expect(JSON.parse(http.requests[0]!.body ?? '{}').response_format).toBeUndefined();
  });

  it('falls back through the configured models when a model is unavailable or overloaded', async () => {
    const logger = new SilentLogger();
    const http = new ScriptedBedrockHttp([
      failure(404, 'not_found_error', "The model 'zai.glm-5' does not exist"),
      failure(503, 'service_unavailable'),
      failure(429, 'rate_limit_exceeded'),
      text('Hello there'),
    ]);
    expect(await provider(http, logger).reply('hi', context)).toBe('Hello there');
    expect(http.modelsCalled()).toEqual(MODELS);
    expect(logger.entries.filter((entry) => entry.level === 'warn')).toHaveLength(3);
  });

  it('skips a model that recently reported itself unavailable', async () => {
    const http = new ScriptedBedrockHttp([failure(404, 'not_found_error'), text('first'), text('second')]);
    const bedrock = provider(http);
    await bedrock.reply('hi', context);
    await bedrock.reply('again', context);
    expect(http.modelsCalled()).toEqual(['zai.glm-5', 'backup.model-a', 'backup.model-a']);
  });

  it('retries the next model after network failures and empty responses', async () => {
    const http = new ScriptedBedrockHttp([new Error('socket hang up'), text(null, 'length'), text('ok')]);
    expect(await provider(http).reply('hi', context)).toBe('ok');
    expect(http.modelsCalled()).toHaveLength(3);
  });

  it('stops immediately on permanent configuration errors such as an invalid key', async () => {
    const logger = new SilentLogger();
    const http = new ScriptedBedrockHttp([failure(401, 'invalid_api_key', 'Invalid bearer token')]);
    await expect(provider(http, logger).reply('hi', context)).rejects.toBeInstanceOf(AIProviderError);
    expect(http.requests).toHaveLength(1);
    expect(logger.entries).toContainEqual({ level: 'error', message: 'Bedrock rejected the request' });
    const forbidden = new ScriptedBedrockHttp([failure(403, 'access_denied')]);
    await expect(provider(forbidden).reply('hi', context)).rejects.toBeInstanceOf(AIProviderError);
    expect(forbidden.requests).toHaveLength(1);
  });

  it('reports an outage when every model fails', async () => {
    const http = new ScriptedBedrockHttp(MODELS.map(() => failure(503, 'service_unavailable')));
    await expect(provider(http).reply('hi', context)).rejects.toThrow('The AI service is unavailable right now.');
  });

  it('accepts fenced JSON', async () => {
    const http = new ScriptedBedrockHttp([text('```json\n{"acceptedIds":["suggestion_1"]}\n```')]);
    expect(await provider(http).selectSuggestions('add 1', [])).toEqual({ acceptedIds: ['suggestion_1'] });
  });

  it('returns unparseable output untouched so the application validator rejects it', async () => {
    const http = new ScriptedBedrockHttp([text('Sure! Here is your form: ...')]);
    expect(await provider(http).generateForm({ instruction: 'x', basis: null, context })).toBe('Sure! Here is your form: ...');
  });

  it('treats content-filtered responses as permanent', async () => {
    const http = new ScriptedBedrockHttp([text(null, 'content_filter')]);
    await expect(provider(http).reply('x', context)).rejects.toBeInstanceOf(AIProviderError);
    expect(http.requests).toHaveLength(1);
  });
});

describe('BedrockSchemaAdapter', () => {
  it('converts every structured output into the supported schema subset', () => {
    const adapter = new BedrockSchemaAdapter();
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
