import type { DraftStatus } from '@forms-ai/contracts';
import { FormDraft } from '../../../domain/entities/form-draft.js';
import type { FormDraftRepository } from '../../../domain/interfaces/repositories.js';
import type { Database } from '../connection/database.js';

interface FormDraftRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  conversation_id: string;
  title: string;
  current_version_id: string | null;
  status: DraftStatus;
  created_at: Date;
  updated_at: Date;
}

const DRAFT_COLUMNS = 'id, user_id, conversation_id, title, current_version_id, status, created_at, updated_at';

export class PostgresFormDraftRepository implements FormDraftRepository {
  constructor(private readonly database: Database) {}

  async insert(draft: FormDraft): Promise<void> {
    await this.database.query(`INSERT INTO form_drafts (${DRAFT_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
      draft.id,
      draft.userId,
      draft.conversationId,
      draft.title,
      draft.currentVersionId,
      draft.status,
      draft.createdAt,
      draft.updatedAt,
    ]);
  }

  async update(draft: FormDraft): Promise<void> {
    await this.database.query(
      'UPDATE form_drafts SET title = $2, current_version_id = $3, status = $4, updated_at = $5 WHERE id = $1',
      [draft.id, draft.title, draft.currentVersionId, draft.status, draft.updatedAt],
    );
  }

  async findById(id: string): Promise<FormDraft | null> {
    const rows = await this.database.query<FormDraftRow>(`SELECT ${DRAFT_COLUMNS} FROM form_drafts WHERE id = $1`, [id]);
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  async lockById(id: string): Promise<FormDraft | null> {
    const rows = await this.database.query<FormDraftRow>(
      `SELECT ${DRAFT_COLUMNS} FROM form_drafts WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  async findLatestByConversation(conversationId: string): Promise<FormDraft | null> {
    const rows = await this.database.query<FormDraftRow>(
      `SELECT ${DRAFT_COLUMNS} FROM form_drafts
       WHERE conversation_id = $1 AND current_version_id IS NOT NULL
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [conversationId],
    );
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  private toEntity(row: FormDraftRow): FormDraft {
    return FormDraft.restore({
      id: row.id,
      userId: row.user_id,
      conversationId: row.conversation_id,
      title: row.title,
      currentVersionId: row.current_version_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
