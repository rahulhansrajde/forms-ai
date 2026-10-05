import { countQuestions, type FormSchema, type QuestionInput } from '@forms-ai/contracts';
import type { FormBlueprint } from '../../../domain/services/form-schema-definitions.js';
import { GENERIC_SUGGESTIONS, type FormTopic, type TopicSection } from './form-topic-library.js';
import type { TextMatcher } from './text-matcher.js';
import type { TopicResolver } from './topic-resolver.js';

const FEWER_PATTERN = /\b(fewer|less|simpler|simple|shorter|short|minimal|concise|reduce|smaller|basic)\b/i;
const MORE_PATTERN = /\b(more questions|longer|detailed|comprehensive|more detail|expand|bigger|extensive)\b/i;
const MINIMUM_KEPT_QUESTIONS = 3;
const EXTRA_QUESTIONS_ON_EXPAND = 3;

type BlueprintSection = FormBlueprint['sections'][number];
type BlueprintQuestion = BlueprintSection['questions'][number];

export class RuleBasedFormDesigner {
  constructor(
    private readonly topics: TopicResolver,
    private readonly matcher: TextMatcher,
  ) {}

  design(instruction: string): FormBlueprint {
    const topic = this.topics.resolve([instruction]);
    return {
      title: this.topics.titleFor(instruction, topic),
      description: topic.description,
      sections: topic.sections.map((section) => this.copySection(section)),
    };
  }

  redesign(instruction: string, basis: FormSchema): FormBlueprint {
    if (FEWER_PATTERN.test(instruction)) {
      return this.condense(basis);
    }
    if (MORE_PATTERN.test(instruction)) {
      return this.expand(basis);
    }
    const topic = this.topics.resolve([instruction, basis.title]);
    return { ...this.fromTopic(topic), title: basis.title, description: basis.description || topic.description };
  }

  private condense(basis: FormSchema): FormBlueprint {
    const total = countQuestions(basis);
    const required = basis.sections.flatMap((section) => section.questions.filter((question) => question.required));
    const keepRequiredOnly = required.length >= MINIMUM_KEPT_QUESTIONS && required.length < total;
    const budget = Math.max(MINIMUM_KEPT_QUESTIONS, Math.ceil(total * 0.6));
    let remaining = budget;
    const sections = basis.sections
      .map((section) => {
        const questions = section.questions.filter((question) => {
          if (keepRequiredOnly) {
            return question.required;
          }
          remaining -= 1;
          return remaining >= 0;
        });
        return { title: section.title, description: section.description, questions: questions.map((question) => this.copyInput(question)) };
      })
      .filter((section) => section.questions.length > 0);
    return {
      title: basis.title,
      description: basis.description,
      sections: sections.length > 0 ? sections : [{ title: '', description: '', questions: [] }],
    };
  }

  private expand(basis: FormSchema): FormBlueprint {
    const topic = this.topics.resolve([basis.title]);
    const existingTitles = basis.sections.flatMap((section) => section.questions.map((question) => question.title));
    const extras = [...topic.suggestionPool, ...GENERIC_SUGGESTIONS]
      .filter((candidate) => !existingTitles.some((title) => this.matcher.similarity(candidate.title, title) >= 0.99))
      .slice(0, EXTRA_QUESTIONS_ON_EXPAND);
    const sections = basis.sections.map((section) => ({
      title: section.title,
      description: section.description,
      questions: section.questions.map((question) => this.copyInput(question)),
    }));
    const last = sections[sections.length - 1];
    if (last) {
      last.questions.push(...extras.map((extra) => this.copyInput(extra)));
    }
    return { title: basis.title, description: basis.description, sections };
  }

  private fromTopic(topic: FormTopic): FormBlueprint {
    return {
      title: topic.title,
      description: topic.description,
      sections: topic.sections.map((section) => this.copySection(section)),
    };
  }

  private copySection(section: TopicSection): BlueprintSection {
    return {
      title: section.title,
      description: section.description,
      questions: section.questions.map((question) => this.copyInput(question)),
    };
  }

  private copyInput({ type, title, description, required, options, scale }: QuestionInput): BlueprintQuestion {
    return {
      type,
      title,
      description: description ?? '',
      required: required ?? false,
      ...(options ? { options: [...options] } : {}),
      ...(scale ? { scale: { ...scale } } : {}),
    };
  }
}
