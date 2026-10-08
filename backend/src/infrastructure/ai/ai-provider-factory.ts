import type { AIProvider } from '../../domain/interfaces/ai-provider.js';
import type { Logger } from '../../domain/interfaces/system.js';
import type { AppConfig } from '../configuration/app-config.js';
import { FetchHttpClient } from '../http/http-client.js';
import { BedrockAIProvider } from './bedrock/bedrock-ai-provider.js';
import { BedrockClient } from './bedrock/bedrock-client.js';
import { BedrockSchemaAdapter } from './bedrock/bedrock-schema-adapter.js';
import { ModelFallbackInvoker } from './bedrock/model-fallback-invoker.js';
import { AIPromptLibrary } from './prompts/ai-prompt-library.js';
import { QuestionPhraseParser } from './rule-based/question-phrase-parser.js';
import { RuleBasedAIProvider } from './rule-based/rule-based-ai-provider.js';
import { RuleBasedFormDesigner } from './rule-based/rule-based-form-designer.js';
import { RuleBasedIntentClassifier } from './rule-based/rule-based-intent-classifier.js';
import { RuleBasedOperationPlanner } from './rule-based/rule-based-operation-planner.js';
import { RuleBasedResponder } from './rule-based/rule-based-responder.js';
import { RuleBasedSheetPlanner } from './rule-based/rule-based-sheet-planner.js';
import { RuleBasedSuggestionAdvisor } from './rule-based/rule-based-suggestion-advisor.js';
import { TextMatcher } from './rule-based/text-matcher.js';
import { TopicResolver } from './rule-based/topic-resolver.js';

const BEDROCK_TIMEOUT_MS = 90_000;

export class AIProviderFactory {
  constructor(private readonly logger: Logger) {}

  create(settings: AppConfig['ai']): AIProvider {
    if (settings.provider === 'bedrock') {
      return this.createBedrock(settings);
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
      new RuleBasedSheetPlanner(),
    );
  }

  private createBedrock(settings: AppConfig['ai']): AIProvider {
    if (settings.bedrockApiKey.length === 0) {
      throw new Error('AI_PROVIDER is bedrock but BEDROCK_API_KEY is not set.');
    }
    return new BedrockAIProvider(
      new BedrockClient(new FetchHttpClient(BEDROCK_TIMEOUT_MS), settings.bedrockApiKey, settings.bedrockRegion),
      new ModelFallbackInvoker(settings.bedrockModels, this.logger),
      new BedrockSchemaAdapter(),
      new AIPromptLibrary(),
    );
  }
}
