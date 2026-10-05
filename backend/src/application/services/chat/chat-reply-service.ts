import { MESSAGE_MAX_LENGTH } from '@forms-ai/contracts';
import type { AIConversationContext, AIProvider } from '../../../domain/interfaces/ai-provider.js';
import { AIOutputRejectedError } from '../../../shared/errors/application-errors.js';

export class ChatReplyService {
  constructor(private readonly ai: AIProvider) {}

  async reply(message: string, context: AIConversationContext): Promise<string> {
    const reply = (await this.ai.reply(message, context)).trim();
    if (reply.length === 0) {
      throw new AIOutputRejectedError('The AI returned an empty reply.');
    }
    return reply.slice(0, MESSAGE_MAX_LENGTH);
  }
}
