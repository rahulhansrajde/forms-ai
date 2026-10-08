import type { MessageView } from '@forms-ai/contracts';
import type { Message } from '../../../domain/entities/message.js';
import { toMessageView } from '../../dto/view-mappers.js';
import type { SheetActionViewService } from '../sheets/sheet-action-view-service.js';

export class MessageViewAssembler {
  constructor(private readonly sheetActions: SheetActionViewService) {}

  async describeAll(messages: readonly Message[]): Promise<MessageView[]> {
    const actionIds = messages.map((message) => message.sheetActionId).filter((id): id is string => id !== null);
    const actions = actionIds.length > 0 ? await this.sheetActions.describeByIds(actionIds) : new Map();
    return messages.map((message) => toMessageView(message, message.sheetActionId ? (actions.get(message.sheetActionId) ?? null) : null));
  }

  async describe(message: Message): Promise<MessageView> {
    const [view] = await this.describeAll([message]);
    return view!;
  }
}
