import { QUESTION_TYPE_LABELS } from '@forms-ai/contracts';
import type { SuggestionSet } from '../../../../domain/entities/suggestion-set.js';
import { quoted } from './text-formatting.js';

export class SuggestionReplyComposer {
  list(suggestionSet: SuggestionSet): string {
    const lines = suggestionSet.suggestions.map(
      (suggestion, index) =>
        `${index + 1}. ${suggestion.question.title} (${QUESTION_TYPE_LABELS[suggestion.question.type].toLowerCase()}${
          suggestion.question.required ? ', required' : ''
        })`,
    );
    return [
      `Here are some questions you could add to ${quoted(suggestionSet.formTitle)}:`,
      lines.join('\n'),
      'Tell me which ones to add, for example "add 1 and 3", "add all of them" or "add everything except the last one". Your draft stays unchanged until you decide.',
    ].join('\n\n');
  }

  nothingNew(): string {
    return "I don't have any new suggestions beyond what you already have. Tell me more about what you want to collect and I'll try again.";
  }
}
