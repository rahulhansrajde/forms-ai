const SYNONYMS: Readonly<Record<string, string>> = {
  mobile: 'phone',
  cell: 'phone',
  telephone: 'phone',
  contact: 'phone',
  mail: 'email',
  emails: 'email',
  mandatory: 'required',
  compulsory: 'required',
  university: 'college',
  institution: 'college',
  institute: 'college',
  skill: 'skills',
  shirt: 'tshirt',
};

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'question',
  'questions',
  'field',
  'fields',
  'for',
  'of',
  'to',
  'about',
  'your',
  'their',
  'my',
  'our',
  'please',
  'it',
  'this',
  'that',
  'and',
  'or',
  'with',
  'on',
  'in',
  'from',
  'one',
  'ones',
  'number',
]);

const FULL_MATCH = 1;
const MINIMUM_SIMILARITY = 0.6;

export class TextMatcher {
  normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/e-mail/g, 'email')
      .replace(/t-shirt|tee shirt/g, 'tshirt')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  keywords(text: string): string[] {
    return this.normalize(text)
      .split(' ')
      .filter((word) => word.length > 0 && !STOPWORDS.has(word))
      .map((word) => SYNONYMS[word] ?? word);
  }

  similarity(phrase: string, candidate: string): number {
    const phraseWords = new Set(this.keywords(phrase));
    const candidateWords = new Set(this.keywords(candidate));
    if (phraseWords.size === 0 || candidateWords.size === 0) {
      return 0;
    }
    const shared = [...phraseWords].filter((word) => candidateWords.has(word)).length;
    const coverage = shared / Math.min(phraseWords.size, candidateWords.size);
    const balance = shared / Math.max(phraseWords.size, candidateWords.size);
    return coverage * 0.8 + balance * 0.2;
  }

  findBest<T>(phrase: string, candidates: readonly T[], titleOf: (candidate: T) => string): T | null {
    let best: T | null = null;
    let bestScore = 0;
    for (const candidate of candidates) {
      const score = this.similarity(phrase, titleOf(candidate));
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return bestScore >= MINIMUM_SIMILARITY ? best : null;
  }

  mentions(text: string, title: string): boolean {
    const titleWords = this.keywords(title);
    if (titleWords.length === 0) {
      return false;
    }
    const textWords = new Set(this.keywords(text));
    const shared = titleWords.filter((word) => textWords.has(word)).length;
    return shared / titleWords.length >= FULL_MATCH || (titleWords.length > 2 && shared / titleWords.length >= 0.66);
  }

  titleCase(phrase: string): string {
    return phrase
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .map((word) => (word.length <= 3 && ['of', 'and', 'or', 'the', 'for', 'to', 'a', 'an', 'in', 'on'].includes(word.toLowerCase()) ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1)))
      .join(' ')
      .replace(/^./, (first) => first.toUpperCase());
  }
}
