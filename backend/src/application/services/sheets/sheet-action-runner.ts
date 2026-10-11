import type { SheetAction } from '../../../domain/entities/sheet-action.js';
import type { Spreadsheet } from '../../../domain/entities/spreadsheet.js';
import type { SheetActionRepository } from '../../../domain/interfaces/repositories.js';
import type { Clock } from '../../../domain/interfaces/system.js';
import { ApplicationError, GoogleOAuthError } from '../../../shared/errors/application-errors.js';
import type { GoogleCredentialService } from '../google/google-credential-service.js';
import type { SheetActionExecutor } from './sheet-action-executor.js';
import type { SheetDataSummarizer } from './sheet-data-summarizer.js';

const STALE_EXECUTION_MS = 5 * 60 * 1000;
const GENERIC_FAILURE = 'Something went wrong while talking to Google Sheets.';

export interface SheetRunResult {
  action: SheetAction;
  spreadsheet: Spreadsheet;
  summary: string | null;
}

export interface SheetRunFailure {
  action: SheetAction;
  reason: string;
}

export class SheetActionRunner {
  constructor(
    private readonly credentials: GoogleCredentialService,
    private readonly actions: SheetActionRepository,
    private readonly executor: SheetActionExecutor,
    private readonly summarizer: SheetDataSummarizer,
    private readonly clock: Clock,
  ) {}

  async requireSheetsAccess(userId: string): Promise<void> {
    const connection = await this.credentials.requireConnection(userId);
    if (!connection.canManageSheets()) {
      throw new GoogleOAuthError('GOOGLE_SHEETS_ACCESS_REQUIRED', 'Allow Forms AI to use Google Sheets, then try again.');
    }
  }

  async claim(action: SheetAction): Promise<SheetAction | null> {
    const now = this.clock.now();
    return this.actions.claimForExecution(action.id, action.userId, now, new Date(now.getTime() - STALE_EXECUTION_MS));
  }

  // Returns the succeeded action unsaved, so callers can store it together with the message that presents it.
  async run(claimed: SheetAction): Promise<SheetRunResult> {
    const accessToken = await this.credentials.accessTokenFor(claimed.userId);
    const outcome = await this.executor.execute(accessToken, claimed);
    const summary =
      outcome.table && outcome.action.wantsSummary() ? await this.summarizer.summarize(outcome.action.summary, outcome.spreadsheet.title, outcome.table) : null;
    return { action: outcome.action.succeed({ table: outcome.table }, this.clock.now()), spreadsheet: outcome.spreadsheet, summary };
  }

  async fail(claimed: SheetAction, error: unknown): Promise<SheetRunFailure> {
    const latest = (await this.actions.findOwned(claimed.id, claimed.userId)) ?? claimed;
    const reason = error instanceof ApplicationError ? error.message : GENERIC_FAILURE;
    const failed = latest.fail(reason, this.clock.now());
    await this.actions.update(failed);
    return { action: failed, reason };
  }
}
