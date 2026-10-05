export const HERO_PHRASES = [
  'What do you want to create?',
  'Turn your idea into a form',
  'Brainstorm your next idea',
  "What's on your mind?",
  'Describe what you need',
  "Let's build something",
  'Start with an idea',
  'Create something amazing',
] as const;

export class RandomPhrasePicker {
  private last: string | null = null;

  constructor(
    private readonly phrases: readonly string[],
    private readonly random: () => number = Math.random,
  ) {
    if (phrases.length < 2) {
      throw new Error('RandomPhrasePicker needs at least two phrases.');
    }
  }

  next(): string {
    const candidates = this.phrases.filter((phrase) => phrase !== this.last);
    const index = Math.min(Math.floor(this.random() * candidates.length), candidates.length - 1);
    const phrase = candidates[index] as string;
    this.last = phrase;
    return phrase;
  }
}
