import type { LinearScale, QuestionType } from './form-schema.js';

export const FORM_OPERATION_TYPES = [
  'UPDATE_TITLE',
  'UPDATE_DESCRIPTION',
  'ADD_SECTION',
  'UPDATE_SECTION',
  'REMOVE_SECTION',
  'REORDER_SECTION',
  'ADD_QUESTION',
  'UPDATE_QUESTION',
  'REMOVE_QUESTION',
  'REORDER_QUESTION',
] as const;

export type FormOperationType = (typeof FORM_OPERATION_TYPES)[number];

export interface QuestionInput {
  type: QuestionType;
  title: string;
  description?: string;
  required?: boolean;
  options?: string[];
  scale?: LinearScale;
}

export interface QuestionChanges {
  type?: QuestionType;
  title?: string;
  description?: string;
  required?: boolean;
  options?: string[];
  scale?: LinearScale;
}

export interface UpdateTitleOperation {
  type: 'UPDATE_TITLE';
  title: string;
}

export interface UpdateDescriptionOperation {
  type: 'UPDATE_DESCRIPTION';
  description: string;
}

export interface AddSectionOperation {
  type: 'ADD_SECTION';
  title: string;
  description?: string;
  index?: number;
}

export interface UpdateSectionOperation {
  type: 'UPDATE_SECTION';
  sectionId: string;
  title?: string;
  description?: string;
}

export interface RemoveSectionOperation {
  type: 'REMOVE_SECTION';
  sectionId: string;
}

export interface ReorderSectionOperation {
  type: 'REORDER_SECTION';
  sectionId: string;
  index: number;
}

export interface AddQuestionOperation {
  type: 'ADD_QUESTION';
  question: QuestionInput;
  sectionId?: string;
  index?: number;
}

export interface UpdateQuestionOperation {
  type: 'UPDATE_QUESTION';
  questionId: string;
  changes: QuestionChanges;
}

export interface RemoveQuestionOperation {
  type: 'REMOVE_QUESTION';
  questionId: string;
}

export interface ReorderQuestionOperation {
  type: 'REORDER_QUESTION';
  questionId: string;
  sectionId?: string;
  index: number;
}

export type FormOperation =
  | UpdateTitleOperation
  | UpdateDescriptionOperation
  | AddSectionOperation
  | UpdateSectionOperation
  | RemoveSectionOperation
  | ReorderSectionOperation
  | AddQuestionOperation
  | UpdateQuestionOperation
  | RemoveQuestionOperation
  | ReorderQuestionOperation;
