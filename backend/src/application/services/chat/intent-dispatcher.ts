import type { ChatIntent } from '@forms-ai/contracts';
import type { Logger } from '../../../domain/interfaces/system.js';
import { AIOutputRejectedError, AIProviderError, ValidationError } from '../../../shared/errors/application-errors.js';
import type { ClarificationMessages } from '../intent/clarification-messages.js';
import type { ChatTurnContext, IntentDecision, IntentOutcome } from './chat-turn-context.js';
import { replyOnly, type IntentHandler } from './handlers/intent-handler.js';

export class IntentDispatcher {
  private readonly handlers: ReadonlyMap<ChatIntent, IntentHandler>;

  constructor(
    handlers: readonly IntentHandler[],
    private readonly clarifications: ClarificationMessages,
    private readonly logger: Logger,
  ) {
    this.handlers = new Map(handlers.map((handler) => [handler.intent, handler]));
  }

  async dispatch(message: string, decision: IntentDecision, context: ChatTurnContext): Promise<IntentOutcome> {
    const handler = this.handlers.get(decision.intent);
    if (!handler) {
      return replyOnly('CLARIFICATION_REQUIRED', this.clarifications.general());
    }
    try {
      return await handler.handle(message, decision, context);
    } catch (error) {
      return this.recoverFromAIFailure(error, decision.intent);
    }
  }

  recoverFromAIFailure(error: unknown, intent: ChatIntent): IntentOutcome {
    if (error instanceof AIOutputRejectedError) {
      this.logger.warn('Rejected AI output', { intent, reason: error.message, details: error.details });
      return replyOnly('CLARIFICATION_REQUIRED', this.clarifications.unsafeAIOutput());
    }
    if (error instanceof AIProviderError) {
      this.logger.error('AI provider failure', { intent, error });
      return replyOnly('NORMAL_CHAT', this.clarifications.aiUnavailable());
    }
    if (error instanceof ValidationError) {
      return replyOnly('CLARIFICATION_REQUIRED', this.clarifications.rejectedChange(error.message));
    }
    throw error;
  }
}
