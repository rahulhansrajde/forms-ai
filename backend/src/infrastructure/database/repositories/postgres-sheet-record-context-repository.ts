import { SheetRecordContext, type PendingRecordRequest, type RememberedRecord } from '../../../domain/entities/sheet-record-context.js';
import type { SheetRecordContextRepository } from '../../../domain/interfaces/repositories.js';
import type { Database } from '../connection/database.js';

interface SheetRecordContextRow extends Record<string, unknown> {
  conversation_id: string;
  user_id: string;
  spreadsheet_id: string;
  subject: RememberedRecord | null;
  pending: PendingRecordRequest | null;
  updated_at: Date;
}

export class PostgresSheetRecordContextRepository implements SheetRecordContextRepository {
  constructor(private readonly database: Database) {}

  async findByConversation(conversationId: string): Promise<SheetRecordContext | null> {
    const rows = await this.database.query<SheetRecordContextRow>(
      'SELECT conversation_id, user_id, spreadsheet_id, subject, pending, updated_at FROM sheet_record_contexts WHERE conversation_id = $1',
      [conversationId],
    );
    const row = rows[0];
    return row
      ? SheetRecordContext.restore({
          conversationId: row.conversation_id,
          userId: row.user_id,
          spreadsheetId: row.spreadsheet_id,
          subject: row.subject,
          pending: row.pending,
          updatedAt: row.updated_at,
        })
      : null;
  }

  async save(context: SheetRecordContext): Promise<void> {
    await this.database.query(
      `INSERT INTO sheet_record_contexts (conversation_id, user_id, spreadsheet_id, subject, pending, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (conversation_id) DO UPDATE
       SET spreadsheet_id = EXCLUDED.spreadsheet_id, subject = EXCLUDED.subject, pending = EXCLUDED.pending, updated_at = EXCLUDED.updated_at`,
      [
        context.conversationId,
        context.userId,
        context.spreadsheetId,
        context.subject === null ? null : JSON.stringify(context.subject),
        context.pending === null ? null : JSON.stringify(context.pending),
        context.updatedAt,
      ],
    );
  }
}
