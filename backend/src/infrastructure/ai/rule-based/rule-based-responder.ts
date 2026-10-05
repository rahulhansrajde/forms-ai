import type { AIConversationContext } from '../../../domain/interfaces/ai-provider.js';

interface CannedReply {
  pattern: RegExp;
  reply: string;
}

const CANNED_REPLIES: readonly CannedReply[] = [
  {
    pattern: /\bgoogle forms?\b/i,
    reply:
      'Google Forms is a free tool from Google for building surveys, quizzes, registrations and feedback forms. It supports question types such as short answer, paragraph, multiple choice, checkboxes, dropdowns, linear scales, dates and times, and it collects responses automatically, with summaries and an optional link to Google Sheets.\n\nIn Forms AI you describe the form you need, refine the draft in chat or in the preview, and publish it to Google Forms with the Create GForm button when you are ready.',
  },
  {
    pattern: /^(hi|hello|hey|good (morning|afternoon|evening))\b/i,
    reply: 'Hi! Describe the form you need, for example "Create a feedback form for students", and I will draft it for you.',
  },
  {
    pattern: /\b(thanks|thank you|thx|cheers)\b/i,
    reply: 'You are welcome! Let me know if you want to change anything else in your form.',
  },
  {
    pattern: /\b(help|what can you do|how does this work|how do i)\b/i,
    reply:
      'I can draft a form from a description, suggest extra questions, and edit your draft: add, remove or rename questions, change question types and options, mark questions as required, or regenerate the whole form. Open Show Preview to edit it by hand, and use Create GForm in the preview to publish it to Google Forms.',
  },
];

const FALLBACK_WITH_DRAFT =
  'I can keep improving your draft. Ask me to add, remove or change questions, or to suggest more questions.';
const FALLBACK_WITHOUT_DRAFT =
  'I can help you design a Google Form. Describe what you need, for example "Create a college hackathon registration form".';

export class RuleBasedResponder {
  reply(message: string, context: AIConversationContext): string {
    const canned = CANNED_REPLIES.find((candidate) => candidate.pattern.test(message.trim()));
    if (canned) {
      return canned.reply;
    }
    return context.currentForm ? FALLBACK_WITH_DRAFT : FALLBACK_WITHOUT_DRAFT;
  }
}
