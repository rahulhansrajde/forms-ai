import type { ChatIntent, SheetPlanKind } from '@forms-ai/contracts';
import { SheetAction } from '../../../../domain/entities/sheet-action.js';
import type { SheetActionRepository, SpreadsheetRepository } from '../../../../domain/interfaces/repositories.js';
import type { Clock, IdentifierGenerator } from '../../../../domain/interfaces/system.js';
import type { SpreadsheetReferenceParser } from '../../../../domain/services/spreadsheet-reference-parser.js';
import { GoogleOAuthError, GoogleSheetsError } from '../../../../shared/errors/application-errors.js';
import type { GoogleCredentialService } from '../../google/google-credential-service.js';
import type { ClarificationMessages } from '../../intent/clarification-messages.js';
import type { SheetPlanningService } from '../../sheets/sheet-planning-service.js';
import type { SpreadsheetAccessChecker } from '../../sheets/spreadsheet-access-checker.js';
import type { ChatTurnContext, IntentDecision, IntentOutcome } from '../chat-turn-context.js';
import { replyOnly, type IntentHandler } from './intent-handler.js';

export interface SheetHandlerCollaborators {
  planner: SheetPlanningService;
  actions: SheetActionRepository;
  clarifications: ClarificationMessages;
  identifiers: IdentifierGenerator;
  clock: Clock;
}

const BUTTON_LABELS: Readonly<Record<SheetPlanKind, string>> = {
  CREATE: 'Create Google Sheet',
  MODIFY: 'Apply changes',
  READ: 'Read sheet',
};

export class SheetActionHandler implements IntentHandler {
  constructor(
    readonly intent: ChatIntent,
    private readonly kind: SheetPlanKind,
    private readonly collaborators: SheetHandlerCollaborators,
  ) {}

  async handle(message: string, _decision: IntentDecision, context: ChatTurnContext): Promise<IntentOutcome> {
    const { planner, actions, clarifications, identifiers, clock } = this.collaborators;
    if (this.kind !== 'CREATE' && !context.spreadsheet) {
      return replyOnly('CLARIFICATION_REQUIRED', clarifications.noSpreadsheet());
    }
    const plan = await planner.plan(this.kind, message, context.ai);
    if (plan.kind === 'clarify') {
      return replyOnly('CLARIFICATION_REQUIRED', plan.question);
    }
    const action = SheetAction.prepare(
      {
        id: identifiers.generate(),
        userId: context.userId,
        conversationId: context.conversation.id,
        spreadsheetId: this.kind === 'CREATE' ? null : (context.spreadsheet?.id ?? null),
        kind: this.kind,
        summary: plan.summary,
        operations: plan.operations,
      },
      clock.now(),
    );
    await actions.insert(action);
    return { intent: this.intent, reply: this.reply(action, context), changedDraft: null, sheetActionId: action.id };
  }

  private reply(action: SheetAction, context: ChatTurnContext): string {
    const button = BUTTON_LABELS[this.kind];
    const warning = action.isDestructive() ? ' This removes data, so you will be asked to confirm.' : '';
    switch (this.kind) {
      case 'CREATE':
        return `I prepared the Google Sheet “${action.plannedTitle() ?? 'Untitled spreadsheet'}”. Review the steps below and click ${button} when it looks right. Nothing is created until you do.`;
      case 'MODIFY':
        return `I prepared these changes to “${context.spreadsheet?.title ?? 'your Google Sheet'}”. Click ${button} to update the Google Sheet.${warning}`;
      case 'READ':
        return `Click ${button} to fetch the data from “${context.spreadsheet?.title ?? 'your Google Sheet'}”.`;
    }
  }
}

export interface LinkSheetCollaborators {
  references: SpreadsheetReferenceParser;
  credentials: GoogleCredentialService;
  access: SpreadsheetAccessChecker;
  spreadsheets: SpreadsheetRepository;
  actions: SheetActionRepository;
  clarifications: ClarificationMessages;
  identifiers: IdentifierGenerator;
  clock: Clock;
}

type LinkPreview = { kind: 'found'; title: string; tabs: string[] } | { kind: 'needs-access' } | { kind: 'unreachable'; message: string };

export class LinkSheetHandler implements IntentHandler {
  readonly intent: ChatIntent = 'LINK_SHEET';

  constructor(private readonly collaborators: LinkSheetCollaborators) {}

  async handle(message: string, _decision: IntentDecision, context: ChatTurnContext): Promise<IntentOutcome> {
    const { references, actions, clarifications, identifiers, clock } = this.collaborators;
    const reference = references.parse(message);
    if (reference.kind === 'INVALID') {
      return replyOnly('CLARIFICATION_REQUIRED', reference.reason);
    }
    const spreadsheetId = reference.kind === 'FOUND' ? reference.spreadsheetId : await this.knownSpreadsheet(message, context);
    if (!spreadsheetId) {
      return replyOnly('CLARIFICATION_REQUIRED', clarifications.spreadsheetLinkNeeded());
    }
    if (context.spreadsheet?.googleSpreadsheetId === spreadsheetId) {
      return replyOnly('LINK_SHEET', `“${context.spreadsheet.title}” is already the active Google Sheet in this chat. Ask me to read or change it.`);
    }
    const preview = await this.preview(context.userId, spreadsheetId);
    if (preview.kind === 'unreachable') {
      return replyOnly('CLARIFICATION_REQUIRED', preview.message);
    }
    const found = preview.kind === 'found' ? preview : null;
    const action = SheetAction.prepare(
      {
        id: identifiers.generate(),
        userId: context.userId,
        conversationId: context.conversation.id,
        spreadsheetId: null,
        kind: 'LINK',
        summary: found ? `Connect “${found.title}”.` : 'Connect an existing Google Sheet.',
        operations: [{ type: 'LINK_EXISTING_SPREADSHEET', spreadsheetId, title: found?.title ?? null, tabs: found?.tabs ?? [] }],
      },
      clock.now(),
    );
    await actions.insert(action);
    const reply = found
      ? `Google Sheet found: “${found.title}”. Click Connect Google Sheet to use it in this chat. Connecting does not change anything in the spreadsheet.`
      : 'I found a Google Sheets link. To open it, Forms AI needs your Google account with Google Sheets access. Click Connect Google Sheet and follow the prompt.';
    return { intent: this.intent, reply, changedDraft: null, sheetActionId: action.id };
  }

  private async knownSpreadsheet(message: string, context: ChatTurnContext): Promise<string | null> {
    const text = message.toLowerCase();
    const known = await this.collaborators.spreadsheets.listByConversation(context.conversation.id);
    const match = known
      .filter((spreadsheet) => text.includes(spreadsheet.title.toLowerCase()))
      .sort((first, second) => second.title.length - first.title.length)[0];
    return match?.googleSpreadsheetId ?? null;
  }

  private async preview(userId: string, spreadsheetId: string): Promise<LinkPreview> {
    const { credentials, access } = this.collaborators;
    try {
      const connection = await credentials.requireConnection(userId);
      if (!connection.canManageSheets()) {
        return { kind: 'needs-access' };
      }
      const inspected = await access.open(await credentials.accessTokenFor(userId), spreadsheetId);
      return { kind: 'found', title: inspected.snapshot.title, tabs: inspected.tabs.map((tab) => tab.title) };
    } catch (error) {
      if (error instanceof GoogleOAuthError) {
        return { kind: 'needs-access' };
      }
      if (error instanceof GoogleSheetsError) {
        return { kind: 'unreachable', message: error.message };
      }
      throw error;
    }
  }
}
