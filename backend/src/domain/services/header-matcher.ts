import type { TextNormalizer } from './text-normalizer.js';

export type HeaderKind = 'IDENTIFIER' | 'EMAIL' | 'NAME' | 'OTHER';

const SYNONYMS: ReadonlyArray<readonly string[]> = [
  ['phone', 'phone number', 'phone no', 'mobile', 'mobile number', 'mobile no', 'contact', 'contact number', 'telephone', 'cell'],
  ['email', 'e mail', 'email address', 'mail', 'email id'],
  ['department', 'dept'],
  ['year', 'year of study', 'study year', 'current year'],
  ['college', 'college name', 'institution', 'university'],
];
const CONTACT_WORDS = new Set(['phone', 'mobile', 'contact', 'telephone', 'cell']);
const IDENTIFIER_WORDS = new Set(['id', 'code', 'roll', 'no', 'number', 'uid', 'usn']);

export class HeaderMatcher {
  constructor(private readonly text: TextNormalizer) {}

  find(headers: readonly string[], field: string): number | null {
    const target = this.key(field);
    if (target.length === 0) {
      return null;
    }
    const keys = headers.map((header) => this.key(header));
    const exact = keys.indexOf(target);
    if (exact >= 0) {
      return exact;
    }
    const group = SYNONYMS.find((synonyms) => synonyms.includes(target));
    const synonym = group ? this.unique(keys.map((key, index) => (group.includes(key) ? index : -1))) : null;
    if (synonym !== null) {
      return synonym;
    }
    const targetWords = target.split(' ');
    return this.unique(
      keys.map((key, index) => {
        const words = key.split(' ');
        return key.length > 0 && (targetWords.every((word) => words.includes(word)) || words.every((word) => targetWords.includes(word))) ? index : -1;
      }),
    );
  }

  kind(header: string): HeaderKind {
    const words = this.key(header).split(' ');
    if (words.includes('email') || words.includes('mail') || (words.includes('e') && words.includes('mail'))) {
      return 'EMAIL';
    }
    if (words.some((word) => IDENTIFIER_WORDS.has(word)) && !words.some((word) => CONTACT_WORDS.has(word))) {
      return 'IDENTIFIER';
    }
    if (words.includes('name')) {
      return 'NAME';
    }
    return 'OTHER';
  }

  private key(text: string): string {
    return this.text.words(text.replace(/e-mail/gi, 'email')).join(' ');
  }

  private unique(indices: readonly number[]): number | null {
    const found = indices.filter((index) => index >= 0);
    return found.length === 1 ? found[0]! : null;
  }
}
