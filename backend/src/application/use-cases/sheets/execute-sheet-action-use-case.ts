import type { ExecuteSheetActionResult } from '@forms-ai/contracts';
import type { SheetAction } from '../../../domain/entities/sheet-action.js';
import type { SheetActionRepository, SpreadsheetRepository } from '../../../domain/interfaces/repositories.js';
import type { Clock, TransactionRunner } from '../../../domain/interfaces/system.js';
import {
  ApplicationError,
  ConfirmationRequiredError,
  ConflictError,
  GoogleOAuthError,
  GoogleSheetsError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/application-errors.js';
import type { MessageViewAssembler } from '../../services/chat/message-view-assembler.js';
import type { GoogleCredentialService } from '../../services/google/google-credential-service.js';
import type { SheetActionExecutor } from '../../services/sheets/sheet-action-executor.js';
import type { SheetActionViewService } from '../../services/sheets/sheet-action-view-service.js';
import type { SheetDataSummarizer } from '../../services/sheets/sheet-data-summarizer.js';
import type { SheetResultAnnouncer } from '../../services/sheets/sheet-result-announcer.js';

const STALE_EXECUTION_MS = 5 * 60 * 1000;
const GENERIC_FAILURE = 'Something went wrong while talking to Google Sheets.';

export interface SheetActionCollaborators {
  actions: SheetActionRepository;
  spreadsheets: SpreadsheetRepository;
  executor: SheetActionExecutor;
  announcer: SheetResultAnnouncer;
  views: SheetActionViewService;
  messages: MessageViewAssembler;
  transactions: TransactionRunner;
  summarizer: SheetDataSummarizer;
}

export class ExecuteSheetActionUseCase {
  constructor(
    private readonly credentials: GoogleCredentialService,
    private readonly collaborators: SheetActionCollaborators,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, actionId: string, confirmDestructive: boolean): Promise<ExecuteSheetActionResult> {
    const { actions, views } = this.collaborators;
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
    const connection = await this.credentials.requireConnection(userId);
    if (!connection.canManageSheets()) {
      throw new GoogleOAuthError('GOOGLE_SHEETS_ACCESS_REQUIRED', 'Allow Forms AI to use Google Sheets, then try again.');
    }
    const now = this.clock.now();
    const claimed = await actions.claimForExecution(actionId, userId, now, new Date(now.getTime() - STALE_EXECUTION_MS));
    if (!claimed) {
      throw new ConflictError('CONFLICT', 'This Google Sheets action is already running.', { action: views.describe(action, null) });
    }
    try {
      return await this.run(userId, claimed);
    } catch (error) {
      throw await this.recordFailure(userId, claimed, error);
    }
  }

  private async run(userId: string, claimed: SheetAction): Promise<ExecuteSheetActionResult> {
    const { actions, executor, announcer, views, messages, transactions } = this.collaborators;
    const accessToken = await this.credentials.accessTokenFor(userId);
    const outcome = await executor.execute(accessToken, claimed);
    const summary =
      outcome.table && outcome.action.wantsSummary()
        ? await this.collaborators.summarizer.summarize(outcome.action.summary, outcome.spreadsheet.title, outcome.table)
        : null;
    const succeeded = outcome.action.succeed({ table: outcome.table }, this.clock.now());
    const message = await transactions.runInTransaction(async () => {
      await actions.update(succeeded);
      return announcer.announceSuccess(succeeded, outcome.spreadsheet, summary);
    });
    return { action: views.describe(succeeded, outcome.spreadsheet), message: await messages.describe(message) };
  }

  private async recordFailure(userId: string, claimed: SheetAction, error: unknown): Promise<Error> {
    const { actions, announcer, messages } = this.collaborators;
    const latest = (await actions.findOwned(claimed.id, userId)) ?? claimed;
    const reason = error instanceof ApplicationError ? error.message : GENERIC_FAILURE;
    const failed = latest.fail(reason, this.clock.now());
    await actions.update(failed);
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
