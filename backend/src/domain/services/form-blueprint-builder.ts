import type { FormSchema } from '@forms-ai/contracts';
import { toValidationError } from '../../shared/utilities/validation-issues.js';
import type { FormElementIdFactory } from './form-element-id-factory.js';
import { formBlueprintSchema } from './form-schema-definitions.js';
import type { FormSchemaValidator } from './form-schema-validator.js';
import type { QuestionFactory } from './question-factory.js';

export class FormBlueprintBuilder {
  constructor(
    private readonly elementIds: FormElementIdFactory,
    private readonly questions: QuestionFactory,
    private readonly validator: FormSchemaValidator,
  ) {}

  build(candidate: unknown): FormSchema {
    const parsed = formBlueprintSchema.safeParse(candidate);
    if (!parsed.success) {
      throw toValidationError(parsed.error, 'The generated form is not valid.');
    }
    const blueprint = parsed.data;
    return this.validator.validate({
      title: blueprint.title,
      description: blueprint.description,
      sections: blueprint.sections.map((section) => ({
        id: this.elementIds.nextSectionId(),
        title: section.title,
        description: section.description,
        questions: section.questions.map((question) => this.questions.create(question)),
      })),
    });
  }
}
