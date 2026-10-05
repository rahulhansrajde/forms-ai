import { Session } from '../../../domain/entities/session.js';
import type { SessionRepository } from '../../../domain/interfaces/repositories.js';
import type { Database } from '../connection/database.js';

interface SessionRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
}

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly database: Database) {}

  async insert(session: Session): Promise<void> {
    await this.database.query(
      'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)',
      [session.id, session.userId, session.tokenHash, session.expiresAt, session.createdAt],
    );
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    const rows = await this.database.query<SessionRow>(
      'SELECT id, user_id, token_hash, expires_at, created_at FROM sessions WHERE token_hash = $1',
      [tokenHash],
    );
    const row = rows[0];
    return row
      ? Session.restore({
          id: row.id,
          userId: row.user_id,
          tokenHash: row.token_hash,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
        })
      : null;
  }

  async deleteById(id: string): Promise<void> {
    await this.database.query('DELETE FROM sessions WHERE id = $1', [id]);
  }

  async deleteOtherSessions(userId: string, keepSessionId: string): Promise<void> {
    await this.database.query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [userId, keepSessionId]);
  }
}
