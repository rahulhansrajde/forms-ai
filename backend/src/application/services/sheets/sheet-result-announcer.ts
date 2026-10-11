import type { SheetAction } from '../../../domain/entities/sheet-action.js';
import type { Spreadsheet } from '../../../domain/entities/spreadsheet.js';
import { Message } from '../../../domain/entities/message.js';
import type { ConversationRepository, MessageRepository } from '../../../domain/interfaces/repositories.js';
import type { Clock, IdentifierGenerator } from '../../../domain/interfaces/system.js';
import type { SheetOperationDescriber } from '../../../domain/services/sheet-operation-describer.js';

const STRUCTURE_RANGE = 'Spreadsheet structure';

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export class SheetResultAnnouncer {
  constructor(
    private readonly messages: MessageRepository,
    private readonly conversations: ConversationRepository,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
    private readonly describer: SheetOperationDescriber,
  ) {}

  async announceSuccess(action: SheetAction, spreadsheet: Spreadsheet, summary: string | null = null): Promise<Message> {
    return this.post(action, this.describeSuccess(action, spreadsheet, summary), action.id);
  }

  describeSuccess(action: SheetAction, spreadsheet: Spreadsheet, summary: string | null = null): string {
    const text = this.successText(action, spreadsheet);
    return summary ? `${text}\n\nSummary: ${summary}` : text;
  }

  async announceFailure(action: SheetAction, reason: string): Promise<Message> {
    return this.post(action, `The Google Sheets action could not be completed. ${reason} Nothing else was changed by Forms AI, so you can try again.`, null);
  }

  private successText(action: SheetAction, spreadsheet: Spreadsheet): string {
    const table = action.result?.table ?? null;
    switch (action.kind) {
      case 'CREATE':
        return `Google Sheet created successfully. “${spreadsheet.title}” is ready.`;
      case 'LINK':
        return `Google Sheet connected successfully. “${spreadsheet.title}” is now the active spreadsheet in this chat (tabs: ${spreadsheet.tabs.map((tab) => tab.title).join(', ') || 'none'}).`;
      case 'MODIFY':
        return `Google Sheet updated successfully. ${this.describer.resultSentence(action.steps ?? this.describer.describeAll(action.operations, spreadsheet.tabs))}`;
      case 'READ':
        if (table?.range === STRUCTURE_RANGE) {
          return `“${spreadsheet.title}” has ${plural(table.values.length - 1, 'tab')}. The table below shows each tab with its size and header row from Google Sheets.`;
        }
        return table
          ? `Here is the data from “${spreadsheet.title}”: ${this.describer.tableSummary(table)}. The table below shows the exact values from Google Sheets.`
          : `Read “${spreadsheet.title}”.`;
    }
  }

  private async post(action: SheetAction, content: string, sheetActionId: string | null): Promise<Message> {
    const now = this.clock.now();
    const message = Message.sheetResult(this.identifiers.generate(), action.conversationId, content, sheetActionId, now);
    await this.messages.insert(message);
    const conversation = await this.conversations.findById(action.conversationId);
    if (conversation) {
      await this.conversations.update(conversation.touch(now));
    }
    return message;
  }
}
