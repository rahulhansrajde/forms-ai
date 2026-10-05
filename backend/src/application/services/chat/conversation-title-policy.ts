import { DEFAULT_CONVERSATION_TITLE } from '../../../domain/entities/conversation.js';

const TITLE_MAX_LENGTH = 60;

export class ConversationTitlePolicy {
  normalizeRequested(title: string | undefined): string {
    const cleaned = this.clean(title ?? '');
    return cleaned.length > 0 ? this.truncate(cleaned) : DEFAULT_CONVERSATION_TITLE;
  }

  deriveFromMessage(content: string): string {
    const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
    const cleaned = this.clean(firstLine);
    return cleaned.length > 0 ? this.truncate(cleaned) : DEFAULT_CONVERSATION_TITLE;
  }

  private clean(raw: string): string {
    return raw.replace(/\s+/g, ' ').trim();
  }

  private truncate(title: string): string {
    if (title.length <= TITLE_MAX_LENGTH) {
      return title;
    }
    const cut = title.slice(0, TITLE_MAX_LENGTH - 1);
    const lastSpace = cut.lastIndexOf(' ');
    return `${(lastSpace > TITLE_MAX_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
  }
}
