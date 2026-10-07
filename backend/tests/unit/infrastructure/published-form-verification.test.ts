import type { FormSchema } from '@forms-ai/contracts';
import { describe, expect, it } from 'vitest';
import type { GoogleFormSnapshot } from '../../../src/domain/interfaces/google.js';
import { GoogleFormItemNormalizer } from '../../../src/infrastructure/google/google-form-item-normalizer.js';
import { GoogleFormRequestBuilder } from '../../../src/infrastructure/google/google-form-request-builder.js';
import { GoogleFormSnapshotVerifier } from '../../../src/infrastructure/google/google-form-snapshot-verifier.js';
import { technovaVersion3 } from '../../support/technova-hackathon.js';

const requests = new GoogleFormRequestBuilder();
const normalizer = new GoogleFormItemNormalizer();
const verifier = new GoogleFormSnapshotVerifier(requests, normalizer);

function snapshotOf(schema: FormSchema): GoogleFormSnapshot {
  return {
    formId: 'form-1',
    title: schema.title,
    description: schema.description,
    links: { responderUrl: 'https://docs.google.com/forms/d/e/form-1/viewform', editUrl: 'https://docs.google.com/forms/d/form-1/edit' },
    items: requests.buildCreateItemRequests(schema).map((request) => normalizer.normalize(request.createItem.item)),
  };
}

describe('Google Form items for TechNova Hackathon 2026 version 3', () => {
  it('builds every section and all 17 questions in order with page breaks before sections 2 and 3', () => {
    const items = requests.buildCreateItemRequests(technovaVersion3).map((request) => normalizer.normalize(request.createItem.item));
    expect(items.map((item) => item.kind)).toEqual([
      'TEXT',
      ...Array<string>(7).fill('QUESTION'),
      'PAGE_BREAK',
      ...Array<string>(4).fill('QUESTION'),
      'PAGE_BREAK',
      ...Array<string>(6).fill('QUESTION'),
    ]);
    expect(items.filter((item) => item.kind !== 'QUESTION').map((item) => item.title)).toEqual([
      'Team Leader Information',
      'Team Details',
      'Project Information',
    ]);
    const questions = items.filter((item) => item.kind === 'QUESTION');
    const expected = technovaVersion3.sections.flatMap((section) => section.questions);
    expect(questions.map((item) => item.title)).toEqual(expected.map((question) => question.title));
    expect(questions.every((item) => item.question?.required)).toBe(true);
    expect(questions.map((item) => item.question?.options)).toEqual(expected.map((question) => question.options ?? []));
    expect(questions.map((item) => item.question?.kind)).toEqual([
      'TEXT',
      'TEXT',
      'TEXT',
      'TEXT',
      'CHOICE_DROP_DOWN',
      'TEXT',
      'CHOICE_DROP_DOWN',
      'TEXT',
      'CHOICE_DROP_DOWN',
      'PARAGRAPH_TEXT',
      'CHOICE_CHECKBOX',
      'CHOICE_DROP_DOWN',
      'CHOICE_RADIO',
      'TEXT',
      'PARAGRAPH_TEXT',
      'PARAGRAPH_TEXT',
      'CHOICE_DROP_DOWN',
    ]);
    expect(questions[9]?.description).toBe('List the names of all team members (one per line)');
  });
});

describe('GoogleFormSnapshotVerifier', () => {
  it('accepts a Google Form that contains the complete version', () => {
    expect(verifier.verify(technovaVersion3, snapshotOf(technovaVersion3))).toEqual({
      expected: { sections: 3, questions: 17 },
      actual: { sections: 3, questions: 17 },
      mismatches: [],
    });
  });

  it('rejects a Google Form that only contains the first section', () => {
    const partial = snapshotOf({ ...technovaVersion3, sections: technovaVersion3.sections.slice(0, 1) });
    const verification = verifier.verify(technovaVersion3, partial);
    expect(verification.actual).toEqual({ sections: 1, questions: 7 });
    expect(verification.mismatches[0]).toBe('expected 20 items but found 8');
    expect(verification.mismatches).toContain('item 9 “Team Details” is missing');
    expect(verification.mismatches).toContain('item 20 “Preferred Role in the Team” is missing');
  });

  it('detects changed order, required flags, options, types and form details', () => {
    const snapshot = snapshotOf(technovaVersion3);
    const items = [...snapshot.items];
    [items[1], items[2]] = [items[2]!, items[1]!];
    items[5] = { ...items[5]!, question: { ...items[5]!.question!, required: false, options: ['Computer Science'] } };
    items[7] = { ...items[7]!, question: { ...items[7]!.question!, kind: 'CHOICE_RADIO' } };
    const mismatches = verifier.verify(technovaVersion3, { ...snapshot, title: 'Other', description: '', items }).mismatches;
    expect(mismatches).toEqual(
      expect.arrayContaining([
        'the form title differs',
        'the form description differs',
        'item 2 “Team leader name” has the title “Email address”',
        'item 6 “Department” should be required',
        'item 6 “Department” has different options',
        'item 8 “Year of study” has the wrong question type',
      ]),
    );
  });

  it('treats values Google omits as defaults so optional questions still match', () => {
    const optional: FormSchema = {
      title: 'Feedback',
      description: '',
      sections: [
        {
          id: 's1',
          title: '',
          description: '',
          questions: [
            { id: 'q1', type: 'SHORT_ANSWER', title: 'Comment', description: '', required: false },
            { id: 'q2', type: 'LINEAR_SCALE', title: 'Score', description: '', required: false, scale: { min: 0, max: 5, minLabel: '', maxLabel: '' } },
          ],
        },
      ],
    };
    const fromGoogle: GoogleFormSnapshot = {
      ...snapshotOf(optional),
      items: [
        normalizer.normalize({ itemId: 'a', title: 'Comment', questionItem: { question: { questionId: 'x', textQuestion: {} } } }),
        normalizer.normalize({ itemId: 'b', title: 'Score', questionItem: { question: { questionId: 'y', scaleQuestion: { high: 5 } } } }),
      ],
    };
    expect(verifier.verify(optional, fromGoogle).mismatches).toEqual([]);
  });
});
