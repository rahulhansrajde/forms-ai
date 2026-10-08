import type { Conversation } from '../../../domain/entities/conversation.js';
import type { Message } from '../../../domain/entities/message.js';
import type { SheetRecordContext } from '../../../domain/entities/sheet-record-context.js';
import type { Spreadsheet } from '../../../domain/entities/spreadsheet.js';
import type { ConversationTurn, RecentRecordContext, SpreadsheetContext } from '../../../domain/interfaces/ai-provider.js';
import type {
  FormDraftRepository,
  MessageRepository,
  SheetRecordContextRepository,
  SpreadsheetRepository,
  SuggestionSetRepository,
} from '../../../domain/interfaces/repositories.js';
import type { FormVersionService } from '../forms/form-version-service.js';
import type { ChatTurnContext } from './chat-turn-context.js';

const CONTEXT_MESSAGE_LIMIT = 12;
const CONTEXT_MESSAGE_MAX_LENGTH = 2000;

export class ChatContextLoader {
  constructor(
    private readonly messages: MessageRepository,
    private readonly drafts: FormDraftRepository,
    private readonly versions: FormVersionService,
    private readonly suggestionSets: SuggestionSetRepository,
    private readonly spreadsheets: SpreadsheetRepository,
    private readonly sheetRecords: SheetRecordContextRepository,
  ) {}

  async load(userId: string, conversation: Conversation): Promise<ChatTurnContext> {
    const [recentMessages, draft, openSuggestions, spreadsheet, sheetRecords] = await Promise.all([
      this.messages.listNewestFirst(conversation.id, { limit: CONTEXT_MESSAGE_LIMIT, before: null }),
      this.drafts.findLatestByConversation(conversation.id),
      this.suggestionSets.findLatestOpen(conversation.id),
      this.spreadsheets.findActiveByConversation(conversation.id),
      this.sheetRecords.findByConversation(conversation.id),
    ]);
    const currentVersion = draft ? await this.versions.loadCurrentVersion(draft) : null;
    const records = spreadsheet && sheetRecords?.appliesTo(spreadsheet.id) ? sheetRecords : null;
    return {
      userId,
      conversation,
      draft,
      currentVersion,
      openSuggestions,
      spreadsheet,
      sheetRecords: records,
      ai: {
        recentTurns: this.toTurns(recentMessages),
        currentForm: currentVersion?.schema ?? null,
        openSuggestions: openSuggestions?.suggestions ?? [],
        currentSpreadsheet: spreadsheet ? this.describeSpreadsheet(spreadsheet) : null,
        recentRecord: records ? this.describeRecord(records) : null,
      },
    };
  }

  private describeSpreadsheet(spreadsheet: Spreadsheet): SpreadsheetContext {
    return {
      title: spreadsheet.title,
      origin: spreadsheet.origin,
      tabs: spreadsheet.tabs.map((tab) => ({ title: tab.title, rowCount: tab.rowCount, columnCount: tab.columnCount, headers: tab.headers })),
    };
  }

  private describeRecord(records: SheetRecordContext): RecentRecordContext | null {
    const subject = records.subject;
    return subject ? { label: subject.label, tab: subject.tab, identifiers: subject.identifiers } : null;
  }

  private toTurns(newestFirst: Message[]): ConversationTurn[] {
    return [...newestFirst].reverse().map((message) => ({
      role: message.role,
      content: message.content.slice(0, CONTEXT_MESSAGE_MAX_LENGTH),
    }));
  }
}
