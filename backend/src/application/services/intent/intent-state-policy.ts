import type { ChatTurnContext, IntentDecision } from '../chat/chat-turn-context.js';
import type { ClarificationMessages } from './clarification-messages.js';

export class IntentStatePolicy {
  constructor(private readonly clarifications: ClarificationMessages) {}

  reconcile(decision: IntentDecision, context: ChatTurnContext): IntentDecision {
    if ((decision.intent === 'MODIFY_FORM' || decision.intent === 'REGENERATE_FORM') && !context.draft) {
      return this.clarify(this.clarifications.noDraftToChange());
    }
    if (decision.intent === 'ACCEPT_SUGGESTIONS' && !context.openSuggestions) {
      return this.clarify(this.clarifications.noSuggestionsToAccept());
    }
    if (decision.intent === 'CLARIFICATION_REQUIRED' && !decision.clarification) {
      return this.clarify(this.clarifications.general());
    }
    return decision;
  }

  clarify(question: string, requestsSuggestionConfirmation = false): IntentDecision {
    return {
      intent: 'CLARIFICATION_REQUIRED',
      clarification: question,
      acceptAllSuggestions: false,
      requestsSuggestionConfirmation,
    };
  }
}
