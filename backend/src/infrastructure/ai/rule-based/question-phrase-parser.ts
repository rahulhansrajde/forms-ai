import type { QuestionInput, QuestionType } from '@forms-ai/contracts';
import type { TextMatcher } from './text-matcher.js';

const TYPE_PATTERNS: ReadonlyArray<[RegExp, QuestionType]> = [
  [/\b(drop[- ]?down|select (box|menu))\b/i, 'DROPDOWN'],
  [/\b(multiple[- ]choice|radio( buttons?)?|single[- ]choice)\b/i, 'MULTIPLE_CHOICE'],
  [/\b(check ?box(es)?|multi[- ]?select|tick ?box(es)?)\b/i, 'CHECKBOXES'],
  [/\b(paragraph|long (answer|text|response))\b/i, 'PARAGRAPH'],
  [/\b(linear scale|rating|scale|rate)\b/i, 'LINEAR_SCALE'],
  [/\b(date of birth|birth ?date|birthday|date)\b/i, 'DATE'],
  [/\b(time slot|preferred time|what time|time question|arrival time)\b/i, 'TIME'],
  [/\bshort (answer|text)\b/i, 'SHORT_ANSWER'],
];

const TYPE_WORDS =
  /\b(drop[- ]?down|select (box|menu)|multiple[- ]choice|radio( buttons?)?|single[- ]choice|check ?box(es)?|multi[- ]?select|tick ?box(es)?|paragraph|long (answer|text|response)|linear scale|short (answer|text)|text field|text box|question|field|input|menu|list)\b/gi;

const LEADING_FILLER =
  /^(?:(?:a|an|the|new|another|one|some|optional|required|mandatory)\s+)*(?:(?:for|about|asking(?: for| about)?|to (?:collect|ask(?: for)?|capture)|called|named|titled|on|regarding)\s+)?/i;

const OPTIONS_CLAUSE = /,?\s*(?:with|having)\s+(?:the\s+)?(?:options?|choices?)\s*(?:of|like|:)?\s*(.+)$/i;
const PARENTHESIZED_OPTIONS = /\s*\(([^)]*[,/][^)]*)\)\s*$/;
const REQUIREMENT_WORDS = /\b(?:that is |which is |and make it |make it |as )?(?:required|mandatory|compulsory|optional|not required)\b/gi;
const TRAILING_FILLER = /\s+(?:to|in|into|on|at)\s+(?:the\s+)?(?:form|draft|end|bottom|top)\b.*$/i;

const DEFAULT_OPTIONS: ReadonlyArray<[RegExp, string[]]> = [
  [/\byear of study|study year|current year|academic year\b/i, ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Postgraduate']],
  [/\b(t-?shirt|tshirt|shirt) size\b/i, ['XS', 'S', 'M', 'L', 'XL', 'XXL']],
  [/\bteam size\b/i, ['1', '2', '3', '4']],
  [/\bgender\b/i, ['Female', 'Male', 'Non-binary', 'Prefer not to say']],
  [/\b(department|branch|major)\b/i, ['Computer Science', 'Electronics', 'Mechanical', 'Civil', 'Other']],
  [/^(do|are|have|will|would|can|did|is) /i, ['Yes', 'No']],
];

export class QuestionPhraseParser {
  constructor(private readonly matcher: TextMatcher) {}

  parse(phrase: string): QuestionInput | null {
    const { remainder, options } = this.splitOptions(phrase);
    const title = this.extractTitle(remainder);
    if (title.length === 0) {
      return null;
    }
    const type = this.inferType(phrase, title);
    return {
      type,
      title,
      required: this.isRequired(phrase),
      ...(this.isChoice(type) ? { options: options.length > 0 ? options : this.defaultOptions(title) } : {}),
    };
  }

  inferType(phrase: string, title: string): QuestionType {
    for (const [pattern, type] of TYPE_PATTERNS) {
      if (pattern.test(phrase)) {
        return type;
      }
    }
    return /\bemail\b/i.test(title) ? 'EMAIL' : 'SHORT_ANSWER';
  }

  defaultOptions(title: string): string[] {
    const match = DEFAULT_OPTIONS.find(([pattern]) => pattern.test(title));
    return match ? [...match[1]] : ['Option 1', 'Option 2', 'Option 3'];
  }

  private extractTitle(phrase: string): string {
    const cleaned = phrase
      .replace(REQUIREMENT_WORDS, ' ')
      .replace(TYPE_WORDS, ' ')
      .replace(TRAILING_FILLER, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(LEADING_FILLER, '')
      .replace(/^[\s,:;-]+|[\s,:;.!?-]+$/g, '')
      .trim();
    return cleaned.length > 0 ? this.matcher.titleCase(cleaned) : '';
  }

  private splitOptions(phrase: string): { remainder: string; options: string[] } {
    for (const pattern of [OPTIONS_CLAUSE, PARENTHESIZED_OPTIONS]) {
      const match = pattern.exec(phrase);
      const options = match?.[1] ? this.splitOptionList(match[1]) : [];
      if (match && options.length > 0) {
        return { remainder: phrase.slice(0, match.index), options };
      }
    }
    return { remainder: phrase, options: [] };
  }

  private splitOptionList(list: string): string[] {
    return list
      .split(/\s*(?:,|\/|;|\bor\b|\band\b)\s*/i)
      .map((option) => option.replace(/[.!?]+$/, '').trim())
      .filter((option) => option.length > 0)
      .map((option) => this.matcher.titleCase(option));
  }

  private isRequired(phrase: string): boolean {
    return /\b(required|mandatory|compulsory)\b/i.test(phrase) && !/\b(not required|optional)\b/i.test(phrase);
  }

  private isChoice(type: QuestionType): boolean {
    return type === 'MULTIPLE_CHOICE' || type === 'CHECKBOXES' || type === 'DROPDOWN';
  }
}
