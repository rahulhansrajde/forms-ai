import type { FormSchema } from '@forms-ai/contracts';
import type {
  GoogleFormSnapshot,
  PublishedFormCounts,
  PublishedFormItem,
  PublishedFormVerification,
  PublishedFormVerifier,
  PublishedQuestion,
} from '../../domain/interfaces/google.js';
import type { GoogleFormItemNormalizer } from './google-form-item-normalizer.js';
import type { GoogleFormRequestBuilder } from './google-form-request-builder.js';

export class GoogleFormSnapshotVerifier implements PublishedFormVerifier {
  constructor(
    private readonly requests: GoogleFormRequestBuilder,
    private readonly normalizer: GoogleFormItemNormalizer,
  ) {}

  verify(schema: FormSchema, snapshot: GoogleFormSnapshot): PublishedFormVerification {
    const expectedItems = this.requests.buildCreateItemRequests(schema).map((request) => this.normalizer.normalize(request.createItem.item));
    return {
      expected: {
        sections: schema.sections.length,
        questions: schema.sections.reduce((total, section) => total + section.questions.length, 0),
      },
      actual: this.count(snapshot.items),
      mismatches: [...this.compareInfo(schema, snapshot), ...this.compareItems(expectedItems, snapshot.items)],
    };
  }

  private count(items: readonly PublishedFormItem[]): PublishedFormCounts {
    return {
      sections: 1 + items.filter((item) => item.kind === 'PAGE_BREAK').length,
      questions: items.filter((item) => item.kind === 'QUESTION').length,
    };
  }

  private compareInfo(schema: FormSchema, snapshot: GoogleFormSnapshot): string[] {
    const mismatches: string[] = [];
    if (schema.title.trim() !== snapshot.title) {
      mismatches.push('the form title differs');
    }
    if (schema.description.trim() !== snapshot.description) {
      mismatches.push('the form description differs');
    }
    return mismatches;
  }

  private compareItems(expected: readonly PublishedFormItem[], actual: readonly PublishedFormItem[]): string[] {
    const mismatches = expected.length === actual.length ? [] : [`expected ${expected.length} items but found ${actual.length}`];
    for (let index = 0; index < Math.max(expected.length, actual.length); index += 1) {
      const wanted = expected[index];
      const found = actual[index];
      if (!wanted) {
        mismatches.push(`unexpected item ${index + 1} “${found?.title ?? ''}”`);
      } else if (!found) {
        mismatches.push(`item ${index + 1} “${wanted.title}” is missing`);
      } else {
        mismatches.push(...this.compareItem(index + 1, wanted, found));
      }
    }
    return mismatches;
  }

  private compareItem(position: number, wanted: PublishedFormItem, found: PublishedFormItem): string[] {
    const label = `item ${position} “${wanted.title}”`;
    const differences: string[] = [];
    if (wanted.kind !== found.kind) {
      differences.push(`${label} is a ${found.kind.toLowerCase()} instead of a ${wanted.kind.toLowerCase()}`);
      return differences;
    }
    if (wanted.title !== found.title) {
      differences.push(`${label} has the title “${found.title}”`);
    }
    if (wanted.description !== found.description) {
      differences.push(`${label} has a different description`);
    }
    if (wanted.question && found.question) {
      differences.push(...this.compareQuestion(label, wanted.question, found.question));
    }
    return differences;
  }

  private compareQuestion(label: string, wanted: PublishedQuestion, found: PublishedQuestion): string[] {
    const differences: string[] = [];
    if (wanted.kind !== found.kind) {
      differences.push(`${label} has the wrong question type`);
    }
    if (wanted.required !== found.required) {
      differences.push(`${label} should be ${wanted.required ? 'required' : 'optional'}`);
    }
    if (wanted.options.join('\u0000') !== found.options.join('\u0000')) {
      differences.push(`${label} has different options`);
    }
    if (JSON.stringify(wanted.scale) !== JSON.stringify(found.scale)) {
      differences.push(`${label} has a different scale`);
    }
    return differences;
  }
}
