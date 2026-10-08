import type { ChatIntent } from '@forms-ai/contracts';
import type { AIConversationContext } from '../../../domain/interfaces/ai-provider.js';
import type { TextMatcher } from './text-matcher.js';

const PUBLISH =
  /\b(publish|upload|push|export)\b|\b(create|make|build|generate|put|turn|convert|send)\s+(it|this|that|the (form|draft))\s+(in|on|to|into|as)\s+(a\s+)?(real\s+)?(google forms?|g ?forms?)\b|\b(create|make)\s+(the\s+)?(actual|real)\s+(google\s+)?form\b|\b(create|make|generate|build)\s+(the|my|this)\s+(g-?form|google form)\b|^(please\s+)?(create|make|generate|build)\s+(g-?form|google form)[\s.!]*$|\b(make|take)\s+(it|this|the form)\s+live\b|\bgo live\b/i;
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
const SHEET_NOUN = /\b(google\s+sheets?|spreadsheets?|sheets?\d*|tabs?)\b/i;
const SHEET_PARTS = /\b(rows?|columns?|cells?|ranges?|[A-Z]{1,3}\d+:[A-Z]{1,3}\d+)\b/i;
const SHEET_CREATE_NOUN = /\b(google\s+sheets?|spreadsheets?|sheets?)\b/i;
const SHEET_CREATE = /\b(create|make|build|set up|start|generate)\b/i;
const SHEET_CREATE_EXCLUSIONS = /\b(forms?|gforms?)\b/i;
const TAB_REQUEST = /\b(add|another|new)\s+(?:a\s+)?(?:new\s+)?(?:sheet|tab)\b/i;
const SPREADSHEET_NOUN = /\b(google\s+sheets?|spreadsheets?)\b/i;
const SHEET_SWITCH = /\b(?:switch(?:\s+over)?\s+to|use|work\s+(?:on|with)|connect|link|open)\b.*\b(?:google\s+sheets?|spreadsheets?|sheets?)\b/i;
const SWITCH_TARGET = /\b(instead|existing|another|other|different|this|that|my)\b/i;
const SHEET_READ = /\b(read|show|display|list|what|which|how many|tell me|see)\b/i;
const SHEET_MODIFY = /\b(add|create|remove|delete|rename|change|update|edit|insert|clear|format|bold|resize|set|write|put|fill|make|freeze)\b/i;

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
    const sheetIntent = this.sheetIntent(message, context);
    if (sheetIntent) {
      return sheetIntent;
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

  private sheetIntent(message: string, context: AIConversationContext): ChatIntent | null {
    const mentionsSheet = SHEET_NOUN.test(message);
    if (SHEET_SWITCH.test(message) && SWITCH_TARGET.test(message) && !SHEET_PARTS.test(message) && !SHEET_CREATE.test(message)) {
      return 'LINK_SHEET';
    }
    const asksForTab = TAB_REQUEST.test(message) && !SPREADSHEET_NOUN.test(message);
    if (SHEET_CREATE_NOUN.test(message) && SHEET_CREATE.test(message) && !SHEET_CREATE_EXCLUSIONS.test(message) && !asksForTab) {
      return 'CREATE_SHEET';
    }
    const lowered = message.toLowerCase();
    const mentionsTab = context.currentSpreadsheet?.tabs.some((tab) => lowered.includes(tab.title.toLowerCase())) ?? false;
    if (!context.currentSpreadsheet || !(mentionsSheet || mentionsTab || SHEET_PARTS.test(message) || /\bdata\b/i.test(message))) {
      return null;
    }
    if (SHEET_READ.test(message) && !SHEET_MODIFY.test(message.replace(/\b(show|tell)\s+me\b/i, ''))) {
      return 'READ_SHEET';
    }
    return SHEET_MODIFY.test(message) ? 'MODIFY_SHEET' : null;
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
