import type { ChatIntent, MessageRole } from '@forms-ai/contracts';
import { Message, type PublishedFormReference } from '../../../domain/entities/message.js';
import type { KeysetPageRequest, MessageRepository } from '../../../domain/interfaces/repositories.js';
import type { Database } from '../connection/database.js';

interface MessageRow extends Record<string, unknown> {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  intent: ChatIntent | null;
  created_at: Date;
  created_form_id: string | null;
  form_title: string | null;
  version_number: number | null;
  responder_url: string | null;
  edit_url: string | null;
}

export class PostgresMessageRepository implements MessageRepository {
  constructor(private readonly database: Database) {}

  async insert(message: Message): Promise<void> {
    await this.database.query(
      'INSERT INTO messages (id, conversation_id, role, content, intent, created_form_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [
        message.id,
        message.conversationId,
        message.role,
        message.content,
        message.intent,
        message.publishedForm?.createdFormId ?? null,
        message.createdAt,
      ],
    );
  }

  async updateIntent(messageId: string, intent: ChatIntent): Promise<void> {
    await this.database.query('UPDATE messages SET intent = $2 WHERE id = $1', [messageId, intent]);
  }

  async listNewestFirst(conversationId: string, page: KeysetPageRequest): Promise<Message[]> {
    const rows = await this.database.query<MessageRow>(
      `SELECT m.id, m.conversation_id, m.role, m.content, m.intent, m.created_at, m.created_form_id,
              v.schema ->> 'title' AS form_title, v.version_number, cf.responder_url, cf.edit_url
       FROM messages m
       LEFT JOIN created_forms cf ON cf.id = m.created_form_id AND cf.status = 'CREATED'
       LEFT JOIN form_versions v ON v.id = cf.version_id
       WHERE m.conversation_id = $1 AND ($2::timestamptz IS NULL OR (m.created_at, m.id) < ($2::timestamptz, $3::uuid))
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $4`,
      [conversationId, page.before?.timestamp ?? null, page.before?.id ?? null, page.limit],
    );
    return rows.map((row) =>
      Message.restore({
        id: row.id,
        conversationId: row.conversation_id,
        role: row.role,
        content: row.content,
        intent: row.intent,
        publishedForm: this.publishedForm(row),
        createdAt: row.created_at,
      }),
    );
  }

  private publishedForm(row: MessageRow): PublishedFormReference | null {
    if (!row.created_form_id || !row.responder_url || !row.edit_url || row.version_number === null) {
      return null;
    }
    return {
      createdFormId: row.created_form_id,
      title: row.form_title ?? '',
      versionNumber: row.version_number,
      responderUrl: row.responder_url,
      editUrl: row.edit_url,
    };
  }
}
