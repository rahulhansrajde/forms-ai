import type { QuestionInput } from '@forms-ai/contracts';

export const SUGGESTION_SET_STATUSES = ['PENDING', 'CONFIRMATION_REQUESTED', 'ACCEPTED', 'SUPERSEDED'] as const;

export type SuggestionSetStatus = (typeof SUGGESTION_SET_STATUSES)[number];

export interface SuggestedQuestion {
  id: string;
  question: QuestionInput;
}

export interface SuggestionSetProps {
  id: string;
  conversationId: string;
  draftId: string | null;
  status: SuggestionSetStatus;
  formTitle: string;
  baseQuestions: QuestionInput[];
  suggestions: SuggestedQuestion[];
  createdAt: Date;
  updatedAt: Date;
}

export interface NewSuggestionSet {
  id: string;
  conversationId: string;
  draftId: string | null;
  formTitle: string;
  baseQuestions: QuestionInput[];
  suggestions: SuggestedQuestion[];
}

export class SuggestionSet {
  private constructor(private readonly props: SuggestionSetProps) {}

  static propose(input: NewSuggestionSet, at: Date): SuggestionSet {
    return new SuggestionSet({ ...input, status: 'PENDING', createdAt: at, updatedAt: at });
  }

  static restore(props: SuggestionSetProps): SuggestionSet {
    return new SuggestionSet({ ...props });
  }

  get id(): string {
    return this.props.id;
  }

  get conversationId(): string {
    return this.props.conversationId;
  }

  get draftId(): string | null {
    return this.props.draftId;
  }

  get status(): SuggestionSetStatus {
    return this.props.status;
  }

  get formTitle(): string {
    return this.props.formTitle;
  }

  get baseQuestions(): QuestionInput[] {
    return structuredClone(this.props.baseQuestions);
  }

  get suggestions(): SuggestedQuestion[] {
    return structuredClone(this.props.suggestions);
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isOpen(): boolean {
    return this.props.status === 'PENDING' || this.props.status === 'CONFIRMATION_REQUESTED';
  }

  isAwaitingConfirmation(): boolean {
    return this.props.status === 'CONFIRMATION_REQUESTED';
  }

  selectByIds(ids: readonly string[]): SuggestedQuestion[] {
    const wanted = new Set(ids);
    return this.suggestions.filter((suggestion) => wanted.has(suggestion.id));
  }

  requestConfirmation(at: Date): SuggestionSet {
    return this.withStatus('CONFIRMATION_REQUESTED', at);
  }

  reopen(at: Date): SuggestionSet {
    return this.withStatus('PENDING', at);
  }

  accept(at: Date): SuggestionSet {
    return this.withStatus('ACCEPTED', at);
  }

  supersede(at: Date): SuggestionSet {
    return this.withStatus('SUPERSEDED', at);
  }

  private withStatus(status: SuggestionSetStatus, at: Date): SuggestionSet {
    return new SuggestionSet({ ...this.props, status, updatedAt: at });
  }
}
