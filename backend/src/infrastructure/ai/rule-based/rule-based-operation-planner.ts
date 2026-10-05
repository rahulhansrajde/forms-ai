import type { FormOperation, FormQuestion, FormSchema, FormSection, QuestionType } from '@forms-ai/contracts';
import type { QuestionPhraseParser } from './question-phrase-parser.js';
import type { TextMatcher } from './text-matcher.js';

export interface RuleBasedOperationPlan {
  operations: FormOperation[];
  clarificationQuestion: string | null;
}

interface ClauseResult {
  operations: FormOperation[];
  clarification?: string;
}

const CLAUSE_SEPARATOR =
  /\s*(?:[;\n]+|\.\s+|,?\s+(?:and|then|also)\s+(?=(?:add|remove|delete|drop|make|change|rename|set|move|mark|turn|put|include|insert|update|replace|get rid of)\b))\s*/i;
const TARGET_SEPARATOR = /\s*(?:,|\band\b|&)\s*/i;
const QUOTES = /^["“'‘]+|["”'’.!?]+$/g;

const TYPE_KEYWORDS: ReadonlyArray<[RegExp, QuestionType]> = [
  [/^(a |an )?(drop[- ]?down)( question| menu)?$/i, 'DROPDOWN'],
  [/^(a |an )?(multiple[- ]choice|radio)( question)?$/i, 'MULTIPLE_CHOICE'],
  [/^(a |an )?(check ?box(es)?)( question)?$/i, 'CHECKBOXES'],
  [/^(a |an )?(paragraph|long answer)( question)?$/i, 'PARAGRAPH'],
  [/^(a |an )?(short answer|short text|text)( question)?$/i, 'SHORT_ANSWER'],
  [/^(a |an )?(email)( question| field)?$/i, 'EMAIL'],
  [/^(a |an )?(date)( question| field)?$/i, 'DATE'],
  [/^(a |an )?(time)( question| field)?$/i, 'TIME'],
  [/^(a |an )?(linear scale|scale|rating)( question)?$/i, 'LINEAR_SCALE'],
];

export class RuleBasedOperationPlanner {
  constructor(
    private readonly matcher: TextMatcher,
    private readonly questionParser: QuestionPhraseParser,
  ) {}

  plan(instruction: string, form: FormSchema): RuleBasedOperationPlan {
    const operations: FormOperation[] = [];
    let clarification: string | null = null;
    for (const clause of this.splitClauses(instruction)) {
      const result = this.planClause(clause, form);
      operations.push(...result.operations);
      clarification ??= result.clarification ?? null;
    }
    return {
      operations,
      clarificationQuestion: operations.length === 0 ? clarification ?? this.defaultClarification() : null,
    };
  }

  private splitClauses(instruction: string): string[] {
    return instruction
      .split(CLAUSE_SEPARATOR)
      .map((clause) => clause.trim().replace(/[.!?]+$/, ''))
      .filter((clause) => clause.length > 0);
  }

  private planClause(clause: string, form: FormSchema): ClauseResult {
    return (
      this.planTitleChange(clause) ??
      this.planDescriptionChange(clause) ??
      this.planSectionAddition(clause) ??
      this.planSectionRemoval(clause, form) ??
      this.planRequirementChange(clause, form) ??
      this.planRemoval(clause, form) ??
      this.planOptionsChange(clause, form) ??
      this.planRenameOrRetype(clause, form) ??
      this.planMove(clause, form) ??
      this.planAddition(clause, form) ?? { operations: [] }
    );
  }

  private planTitleChange(clause: string): ClauseResult | null {
    const withValue =
      /\b(?:change|rename|update|set)\s+(?:the\s+)?(?:form(?:'s)?\s+)?title(?:\s+of the form)?\s+(?:to|as)\s+(.+)$/i.exec(clause) ??
      /\b(?:call|rename|title)\s+(?:the\s+)?form\s+(?:to\s+)?(.+)$/i.exec(clause);
    if (withValue?.[1]) {
      return { operations: [{ type: 'UPDATE_TITLE', title: this.unquote(withValue[1]) }] };
    }
    if (/\b(?:change|rename|update)\s+(?:the\s+)?(?:form\s+)?title\b/i.test(clause)) {
      return { operations: [], clarification: 'What should the new title be?' };
    }
    return null;
  }

  private planDescriptionChange(clause: string): ClauseResult | null {
    const match = /\b(?:change|update|set)\s+(?:the\s+)?(?:form\s+)?description\s+(?:to|as)\s+(.+)$/i.exec(clause);
    return match?.[1] ? { operations: [{ type: 'UPDATE_DESCRIPTION', description: this.unquote(match[1]) }] } : null;
  }

  private planSectionAddition(clause: string): ClauseResult | null {
    const match = /\badd\s+(?:a\s+|an\s+)?(?:new\s+)?section\s*(?:called|named|titled|for|about)?\s*(.*)$/i.exec(clause);
    if (!match) {
      return null;
    }
    const title = this.unquote(match[1] ?? '');
    return { operations: [{ type: 'ADD_SECTION', title: title ? this.matcher.titleCase(title) : 'New Section' }] };
  }

  private planSectionRemoval(clause: string, form: FormSchema): ClauseResult | null {
    const match = /\b(?:remove|delete|drop)\s+(?:the\s+)?(.+?)\s+section\b/i.exec(clause);
    if (!match?.[1]) {
      return null;
    }
    const section = this.matcher.findBest(match[1], form.sections, (candidate) => candidate.title);
    return section ? { operations: [{ type: 'REMOVE_SECTION', sectionId: section.id }] } : null;
  }

  private planRequirementChange(clause: string, form: FormSchema): ClauseResult | null {
    const match =
      /\b(?:make|mark|set)\s+(?:the\s+)?(.+?)\s+(?:questions?\s+|fields?\s+)?(?:as\s+)?(required|mandatory|compulsory|optional|not required)$/i.exec(clause) ??
      /^(?:the\s+)?(.+?)\s+(?:should|must|needs to|has to)\s+be\s+(required|mandatory|compulsory|optional)$/i.exec(clause);
    if (!match?.[1] || !match[2]) {
      return null;
    }
    const required = !/optional|not required/i.test(match[2]);
    const questions = /^(all|every|each)\b/i.test(match[1]) ? this.allQuestions(form) : this.findQuestions(match[1], form);
    if (questions.length === 0) {
      return { operations: [], clarification: `I couldn't find a question matching ${this.quote(match[1])}. Which question did you mean?` };
    }
    return {
      operations: questions.map((question) => ({ type: 'UPDATE_QUESTION', questionId: question.id, changes: { required } })),
    };
  }

  private planRemoval(clause: string, form: FormSchema): ClauseResult | null {
    const match = /\b(?:remove|delete|drop|get rid of|take out|exclude)\s+(?:the\s+)?(.+?)(?:\s+(?:questions?|fields?))?(?:\s+from\s+the\s+form)?$/i.exec(clause);
    if (!match?.[1]) {
      return null;
    }
    const questions = this.findQuestions(match[1], form);
    if (questions.length === 0) {
      return { operations: [], clarification: `I couldn't find a question matching ${this.quote(match[1])}. Which question should I remove?` };
    }
    return { operations: questions.map((question) => ({ type: 'REMOVE_QUESTION', questionId: question.id })) };
  }

  private planOptionsChange(clause: string, form: FormSchema): ClauseResult | null {
    const match = /\b(?:set|change|update|make)\s+(?:the\s+)?(?:options|choices)\s+(?:for|of|in)\s+(?:the\s+)?(.+?)\s+(?:to|as)\s+(.+)$/i.exec(clause);
    if (!match?.[1] || !match[2]) {
      return null;
    }
    const question = this.matcher.findBest(match[1], this.allQuestions(form), (candidate) => candidate.title);
    const options = match[2]
      .split(/\s*(?:,|\/|;|\bor\b|\band\b)\s*/i)
      .map((option) => this.unquote(option))
      .filter((option) => option.length > 0);
    if (!question || options.length === 0) {
      return { operations: [], clarification: 'Which question should get these options?' };
    }
    return { operations: [{ type: 'UPDATE_QUESTION', questionId: question.id, changes: { options } }] };
  }

  private planRenameOrRetype(clause: string, form: FormSchema): ClauseResult | null {
    const match = /\b(?:rename|change|turn|convert|make)\s+(?:the\s+)?(.+?)\s+(?:question\s+|field\s+)?(?:to|into)\s+(.+)$/i.exec(clause);
    if (!match?.[1] || !match[2]) {
      return null;
    }
    const question = this.matcher.findBest(match[1], this.allQuestions(form), (candidate) => candidate.title);
    if (!question) {
      return null;
    }
    const target = this.unquote(match[2]);
    const type = this.typeFromPhrase(target);
    if (type) {
      return { operations: [{ type: 'UPDATE_QUESTION', questionId: question.id, changes: this.retypeChanges(question, type) }] };
    }
    return { operations: [{ type: 'UPDATE_QUESTION', questionId: question.id, changes: { title: this.matcher.titleCase(target) } }] };
  }

  private planMove(clause: string, form: FormSchema): ClauseResult | null {
    const edge = /\bmove\s+(?:the\s+)?(.+?)\s+(?:question\s+)?to\s+(?:the\s+)?(top|beginning|start|bottom|end)\b/i.exec(clause);
    if (edge?.[1] && edge[2]) {
      const question = this.matcher.findBest(edge[1], this.allQuestions(form), (candidate) => candidate.title);
      if (!question) {
        return null;
      }
      const toTop = /top|beginning|start/i.test(edge[2]);
      const section = toTop ? form.sections[0] : form.sections[form.sections.length - 1];
      return {
        operations: [
          { type: 'REORDER_QUESTION', questionId: question.id, sectionId: section?.id, index: toTop ? 0 : Number.MAX_SAFE_INTEGER },
        ],
      };
    }
    const relative = /\bmove\s+(?:the\s+)?(.+?)\s+(after|below|before|above)\s+(?:the\s+)?(.+)$/i.exec(clause);
    if (!relative?.[1] || !relative[2] || !relative[3]) {
      return null;
    }
    return this.planRelativeMove(relative[1], /after|below/i.test(relative[2]), relative[3], form);
  }

  private planRelativeMove(subject: string, after: boolean, anchorPhrase: string, form: FormSchema): ClauseResult | null {
    const questions = this.allQuestions(form);
    const question = this.matcher.findBest(subject, questions, (candidate) => candidate.title);
    const anchor = this.matcher.findBest(anchorPhrase, questions, (candidate) => candidate.title);
    const anchorSection = anchor ? this.sectionOf(anchor.id, form) : null;
    if (!question || !anchor || !anchorSection || question.id === anchor.id) {
      return null;
    }
    const remaining = anchorSection.questions.filter((candidate) => candidate.id !== question.id);
    const anchorIndex = remaining.findIndex((candidate) => candidate.id === anchor.id);
    return {
      operations: [
        { type: 'REORDER_QUESTION', questionId: question.id, sectionId: anchorSection.id, index: after ? anchorIndex + 1 : anchorIndex },
      ],
    };
  }

  private planAddition(clause: string, form: FormSchema): ClauseResult | null {
    const match = /\b(?:add|include|insert|put|ask for|ask about)\s+(.+)$/i.exec(clause);
    if (!match?.[1]) {
      return null;
    }
    const sectionMatch = /\s+(?:to|in|into)\s+(?:the\s+)?(.+?)\s+section$/i.exec(match[1]);
    const section = sectionMatch?.[1] ? this.matcher.findBest(sectionMatch[1], form.sections, (candidate) => candidate.title) : null;
    const phrase = sectionMatch ? match[1].slice(0, sectionMatch.index) : match[1];
    const question = this.questionParser.parse(phrase);
    if (!question) {
      return { operations: [], clarification: 'What question would you like me to add?' };
    }
    return { operations: [{ type: 'ADD_QUESTION', question, ...(section ? { sectionId: section.id } : {}) }] };
  }

  private retypeChanges(question: FormQuestion, type: QuestionType): { type: QuestionType; options?: string[] } {
    const becomesChoice = type === 'DROPDOWN' || type === 'MULTIPLE_CHOICE' || type === 'CHECKBOXES';
    if (becomesChoice && !question.options) {
      return { type, options: this.questionParser.defaultOptions(question.title) };
    }
    return { type };
  }

  private typeFromPhrase(phrase: string): QuestionType | null {
    return TYPE_KEYWORDS.find(([pattern]) => pattern.test(phrase.trim()))?.[1] ?? null;
  }

  private findQuestions(targets: string, form: FormSchema): FormQuestion[] {
    const questions = this.allQuestions(form);
    const found = new Map<string, FormQuestion>();
    for (const target of targets.split(TARGET_SEPARATOR)) {
      const question = this.matcher.findBest(target, questions, (candidate) => candidate.title);
      if (question) {
        found.set(question.id, question);
      }
    }
    return [...found.values()];
  }

  private allQuestions(form: FormSchema): FormQuestion[] {
    return form.sections.flatMap((section) => section.questions);
  }

  private sectionOf(questionId: string, form: FormSchema): FormSection | null {
    return form.sections.find((section) => section.questions.some((question) => question.id === questionId)) ?? null;
  }

  private unquote(text: string): string {
    return text.trim().replace(QUOTES, '').trim();
  }

  private quote(text: string): string {
    return `“${this.unquote(text)}”`;
  }

  private defaultClarification(): string {
    return 'Which part of the form should I change? Mention the question or section by name.';
  }
}
