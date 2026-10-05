import type { QuestionInput } from '@forms-ai/contracts';
import { SuggestionSet } from '../../../domain/entities/suggestion-set.js';
import type { SuggestionSetRepository } from '../../../domain/interfaces/repositories.js';
import type { Clock, IdentifierGenerator, TransactionRunner } from '../../../domain/interfaces/system.js';
import type { IntentDecision } from '../chat/chat-turn-context.js';
import type { SuggestionProposal } from './suggestion-generation-service.js';

export class SuggestionSetService {
  constructor(
    private readonly suggestionSets: SuggestionSetRepository,
    private readonly transactions: TransactionRunner,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
  ) {}

  async open(conversationId: string, draftId: string | null, proposal: SuggestionProposal): Promise<SuggestionSet> {
    const suggestionSet = SuggestionSet.propose(
      {
        id: this.identifiers.generate(),
        conversationId,
        draftId,
        formTitle: proposal.formTitle,
        baseQuestions: proposal.baseQuestions,
        suggestions: this.numbered(proposal.suggestions),
      },
      this.clock.now(),
    );
    await this.transactions.runInTransaction(async () => {
      await this.suggestionSets.supersedeOpen(conversationId, this.clock.now());
      await this.suggestionSets.insert(suggestionSet);
    });
    return suggestionSet;
  }

  async closeOpen(conversationId: string): Promise<void> {
    await this.suggestionSets.supersedeOpen(conversationId, this.clock.now());
  }

  async markAccepted(suggestionSet: SuggestionSet): Promise<void> {
    await this.suggestionSets.update(suggestionSet.accept(this.clock.now()));
  }

  async settleConfirmation(suggestionSet: SuggestionSet | null, decision: IntentDecision): Promise<void> {
    if (!suggestionSet || !suggestionSet.isOpen() || decision.intent === 'ACCEPT_SUGGESTIONS') {
      return;
    }
    if (decision.requestsSuggestionConfirmation) {
      await this.suggestionSets.update(suggestionSet.requestConfirmation(this.clock.now()));
      return;
    }
    if (suggestionSet.isAwaitingConfirmation()) {
      await this.suggestionSets.update(suggestionSet.reopen(this.clock.now()));
    }
  }

  private numbered(questions: QuestionInput[]): SuggestionSet['suggestions'] {
    return questions.map((question, index) => ({ id: `suggestion_${index + 1}`, question }));
  }
}
