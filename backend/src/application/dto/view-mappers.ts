import type {
  ConversationSummary,
  FormVersionSummary,
  FormVersionView,
  GoogleConnectionView,
  MessageView,
  PublicationView,
  UserView,
} from '@forms-ai/contracts';
import type { Conversation } from '../../domain/entities/conversation.js';
import type { CreatedGoogleForm } from '../../domain/entities/created-google-form.js';
import type { FormVersion } from '../../domain/entities/form-version.js';
import type { GoogleAccountConnection } from '../../domain/entities/google-account-connection.js';
import type { Message } from '../../domain/entities/message.js';
import type { PublishJob } from '../../domain/entities/publish-job.js';
import type { User } from '../../domain/entities/user.js';

export function toUserView(user: User): UserView {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toConversationSummary(conversation: Conversation): ConversationSummary {
  return { id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt.toISOString() };
}

export function toMessageView(message: Message): MessageView {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    intent: message.intent,
    createdAt: message.createdAt.toISOString(),
  };
}

export function toVersionSummary(version: FormVersion): FormVersionSummary {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    source: version.source,
    createdAt: version.createdAt.toISOString(),
  };
}

export function toVersionView(version: FormVersion): FormVersionView {
  return { ...toVersionSummary(version), draftId: version.draftId, schema: version.schema };
}

export function toGoogleConnectionView(connection: GoogleAccountConnection | null): GoogleConnectionView {
  return connection
    ? { connected: true, email: connection.email, connectedAt: connection.createdAt.toISOString() }
    : { connected: false, email: null, connectedAt: null };
}

export function toPublicationView(job: PublishJob, createdForm: CreatedGoogleForm | null): PublicationView {
  const completed = createdForm?.isComplete() ? createdForm : null;
  return {
    jobId: job.id,
    status: job.status,
    currentStep: job.currentStep,
    versionId: job.versionId,
    error: job.error,
    googleFormId: completed?.googleFormId ?? null,
    responderUrl: completed?.responderUrl ?? null,
    editUrl: completed?.editUrl ?? null,
    updatedAt: job.updatedAt.toISOString(),
  };
}
