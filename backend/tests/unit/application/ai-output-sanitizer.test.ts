import { describe, expect, it } from 'vitest';
import { suggestionProposalOutputSchema } from '../../../src/application/services/ai/ai-output-schemas.js';
import { AIOutputSanitizer } from '../../../src/application/services/ai/ai-output-sanitizer.js';
import { AIOutputValidator } from '../../../src/application/services/ai/ai-output-validator.js';
import { AIOutputRejectedError } from '../../../src/shared/errors/application-errors.js';

const placeholderScale = { min: 0, max: 0, minLabel: '', maxLabel: '' };

describe('AIOutputSanitizer', () => {
  const sanitizer = new AIOutputSanitizer();

  it('removes placeholder fields that do not apply to the question type', () => {
    expect(
      sanitizer.sanitize({
        suggestions: [
          { type: 'SHORT_ANSWER', title: 'Major', scale: placeholderScale, options: [], description: null },
          { type: 'LINEAR_SCALE', title: 'Rate', scale: { min: 1, max: 5, minLabel: 'Low', maxLabel: 'High' }, options: [] },
          { type: 'DROPDOWN', title: 'Size', options: ['S', 'M'], scale: placeholderScale },
          { type: 'PARAGRAPH', title: 'Notes', options: ['stray'] },
        ],
      }),
    ).toEqual({
      suggestions: [
        { type: 'SHORT_ANSWER', title: 'Major' },
        { type: 'LINEAR_SCALE', title: 'Rate', scale: { min: 1, max: 5, minLabel: 'Low', maxLabel: 'High' } },
        { type: 'DROPDOWN', title: 'Size', options: ['S', 'M'] },
        { type: 'PARAGRAPH', title: 'Notes' },
      ],
    });
  });

  it('drops placeholder scales from partial question changes', () => {
    expect(sanitizer.sanitize({ type: 'UPDATE_QUESTION', questionId: 'q', changes: { required: true, scale: placeholderScale } })).toEqual({
      type: 'UPDATE_QUESTION',
      questionId: 'q',
      changes: { required: true },
    });
  });

  it('leaves non-objects untouched and still lets validation reject real problems', () => {
    expect(sanitizer.sanitize('plain text')).toBe('plain text');
    const validator = new AIOutputValidator(sanitizer);
    expect(
      validator.parse(
        suggestionProposalOutputSchema,
        { formTitle: 'Form', suggestions: [{ type: 'SHORT_ANSWER', title: 'Major', scale: placeholderScale }] },
        'suggestions',
      ).suggestions,
    ).toEqual([{ type: 'SHORT_ANSWER', title: 'Major', description: '', required: false }]);
    expect(() =>
      validator.parse(suggestionProposalOutputSchema, { formTitle: 'Form', suggestions: [{ type: 'LINEAR_SCALE', title: 'Rate', scale: { min: 7, max: 5 } }] }, 'suggestions'),
    ).toThrow(AIOutputRejectedError);
  });
});
