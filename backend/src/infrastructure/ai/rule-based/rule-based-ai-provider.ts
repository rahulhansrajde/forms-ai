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
import type { RuleBasedFormDesigner } from './rule-based-form-designer.js';
import type { RuleBasedIntentClassifier } from './rule-based-intent-classifier.js';
import type { RuleBasedOperationPlanner } from './rule-based-operation-planner.js';
import type { RuleBasedResponder } from './rule-based-responder.js';
import type { RuleBasedSheetPlanner } from './rule-based-sheet-planner.js';
import type { RuleBasedSuggestionAdvisor } from './rule-based-suggestion-advisor.js';

export class RuleBasedAIProvider implements AIProvider {
  constructor(
    private readonly classifier: RuleBasedIntentClassifier,
    private readonly designer: RuleBasedFormDesigner,
    private readonly planner: RuleBasedOperationPlanner,
    private readonly advisor: RuleBasedSuggestionAdvisor,
    private readonly responder: RuleBasedResponder,
    private readonly sheets: RuleBasedSheetPlanner,
  ) {}

  async classifyIntent(message: string, context: AIConversationContext): Promise<unknown> {
    return this.classifier.classify(message, context);
  }

  async generateForm(request: FormGenerationRequest): Promise<unknown> {
    return request.basis
      ? this.designer.redesign(request.instruction, request.basis)
      : this.designer.design(request.instruction);
  }

  async planFormOperations(instruction: string, form: FormSchema): Promise<unknown> {
    return this.planner.plan(instruction, form);
  }

  async suggestQuestions(request: SuggestionRequest): Promise<unknown> {
    return this.advisor.suggest(request);
  }

  async selectSuggestions(message: string, suggestions: SuggestedQuestion[]): Promise<unknown> {
    return this.advisor.select(message, suggestions);
  }

  async planSheetAction(request: SheetPlanRequest): Promise<unknown> {
    return this.sheets.plan(request);
  }

  async summarizeSheetData(request: SheetSummaryRequest): Promise<string> {
    return this.sheets.summarize(request);
  }

  async reply(message: string, context: AIConversationContext): Promise<string> {
    return this.responder.reply(message, context);
  }
}
