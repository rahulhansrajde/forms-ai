import { FORM_TOPICS, GENERIC_TOPIC, type FormTopic } from './form-topic-library.js';
import type { TextMatcher } from './text-matcher.js';

const SUBJECT_PATTERN =
  /\b(?:create|make|build|generate|design|draft|set up|need|want|prepare)\s+(?:me\s+)?(?:(?:a|an|the|some)\s+)?(?:new\s+)?(?:google\s+)?(.*?)\s*\b(?:g?forms?|survey|questionnaire)\b(?:\s+for\s+(?:the\s+|my\s+|our\s+)?([^.?!,]+))?/i;

const MAX_SUBJECT_WORDS = 6;

export class TopicResolver {
  constructor(private readonly matcher: TextMatcher) {}

  resolve(texts: readonly string[]): FormTopic {
    for (const topic of FORM_TOPICS) {
      if (texts.some((text) => topic.pattern.test(text))) {
        return topic;
      }
    }
    return GENERIC_TOPIC;
  }

  titleFor(instruction: string, topic: FormTopic): string {
    const match = SUBJECT_PATTERN.exec(instruction);
    const subject = match?.[1]?.trim() ?? '';
    const audience = match?.[2]?.trim() ?? '';
    const subjectWords = subject.split(/\s+/).filter((word) => word.length > 0);
    if (subjectWords.length >= 2 && subjectWords.length <= MAX_SUBJECT_WORDS) {
      return this.matcher.titleCase(subject);
    }
    if (subjectWords.length === 1) {
      const base = `${this.matcher.titleCase(subject)} Form`;
      return audience.length > 0 && audience.split(/\s+/).length <= 4 ? `${base} for ${this.matcher.titleCase(audience)}` : base;
    }
    return topic.title;
  }
}
