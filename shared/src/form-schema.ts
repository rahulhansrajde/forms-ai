export const QUESTION_TYPES = [
  'SHORT_ANSWER',
  'PARAGRAPH',
  'EMAIL',
  'MULTIPLE_CHOICE',
  'CHECKBOXES',
  'DROPDOWN',
  'LINEAR_SCALE',
  'DATE',
  'TIME',
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const CHOICE_QUESTION_TYPES = ['MULTIPLE_CHOICE', 'CHECKBOXES', 'DROPDOWN'] as const;

export type ChoiceQuestionType = (typeof CHOICE_QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Readonly<Record<QuestionType, string>> = {
  SHORT_ANSWER: 'Short answer',
  PARAGRAPH: 'Paragraph',
  EMAIL: 'Email',
  MULTIPLE_CHOICE: 'Multiple choice',
  CHECKBOXES: 'Checkboxes',
  DROPDOWN: 'Dropdown',
  LINEAR_SCALE: 'Linear scale',
  DATE: 'Date',
  TIME: 'Time',
};

export interface LinearScale {
  min: 0 | 1;
  max: number;
  minLabel: string;
  maxLabel: string;
}

export interface FormQuestion {
  id: string;
  type: QuestionType;
  title: string;
  description: string;
  required: boolean;
  options?: string[];
  scale?: LinearScale;
}

export interface FormSection {
  id: string;
  title: string;
  description: string;
  questions: FormQuestion[];
}

export interface FormSchema {
  title: string;
  description: string;
  sections: FormSection[];
}

export const FORM_LIMITS = {
  titleMaxLength: 300,
  descriptionMaxLength: 4000,
  maxSections: 50,
  maxQuestions: 200,
  maxOptions: 100,
  optionMaxLength: 300,
  scaleMaxUpperBound: 10,
  scaleMinUpperBound: 2,
  scaleLabelMaxLength: 100,
} as const;

export function isQuestionType(value: unknown): value is QuestionType {
  return typeof value === 'string' && (QUESTION_TYPES as readonly string[]).includes(value);
}

export function isChoiceQuestionType(type: QuestionType): type is ChoiceQuestionType {
  return (CHOICE_QUESTION_TYPES as readonly string[]).includes(type);
}

export function countQuestions(schema: FormSchema): number {
  return schema.sections.reduce((total, section) => total + section.questions.length, 0);
}
