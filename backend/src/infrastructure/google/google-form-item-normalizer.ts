import { z } from 'zod';
import type { PublishedFormItem, PublishedQuestion } from '../../domain/interfaces/google.js';

const questionSchema = z.looseObject({
  required: z.boolean().optional(),
  textQuestion: z.looseObject({ paragraph: z.boolean().optional() }).optional(),
  choiceQuestion: z
    .looseObject({ type: z.string().optional(), options: z.array(z.looseObject({ value: z.string().optional() })).optional() })
    .optional(),
  scaleQuestion: z
    .looseObject({
      low: z.number().optional(),
      high: z.number().optional(),
      lowLabel: z.string().optional(),
      highLabel: z.string().optional(),
    })
    .optional(),
  dateQuestion: z.looseObject({}).optional(),
  timeQuestion: z.looseObject({}).optional(),
});

const itemSchema = z.looseObject({
  title: z.string().optional(),
  description: z.string().optional(),
  questionItem: z.looseObject({ question: questionSchema }).optional(),
  pageBreakItem: z.looseObject({}).optional(),
  textItem: z.looseObject({}).optional(),
});

type RawQuestion = z.infer<typeof questionSchema>;
type RawItem = z.infer<typeof itemSchema>;

export class GoogleFormItemNormalizer {
  normalize(item: unknown): PublishedFormItem {
    const parsed = itemSchema.safeParse(item);
    if (!parsed.success) {
      return { kind: 'OTHER', title: '', description: '', question: null };
    }
    const raw = parsed.data;
    return {
      kind: this.itemKind(raw),
      title: (raw.title ?? '').trim(),
      description: (raw.description ?? '').trim(),
      question: raw.questionItem ? this.question(raw.questionItem.question) : null,
    };
  }

  private itemKind(raw: RawItem): PublishedFormItem['kind'] {
    if (raw.questionItem) {
      return 'QUESTION';
    }
    if (raw.pageBreakItem) {
      return 'PAGE_BREAK';
    }
    return raw.textItem ? 'TEXT' : 'OTHER';
  }

  private question(raw: RawQuestion): PublishedQuestion {
    return {
      kind: this.questionKind(raw),
      required: raw.required ?? false,
      options: (raw.choiceQuestion?.options ?? []).map((option) => (option.value ?? '').trim()),
      scale: raw.scaleQuestion
        ? {
            low: raw.scaleQuestion.low ?? 0,
            high: raw.scaleQuestion.high ?? 0,
            lowLabel: (raw.scaleQuestion.lowLabel ?? '').trim(),
            highLabel: (raw.scaleQuestion.highLabel ?? '').trim(),
          }
        : null,
    };
  }

  private questionKind(raw: RawQuestion): string {
    if (raw.textQuestion) {
      return raw.textQuestion.paragraph ? 'PARAGRAPH_TEXT' : 'TEXT';
    }
    if (raw.choiceQuestion) {
      return `CHOICE_${raw.choiceQuestion.type ?? 'UNSPECIFIED'}`;
    }
    if (raw.scaleQuestion) {
      return 'SCALE';
    }
    if (raw.dateQuestion) {
      return 'DATE';
    }
    return raw.timeQuestion ? 'TIME' : 'UNKNOWN';
  }
}
