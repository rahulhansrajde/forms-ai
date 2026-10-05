import type { FormQuestion, QuestionInput } from '@forms-ai/contracts';
import type { FormElementIdFactory } from './form-element-id-factory.js';
import type { QuestionNormalizer } from './question-normalizer.js';

export class QuestionFactory {
  constructor(
    private readonly elementIds: FormElementIdFactory,
    private readonly normalizer: QuestionNormalizer,
  ) {}

  create(input: QuestionInput): FormQuestion {
    return this.normalizer.normalize({
      id: this.elementIds.nextQuestionId(),
      type: input.type,
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      required: input.required ?? false,
      ...(input.options ? { options: [...input.options] } : {}),
      ...(input.scale ? { scale: { ...input.scale } } : {}),
    });
  }
}
