import type { Conversation } from '../../../domain/entities/conversation.js';
import type { FormDraft } from '../../../domain/entities/form-draft.js';
import type { ConversationRepository, FormDraftRepository } from '../../../domain/interfaces/repositories.js';
import { NotFoundError } from '../../../shared/errors/application-errors.js';

export class ConversationAccessService {
  constructor(private readonly conversations: ConversationRepository) {}

  async requireOwned(conversationId: string, userId: string): Promise<Conversation> {
    const conversation = await this.conversations.findById(conversationId);
    if (!conversation || !conversation.isOwnedBy(userId)) {
      throw new NotFoundError('Conversation');
    }
    return conversation;
  }
}

export class DraftAccessService {
  constructor(private readonly drafts: FormDraftRepository) {}

  async requireOwned(draftId: string, userId: string): Promise<FormDraft> {
    const draft = await this.drafts.findById(draftId);
    if (!draft || !draft.isOwnedBy(userId)) {
      throw new NotFoundError('Form draft');
    }
    return draft;
  }
}
