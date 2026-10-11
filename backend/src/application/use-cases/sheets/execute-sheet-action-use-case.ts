import type { ExecuteSheetActionResult } from '@forms-ai/contracts';
import type { SheetAction } from '../../../domain/entities/sheet-action.js';
import type { SheetActionRepository, SpreadsheetRepository } from '../../../domain/interfaces/repositories.js';
import type { TransactionRunner } from '../../../domain/interfaces/system.js';
import {
  ConfirmationRequiredError,
  ConflictError,
  GoogleOAuthError,
  GoogleSheetsError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/application-errors.js';
import type { MessageViewAssembler } from '../../services/chat/message-view-assembler.js';
import type { SheetActionRunner } from '../../services/sheets/sheet-action-runner.js';
import type { SheetActionViewService } from '../../services/sheets/sheet-action-view-service.js';
import type { SheetResultAnnouncer } from '../../services/sheets/sheet-result-announcer.js';

export interface SheetActionCollaborators {
  actions: SheetActionRepository;
  spreadsheets: SpreadsheetRepository;
  runner: SheetActionRunner;
  announcer: SheetResultAnnouncer;
  views: SheetActionViewService;
  messages: MessageViewAssembler;
  transactions: TransactionRunner;
}

export class ExecuteSheetActionUseCase {
  constructor(private readonly collaborators: SheetActionCollaborators) {}

  async execute(userId: string, actionId: string, confirmDestructive: boolean): Promise<ExecuteSheetActionResult> {
    const { actions, views, runner } = this.collaborators;
    const action = await actions.findOwned(actionId, userId);
    if (!action) {
      throw new NotFoundError('Google Sheets action');
    }
    if (action.isComplete()) {
      return { action: await this.view(action), message: null };
    }
    if (action.isDestructive() && !confirmDestructive) {
      throw new ConfirmationRequiredError('Confirm that you want to make this destructive change before Forms AI applies it.', {
        action: await this.view(action),
      });
    }
    await runner.requireSheetsAccess(userId);
    const claimed = await runner.claim(action);
    if (!claimed) {
      throw new ConflictError('CONFLICT', 'This Google Sheets action is already running.', { action: views.describe(action, null) });
    }
    try {
      return await this.run(claimed);
    } catch (error) {
      throw await this.recordFailure(claimed, error);
    }
  }

  private async run(claimed: SheetAction): Promise<ExecuteSheetActionResult> {
    const { actions, runner, announcer, views, messages, transactions } = this.collaborators;
    const result = await runner.run(claimed);
    const message = await transactions.runInTransaction(async () => {
      await actions.update(result.action);
      return announcer.announceSuccess(result.action, result.spreadsheet, result.summary);
    });
    return { action: views.describe(result.action, result.spreadsheet), message: await messages.describe(message) };
  }

  private async recordFailure(claimed: SheetAction, error: unknown): Promise<Error> {
    const { runner, announcer, messages } = this.collaborators;
    const { action: failed, reason } = await runner.fail(claimed, error);
    const action = await this.view(failed);
    if (error instanceof GoogleOAuthError) {
      return error;
    }
    const message = await messages.describe(await announcer.announceFailure(failed, reason));
    if (error instanceof ValidationError) {
      return new ValidationError(reason, { action, message }, { cause: error });
    }
    return new GoogleSheetsError(reason, { action, message }, { cause: error });
  }

  private async view(action: SheetAction) {
    const spreadsheet = action.spreadsheetId ? await this.collaborators.spreadsheets.findOwned(action.spreadsheetId, action.userId) : null;
    return this.collaborators.views.describe(action, spreadsheet);
  }
}
