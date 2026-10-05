import { FORM_LIMITS, countQuestions, type FormSchema } from '@forms-ai/contracts';
import { ValidationError } from '../../shared/errors/application-errors.js';
import { toValidationError } from '../../shared/utilities/validation-issues.js';
import { storedFormSchemaSchema } from './form-schema-definitions.js';
import type { QuestionNormalizer } from './question-normalizer.js';

export class FormSchemaValidator {
  constructor(private readonly normalizer: QuestionNormalizer) {}

  validate(candidate: unknown): FormSchema {
    const parsed = storedFormSchemaSchema.safeParse(candidate);
    if (!parsed.success) {
      throw toValidationError(parsed.error, 'The form is not valid.');
    }
    const schema: FormSchema = {
      ...parsed.data,
      sections: parsed.data.sections.map((section) => ({
        ...section,
        questions: section.questions.map((question) => this.normalizer.normalize(question)),
      })),
    };
    this.assertQuestionLimit(schema);
    this.assertUniqueIdentifiers(schema);
    return schema;
  }

  private assertQuestionLimit(schema: FormSchema): void {
    if (countQuestions(schema) > FORM_LIMITS.maxQuestions) {
      throw new ValidationError(`A form can have at most ${FORM_LIMITS.maxQuestions} questions.`);
    }
  }

  private assertUniqueIdentifiers(schema: FormSchema): void {
    const identifiers = new Set<string>();
    for (const section of schema.sections) {
      this.claimIdentifier(identifiers, section.id);
      for (const question of section.questions) {
        this.claimIdentifier(identifiers, question.id);
      }
    }
  }

  private claimIdentifier(identifiers: Set<string>, identifier: string): void {
    if (identifiers.has(identifier)) {
      throw new ValidationError('Every section and question needs a unique identifier.', { identifier });
    }
    identifiers.add(identifier);
  }
}
