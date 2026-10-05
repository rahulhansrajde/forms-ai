import type { ChatIntent } from '@forms-ai/contracts';
import type { Conversation } from '../entities/conversation.js';
import type { CreatedGoogleForm } from '../entities/created-google-form.js';
import type { FormDraft } from '../entities/form-draft.js';
import type { FormVersion } from '../entities/form-version.js';
import type { GoogleAccountConnection } from '../entities/google-account-connection.js';
import type { Message } from '../entities/message.js';
import type { PublishJob } from '../entities/publish-job.js';
import type { Session } from '../entities/session.js';
import type { SuggestionSet } from '../entities/suggestion-set.js';
import type { User } from '../entities/user.js';

export interface KeysetCursor {
  timestamp: Date;
  id: string;
}

export interface KeysetPageRequest {
  limit: number;
  before: KeysetCursor | null;
}

export interface UserRepository {
  insert(user: User): Promise<void>;
  update(user: User): Promise<void>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
}

export interface SessionRepository {
  insert(session: Session): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  deleteById(id: string): Promise<void>;
  deleteOtherSessions(userId: string, keepSessionId: string): Promise<void>;
}

export interface ConversationRepository {
  insert(conversation: Conversation): Promise<void>;
  update(conversation: Conversation): Promise<void>;
  findById(id: string): Promise<Conversation | null>;
  listByUser(userId: string, page: KeysetPageRequest): Promise<Conversation[]>;
}

export interface MessageRepository {
  insert(message: Message): Promise<void>;
  updateIntent(messageId: string, intent: ChatIntent): Promise<void>;
  listNewestFirst(conversationId: string, page: KeysetPageRequest): Promise<Message[]>;
}

export interface FormDraftRepository {
  insert(draft: FormDraft): Promise<void>;
  update(draft: FormDraft): Promise<void>;
  findById(id: string): Promise<FormDraft | null>;
  lockById(id: string): Promise<FormDraft | null>;
  findLatestByConversation(conversationId: string): Promise<FormDraft | null>;
}

export interface FormVersionRepository {
  insert(version: FormVersion): Promise<void>;
  findById(id: string): Promise<FormVersion | null>;
  findLatestVersionNumber(draftId: string): Promise<number>;
  listByDraft(draftId: string, limit: number, beforeVersionNumber: number | null): Promise<FormVersion[]>;
}

export interface SuggestionSetRepository {
  insert(suggestionSet: SuggestionSet): Promise<void>;
  update(suggestionSet: SuggestionSet): Promise<void>;
  findLatestOpen(conversationId: string): Promise<SuggestionSet | null>;
  supersedeOpen(conversationId: string, at: Date): Promise<void>;
}

export interface ConnectedAccountRepository {
  findGoogleConnection(userId: string): Promise<GoogleAccountConnection | null>;
  saveGoogleConnection(connection: GoogleAccountConnection): Promise<void>;
  deleteGoogleConnection(userId: string): Promise<void>;
}

export interface CreatedFormRepository {
  insert(createdForm: CreatedGoogleForm): Promise<void>;
  update(createdForm: CreatedGoogleForm): Promise<void>;
  findByVersion(versionId: string): Promise<CreatedGoogleForm | null>;
}

export interface PublishJobRepository {
  insert(job: PublishJob): Promise<void>;
  update(job: PublishJob): Promise<void>;
  findLatestByDraft(draftId: string): Promise<PublishJob | null>;
  findRunningByVersion(versionId: string): Promise<PublishJob | null>;
}
