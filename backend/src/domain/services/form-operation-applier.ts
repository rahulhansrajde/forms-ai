import type {
  AddQuestionOperation,
  AddSectionOperation,
  FormOperation,
  FormQuestion,
  FormSchema,
  FormSection,
  ReorderQuestionOperation,
  UpdateQuestionOperation,
  UpdateSectionOperation,
} from '@forms-ai/contracts';
import { ValidationError } from '../../shared/errors/application-errors.js';
import type { FormElementIdFactory } from './form-element-id-factory.js';
import type { FormSchemaValidator } from './form-schema-validator.js';
import type { QuestionFactory } from './question-factory.js';
import type { QuestionNormalizer } from './question-normalizer.js';

interface QuestionLocation {
  section: FormSection;
  index: number;
}

export class FormOperationApplier {
  constructor(
    private readonly elementIds: FormElementIdFactory,
    private readonly questions: QuestionFactory,
    private readonly normalizer: QuestionNormalizer,
    private readonly validator: FormSchemaValidator,
  ) {}

  apply(schema: FormSchema, operations: readonly FormOperation[]): FormSchema {
    const working = structuredClone(schema);
    for (const operation of operations) {
      this.applyOne(working, operation);
    }
    return this.validator.validate(working);
  }

  private applyOne(form: FormSchema, operation: FormOperation): void {
    switch (operation.type) {
      case 'UPDATE_TITLE':
        form.title = operation.title;
        return;
      case 'UPDATE_DESCRIPTION':
        form.description = operation.description;
        return;
      case 'ADD_SECTION':
        this.addSection(form, operation);
        return;
      case 'UPDATE_SECTION':
        this.updateSection(form, operation);
        return;
      case 'REMOVE_SECTION':
        this.removeSection(form, operation.sectionId);
        return;
      case 'REORDER_SECTION':
        this.moveSection(form, operation.sectionId, operation.index);
        return;
      case 'ADD_QUESTION':
        this.addQuestion(form, operation);
        return;
      case 'UPDATE_QUESTION':
        this.updateQuestion(form, operation);
        return;
      case 'REMOVE_QUESTION':
        this.removeQuestion(form, operation.questionId);
        return;
      case 'REORDER_QUESTION':
        this.moveQuestion(form, operation);
        return;
    }
  }

  private addSection(form: FormSchema, operation: AddSectionOperation): void {
    const section: FormSection = {
      id: this.elementIds.nextSectionId(),
      title: operation.title,
      description: operation.description ?? '',
      questions: [],
    };
    this.insertAt(form.sections, section, operation.index);
  }

  private updateSection(form: FormSchema, operation: UpdateSectionOperation): void {
    const section = this.requireSection(form, operation.sectionId);
    if (operation.title !== undefined) {
      section.title = operation.title;
    }
    if (operation.description !== undefined) {
      section.description = operation.description;
    }
  }

  private removeSection(form: FormSchema, sectionId: string): void {
    const section = this.requireSection(form, sectionId);
    if (form.sections.length === 1) {
      throw new ValidationError('A form needs at least one section.');
    }
    form.sections.splice(form.sections.indexOf(section), 1);
  }

  private moveSection(form: FormSchema, sectionId: string, index: number): void {
    const section = this.requireSection(form, sectionId);
    form.sections.splice(form.sections.indexOf(section), 1);
    this.insertAt(form.sections, section, index);
  }

  private addQuestion(form: FormSchema, operation: AddQuestionOperation): void {
    const section = operation.sectionId ? this.requireSection(form, operation.sectionId) : this.lastSection(form);
    this.insertAt(section.questions, this.questions.create(operation.question), operation.index);
  }

  private updateQuestion(form: FormSchema, operation: UpdateQuestionOperation): void {
    const location = this.requireQuestion(form, operation.questionId);
    const current = location.section.questions[location.index] as FormQuestion;
    location.section.questions[location.index] = this.normalizer.normalize({ ...current, ...operation.changes });
  }

  private removeQuestion(form: FormSchema, questionId: string): void {
    const location = this.requireQuestion(form, questionId);
    location.section.questions.splice(location.index, 1);
  }

  private moveQuestion(form: FormSchema, operation: ReorderQuestionOperation): void {
    const location = this.requireQuestion(form, operation.questionId);
    const target = operation.sectionId ? this.requireSection(form, operation.sectionId) : location.section;
    const [question] = location.section.questions.splice(location.index, 1);
    this.insertAt(target.questions, question as FormQuestion, operation.index);
  }

  private insertAt<T>(items: T[], item: T, index: number | undefined): void {
    const position = index === undefined ? items.length : Math.min(Math.max(index, 0), items.length);
    items.splice(position, 0, item);
  }

  private lastSection(form: FormSchema): FormSection {
    const section = form.sections[form.sections.length - 1];
    if (!section) {
      throw new ValidationError('A form needs at least one section.');
    }
    return section;
  }

  private requireSection(form: FormSchema, sectionId: string): FormSection {
    const section = form.sections.find((candidate) => candidate.id === sectionId);
    if (!section) {
      throw new ValidationError('The referenced section does not exist in this form.', { sectionId });
    }
    return section;
  }

  private requireQuestion(form: FormSchema, questionId: string): QuestionLocation {
    for (const section of form.sections) {
      const index = section.questions.findIndex((question) => question.id === questionId);
      if (index >= 0) {
        return { section, index };
      }
    }
    throw new ValidationError('The referenced question does not exist in this form.', { questionId });
  }
}
