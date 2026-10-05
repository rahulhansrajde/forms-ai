import type { ChatIntent } from '@forms-ai/contracts';
import type { Conversation } from '../../../domain/entities/conversation.js';
import type { FormDraft } from '../../../domain/entities/form-draft.js';
import type { FormVersion } from '../../../domain/entities/form-version.js';
import type { SuggestionSet } from '../../../domain/entities/suggestion-set.js';
import type { AIConversationContext } from '../../../domain/interfaces/ai-provider.js';

export interface ChatTurnContext {
  userId: string;
  conversation: Conversation;
  draft: FormDraft | null;
  currentVersion: FormVersion | null;
  openSuggestions: SuggestionSet | null;
  ai: AIConversationContext;
}

export interface IntentDecision {
  intent: ChatIntent;
  clarification: string | null;
  acceptAllSuggestions: boolean;
  requestsSuggestionConfirmation: boolean;
}

export interface ChangedDraft {
  draft: FormDraft;
  version: FormVersion;
}

export interface IntentOutcome {
  intent: ChatIntent;
  reply: string;
  changedDraft: ChangedDraft | null;
}
