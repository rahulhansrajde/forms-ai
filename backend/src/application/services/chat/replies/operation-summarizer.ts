import {
  QUESTION_TYPE_LABELS,
  type FormOperation,
  type FormQuestion,
  type FormSchema,
  type QuestionChanges,
} from '@forms-ai/contracts';
import { quoted } from './text-formatting.js';

export class OperationSummarizer {
  describe(operations: readonly FormOperation[], before: FormSchema): string[] {
    return operations.map((operation) => this.describeOne(operation, before));
  }

  private describeOne(operation: FormOperation, before: FormSchema): string {
    switch (operation.type) {
      case 'UPDATE_TITLE':
        return `Renamed the form to ${quoted(operation.title)}`;
      case 'UPDATE_DESCRIPTION':
        return 'Updated the form description';
      case 'ADD_SECTION':
        return `Added the section ${quoted(operation.title || 'Untitled section')}`;
      case 'UPDATE_SECTION':
        return `Updated the section ${quoted(this.sectionTitle(before, operation.sectionId))}`;
      case 'REMOVE_SECTION':
        return `Removed the section ${quoted(this.sectionTitle(before, operation.sectionId))}`;
      case 'REORDER_SECTION':
        return `Moved the section ${quoted(this.sectionTitle(before, operation.sectionId))}`;
      case 'ADD_QUESTION':
        return `Added ${quoted(operation.question.title)}`;
      case 'UPDATE_QUESTION':
        return this.describeQuestionChanges(this.findQuestion(before, operation.questionId), operation.changes);
      case 'REMOVE_QUESTION':
        return `Removed ${quoted(this.questionTitle(before, operation.questionId))}`;
      case 'REORDER_QUESTION':
        return `Moved ${quoted(this.questionTitle(before, operation.questionId))}`;
    }
  }

  private describeQuestionChanges(question: FormQuestion | null, changes: QuestionChanges): string {
    const title = quoted(question?.title ?? 'the question');
    const details: string[] = [];
    if (changes.title !== undefined && changes.title !== question?.title) {
      details.push(`renamed ${title} to ${quoted(changes.title)}`);
    }
    if (changes.required !== undefined) {
      details.push(`made ${title} ${changes.required ? 'required' : 'optional'}`);
    }
    if (changes.type !== undefined) {
      details.push(`changed ${title} to ${QUESTION_TYPE_LABELS[changes.type].toLowerCase()}`);
    }
    if (changes.options !== undefined) {
      details.push(`updated the options for ${title}`);
    }
    if (changes.description !== undefined) {
      details.push(`updated the description of ${title}`);
    }
    if (changes.scale !== undefined) {
      details.push(`updated the scale for ${title}`);
    }
    const summary = details.length > 0 ? details.join(', ') : `updated ${title}`;
    return summary.charAt(0).toUpperCase() + summary.slice(1);
  }

  private findQuestion(form: FormSchema, questionId: string): FormQuestion | null {
    for (const section of form.sections) {
      const question = section.questions.find((candidate) => candidate.id === questionId);
      if (question) {
        return question;
      }
    }
    return null;
  }

  private questionTitle(form: FormSchema, questionId: string): string {
    return this.findQuestion(form, questionId)?.title ?? 'a question';
  }

  private sectionTitle(form: FormSchema, sectionId: string): string {
    return form.sections.find((section) => section.id === sectionId)?.title || 'Untitled section';
  }
}
