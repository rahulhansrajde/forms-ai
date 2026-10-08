import type { SendMessageResult } from '@forms-ai/contracts';
import type { Conversation } from '../../../domain/entities/conversation.js';
import { Message } from '../../../domain/entities/message.js';
import type { ConversationRepository, MessageRepository } from '../../../domain/interfaces/repositories.js';
import type { Clock, IdentifierGenerator } from '../../../domain/interfaces/system.js';
import { toConversationSummary } from '../../dto/view-mappers.js';
import type { ConversationAccessService } from '../../services/access/resource-access-service.js';
import type { ChatContextLoader } from '../../services/chat/chat-context-loader.js';
import type { MessageViewAssembler } from '../../services/chat/message-view-assembler.js';
import type { ChatTurnContext, IntentDecision, IntentOutcome } from '../../services/chat/chat-turn-context.js';
import type { ConversationTitlePolicy } from '../../services/chat/conversation-title-policy.js';
import type { IntentDispatcher } from '../../services/chat/intent-dispatcher.js';
import type { DraftViewService } from '../../services/forms/draft-view-service.js';
import type { IntentDetectionService } from '../../services/intent/intent-detection-service.js';
import type { SuggestionSetService } from '../../services/suggestions/suggestion-set-service.js';

interface ProcessedTurn {
  decision: IntentDecision;
  outcome: IntentOutcome;
}

export class SendChatMessageUseCase {
  constructor(
    private readonly access: ConversationAccessService,
    private readonly contextLoader: ChatContextLoader,
    private readonly intentDetection: IntentDetectionService,
    private readonly dispatcher: IntentDispatcher,
    private readonly suggestionSets: SuggestionSetService,
    private readonly draftViews: DraftViewService,
    private readonly messages: MessageRepository,
    private readonly conversations: ConversationRepository,
    private readonly titles: ConversationTitlePolicy,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
    private readonly messageViews: MessageViewAssembler,
  ) {}

  async execute(userId: string, conversationId: string, content: string): Promise<SendMessageResult> {
    const conversation = await this.access.requireOwned(conversationId, userId);
    const context = await this.contextLoader.load(userId, conversation);
    const userMessage = Message.fromUser(this.identifiers.generate(), conversation.id, content.trim(), this.clock.now());
    await this.messages.insert(userMessage);
    const turn = await this.process(userMessage.content, context);
    await this.suggestionSets.settleConfirmation(context.openSuggestions, turn.decision);
    const classifiedUserMessage = userMessage.classify(turn.outcome.intent);
    await this.messages.updateIntent(classifiedUserMessage.id, turn.outcome.intent);
    const assistantMessage = Message.fromAssistant(
      this.identifiers.generate(),
      conversation.id,
      turn.outcome.reply,
      turn.outcome.intent,
      this.clock.now(),
      turn.outcome.sheetActionId ?? null,
    );
    await this.messages.insert(assistantMessage);
    const updatedConversation = await this.recordActivity(conversation, userMessage.content);
    const changedDraft = turn.outcome.changedDraft;
    const [userView, assistantView] = await this.messageViews.describeAll([classifiedUserMessage, assistantMessage]);
    return {
      conversation: toConversationSummary(updatedConversation),
      userMessage: userView!,
      assistantMessage: assistantView!,
      draft: changedDraft ? await this.draftViews.describe(changedDraft.draft, changedDraft.version) : null,
      draftChanged: changedDraft !== null,
    };
  }

  private async process(content: string, context: ChatTurnContext): Promise<ProcessedTurn> {
    try {
      const decision = await this.intentDetection.detect(content, context);
      return { decision, outcome: await this.dispatcher.dispatch(content, decision, context) };
    } catch (error) {
      const outcome = this.dispatcher.recoverFromAIFailure(error, 'NORMAL_CHAT');
      return {
        decision: { intent: outcome.intent, clarification: null, acceptAllSuggestions: false, requestsSuggestionConfirmation: false },
        outcome,
      };
    }
  }

  private async recordActivity(conversation: Conversation, content: string): Promise<Conversation> {
    const now = this.clock.now();
    const updated = conversation.hasDefaultTitle()
      ? conversation.retitle(this.titles.deriveFromMessage(content), now)
      : conversation.touch(now);
    await this.conversations.update(updated);
    return updated;
  }
}
