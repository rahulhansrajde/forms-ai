import type { FormQuestion, FormSchema, FormSection } from '@forms-ai/contracts';

export interface GoogleFormItem {
  title: string;
  description?: string;
  questionItem?: { question: Record<string, unknown> };
  pageBreakItem?: Record<string, never>;
  textItem?: Record<string, never>;
}

export interface GoogleCreateItemRequest {
  createItem: { item: GoogleFormItem; location: { index: number } };
}

const CHOICE_TYPES: Readonly<Record<string, string>> = {
  MULTIPLE_CHOICE: 'RADIO',
  CHECKBOXES: 'CHECKBOX',
  DROPDOWN: 'DROP_DOWN',
};

export class GoogleFormRequestBuilder {
  buildCreateItemRequests(schema: FormSchema): GoogleCreateItemRequest[] {
    const items = schema.sections.flatMap((section, index) => this.sectionItems(section, index));
    return items.map((item, index) => ({ createItem: { item, location: { index } } }));
  }

  buildDeleteItemRequests(existingItemCount: number): Array<{ deleteItem: { location: { index: number } } }> {
    return Array.from({ length: existingItemCount }, () => ({ deleteItem: { location: { index: 0 } } }));
  }

  private sectionItems(section: FormSection, sectionIndex: number): GoogleFormItem[] {
    const header = this.sectionHeader(section, sectionIndex);
    return [...(header ? [header] : []), ...section.questions.map((question) => this.questionItem(question))];
  }

  private sectionHeader(section: FormSection, sectionIndex: number): GoogleFormItem | null {
    if (sectionIndex > 0) {
      return this.withDescription({ title: this.singleLine(section.title) || `Section ${sectionIndex + 1}`, pageBreakItem: {} }, section.description);
    }
    if (section.title.trim().length > 0) {
      return this.withDescription({ title: this.singleLine(section.title), textItem: {} }, section.description);
    }
    return null;
  }

  private questionItem(question: FormQuestion): GoogleFormItem {
    return this.withDescription(
      {
        title: this.singleLine(question.title),
        questionItem: { question: { required: question.required, ...this.questionKind(question) } },
      },
      question.description,
    );
  }

  private questionKind(question: FormQuestion): Record<string, unknown> {
    switch (question.type) {
      case 'SHORT_ANSWER':
      case 'EMAIL':
        return { textQuestion: { paragraph: false } };
      case 'PARAGRAPH':
        return { textQuestion: { paragraph: true } };
      case 'MULTIPLE_CHOICE':
      case 'CHECKBOXES':
      case 'DROPDOWN':
        return {
          choiceQuestion: {
            type: CHOICE_TYPES[question.type],
            options: (question.options ?? []).map((value) => ({ value })),
          },
        };
      case 'LINEAR_SCALE':
        return {
          scaleQuestion: {
            low: question.scale?.min ?? 1,
            high: question.scale?.max ?? 5,
            ...(question.scale?.minLabel ? { lowLabel: question.scale.minLabel } : {}),
            ...(question.scale?.maxLabel ? { highLabel: question.scale.maxLabel } : {}),
          },
        };
      case 'DATE':
        return { dateQuestion: { includeYear: true, includeTime: false } };
      case 'TIME':
        return { timeQuestion: { duration: false } };
    }
  }

  private withDescription(item: GoogleFormItem, description: string): GoogleFormItem {
    return description.trim().length > 0 ? { ...item, description } : item;
  }

  private singleLine(text: string): string {
    return text.replace(/\s*\n\s*/g, ' ').trim();
  }
}
