import type { FormSchema } from '@forms-ai/contracts';
import type { IdentifierGenerator } from '../../src/domain/interfaces/system.js';
import { FormBlueprintBuilder } from '../../src/domain/services/form-blueprint-builder.js';
import { FormElementIdFactory } from '../../src/domain/services/form-element-id-factory.js';
import { FormOperationApplier } from '../../src/domain/services/form-operation-applier.js';
import { FormOperationParser } from '../../src/domain/services/form-operation-parser.js';
import { FormSchemaValidator } from '../../src/domain/services/form-schema-validator.js';
import { QuestionFactory } from '../../src/domain/services/question-factory.js';
import { QuestionNormalizer } from '../../src/domain/services/question-normalizer.js';

export class SequentialIdentifiers implements IdentifierGenerator {
  private next = 0;

  generate(): string {
    this.next += 1;
    return `00000000-0000-4000-8000-${String(this.next).padStart(12, '0')}`;
  }
}

export function formServices() {
  const normalizer = new QuestionNormalizer();
  const validator = new FormSchemaValidator(normalizer);
  const elementIds = new FormElementIdFactory(new SequentialIdentifiers());
  const questions = new QuestionFactory(elementIds, normalizer);
  return {
    normalizer,
    validator,
    parser: new FormOperationParser(),
    applier: new FormOperationApplier(elementIds, questions, normalizer, validator),
    blueprints: new FormBlueprintBuilder(elementIds, questions, validator),
  };
}

export function sampleForm(): FormSchema {
  return {
    title: 'College Hackathon Registration',
    description: 'Register for the hackathon',
    sections: [
      {
        id: 'section_1',
        title: 'Participant Information',
        description: '',
        questions: [
          { id: 'question_1', type: 'SHORT_ANSWER', title: 'Full Name', description: '', required: true },
          { id: 'question_2', type: 'EMAIL', title: 'Email Address', description: '', required: false },
          { id: 'question_3', type: 'SHORT_ANSWER', title: 'Phone Number', description: '', required: false },
        ],
      },
      {
        id: 'section_2',
        title: 'Team Details',
        description: '',
        questions: [
          { id: 'question_4', type: 'SHORT_ANSWER', title: 'Team Name', description: '', required: true },
          { id: 'question_5', type: 'DROPDOWN', title: 'Team Size', description: '', required: true, options: ['1', '2', '3'] },
        ],
      },
    ],
  };
}
