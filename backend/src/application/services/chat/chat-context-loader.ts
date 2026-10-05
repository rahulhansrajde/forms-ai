import type { Conversation } from '../../../domain/entities/conversation.js';
import type { Message } from '../../../domain/entities/message.js';
import type { ConversationTurn } from '../../../domain/interfaces/ai-provider.js';
import type {
  FormDraftRepository,
  MessageRepository,
  SuggestionSetRepository,
} from '../../../domain/interfaces/repositories.js';
import type { FormVersionService } from '../forms/form-version-service.js';
import type { ChatTurnContext } from './chat-turn-context.js';

const CONTEXT_MESSAGE_LIMIT = 12;
const CONTEXT_MESSAGE_MAX_LENGTH = 2000;

export class ChatContextLoader {
  constructor(
    private readonly messages: MessageRepository,
    private readonly drafts: FormDraftRepository,
    private readonly versions: FormVersionService,
    private readonly suggestionSets: SuggestionSetRepository,
  ) {}

  async load(userId: string, conversation: Conversation): Promise<ChatTurnContext> {
    const [recentMessages, draft, openSuggestions] = await Promise.all([
      this.messages.listNewestFirst(conversation.id, { limit: CONTEXT_MESSAGE_LIMIT, before: null }),
      this.drafts.findLatestByConversation(conversation.id),
      this.suggestionSets.findLatestOpen(conversation.id),
    ]);
    const currentVersion = draft ? await this.versions.loadCurrentVersion(draft) : null;
    return {
      userId,
      conversation,
      draft,
      currentVersion,
      openSuggestions,
      ai: {
        recentTurns: this.toTurns(recentMessages),
        currentForm: currentVersion?.schema ?? null,
        openSuggestions: openSuggestions?.suggestions ?? [],
      },
    };
  }

  private toTurns(newestFirst: Message[]): ConversationTurn[] {
    return [...newestFirst].reverse().map((message) => ({
      role: message.role,
      content: message.content.slice(0, CONTEXT_MESSAGE_MAX_LENGTH),
    }));
  }
}
