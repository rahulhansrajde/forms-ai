import type { QuestionInput } from '@forms-ai/contracts';
import type { SuggestedQuestion } from '../../../domain/entities/suggestion-set.js';
import type { SuggestionRequest } from '../../../domain/interfaces/ai-provider.js';
import { GENERIC_SUGGESTIONS } from './form-topic-library.js';
import type { QuestionPhraseParser } from './question-phrase-parser.js';
import type { TextMatcher } from './text-matcher.js';
import type { TopicResolver } from './topic-resolver.js';

const SUGGESTIONS_PER_ROUND = 5;
const MAX_LISTED_QUESTIONS = 20;
const EXCLUSION_MARKER = /\b(?:but\s+)?(?:except(?:\s+for)?|not|skip(?:ping)?|without|excluding|leave out|leaving out|minus|apart from)\b/i;
const EVERYTHING = /\b(all|those|these|them|everything|both|every one|each)\b/i;
const ORDINALS: Readonly<Record<string, number>> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

export interface RuleBasedSuggestionProposal {
  formTitle: string;
  baseQuestions: QuestionInput[];
  suggestions: QuestionInput[];
}

export class RuleBasedSuggestionAdvisor {
  constructor(
    private readonly topics: TopicResolver,
    private readonly matcher: TextMatcher,
    private readonly questionParser: QuestionPhraseParser,
  ) {}

  suggest(request: SuggestionRequest): RuleBasedSuggestionProposal {
    const form = request.context.currentForm;
    const userTurns = request.context.recentTurns.filter((turn) => turn.role === 'USER').map((turn) => turn.content);
    const topic = this.topics.resolve([request.instruction, form?.title ?? '', ...userTurns.reverse()]);
    const baseQuestions = form ? [] : this.extractListedQuestions(request.instruction);
    const excluded = [...request.excludedQuestionTitles, ...baseQuestions.map((question) => question.title)];
    const suggestions = [...topic.suggestionPool, ...GENERIC_SUGGESTIONS]
      .filter((candidate) => !excluded.some((title) => this.isSameQuestion(candidate.title, title)))
      .filter((candidate, index, all) => all.findIndex((other) => this.isSameQuestion(other.title, candidate.title)) === index)
      .slice(0, SUGGESTIONS_PER_ROUND)
      .map((candidate) => ({ ...candidate }));
    return {
      formTitle: form?.title ?? this.topics.titleFor(request.instruction, topic),
      baseQuestions,
      suggestions,
    };
  }

  select(message: string, suggestions: readonly SuggestedQuestion[]): { acceptedIds: string[] } {
    const marker = EXCLUSION_MARKER.exec(message);
    const includePart = marker ? message.slice(0, marker.index) : message;
    const excludePart = marker ? message.slice(marker.index + marker[0].length) : '';
    const excluded = new Set(this.referenced(excludePart, suggestions).map((suggestion) => suggestion.id));
    const explicit = this.referenced(includePart, suggestions);
    const chosen = explicit.length > 0 ? explicit : EVERYTHING.test(includePart) ? [...suggestions] : [];
    return { acceptedIds: chosen.filter((suggestion) => !excluded.has(suggestion.id)).map((suggestion) => suggestion.id) };
  }

  private referenced(text: string, suggestions: readonly SuggestedQuestion[]): SuggestedQuestion[] {
    if (text.trim().length === 0) {
      return [];
    }
    const positions = this.referencedPositions(text);
    return suggestions.filter(
      (suggestion, index) => positions.has(index + 1) || this.matcher.mentions(text, suggestion.question.title),
    );
  }

  private referencedPositions(text: string): Set<number> {
    const positions = new Set<number>();
    for (const match of text.matchAll(/\b(\d{1,2})\b/g)) {
      positions.add(Number(match[1]));
    }
    for (const [word, position] of Object.entries(ORDINALS)) {
      if (new RegExp(`\\b${word}\\b`, 'i').test(text)) {
        positions.add(position);
      }
    }
    return positions;
  }

  private extractListedQuestions(instruction: string): QuestionInput[] {
    const listed = this.listedPhrases(instruction);
    return listed
      .slice(0, MAX_LISTED_QUESTIONS)
      .map((phrase) => this.questionParser.parse(phrase))
      .filter((question): question is QuestionInput => question !== null);
  }

  private listedPhrases(instruction: string): string[] {
    const bulletLines = instruction
      .split(/\r?\n/)
      .filter((line) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(line))
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''));
    if (bulletLines.length > 0) {
      return bulletLines;
    }
    const colon = instruction.indexOf(':');
    if (colon < 0) {
      return [];
    }
    const segment = instruction.slice(colon + 1).split(/[.?!]/)[0] ?? '';
    return segment.split(/\s*(?:,|;|\band\b)\s*/i).filter((phrase) => phrase.trim().length > 0);
  }

  private isSameQuestion(first: string, second: string): boolean {
    return this.matcher.similarity(first, second) >= 0.99;
  }
}
