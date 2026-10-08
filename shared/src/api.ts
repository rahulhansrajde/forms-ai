import type { FormOperation } from './form-operations.js';
import type { FormSchema, QuestionType } from './form-schema.js';
import type { ChatIntent } from './intents.js';
import type { SheetActionView } from './sheets.js';
import type { DraftStatus, PublishJobStatus, PublishStep, VersionSource } from './versioning.js';

export const MESSAGE_PAGE_SIZE = 50;
export const CONVERSATION_PAGE_SIZE = 30;
export const VERSION_PAGE_SIZE = 20;
export const MESSAGE_MAX_LENGTH = 8000;

export interface UserView {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
}

export interface SignUpRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface LogInRequest {
  email: string;
  password: string;
}

export interface UpdateProfileRequest {
  firstName: string;
  lastName: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  createdAt: string;
  activeDraftId: string | null;
}

export interface CreateConversationRequest {
  title?: string;
}

export type MessageRole = 'USER' | 'ASSISTANT';

export interface PublishedFormView {
  title: string;
  versionNumber: number;
  responderUrl: string;
  editUrl: string;
}

export interface MessageView {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  intent: ChatIntent | null;
  publishedForm: PublishedFormView | null;
  sheetAction: SheetActionView | null;
  createdAt: string;
}

export interface SendMessageRequest {
  content: string;
}

export interface FormVersionSummary {
  id: string;
  versionNumber: number;
  source: VersionSource;
  createdAt: string;
}

export interface FormVersionView extends FormVersionSummary {
  draftId: string;
  schema: FormSchema;
}

export interface PublicationView {
  jobId: string;
  status: PublishJobStatus;
  currentStep: PublishStep;
  versionId: string;
  error: string | null;
  googleFormId: string | null;
  responderUrl: string | null;
  editUrl: string | null;
  updatedAt: string;
}

export interface DraftView {
  id: string;
  conversationId: string;
  title: string;
  status: DraftStatus;
  currentVersion: FormVersionView;
  publication: PublicationView | null;
  updatedAt: string;
}

export interface SuggestedQuestionView {
  id: string;
  title: string;
  type: QuestionType;
}

export interface SendMessageResult {
  conversation: ConversationSummary;
  userMessage: MessageView;
  assistantMessage: MessageView;
  draft: DraftView | null;
  draftChanged: boolean;
}

export interface ApplyOperationsRequest {
  baseVersionId: string;
  operations: FormOperation[];
}

export interface RestoreVersionRequest {
  baseVersionId: string;
  restoreVersionId: string;
}

export type CreateDraftVersionRequest = ApplyOperationsRequest | RestoreVersionRequest;

export interface GoogleCapabilitiesView {
  forms: boolean;
  sheets: boolean;
}

export interface GoogleConnectionView {
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
  capabilities: GoogleCapabilitiesView;
}

export interface ExecuteSheetActionResult {
  action: SheetActionView;
  message: MessageView | null;
}

export interface PublishRequest {
  draftId: string;
  versionId: string;
}

export interface PublishResult {
  publication: PublicationView;
  message: MessageView | null;
}
