import type { FormSchema, MessageRole, SheetPlanKind, SheetTableView, SpreadsheetOrigin } from '@forms-ai/contracts';
import type { SuggestedQuestion } from '../entities/suggestion-set.js';

export interface ConversationTurn {
  role: MessageRole;
  content: string;
}

export interface SpreadsheetContext {
  title: string;
  origin?: SpreadsheetOrigin;
  tabs: Array<{ title: string; rowCount: number; columnCount: number; headers: string[] }>;
}

export interface RecentRecordContext {
  label: string;
  tab: string;
  identifiers: Record<string, string>;
}

export interface AIConversationContext {
  recentTurns: ConversationTurn[];
  currentForm: FormSchema | null;
  openSuggestions: SuggestedQuestion[];
  currentSpreadsheet?: SpreadsheetContext | null;
  recentRecord?: RecentRecordContext | null;
}

export interface SheetPlanRequest {
  instruction: string;
  kind: SheetPlanKind;
  context: AIConversationContext;
}

export interface SheetSummaryRequest {
  instruction: string;
  spreadsheetTitle: string;
  table: SheetTableView;
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
  planSheetAction(request: SheetPlanRequest): Promise<unknown>;
  summarizeSheetData(request: SheetSummaryRequest): Promise<string>;
  reply(message: string, context: AIConversationContext): Promise<string>;
}
