import type { ChatIntent } from '@forms-ai/contracts';
import { describe, expect, it } from 'vitest';
import type { SuggestedQuestion } from '../../../src/domain/entities/suggestion-set.js';
import type { AIConversationContext } from '../../../src/domain/interfaces/ai-provider.js';
import { AIProviderFactory } from '../../../src/infrastructure/ai/ai-provider-factory.js';
import { QuestionPhraseParser } from '../../../src/infrastructure/ai/rule-based/question-phrase-parser.js';
import { RuleBasedIntentClassifier } from '../../../src/infrastructure/ai/rule-based/rule-based-intent-classifier.js';
import { RuleBasedOperationPlanner } from '../../../src/infrastructure/ai/rule-based/rule-based-operation-planner.js';
import { RuleBasedSuggestionAdvisor } from '../../../src/infrastructure/ai/rule-based/rule-based-suggestion-advisor.js';
import { TextMatcher } from '../../../src/infrastructure/ai/rule-based/text-matcher.js';
import { TopicResolver } from '../../../src/infrastructure/ai/rule-based/topic-resolver.js';
import { formServices, sampleForm } from '../../support/domain-fixtures.js';
import { SilentLogger } from '../../support/fakes.js';

const matcher = new TextMatcher();
const parser = new QuestionPhraseParser(matcher);
const suggestions: SuggestedQuestion[] = [
  { id: 'suggestion_1', question: { type: 'SHORT_ANSWER', title: 'College Name' } },
  { id: 'suggestion_2', question: { type: 'SHORT_ANSWER', title: 'Phone Number' } },
  { id: 'suggestion_3', question: { type: 'CHECKBOXES', title: 'Skills', options: ['A'] } },
  { id: 'suggestion_4', question: { type: 'DROPDOWN', title: 'Team Size', options: ['1'] } },
];

function context(options: { form?: boolean; suggestions?: boolean } = {}): AIConversationContext {
  return {
    recentTurns: [],
    currentForm: options.form ? sampleForm() : null,
    openSuggestions: options.suggestions ? suggestions : [],
  };
}

describe('RuleBasedIntentClassifier', () => {
  const classifier = new RuleBasedIntentClassifier(matcher);

  it.each<[string, AIConversationContext, ChatIntent]>([
    ['What is Google Forms?', context(), 'NORMAL_CHAT'],
    ['Explain what Google Forms can do.', context({ form: true }), 'NORMAL_CHAT'],
    ['Create a college hackathon registration form.', context(), 'CREATE_FORM'],
    ['I need a form for collecting internship information', context(), 'CREATE_FORM'],
    ['I have four questions already. What other questions can I add?', context({ form: true }), 'SUGGEST_QUESTIONS'],
    ['What else?', context({ form: true, suggestions: true }), 'SUGGEST_QUESTIONS'],
    ["I don't think these are useful. Give me different ones.", context({ suggestions: true }), 'SUGGEST_QUESTIONS'],
    ['Okay, add those questions.', context({ suggestions: true }), 'ACCEPT_SUGGESTIONS'],
    ['Use college name, phone, skills but skip team size.', context({ suggestions: true }), 'ACCEPT_SUGGESTIONS'],
    ['Remove the phone number.', context({ form: true }), 'MODIFY_FORM'],
    ['Make email mandatory.', context({ form: true }), 'MODIFY_FORM'],
    ['Add a dropdown for year of study.', context({ form: true }), 'MODIFY_FORM'],
    ['Change the title.', context({ form: true }), 'MODIFY_FORM'],
    ['Regenerate it.', context({ form: true }), 'REGENERATE_FORM'],
    ['Make a simpler version.', context({ form: true }), 'REGENERATE_FORM'],
    ['Create a better version with fewer questions.', context({ form: true }), 'REGENERATE_FORM'],
    ['Create it in Google Forms.', context({ form: true }), 'CREATE_GOOGLE_FORM'],
    ['Publish this please', context({ form: true }), 'CREATE_GOOGLE_FORM'],
    ['create gform', context({ form: true }), 'CREATE_GOOGLE_FORM'],
    ['create the gform', context({ form: true }), 'CREATE_GOOGLE_FORM'],
    ['Create the Google Form', context({ form: true }), 'CREATE_GOOGLE_FORM'],
    ['make it live', context({ form: true }), 'CREATE_GOOGLE_FORM'],
    ['Create a Google Form for our hackathon registration', context(), 'CREATE_FORM'],
  ])('classifies "%s"', (message, conversation, expected) => {
    expect(classifier.classify(message, conversation).intent).toBe(expected);
  });
});

describe('QuestionPhraseParser', () => {
  it('infers types, titles, options and requirement', () => {
    expect(parser.parse('a dropdown for year of study')).toMatchObject({
      type: 'DROPDOWN',
      title: 'Year of Study',
      options: ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Postgraduate'],
    });
    expect(parser.parse('a required multiple choice question about meal preference with options veg, non-veg or vegan')).toMatchObject({
      type: 'MULTIPLE_CHOICE',
      title: 'Meal Preference',
      required: true,
      options: ['Veg', 'Non-veg', 'Vegan'],
    });
    expect(parser.parse('email')).toMatchObject({ type: 'EMAIL', title: 'Email' });
    expect(parser.parse('date of birth')).toMatchObject({ type: 'DATE' });
    expect(parser.parse('   ')).toBeNull();
  });
});

