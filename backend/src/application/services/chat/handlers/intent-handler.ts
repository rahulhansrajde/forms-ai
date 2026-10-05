import type { ChatIntent } from '@forms-ai/contracts';
import type { ChatTurnContext, IntentDecision, IntentOutcome } from '../chat-turn-context.js';

export interface IntentHandler {
  readonly intent: ChatIntent;
  handle(message: string, decision: IntentDecision, context: ChatTurnContext): Promise<IntentOutcome>;
}

export function replyOnly(intent: ChatIntent, reply: string): IntentOutcome {
  return { intent, reply, changedDraft: null };
}
