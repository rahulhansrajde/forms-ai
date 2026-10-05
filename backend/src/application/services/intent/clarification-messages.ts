import type { SuggestionSet } from '../../../domain/entities/suggestion-set.js';

export class ClarificationMessages {
  general(): string {
    return "I'm not sure what you'd like me to do. Could you tell me a bit more? For example, describe a form to create, or a change to make to your draft.";
  }

  confirmSuggestions(suggestions: SuggestionSet): string {
    const count = suggestions.suggestions.length;
    return `Just to confirm: should I add all ${count} suggested question${count === 1 ? '' : 's'} to your form? Reply "yes" to add all of them, or name the ones you want.`;
  }

  affirmationWithDraft(): string {
    return 'Happy to help. What would you like me to do with your draft? You can ask me to add, remove or change questions.';
  }

  affirmationWithoutDraft(): string {
    return 'What would you like to create? Describe the form you need and I will draft it for you.';
  }

  noDraftToChange(): string {
    return "There's no form draft in this chat yet. Describe the form you need and I'll create one first.";
  }

  noSuggestionsToAccept(): string {
    return "I don't have any pending suggestions to add. Would you like me to suggest some questions?";
  }

  unclearSelection(): string {
    return 'Which of the suggested questions should I add? You can say "add all of them", "add 1 and 3", or name the questions.';
  }

  unsafeAIOutput(): string {
    return "I couldn't apply that safely. Could you rephrase it? Mentioning the exact question names helps.";
  }

  rejectedChange(reason: string): string {
    return `I couldn't make that change: ${reason}`;
  }

  aiUnavailable(): string {
    return "I'm having trouble reaching the AI service right now. Please try again in a moment.";
  }
}
