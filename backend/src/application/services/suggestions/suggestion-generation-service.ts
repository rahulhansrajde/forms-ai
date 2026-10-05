import { countQuestions, type FormSchema, type QuestionInput } from '@forms-ai/contracts';
import type { AIProvider } from '../../../domain/interfaces/ai-provider.js';
import { suggestionProposalOutputSchema } from '../ai/ai-output-schemas.js';
import type { AIOutputValidator } from '../ai/ai-output-validator.js';
import type { ChatTurnContext } from '../chat/chat-turn-context.js';

export interface SuggestionProposal {
  formTitle: string;
  baseQuestions: QuestionInput[];
  suggestions: QuestionInput[];
}

export class SuggestionGenerationService {
  constructor(
    private readonly ai: AIProvider,
    private readonly outputValidator: AIOutputValidator,
  ) {}

  async propose(instruction: string, context: ChatTurnContext): Promise<SuggestionProposal> {
    const excluded = this.excludedTitles(context);
    const output = this.outputValidator.parse(
      suggestionProposalOutputSchema,
      await this.ai.suggestQuestions({ instruction, excludedQuestionTitles: excluded, context: context.ai }),
      'question suggestions',
    );
    const form = context.currentVersion?.schema ?? null;
    return {
      formTitle: form?.title ?? output.formTitle,
      baseQuestions: this.hasQuestions(form) ? [] : output.baseQuestions,
      suggestions: this.withoutDuplicates(output.suggestions, excluded),
    };
  }

  private excludedTitles(context: ChatTurnContext): string[] {
    const formTitles =
      context.currentVersion?.schema.sections.flatMap((section) => section.questions.map((question) => question.title)) ??
      [];
    const suggestedTitles = context.openSuggestions?.suggestions.map((suggestion) => suggestion.question.title) ?? [];
    return [...formTitles, ...suggestedTitles];
  }

  private withoutDuplicates(suggestions: QuestionInput[], excludedTitles: readonly string[]): QuestionInput[] {
    const seen = new Set(excludedTitles.map((title) => this.titleKey(title)));
    return suggestions.filter((suggestion) => {
      const key = this.titleKey(suggestion.title);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private hasQuestions(form: FormSchema | null): boolean {
    return form !== null && countQuestions(form) > 0;
  }

  private titleKey(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
}
