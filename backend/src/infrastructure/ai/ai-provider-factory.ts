import type { AIProvider } from '../../domain/interfaces/ai-provider.js';
import type { Logger } from '../../domain/interfaces/system.js';
import type { AppConfig } from '../configuration/app-config.js';
import { FetchHttpClient } from '../http/http-client.js';
import { GeminiAIProvider } from './gemini/gemini-ai-provider.js';
import { GeminiClient } from './gemini/gemini-client.js';
import { GeminiSchemaAdapter } from './gemini/gemini-schema-adapter.js';
import { ModelFallbackInvoker } from './gemini/model-fallback-invoker.js';
import { AIPromptLibrary } from './prompts/ai-prompt-library.js';
import { QuestionPhraseParser } from './rule-based/question-phrase-parser.js';
import { RuleBasedAIProvider } from './rule-based/rule-based-ai-provider.js';
import { RuleBasedFormDesigner } from './rule-based/rule-based-form-designer.js';
import { RuleBasedIntentClassifier } from './rule-based/rule-based-intent-classifier.js';
import { RuleBasedOperationPlanner } from './rule-based/rule-based-operation-planner.js';
import { RuleBasedResponder } from './rule-based/rule-based-responder.js';
import { RuleBasedSuggestionAdvisor } from './rule-based/rule-based-suggestion-advisor.js';
import { TextMatcher } from './rule-based/text-matcher.js';
import { TopicResolver } from './rule-based/topic-resolver.js';

const GEMINI_TIMEOUT_MS = 90_000;

export class AIProviderFactory {
  constructor(private readonly logger: Logger) {}

  create(settings: AppConfig['ai']): AIProvider {
    if (settings.provider === 'gemini') {
      return this.createGemini(settings);
    }
    return this.createRuleBased();
  }

  createRuleBased(): RuleBasedAIProvider {
    const matcher = new TextMatcher();
    const topics = new TopicResolver(matcher);
    const questionParser = new QuestionPhraseParser(matcher);
    return new RuleBasedAIProvider(
      new RuleBasedIntentClassifier(matcher),
      new RuleBasedFormDesigner(topics, matcher),
      new RuleBasedOperationPlanner(matcher, questionParser),
      new RuleBasedSuggestionAdvisor(topics, matcher, questionParser),
      new RuleBasedResponder(),
    );
  }

  private createGemini(settings: AppConfig['ai']): AIProvider {
    if (settings.geminiApiKey.length === 0) {
      throw new Error('AI_PROVIDER is gemini but GEMINI_API_KEY is not set.');
    }
    return new GeminiAIProvider(
      new GeminiClient(new FetchHttpClient(GEMINI_TIMEOUT_MS), settings.geminiApiKey),
      new ModelFallbackInvoker(settings.geminiModels, this.logger),
      new GeminiSchemaAdapter(),
      new AIPromptLibrary(),
    );
  }
}
