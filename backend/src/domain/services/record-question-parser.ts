import type { HeaderMatcher } from './header-matcher.js';
import type { RecordQuestion, RecordSubject } from './record-request-parser.js';
import type { TextNormalizer } from './text-normalizer.js';

interface Token {
  text: string;
  key: string;
  possessive: boolean;
}

interface ClauseReading {
  subject: RecordSubject | null;
  fields: string[];
  strong: boolean;
  weak: boolean;
  reference: boolean;
  recordNoun: boolean;
}

// Requests that are about many rows, columns, the whole sheet, forms or changes are left to the general planner.
const NOT_A_RECORD_QUESTION = [
  /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:data\s+)?rows\b/,
  /\b(?:first|last|top|bottom|next|previous|second|third)\s+(?:\d+\s+)?(?:data\s+)?rows?\b/,
  /\brows\b/,
  /\bcolumns?\b/,
  /\b(?:all|every|everything|everyone|everybody|each)\b/,
  /\b(?:entire|whole|full|complete)\s+(?:sheet|spreadsheet|tab|data|table|list|file)\b/,
  /\b(?:summar\w*|analy[sz]\w*|overview|insights?|statistics|stats|average|total|count|how\s+many|how\s+much|highest|lowest|sort\w*|filter\w*|compar\w*)\b/,
  /\b(?:tabs|headers?|structure)\b/,
  /\b[a-z]{1,3}\d+:[a-z]{1,3}\d*\b/,
  /\b(?:forms?|g-?forms?|questions?|sections?|drafts?|survey|quiz|preview|publish\w*|options?)\b/,
  /\b(?:change|update|set|edit|modify|correct|fix|add|delete|remove|clear|rename|insert|write|put|make|move|replace|create|append|format|bold|resize|freeze)\b/,
];
const CLAUSE_BREAK = /\s*(?:,|;|&|\band\b|\bthen\b|\balso\b)\s*/i;
const TOKEN = /[\p{L}\p{N}][\p{L}\p{N}@._+-]*(?:'s?)?/gu;
const VERBS = new Set([
  'find', 'show', 'get', 'give', 'display', 'fetch', 'search', 'lookup', 'look', 'tell', 'read', 'pull', 'check', 'see', 'open', 'view',
  'print', 'bring', 'what', 'whats', 'who', 'whos', 'which', 'where', 'locate', 'return',
]);
const STRONG_VERBS = new Set(['find', 'search', 'lookup', 'look', 'who', 'whos', 'locate', 'about']);
const FUZZY_VERBS = ['find', 'show', 'give', 'fetch', 'search', 'display', 'lookup', 'tell'];
const RECORD_NOUNS = new Set(['row', 'record', 'details', 'detail', 'info', 'information', 'entry', 'profile', 'data']);
const FUZZY_NOUNS = ['details', 'detail', 'record', 'entry', 'profile', 'information'];
const REFERENCES = new Set(['his', 'her', 'their', 'its', 'him', 'them', 'he', 'she', 'they', 'it', 'that', 'this', 'those', 'these', 'same']);
const CONTRACTIONS = new Set(['it', 'that', 'what', 'who', 'he', 'she', 'there', 'here', 'where', 'how', 'let']);
const FILLERS = new Set([
  'a', 'an', 'the', 'me', 'us', 'my', 'our', 'i', 'you', 'your', 'please', 'pls', 'plz', 'kindly', 'can', 'could', 'would', 'will', 'do',
  'does', 'did', 'is', 'are', 'was', 'were', 'be', 'been', 'of', 'for', 'to', 'in', 'on', 'at', 'from', 'by', 'with', 'about', 'just', 'only',
  'now', 'want', 'need', 'know', 'like', 'full', 'whole', 'complete', 'sheet', 'spreadsheet', 'tab', 'table', 'student', 'person', 'someone',
  'somebody', 'anyone', 'unknown', 'random', 'any', 'some', 'named', 'called', 'value', 'values', 'something', 'anything', 'stuff', 'result',
  'results', 'content', 'contents', 'more', 'rest', 'again', 'here', 'there', 'whose', 'has', 'have', 'had', 'got', 'up', 'out', 'hey', 'hi',
  'hello', 'thanks', 'thank', 'ok', 'okay', 'quickly', 'quick', 'exactly', 'exact', 'or', 'alone', 'single', 'specific', 'particular',
  'separately', 'individually', 'own', 'solely', 'matching', 'matches', 'match', 'corresponding', 'related',
]);
const POLITE_U = new Set(['can', 'could', 'would', 'will', 'do', 'did', 'thank']);
const IDENTIFYING_KINDS = new Set(['IDENTIFIER', 'EMAIL', 'NAME']);
const MAX_CLAUSES = 4;
const MAX_ENTITY_WORDS = 6;
const MAX_FIELD_WORDS = 4;

// Optimal string alignment distance, so one typo (including a swapped pair of letters) still counts as the same word.
function editDistance(first: string, second: string): number {
  const rows = Array.from({ length: first.length + 1 }, (_row, index) => [index, ...Array<number>(second.length).fill(0)]);
  for (let column = 1; column <= second.length; column += 1) {
    rows[0]![column] = column;
  }
  for (let row = 1; row <= first.length; row += 1) {
    for (let column = 1; column <= second.length; column += 1) {
      const cost = first[row - 1] === second[column - 1] ? 0 : 1;
      let best = Math.min(rows[row - 1]![column]! + 1, rows[row]![column - 1]! + 1, rows[row - 1]![column - 1]! + cost);
      if (row > 1 && column > 1 && first[row - 1] === second[column - 2] && first[row - 2] === second[column - 1]) {
        best = Math.min(best, rows[row - 2]![column - 2]! + 1);
      }
      rows[row]![column] = best;
    }
  }
  return rows[first.length]![second.length]!;
}

export class RecordQuestionParser {
  constructor(
    private readonly text: TextNormalizer,
    private readonly headers: HeaderMatcher,
  ) {}

  parse(message: string, headers: readonly string[], tabs: readonly string[]): RecordQuestion | null {
    const cleaned = this.text.clean(message).replace(/[?!.]+$/, '');
    if (NOT_A_RECORD_QUESTION.some((pattern) => pattern.test(cleaned.toLowerCase()))) {
      return null;
    }
    const clauses = cleaned.split(CLAUSE_BREAK).filter((clause) => clause.trim().length > 0);
    if (clauses.length === 0 || clauses.length > MAX_CLAUSES) {
      return null;
    }
    const tabKeys = tabs.map((tab) => this.text.words(tab)).filter((words) => words.length > 0);
    let subject: RecordSubject | null = null;
    const fields: string[] = [];
    let confident = false;
    let signalled = false;
    let referenced = false;
    let recordNoun = false;
    for (const clause of clauses) {
      const reading = this.clause(clause, headers, tabKeys, subject !== null);
      if (reading.subject) {
        if (subject && !this.sameSubject(subject, reading.subject)) {
          return null;
        }
        subject = reading.subject;
      }
      for (const field of reading.fields) {
        if (!fields.some((known) => this.text.comparable(known) === this.text.comparable(field))) {
          fields.push(field);
        }
      }
      confident ||= reading.strong;
      signalled ||= reading.strong || reading.weak;
      referenced ||= reading.reference;
      recordNoun ||= reading.recordNoun;
    }
    if (!subject && referenced && (fields.length > 0 || recordNoun)) {
      subject = { kind: 'PRONOUN' };
    }
    if (!subject || !signalled) {
      return null;
    }
    if (!confident && !(subject.kind === 'VALUE' && this.looksLikeRecord(subject.value))) {
      return null;
    }
    return { subject, fields, confident };
  }

  private clause(clause: string, headers: readonly string[], tabKeys: readonly string[][], hasSubject: boolean): ClauseReading {
    const tokens = this.tokens(clause);
    const used = tokens.map(() => false);
    const reading: ClauseReading = { subject: null, fields: [], strong: false, weak: false, reference: false, recordNoun: false };

    tokens.forEach((token, index) => {
      if (token.key === 'row' && /^\d{1,7}$/.test(tokens[index + 1]?.key ?? '')) {
        reading.subject = { kind: 'ROW', row: Number(tokens[index + 1]!.key) };
        used[index] = used[index + 1] = true;
        reading.strong = true;
      }
    });
    for (const tab of tabKeys) {
      for (let start = 0; start + tab.length <= tokens.length; start += 1) {
        if (tab.every((word, offset) => tokens[start + offset]!.key === word && !used[start + offset])) {
          tab.forEach((_word, offset) => (used[start + offset] = true));
        }
      }
    }
    this.readHeaders(tokens, used, headers, reading);

    const possessive = tokens.findIndex((token, index) => token.possessive && !used[index]);
    if (possessive >= 0 && !reading.subject) {
      const owner = this.entityTokens(tokens, used, 0, possessive + 1);
      const after = this.entityTokens(tokens, used, possessive + 1, tokens.length);
      if (owner.length > 0) {
        reading.subject = this.subjectOf(tokens, owner);
        reading.strong = true;
        owner.concat(after).forEach((index) => (used[index] = true));
        if (after.length > 0 && after.length <= MAX_FIELD_WORDS) {
          reading.fields.push(after.map((index) => tokens[index]!.text).join(' '));
        }
      }
    }

    for (const token of tokens) {
      reading.reference ||= REFERENCES.has(token.key);
      reading.recordNoun ||= RECORD_NOUNS.has(token.key);
      reading.strong ||= STRONG_VERBS.has(token.key) || RECORD_NOUNS.has(token.key);
      reading.weak ||= VERBS.has(token.key);
    }
    let entity = this.entityTokens(tokens, used, 0, tokens.length);
    if ((hasSubject || reading.reference) && entity.every((index) => /^\p{Ll}{1,3}$/u.test(tokens[index]!.text))) {
      entity = [];
    }
    if (entity.length > 0 && entity.length <= MAX_ENTITY_WORDS && !reading.subject) {
      reading.subject = this.subjectOf(tokens, entity);
    }
    return reading;
  }

  // Column names become requested fields, unless an identifying column is followed by its value ("register number STU001").
  private readHeaders(tokens: readonly Token[], used: boolean[], headers: readonly string[], reading: ClauseReading): void {
    for (let start = 0; start < tokens.length; start += 1) {
      for (let size = Math.min(MAX_FIELD_WORDS, tokens.length - start); size >= 1; size -= 1) {
        const window = tokens.slice(start, start + size);
        if (window.some((_token, offset) => used[start + offset]) || window.every((token) => this.isNoise(token.key))) {
          continue;
        }
        const text = window.map((token) => token.text).join(' ');
        const column = this.matchHeader(headers, text);
        if (column === null) {
          continue;
        }
        const kind = this.headers.kind(headers[column]!);
        const value = this.valueAfter(tokens, used, start + size, kind);
        if (IDENTIFYING_KINDS.has(kind) && value.length > 0) {
          reading.subject = { kind: 'VALUE', column: headers[column]!, value: value.map((index) => tokens[index]!.text).join(' ') };
          value.forEach((index) => (used[index] = true));
        } else {
          reading.fields.push(text);
        }
        window.forEach((_token, offset) => (used[start + offset] = true));
        reading.strong = true;
        start += size - 1;
        break;
      }
    }
  }

  private valueAfter(tokens: readonly Token[], used: readonly boolean[], from: number, kind: string): number[] {
    const value: number[] = [];
    for (let index = from; index < tokens.length && !used[index] && !this.isNoise(tokens[index]!.key); index += 1) {
      value.push(index);
      if (kind !== 'NAME' || value.length >= MAX_ENTITY_WORDS) {
        break;
      }
    }
    const first = value[0] === undefined ? null : tokens[value[0]]!.text;
    return first !== null && (kind === 'NAME' || /\d|@/.test(first)) ? value : [];
  }

  // Only a column name, a part of one, or a short synonym counts; a longer phrase that merely contains a column name does not.
  private matchHeader(headers: readonly string[], text: string): number | null {
    const column = this.headers.find(headers, text);
    if (column === null) {
      return null;
    }
    const words = this.text.words(text);
    const headerWords = this.text.words(headers[column]!);
    if (words.every((word) => headerWords.includes(word))) {
      return column;
    }
    return words.length <= 2 && words.every((word) => !headerWords.includes(word)) ? column : null;
  }

  private entityTokens(tokens: readonly Token[], used: readonly boolean[], from: number, to: number): number[] {
    const indices: number[] = [];
    for (let index = from; index < to; index += 1) {
      if (!used[index] && !this.isNoise(tokens[index]!.key)) {
        indices.push(index);
      }
    }
    return indices;
  }

  private subjectOf(tokens: readonly Token[], indices: readonly number[]): RecordSubject {
    return { kind: 'VALUE', value: indices.map((index) => tokens[index]!.text).join(' ') };
  }

  private tokens(clause: string): Token[] {
    const matches = clause.match(TOKEN) ?? [];
    const tokens: Token[] = [];
    for (const match of matches) {
      const possessive = /'s?$/i.test(match);
      const text = match.replace(/'s?$/i, '').replace(/[._+-]+$/, '');
      if (text.length === 0) {
        continue;
      }
      let key = text.toLowerCase();
      const previous = tokens[tokens.length - 1]?.key;
      if (key === 'u' && previous !== undefined && POLITE_U.has(previous)) {
        key = 'you';
      }
      const lowercase = text === key;
      if (lowercase && tokens.every((token) => this.isNoise(token.key)) && !VERBS.has(key)) {
        key = FUZZY_VERBS.find((verb) => key.length >= 3 && editDistance(key, verb) <= 1) ?? key;
      }
      if (lowercase && key.length >= 5 && !RECORD_NOUNS.has(key)) {
        key = FUZZY_NOUNS.find((noun) => editDistance(key, noun) <= 1) ?? key;
      }
      tokens.push({ text, key, possessive: possessive && !CONTRACTIONS.has(key) && !REFERENCES.has(key) });
    }
    return tokens;
  }

  private isNoise(key: string): boolean {
    return FILLERS.has(key) || VERBS.has(key) || RECORD_NOUNS.has(key) || REFERENCES.has(key);
  }

  private looksLikeRecord(value: string): boolean {
    return /\d|@/.test(value) || value.split(' ').length >= 2 || /^\p{Lu}/u.test(value);
  }

  private sameSubject(first: RecordSubject, second: RecordSubject): boolean {
    if (first.kind === 'VALUE' && second.kind === 'VALUE') {
      return this.text.comparable(first.value) === this.text.comparable(second.value);
    }
    return first.kind === second.kind && (first.kind !== 'ROW' || (second.kind === 'ROW' && first.row === second.row));
  }
}
