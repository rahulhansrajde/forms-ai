import type { FormSchema } from '@forms-ai/contracts';
import type { SuggestedQuestion } from '../../../domain/entities/suggestion-set.js';
import type {
  AIConversationContext,
  AIProvider,
  FormGenerationRequest,
  SheetPlanRequest,
  SheetSummaryRequest,
  SuggestionRequest,
} from '../../../domain/interfaces/ai-provider.js';
import type { AIPromptLibrary } from '../prompts/ai-prompt-library.js';
import { STRUCTURED_OUTPUTS, type StructuredOutput } from '../prompts/structured-outputs.js';
import type { BedrockClient } from './bedrock-client.js';
import type { BedrockSchemaAdapter } from './bedrock-schema-adapter.js';
import type { ModelFallbackInvoker } from './model-fallback-invoker.js';

const STRUCTURED_MAX_TOKENS = 16384;
const REPLY_MAX_TOKENS = 4096;
const CODE_FENCE = /^```(?:json)?\s*|\s*```$/g;
const SCHEMA_NAME_SEPARATOR = /[^A-Za-z0-9_-]+/g;

interface StructuredCall {
  output: StructuredOutput;
  system: string;
  prompt: string;
}

export class BedrockAIProvider implements AIProvider {
  constructor(
    private readonly client: BedrockClient,
    private readonly fallback: ModelFallbackInvoker,
    private readonly schemas: BedrockSchemaAdapter,
    private readonly prompts: AIPromptLibrary,
  ) {}

  classifyIntent(message: string, context: AIConversationContext): Promise<unknown> {
    return this.structured({
      output: STRUCTURED_OUTPUTS.classifyIntent,
      system: this.prompts.intentSystem(),
      prompt: `${this.prompts.describeContext(context)}\n\nLatest user message:\n${message}`,
    });
  }

  generateForm(request: FormGenerationRequest): Promise<unknown> {
    const basis = request.basis ? `\n\nBasis form to rework:\n${this.prompts.describeForm(request.basis)}` : '';
    return this.structured({
      output: STRUCTURED_OUTPUTS.generateForm,
      system: this.prompts.generationSystem(),
      prompt: `${this.prompts.describeContext({ ...request.context, currentForm: null })}${basis}\n\nRequest:\n${request.instruction}`,
    });
  }

  planFormOperations(instruction: string, form: FormSchema, context: AIConversationContext): Promise<unknown> {
    return this.structured({
      output: STRUCTURED_OUTPUTS.planOperations,
      system: this.prompts.modificationSystem(),
      prompt: `${this.prompts.describeContext({ ...context, currentForm: null })}\n\nCurrent form:\n${this.prompts.describeForm(form)}\n\nChange request:\n${instruction}`,
    });
  }

  suggestQuestions(request: SuggestionRequest): Promise<unknown> {
    const excluded = request.excludedQuestionTitles.length > 0 ? request.excludedQuestionTitles.join('; ') : '(none)';
    return this.structured({
      output: STRUCTURED_OUTPUTS.suggestQuestions,
      system: this.prompts.suggestionSystem(),
      prompt: `${this.prompts.describeContext(request.context)}\n\nExcluded question titles: ${excluded}\n\nRequest:\n${request.instruction}`,
    });
  }

  selectSuggestions(message: string, suggestions: SuggestedQuestion[]): Promise<unknown> {
    return this.structured({
      output: STRUCTURED_OUTPUTS.selectSuggestions,
      system: this.prompts.selectionSystem(),
      prompt: `Suggestions:\n${this.prompts.describeSuggestions(suggestions)}\n\nUser message:\n${message}`,
    });
  }

  planSheetAction(request: SheetPlanRequest): Promise<unknown> {
    return this.structured({
      output: STRUCTURED_OUTPUTS.planSheetAction,
      system: this.prompts.sheetPlanningSystem(request.kind),
      prompt: `${this.prompts.describeContext({ ...request.context, currentForm: null })}\n\nRequest:\n${request.instruction}`,
    });
  }

  summarizeSheetData(request: SheetSummaryRequest): Promise<string> {
    return this.fallback.invoke('summarize sheet data', (model) =>
      this.client.generate(model, {
        system: this.prompts.sheetSummarySystem(),
        prompt: this.prompts.describeSheetTable(request),
        maxOutputTokens: REPLY_MAX_TOKENS,
      }),
    );
  }

  reply(message: string, context: AIConversationContext): Promise<string> {
    return this.fallback.invoke('reply', (model) =>
      this.client.generate(model, {
        system: this.prompts.replySystem(),
        prompt: `${this.prompts.describeContext(context)}\n\nUser message:\n${message}`,
        maxOutputTokens: REPLY_MAX_TOKENS,
      }),
    );
  }

  private async structured(call: StructuredCall): Promise<unknown> {
    const text = await this.fallback.invoke(call.output.name, (model) =>
      this.client.generate(model, {
        system: call.system,
        prompt: call.prompt,
        responseFormat: {
          name: call.output.name.replace(SCHEMA_NAME_SEPARATOR, '_'),
          schema: this.schemas.adapt(call.output.jsonSchema),
        },
        maxOutputTokens: STRUCTURED_MAX_TOKENS,
      }),
    );
    return this.parseJson(text);
  }

  private parseJson(text: string): unknown {
    try {
      return JSON.parse(text.trim().replace(CODE_FENCE, '')) as unknown;
    } catch {
      return text;
    }
  }
}
