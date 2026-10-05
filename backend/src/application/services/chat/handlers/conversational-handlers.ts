import type { ChatReplyService } from '../chat-reply-service.js';
import type { ChatTurnContext, IntentDecision, IntentOutcome } from '../chat-turn-context.js';
import type { DraftReplyComposer } from '../replies/draft-reply-composer.js';
import type { ClarificationMessages } from '../../intent/clarification-messages.js';
import { replyOnly, type IntentHandler } from './intent-handler.js';

export class NormalChatHandler implements IntentHandler {
  readonly intent = 'NORMAL_CHAT';

  constructor(private readonly replies: ChatReplyService) {}

  async handle(message: string, _decision: IntentDecision, context: ChatTurnContext): Promise<IntentOutcome> {
    return replyOnly(this.intent, await this.replies.reply(message, context.ai));
  }
}

export class ClarificationHandler implements IntentHandler {
  readonly intent = 'CLARIFICATION_REQUIRED';

  constructor(private readonly clarifications: ClarificationMessages) {}

  async handle(_message: string, decision: IntentDecision): Promise<IntentOutcome> {
    return replyOnly(this.intent, decision.clarification ?? this.clarifications.general());
  }
}

export class PublishRequestHandler implements IntentHandler {
  readonly intent = 'CREATE_GOOGLE_FORM';

  constructor(private readonly composer: DraftReplyComposer) {}

  async handle(_message: string, _decision: IntentDecision, context: ChatTurnContext): Promise<IntentOutcome> {
    return replyOnly(this.intent, this.composer.publishFromChat(context.draft !== null));
  }
}
