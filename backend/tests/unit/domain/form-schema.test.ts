import { countQuestions } from '@forms-ai/contracts';
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../src/shared/errors/application-errors.js';
import { formServices, sampleForm } from '../../support/domain-fixtures.js';

describe('FormSchemaValidator', () => {
  const { validator } = formServices();

  it('accepts a valid schema and normalizes type-specific fields', () => {
    const form = sampleForm();
    form.sections[0]!.questions[0]!.options = ['should be dropped'];
    const validated = validator.validate(form);
    expect(validated.sections[0]!.questions[0]!.options).toBeUndefined();
    expect(validated.sections[1]!.questions[1]!.options).toEqual(['1', '2', '3']);
  });

  it('gives choice questions a default option and scales a default range', () => {
    const form = sampleForm();
    form.sections[0]!.questions.push(
      { id: 'question_6', type: 'CHECKBOXES', title: 'Skills', description: '', required: false, options: [] },
      { id: 'question_7', type: 'LINEAR_SCALE', title: 'Excitement', description: '', required: false },
    );
    const validated = validator.validate(form);
    expect(validated.sections[0]!.questions[3]!.options).toEqual(['Option 1']);
    expect(validated.sections[0]!.questions[4]!.scale).toEqual({ min: 1, max: 5, minLabel: '', maxLabel: '' });
  });

  it('removes duplicate options case-insensitively', () => {
    const form = sampleForm();
    form.sections[1]!.questions[1]!.options = ['Yes', 'yes', ' No '];
    expect(validator.validate(form).sections[1]!.questions[1]!.options).toEqual(['Yes', 'No']);
  });

  it.each([
    ['an unknown question type', (form: ReturnType<typeof sampleForm>) => ((form.sections[0]!.questions[0] as { type: string }).type = 'FILE_UPLOAD')],
    ['an empty title', (form: ReturnType<typeof sampleForm>) => (form.title = '   ')],
    ['no sections', (form: ReturnType<typeof sampleForm>) => (form.sections = [])],
    ['duplicate identifiers', (form: ReturnType<typeof sampleForm>) => (form.sections[1]!.questions[0]!.id = 'question_1')],
    ['an invalid scale', (form: ReturnType<typeof sampleForm>) => {
      form.sections[0]!.questions[0] = { id: 'q', type: 'LINEAR_SCALE', title: 'Rate', description: '', required: false, scale: { min: 1, max: 42, minLabel: '', maxLabel: '' } };
    }],
    ['unexpected properties', (form: ReturnType<typeof sampleForm>) => Object.assign(form, { script: 'alert(1)' })],
  ])('rejects %s', (_label, mutate) => {
    const form = sampleForm();
    mutate(form);
    expect(() => validator.validate(form)).toThrow(ValidationError);
  });
});