describe('RuleBasedOperationPlanner', () => {
  const planner = new RuleBasedOperationPlanner(matcher, parser);
  const { applier } = formServices();

  it('plans multi-step edits that apply cleanly', () => {
    const plan = planner.plan('Remove phone number and make email mandatory. Rename team name to Squad Name', sampleForm());
    expect(plan.operations).toEqual([
      { type: 'REMOVE_QUESTION', questionId: 'question_3' },
      { type: 'UPDATE_QUESTION', questionId: 'question_2', changes: { required: true } },
      { type: 'UPDATE_QUESTION', questionId: 'question_4', changes: { title: 'Squad Name' } },
    ]);
    expect(() => applier.apply(sampleForm(), plan.operations)).not.toThrow();
  });

  it('handles titles, type changes, moves and sections', () => {
    const form = sampleForm();
    expect(planner.plan('Change the title to "Hack Night 2026"', form).operations).toEqual([
      { type: 'UPDATE_TITLE', title: 'Hack Night 2026' },
    ]);
    expect(planner.plan('Turn team name into a dropdown', form).operations[0]).toMatchObject({
      type: 'UPDATE_QUESTION',
      changes: { type: 'DROPDOWN' },
    });
    expect(planner.plan('Move email to the top', form).operations[0]).toMatchObject({ type: 'REORDER_QUESTION', questionId: 'question_2', index: 0 });
    expect(planner.plan('Add a section called Logistics', form).operations).toEqual([{ type: 'ADD_SECTION', title: 'Logistics' }]);
    expect(planner.plan('Make all questions required', form).operations).toHaveLength(5);
  });

  it('asks for clarification instead of guessing', () => {
    expect(planner.plan('Change the title', sampleForm())).toEqual({ operations: [], clarificationQuestion: 'What should the new title be?' });
    const missing = planner.plan('Remove the shoe size question', sampleForm());
    expect(missing.operations).toEqual([]);
    expect(missing.clarificationQuestion).toContain('shoe size');
  });
});

describe('RuleBasedSuggestionAdvisor', () => {
  const advisor = new RuleBasedSuggestionAdvisor(new TopicResolver(matcher), matcher, parser);

  it('selects explicit suggestions and respects exclusions', () => {
    expect(advisor.select('Use college name, phone, skills but skip team size.', suggestions).acceptedIds).toEqual([
      'suggestion_1',
      'suggestion_2',
      'suggestion_3',
    ]);
    expect(advisor.select('add all of them except team size', suggestions).acceptedIds).toEqual([
      'suggestion_1',
      'suggestion_2',
      'suggestion_3',
    ]);
    expect(advisor.select('add 1 and the third one', suggestions).acceptedIds).toEqual(['suggestion_1', 'suggestion_3']);
    expect(advisor.select('hmm maybe later', suggestions).acceptedIds).toEqual([]);
  });

  it('extracts listed questions and avoids suggesting duplicates', () => {
    const proposal = advisor.suggest({
      instruction: 'I need a GForm for a college hackathon. I have these questions: full name, email and college name. What else?',
      excludedQuestionTitles: [],
      context: context(),
    });
    expect(proposal.baseQuestions.map((question) => question.title)).toEqual(['Full Name', 'Email', 'College Name']);
    expect(proposal.suggestions.map((question) => question.title)).not.toContain('College Name');
    expect(proposal.suggestions.length).toBeGreaterThan(0);
  });
});

describe('TopicResolver', () => {
  const topics = new TopicResolver(matcher);

  it.each([
    ['Create a college hackathon registration form.', 'College Hackathon Registration'],
    ['Create an RSVP form for my party', 'RSVP Form for Party'],
    ['Create a feedback form for students.', 'Feedback Form for Students'],
    ['I need a form for collecting internship information', 'Internship Information Form'],
    ['Make an event registration survey', 'Event Registration'],
  ])('derives the title of "%s"', (instruction, title) => {
    expect(topics.titleFor(instruction, topics.resolve([instruction]))).toBe(title);
  });
});

describe('AIProviderFactory', () => {
  it('uses the offline provider unless Bedrock is configured', () => {
    const factory = new AIProviderFactory(new SilentLogger());
    const settings = { bedrockRegion: 'ap-south-1', bedrockModels: ['m'] };
    expect(factory.create({ ...settings, provider: 'rule-based', bedrockApiKey: '' }).constructor.name).toBe('RuleBasedAIProvider');
    expect(() => factory.create({ ...settings, provider: 'bedrock', bedrockApiKey: '' })).toThrow('BEDROCK_API_KEY');
    expect(factory.create({ ...settings, provider: 'bedrock', bedrockApiKey: 'placeholder' }).constructor.name).toBe('BedrockAIProvider');
  });

  it('produces forms the domain accepts', async () => {
    const provider = new AIProviderFactory(new SilentLogger()).createRuleBased();
    const { blueprints } = formServices();
    for (const instruction of [
      'Create a college hackathon registration form.',
      'Create a feedback form for students.',
      'I need a form for collecting internship information',
      'Make a job application form',
      'Create an RSVP form for my party',
      'Create a form',
    ]) {
      const schema = blueprints.build(await provider.generateForm({ instruction, basis: null, context: context() }));
      expect(schema.sections.length).toBeGreaterThan(0);
    }
    const fewer = blueprints.build(await provider.generateForm({ instruction: 'fewer questions', basis: sampleForm(), context: context() }));
    expect(fewer.sections.flatMap((section) => section.questions).length).toBeLessThan(5);
  });
});
