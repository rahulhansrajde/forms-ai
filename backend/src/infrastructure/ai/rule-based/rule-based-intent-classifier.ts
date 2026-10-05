import type { ChatIntent } from '@forms-ai/contracts';
import type { AIConversationContext } from '../../../domain/interfaces/ai-provider.js';
import type { TextMatcher } from './text-matcher.js';

const PUBLISH =
  /\b(publish|upload|push|export)\b|\b(create|make|build|generate|put|turn|convert|send)\s+(it|this|that|the (form|draft))\s+(in|on|to|into|as)\s+(a\s+)?(real\s+)?(google forms?|g ?forms?)\b|\b(create|make)\s+(the\s+)?(actual|real)\s+(google\s+)?form\b/i;
const SUGGEST =
  /\bwhat (else|other|more)\b|\bsuggest(ions?)?\b|\b(ideas?|recommend\w*)\b.*\bquestions?\b|\b(give|show|get)\s+me\s+(some\s+|more\s+|other\s+|different\s+|new\s+)?(questions|ideas|suggestions|ones)\b|\b(different|other|more|new) (ones|suggestions)\b|\bwhat (questions|should i ask|can i ask|could i ask)\b/i;
const ACCEPT_VERBS = /\b(add|use|include|take|keep|accept|go with|put in|insert)\b/i;
const ACCEPT_REFERENCES = /\b(those|these|them|all|both|everything|suggestions?|suggested|ones|first|second|third|fourth|fifth|last|\d+)\b/i;
const REGENERATE =
  /\b(regenerate|re-?generate|redo|start over|recreate|re-?create|rewrite|rebuild)\b|\b(another|new|different|better|simpler|shorter|longer|cleaner) version\b|\b(fewer|less) questions\b|\bmake (it|this|the form) (simpler|shorter|longer|better|more detailed)\b/i;
const STRONG_CREATE =
  /\b(create|build|generate|design|draft|set up|prepare|need|want|make)\s+(me\s+)?(a|an|another|new)\b.*\b(g?forms?|survey|questionnaire|poll|quiz)\b/i;
const WEAK_CREATE =
  /\b(create|make|build|generate|design|draft|set up|need|want|prepare|start)\b.*\b(g?forms?|survey|questionnaire|registration|application|poll|quiz|sign[- ]?up|rsvp)\b/i;
const MODIFY =
  /\b(add|remove|delete|drop|rename|change|update|edit|replace|move|reorder|swap|insert|include|exclude|set|mark|turn|make)\b|\bget rid of\b|\b(should|must|needs to) be\s+(required|mandatory|optional)\b/i;
const INFORMATION_QUESTION = /^(what|how|why|who|when|where|explain|tell me|is|are|does|do|can you explain)\b/i;

export interface RuleBasedIntentResult {
  intent: ChatIntent;
}

export class RuleBasedIntentClassifier {
  constructor(private readonly matcher: TextMatcher) {}

  classify(message: string, context: AIConversationContext): RuleBasedIntentResult {
    return { intent: this.detect(message.trim(), context) };
  }

  private detect(message: string, context: AIConversationContext): ChatIntent {
    if (PUBLISH.test(message)) {
      return 'CREATE_GOOGLE_FORM';
    }
    if (this.isAcceptance(message, context)) {
      return 'ACCEPT_SUGGESTIONS';
    }
    if (SUGGEST.test(message)) {
      return 'SUGGEST_QUESTIONS';
    }
    if (REGENERATE.test(message)) {
      return 'REGENERATE_FORM';
    }
    if (STRONG_CREATE.test(message)) {
      return 'CREATE_FORM';
    }
    if (INFORMATION_QUESTION.test(message)) {
      return 'NORMAL_CHAT';
    }
    if (MODIFY.test(message) && context.currentForm) {
      return 'MODIFY_FORM';
    }
    if (WEAK_CREATE.test(message)) {
      return 'CREATE_FORM';
    }
    return MODIFY.test(message) ? 'MODIFY_FORM' : 'NORMAL_CHAT';
  }

  private isAcceptance(message: string, context: AIConversationContext): boolean {
    if (context.openSuggestions.length === 0 || !ACCEPT_VERBS.test(message)) {
      return false;
    }
    return (
      ACCEPT_REFERENCES.test(message) ||
      context.openSuggestions.some((suggestion) => this.matcher.mentions(message, suggestion.question.title))
    );
  }
}
