import type { ChatIntent, MessageRole } from '@forms-ai/contracts';
import { Message } from '../../../domain/entities/message.js';
import type { KeysetPageRequest, MessageRepository } from '../../../domain/interfaces/repositories.js';
import type { Database } from '../connection/database.js';

interface MessageRow extends Record<string, unknown> {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  intent: ChatIntent | null;
  created_at: Date;
}

export class PostgresMessageRepository implements MessageRepository {
  constructor(private readonly database: Database) {}

  async insert(message: Message): Promise<void> {
    await this.database.query(
      'INSERT INTO messages (id, conversation_id, role, content, intent, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [message.id, message.conversationId, message.role, message.content, message.intent, message.createdAt],
    );
  }

  async updateIntent(messageId: string, intent: ChatIntent): Promise<void> {
    await this.database.query('UPDATE messages SET intent = $2 WHERE id = $1', [messageId, intent]);
  }

  async listNewestFirst(conversationId: string, page: KeysetPageRequest): Promise<Message[]> {
    const rows = await this.database.query<MessageRow>(
      `SELECT id, conversation_id, role, content, intent, created_at FROM messages
       WHERE conversation_id = $1 AND ($2::timestamptz IS NULL OR (created_at, id) < ($2::timestamptz, $3::uuid))
       ORDER BY created_at DESC, id DESC
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
        createdAt: row.created_at,
      }),
    );
  }
}
