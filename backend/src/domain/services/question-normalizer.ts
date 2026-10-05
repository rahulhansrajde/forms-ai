import { isChoiceQuestionType, type FormQuestion, type LinearScale } from '@forms-ai/contracts';

const DEFAULT_OPTION = 'Option 1';

const DEFAULT_LINEAR_SCALE: LinearScale = { min: 1, max: 5, minLabel: '', maxLabel: '' };

export class QuestionNormalizer {
  normalize(question: FormQuestion): FormQuestion {
    const base: FormQuestion = {
      id: question.id,
      type: question.type,
      title: question.title,
      description: question.description,
      required: question.required,
    };
    if (isChoiceQuestionType(question.type)) {
      return { ...base, options: this.normalizeOptions(question.options) };
    }
    if (question.type === 'LINEAR_SCALE') {
      return { ...base, scale: { ...(question.scale ?? DEFAULT_LINEAR_SCALE) } };
    }
    return base;
  }

  private normalizeOptions(options: readonly string[] | undefined): string[] {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const option of options ?? []) {
      const trimmed = option.trim();
      const key = trimmed.toLowerCase();
      if (trimmed.length > 0 && !seen.has(key)) {
        seen.add(key);
        unique.push(trimmed);
      }
    }
    return unique.length > 0 ? unique : [DEFAULT_OPTION];
  }
}
