import type { HeaderMatcher } from './header-matcher.js';
import { RecordQuestionParser } from './record-question-parser.js';
import type { TextNormalizer } from './text-normalizer.js';

export type RecordSubject = { kind: 'VALUE'; value: string; column?: string } | { kind: 'ROW'; row: number } | { kind: 'PRONOUN' };

export interface RecordRequestChange {
  column: string;
  value: string | null;
  from?: string;
}

export interface RecordRequest {
  sheet?: string;
  subject: RecordSubject;
  changes: RecordRequestChange[];
  read?: { fields: string[]; confident: boolean };
}

export interface RecordQuestion {
  subject: RecordSubject;
  fields: string[];
  confident: boolean;
}

export type IdentifierStatement = { kind: 'VALUE'; column: string; value: string } | { kind: 'ROW'; row: number };

export interface RecordConversationState {
  hasSubject: boolean;
  hasPending: boolean;
  hasDraft: boolean;
}

const VERBS = '(?:change|update|set|make|edit|correct|fix|modify)';
const WITH_VALUE = new RegExp(`^(?:please\\s+)?${VERBS}\\s+(.+?)\\s+(?:from\\s+(.+?)\\s+)?(?:to|as|into|=)\\s+(.+?)[.!]*$`, 'i');
const WITHOUT_VALUE = new RegExp(`^(?:please\\s+)?${VERBS}\\s+(.+?)[.!?]*$`, 'i');
const POSSESSIVE_SUBJECT = /^(.+?)'s?\s+(.+)$/i;
const OF_SUBJECT = /^(?:the\s+)?(.+?)\s+of\s+(.+)$/i;
const PRONOUN_SUBJECT = /^(his|her|their|its)\s+(.+)$/i;
const ROW_ENTITY = /^row\s+(?:number\s+)?(\d{1,7})$/i;
const ROW_STATEMENT = /^(?:(?:it|he|she|they)(?:'s|\s+is|\s+are)\s+|(?:use|try)\s+)?(?:in\s+|on\s+)?row\s+(?:number\s+)?(\d{1,7})$/i;
const VALUE_STATEMENT = /^(?:(?:his|her|their|its|it's|the)\s+|.+?'s?\s+)?(.+?)\s+(?:is|=|:)\s+["']?([^\s"']+)["']?$/i;
const PRONOUNS = new Set(['his', 'her', 'their', 'its', 'him', 'them', 'he', 'she', 'they', 'it']);
const DETERMINERS = /^(?:the|this|that|these|those|a|an|my|our|your|all|every|each|some|any|another|other|new|first|last)\b/i;
const MAX_ENTITY_WORDS = 6;
const MAX_FIELD_WORDS = 4;
const IDENTIFYING_KINDS = new Set(['IDENTIFIER', 'EMAIL', 'NAME']);

export class RecordRequestParser {
  private readonly questions: RecordQuestionParser;

  constructor(
    private readonly text: TextNormalizer,
    private readonly headers: HeaderMatcher,
  ) {
    this.questions = new RecordQuestionParser(text, headers);
  }

  parse(message: string, headers: readonly string[]): RecordRequest | null {
    const text = this.text.clean(message);
    const withValue = WITH_VALUE.exec(text);
    const match = withValue ?? WITHOUT_VALUE.exec(text);
    if (!match) {
      return null;
    }
    const parsed = this.subject(match[1]!, headers);
    if (!parsed) {
      return null;
    }
    const from = withValue?.[2] ? this.text.unquote(withValue[2]) : undefined;
    const value = withValue ? this.text.unquote(withValue[3]!) : null;
    if (value !== null && value.length === 0) {
      return null;
    }
    return { subject: parsed.subject, changes: [{ column: parsed.field, value, ...(from ? { from } : {}) }] };
  }

  // Questions about one record, e.g. "What is Priya's department?" or "find Rahul row and show me that row". Fields are column names; none means the whole row.
  parseQuestion(message: string, headers: readonly string[], tabs: readonly string[] = []): RecordQuestion | null {
    return this.questions.parse(message, headers, tabs);
  }

  parseIdentifier(message: string, headers: readonly string[]): IdentifierStatement | null {
    const text = this.text.clean(message).replace(/[.!]+$/, '');
    const row = ROW_STATEMENT.exec(text);
    if (row) {
      return { kind: 'ROW', row: Number(row[1]) };
    }
    const statement = VALUE_STATEMENT.exec(text);
    if (!statement) {
      return null;
    }
    const column = this.headers.find(headers, statement[1]!);
    if (column === null || !IDENTIFYING_KINDS.has(this.headers.kind(headers[column]!))) {
      return null;
    }
    return { kind: 'VALUE', column: headers[column]!, value: statement[2]! };
  }

  isRecordRequest(message: string, headers: readonly string[], state: RecordConversationState): boolean {
    if ((state.hasPending || state.hasSubject) && this.parseIdentifier(message, headers)) {
      return true;
    }
    const request = this.parse(message, headers);
    if (!request) {
      return false;
    }
    if (request.subject.kind === 'PRONOUN') {
      return state.hasSubject || state.hasPending;
    }
    return request.changes.every((change) => this.headers.find(headers, change.column) !== null) || !state.hasDraft;
  }

  isPronoun(value: string): boolean {
    return PRONOUNS.has(this.text.comparable(value));
  }

  subjectFor(value: string, column?: string): RecordSubject {
    const row = ROW_ENTITY.exec(this.text.clean(value));
    if (row) {
      return { kind: 'ROW', row: Number(row[1]) };
    }
    return this.isPronoun(value) ? { kind: 'PRONOUN' } : { kind: 'VALUE', value: this.text.stripPossessive(value), ...(column ? { column } : {}) };
  }

  private subject(text: string, headers: readonly string[]): { subject: RecordSubject; field: string } | null {
    const pronoun = PRONOUN_SUBJECT.exec(text);
    if (pronoun) {
      return this.field(pronoun[2]!) ? { subject: { kind: 'PRONOUN' }, field: this.field(pronoun[2]!)! } : null;
    }
    const possessive = POSSESSIVE_SUBJECT.exec(text);
    if (possessive) {
      return this.build(possessive[1]!, possessive[2]!, headers, false);
    }
    const of = OF_SUBJECT.exec(text);
    if (of) {
      const built = this.build(of[2]!, of[1]!, headers, true);
      if (built) {
        return built;
      }
    }
    const words = text.split(' ');
    for (let size = Math.min(MAX_FIELD_WORDS, words.length - 1); size >= 1; size -= 1) {
      const built = this.build(words.slice(0, -size).join(' '), words.slice(-size).join(' '), headers, true);
      if (built) {
        return built;
      }
    }
    return null;
  }

  private build(entityText: string, fieldText: string, headers: readonly string[], requireHeader: boolean): { subject: RecordSubject; field: string } | null {
    const field = this.field(fieldText);
    const entity = this.text.stripPossessive(entityText);
    if (!field || entity.length === 0 || DETERMINERS.test(entity) || entity.split(' ').length > MAX_ENTITY_WORDS) {
      return null;
    }
    if (requireHeader && this.headers.find(headers, field) === null) {
      return null;
    }
    return { subject: this.subjectFor(entity), field };
  }

  private field(text: string): string | null {
    const field = this.text.unquote(text).replace(/\s+(?:column|field|value)$/i, '').trim();
    return field.length > 0 && field.split(' ').length <= MAX_FIELD_WORDS ? field : null;
  }
}
