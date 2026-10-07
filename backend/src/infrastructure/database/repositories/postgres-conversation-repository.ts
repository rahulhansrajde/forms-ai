import { Conversation } from '../../../domain/entities/conversation.js';
import type { ConversationRepository, KeysetPageRequest } from '../../../domain/interfaces/repositories.js';
import type { Database } from '../connection/database.js';

interface ConversationRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
}

const CONVERSATION_COLUMNS = 'id, user_id, title, created_at, updated_at';

export class PostgresConversationRepository implements ConversationRepository {
  constructor(private readonly database: Database) {}

  async insert(conversation: Conversation): Promise<void> {
    await this.database.query(`INSERT INTO conversations (${CONVERSATION_COLUMNS}) VALUES ($1, $2, $3, $4, $5)`, [
      conversation.id,
      conversation.userId,
      conversation.title,
      conversation.createdAt,
      conversation.updatedAt,
    ]);
  }

  async update(conversation: Conversation): Promise<void> {
    await this.database.query('UPDATE conversations SET title = $2, updated_at = $3 WHERE id = $1', [
      conversation.id,
      conversation.title,
      conversation.updatedAt,
    ]);
  }

  async deleteOwned(id: string, userId: string): Promise<boolean> {
    const rows = await this.database.query<{ id: string }>('DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
    return rows.length > 0;
  }

  async findById(id: string): Promise<Conversation | null> {
    const rows = await this.database.query<ConversationRow>(
      `SELECT ${CONVERSATION_COLUMNS} FROM conversations WHERE id = $1`,
      [id],
    );
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  async listByUser(userId: string, page: KeysetPageRequest): Promise<Conversation[]> {
    const rows = await this.database.query<ConversationRow>(
      `SELECT ${CONVERSATION_COLUMNS} FROM conversations
       WHERE user_id = $1 AND ($2::timestamptz IS NULL OR (updated_at, id) < ($2::timestamptz, $3::uuid))
       ORDER BY updated_at DESC, id DESC
       LIMIT $4`,
      [userId, page.before?.timestamp ?? null, page.before?.id ?? null, page.limit],
    );
    return rows.map((row) => this.toEntity(row));
  }

  private toEntity(row: ConversationRow): Conversation {
    return Conversation.restore({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
