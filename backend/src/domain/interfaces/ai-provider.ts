import type { FormSchema, MessageRole } from '@forms-ai/contracts';
import type { SuggestedQuestion } from '../entities/suggestion-set.js';

export interface ConversationTurn {
  role: MessageRole;
  content: string;
}

export interface AIConversationContext {
  recentTurns: ConversationTurn[];
  currentForm: FormSchema | null;
  openSuggestions: SuggestedQuestion[];
}

export interface FormGenerationRequest {
  instruction: string;
  basis: FormSchema | null;
  context: AIConversationContext;
}

export interface SuggestionRequest {
  instruction: string;
  excludedQuestionTitles: string[];
  context: AIConversationContext;
}

export interface AIProvider {
  classifyIntent(message: string, context: AIConversationContext): Promise<unknown>;
  generateForm(request: FormGenerationRequest): Promise<unknown>;
  planFormOperations(instruction: string, form: FormSchema, context: AIConversationContext): Promise<unknown>;
  suggestQuestions(request: SuggestionRequest): Promise<unknown>;
  selectSuggestions(message: string, suggestions: SuggestedQuestion[]): Promise<unknown>;
  reply(message: string, context: AIConversationContext): Promise<string>;
}
