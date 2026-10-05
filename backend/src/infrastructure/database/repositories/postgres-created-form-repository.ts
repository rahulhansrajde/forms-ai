import type { CreatedFormStatus } from '@forms-ai/contracts';
import { CreatedGoogleForm } from '../../../domain/entities/created-google-form.js';
import type { CreatedFormRepository } from '../../../domain/interfaces/repositories.js';
import type { Database } from '../connection/database.js';

interface CreatedFormRow extends Record<string, unknown> {
  id: string;
  draft_id: string;
  version_id: string;
  google_form_id: string;
  responder_url: string | null;
  edit_url: string | null;
  status: CreatedFormStatus;
  created_at: Date;
  updated_at: Date;
}

const CREATED_FORM_COLUMNS =
  'id, draft_id, version_id, google_form_id, responder_url, edit_url, status, created_at, updated_at';

export class PostgresCreatedFormRepository implements CreatedFormRepository {
  constructor(private readonly database: Database) {}

  async insert(createdForm: CreatedGoogleForm): Promise<void> {
    await this.database.query(
      `INSERT INTO created_forms (${CREATED_FORM_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        createdForm.id,
        createdForm.draftId,
        createdForm.versionId,
        createdForm.googleFormId,
        createdForm.responderUrl,
        createdForm.editUrl,
        createdForm.status,
        createdForm.createdAt,
        createdForm.updatedAt,
      ],
    );
  }

  async update(createdForm: CreatedGoogleForm): Promise<void> {
    await this.database.query(
      'UPDATE created_forms SET responder_url = $2, edit_url = $3, status = $4, updated_at = $5 WHERE id = $1',
      [createdForm.id, createdForm.responderUrl, createdForm.editUrl, createdForm.status, createdForm.updatedAt],
    );
  }

  async findByVersion(versionId: string): Promise<CreatedGoogleForm | null> {
    const rows = await this.database.query<CreatedFormRow>(
      `SELECT ${CREATED_FORM_COLUMNS} FROM created_forms WHERE version_id = $1`,
      [versionId],
    );
    const row = rows[0];
    return row
      ? CreatedGoogleForm.restore({
          id: row.id,
          draftId: row.draft_id,
          versionId: row.version_id,
          googleFormId: row.google_form_id,
          responderUrl: row.responder_url,
          editUrl: row.edit_url,
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })
      : null;
  }
}
