import type { ConversationDetail, ConversationSummary, CursorPage, MessageView } from '@forms-ai/contracts';
import { Conversation } from '../../../domain/entities/conversation.js';
import type {
  ConversationRepository,
  FormDraftRepository,
  MessageRepository,
} from '../../../domain/interfaces/repositories.js';
import type { Clock, IdentifierGenerator } from '../../../domain/interfaces/system.js';
import { NotFoundError } from '../../../shared/errors/application-errors.js';
import { toConversationSummary } from '../../dto/view-mappers.js';
import type { ConversationAccessService } from '../../services/access/resource-access-service.js';
import type { MessageViewAssembler } from '../../services/chat/message-view-assembler.js';
import type { ConversationTitlePolicy } from '../../services/chat/conversation-title-policy.js';
import type { KeysetCursorCodec } from '../../services/pagination/keyset-cursor-codec.js';
import { pageFromOverfetch } from '../../services/pagination/overfetch-page.js';

export interface PageQuery {
  limit: number;
  cursor: string | null;
}

export class CreateConversationUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly titles: ConversationTitlePolicy,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, title: string | undefined): Promise<ConversationSummary> {
    const conversation = Conversation.start(
      this.identifiers.generate(),
      userId,
      this.titles.normalizeRequested(title),
      this.clock.now(),
    );
    await this.conversations.insert(conversation);
    return toConversationSummary(conversation);
  }
}

export class ListConversationsUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly cursors: KeysetCursorCodec,
  ) {}

  async execute(userId: string, query: PageQuery): Promise<CursorPage<ConversationSummary>> {
    const rows = await this.conversations.listByUser(userId, {
      limit: query.limit + 1,
      before: this.cursors.decode(query.cursor),
    });
    const page = pageFromOverfetch(rows, query.limit, (last) =>
      this.cursors.encode({ timestamp: last.updatedAt, id: last.id }),
    );
    return { items: page.items.map(toConversationSummary), nextCursor: page.nextCursor };
  }
}

export class GetConversationUseCase {
  constructor(
    private readonly access: ConversationAccessService,
    private readonly drafts: FormDraftRepository,
  ) {}

  async execute(userId: string, conversationId: string): Promise<ConversationDetail> {
    const conversation = await this.access.requireOwned(conversationId, userId);
    const activeDraft = await this.drafts.findLatestByConversation(conversation.id);
    return {
      ...toConversationSummary(conversation),
      createdAt: conversation.createdAt.toISOString(),
      activeDraftId: activeDraft?.id ?? null,
    };
  }
}

export class DeleteConversationUseCase {
  constructor(
    private readonly access: ConversationAccessService,
    private readonly conversations: ConversationRepository,
  ) {}

  async execute(userId: string, conversationId: string): Promise<void> {
    const conversation = await this.access.requireOwned(conversationId, userId);
    if (!(await this.conversations.deleteOwned(conversation.id, userId))) {
      throw new NotFoundError('Conversation');
    }
  }
}

export class GetConversationMessagesUseCase {
  constructor(
    private readonly access: ConversationAccessService,
    private readonly messages: MessageRepository,
    private readonly cursors: KeysetCursorCodec,
    private readonly messageViews: MessageViewAssembler,
  ) {}

  async execute(userId: string, conversationId: string, query: PageQuery): Promise<CursorPage<MessageView>> {
    const conversation = await this.access.requireOwned(conversationId, userId);
    const newestFirst = await this.messages.listNewestFirst(conversation.id, {
      limit: query.limit + 1,
      before: this.cursors.decode(query.cursor),
    });
    const page = pageFromOverfetch(newestFirst, query.limit, (oldest) =>
      this.cursors.encode({ timestamp: oldest.createdAt, id: oldest.id }),
    );
    return { items: await this.messageViews.describeAll(page.items.reverse()), nextCursor: page.nextCursor };
  }
}
