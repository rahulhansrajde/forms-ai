import type { FormOperation } from '@forms-ai/contracts';
import type { SuggestedQuestion, SuggestionSet } from '../../../../domain/entities/suggestion-set.js';
import type { FormBlueprintBuilder } from '../../../../domain/services/form-blueprint-builder.js';
import type { FormOperationApplier } from '../../../../domain/services/form-operation-applier.js';
import type { FormVersionService, VersionedDraft } from '../../forms/form-version-service.js';
import type { ClarificationMessages } from '../../intent/clarification-messages.js';
import type { SuggestionGenerationService } from '../../suggestions/suggestion-generation-service.js';
import type { SuggestionSelectionService } from '../../suggestions/suggestion-selection-service.js';
import type { SuggestionSetService } from '../../suggestions/suggestion-set-service.js';
import type { ChatTurnContext, IntentDecision, IntentOutcome } from '../chat-turn-context.js';
import type { DraftReplyComposer } from '../replies/draft-reply-composer.js';
import type { SuggestionReplyComposer } from '../replies/suggestion-reply-composer.js';
import { replyOnly, type IntentHandler } from './intent-handler.js';

export class SuggestQuestionsHandler implements IntentHandler {
  readonly intent = 'SUGGEST_QUESTIONS';

  constructor(
    private readonly generation: SuggestionGenerationService,
    private readonly suggestionSets: SuggestionSetService,
    private readonly composer: SuggestionReplyComposer,
  ) {}

  async handle(message: string, _decision: IntentDecision, context: ChatTurnContext): Promise<IntentOutcome> {
    const proposal = await this.generation.propose(message, context);
    if (proposal.suggestions.length === 0) {
      return replyOnly(this.intent, this.composer.nothingNew());
    }
    const suggestionSet = await this.suggestionSets.open(context.conversation.id, context.draft?.id ?? null, proposal);
    return replyOnly(this.intent, this.composer.list(suggestionSet));
  }
}

export class AcceptSuggestionsHandler implements IntentHandler {
  readonly intent = 'ACCEPT_SUGGESTIONS';

  constructor(
    private readonly selection: SuggestionSelectionService,
    private readonly suggestionSets: SuggestionSetService,
    private readonly versions: FormVersionService,
    private readonly applier: FormOperationApplier,
    private readonly blueprints: FormBlueprintBuilder,
    private readonly clarifications: ClarificationMessages,
    private readonly composer: DraftReplyComposer,
  ) {}

  async handle(message: string, decision: IntentDecision, context: ChatTurnContext): Promise<IntentOutcome> {
    const suggestionSet = context.openSuggestions;
    if (!suggestionSet) {
      return replyOnly('CLARIFICATION_REQUIRED', this.clarifications.noSuggestionsToAccept());
    }
    const accepted = await this.selection.select(message, suggestionSet, decision.acceptAllSuggestions);
    if (accepted.length === 0) {
      return replyOnly('CLARIFICATION_REQUIRED', this.clarifications.unclearSelection());
    }
    const changedDraft = context.draft ? await this.addToDraft(context, accepted) : await this.createDraft(context, suggestionSet, accepted);
    await this.suggestionSets.markAccepted(suggestionSet);
    return {
      intent: this.intent,
      reply: this.composer.suggestionsAdded(
        accepted.map((suggestion) => suggestion.question.title),
        changedDraft.version.schema,
        context.draft === null,
      ),
      changedDraft,
    };
  }

  private async addToDraft(context: ChatTurnContext, accepted: SuggestedQuestion[]): Promise<VersionedDraft> {
    if (!context.draft || !context.currentVersion) {
      throw new Error('A draft is required to add suggestions.');
    }
    const operations: FormOperation[] = accepted.map((suggestion) => ({ type: 'ADD_QUESTION', question: suggestion.question }));
    return this.versions.commitVersion({
      draftId: context.draft.id,
      baseVersionId: context.currentVersion.id,
      schema: this.applier.apply(context.currentVersion.schema, operations),
      source: 'SUGGESTION_ACCEPTANCE',
    });
  }

  private async createDraft(
    context: ChatTurnContext,
    suggestionSet: SuggestionSet,
    accepted: SuggestedQuestion[],
  ): Promise<VersionedDraft> {
    const schema = this.blueprints.build({
      title: suggestionSet.formTitle,
      description: '',
      sections: [
        {
          title: '',
          description: '',
          questions: [...suggestionSet.baseQuestions, ...accepted.map((suggestion) => suggestion.question)],
        },
      ],
    });
    return this.versions.createDraft({
      userId: context.userId,
      conversationId: context.conversation.id,
      schema,
      source: 'SUGGESTION_ACCEPTANCE',
    });
  }
}
