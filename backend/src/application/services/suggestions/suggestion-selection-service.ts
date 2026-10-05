import type { SuggestedQuestion, SuggestionSet } from '../../../domain/entities/suggestion-set.js';
import type { AIProvider } from '../../../domain/interfaces/ai-provider.js';
import { suggestionSelectionOutputSchema } from '../ai/ai-output-schemas.js';
import type { AIOutputValidator } from '../ai/ai-output-validator.js';

export class SuggestionSelectionService {
  constructor(
    private readonly ai: AIProvider,
    private readonly outputValidator: AIOutputValidator,
  ) {}

  async select(message: string, suggestionSet: SuggestionSet, acceptAll: boolean): Promise<SuggestedQuestion[]> {
    if (acceptAll) {
      return suggestionSet.suggestions;
    }
    const output = this.outputValidator.parse(
      suggestionSelectionOutputSchema,
      await this.ai.selectSuggestions(message, suggestionSet.suggestions),
      'suggestion selection',
    );
    return suggestionSet.selectByIds(output.acceptedIds);
  }
}