describe('FormOperationApplier', () => {
  const { applier, parser } = formServices();

  it('applies every supported operation without mutating the input', () => {
    const form = sampleForm();
    const snapshot = structuredClone(form);
    const result = applier.apply(form, [
      { type: 'UPDATE_TITLE', title: 'New Title' },
      { type: 'UPDATE_DESCRIPTION', description: 'New description' },
      { type: 'REMOVE_QUESTION', questionId: 'question_3' },
      { type: 'UPDATE_QUESTION', questionId: 'question_2', changes: { required: true } },
      { type: 'ADD_QUESTION', question: { type: 'DROPDOWN', title: 'Year of Study' }, sectionId: 'section_1', index: 0 },
      { type: 'REORDER_QUESTION', questionId: 'question_4', sectionId: 'section_1', index: 99 },
      { type: 'ADD_SECTION', title: 'Preferences', index: 1 },
      { type: 'UPDATE_SECTION', sectionId: 'section_2', title: 'Team' },
      { type: 'REORDER_SECTION', sectionId: 'section_2', index: 0 },
    ]);

    expect(form).toEqual(snapshot);
    expect(result.title).toBe('New Title');
    expect(result.description).toBe('New description');
    expect(result.sections.map((section) => section.title)).toEqual(['Team', 'Participant Information', 'Preferences']);
    const participant = result.sections[1]!;
    expect(participant.questions.map((question) => question.title)).toEqual(['Year of Study', 'Full Name', 'Email Address', 'Team Name']);
    expect(participant.questions[0]!.options).toEqual(['Option 1']);
    expect(participant.questions[2]!.required).toBe(true);
    expect(countQuestions(result)).toBe(5);
  });

  it('switches question types and keeps options consistent', () => {
    const result = applier.apply(sampleForm(), [
      { type: 'UPDATE_QUESTION', questionId: 'question_5', changes: { type: 'SHORT_ANSWER' } },
      { type: 'UPDATE_QUESTION', questionId: 'question_1', changes: { type: 'MULTIPLE_CHOICE', options: ['A', 'B'] } },
    ]);
    expect(result.sections[1]!.questions[1]!.options).toBeUndefined();
    expect(result.sections[0]!.questions[0]!.options).toEqual(['A', 'B']);
  });

  it('refuses to remove the last section and rejects unknown references', () => {
    const single = sampleForm();
    single.sections = [single.sections[0]!];
    expect(() => applier.apply(single, [{ type: 'REMOVE_SECTION', sectionId: 'section_1' }])).toThrow(ValidationError);
    expect(() => applier.apply(sampleForm(), [{ type: 'REMOVE_QUESTION', questionId: 'missing' }])).toThrow(ValidationError);
    expect(() => applier.apply(sampleForm(), [{ type: 'UPDATE_SECTION', sectionId: 'missing', title: 'x' }])).toThrow(ValidationError);
  });

  it('removes a section together with its questions', () => {
    const result = applier.apply(sampleForm(), [{ type: 'REMOVE_SECTION', sectionId: 'section_2' }]);
    expect(result.sections).toHaveLength(1);
    expect(countQuestions(result)).toBe(3);
  });

  it('parses operations strictly', () => {
    expect(parser.parse([{ type: 'UPDATE_TITLE', title: ' Trimmed ' }])).toEqual([{ type: 'UPDATE_TITLE', title: 'Trimmed' }]);
    expect(() => parser.parse([])).toThrow(ValidationError);
    expect(() => parser.parse([{ type: 'UPDATE_TITLE', title: 'x', extra: true }])).toThrow(ValidationError);
    expect(() => parser.parse([{ type: 'EXECUTE', command: 'rm -rf' }])).toThrow(ValidationError);
    expect(() => parser.parse([{ type: 'UPDATE_QUESTION', questionId: 'question_1', changes: {} }])).toThrow(ValidationError);
  });
});

describe('FormBlueprintBuilder', () => {
  const { blueprints } = formServices();

  it('assigns unique identifiers to generated sections and questions', () => {
    const schema = blueprints.build({
      title: 'Feedback',
      sections: [
        { questions: [{ type: 'SHORT_ANSWER', title: 'Name' }, { type: 'PARAGRAPH', title: 'Comments' }] },
        { title: 'More', questions: [{ type: 'DROPDOWN', title: 'Pick', options: ['A'] }] },
      ],
    });
    const identifiers = schema.sections.flatMap((section) => [section.id, ...section.questions.map((question) => question.id)]);
    expect(new Set(identifiers).size).toBe(identifiers.length);
    expect(schema.sections[0]!.id.startsWith('section_')).toBe(true);
    expect(schema.sections[0]!.questions[0]!.id.startsWith('question_')).toBe(true);
    expect(schema.sections[0]!.questions[0]).toMatchObject({ description: '', required: false });
  });

  it('rejects malformed generated forms', () => {
    expect(() => blueprints.build({ title: 'x', sections: [{ questions: [{ type: 'NOPE', title: 'x' }] }] })).toThrow(ValidationError);
    expect(() => blueprints.build('not an object')).toThrow(ValidationError);
  });
});
