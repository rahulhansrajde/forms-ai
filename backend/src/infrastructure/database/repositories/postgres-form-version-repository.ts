import type { FormSchema, VersionSource } from '@forms-ai/contracts';
import { FormVersion } from '../../../domain/entities/form-version.js';
import type { FormVersionRepository } from '../../../domain/interfaces/repositories.js';
import { ConflictError } from '../../../shared/errors/application-errors.js';
import type { Database } from '../connection/database.js';
import { UniqueConstraintViolation } from '../connection/database-error-translator.js';

interface FormVersionRow extends Record<string, unknown> {
  id: string;
  draft_id: string;
  version_number: number;
  schema: FormSchema;
  source: VersionSource;
  created_at: Date;
}

const VERSION_COLUMNS = 'id, draft_id, version_number, schema, source, created_at';

export class PostgresFormVersionRepository implements FormVersionRepository {
  constructor(private readonly database: Database) {}

  async insert(version: FormVersion): Promise<void> {
    try {
      await this.database.query(
        `INSERT INTO form_versions (${VERSION_COLUMNS}) VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
        [
          version.id,
          version.draftId,
          version.versionNumber,
          JSON.stringify(version.schema),
          version.source,
          version.createdAt,
        ],
      );
    } catch (error) {
      if (error instanceof UniqueConstraintViolation) {
        throw new ConflictError('VERSION_CONFLICT', 'This form was changed at the same time. Please try again.');
      }
      throw error;
    }
  }

  async findById(id: string): Promise<FormVersion | null> {
    const rows = await this.database.query<FormVersionRow>(
      `SELECT ${VERSION_COLUMNS} FROM form_versions WHERE id = $1`,
      [id],
    );
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  async findLatestVersionNumber(draftId: string): Promise<number> {
    const rows = await this.database.query<{ latest: number | null }>(
      'SELECT MAX(version_number) AS latest FROM form_versions WHERE draft_id = $1',
      [draftId],
    );
    return Number(rows[0]?.latest ?? 0);
  }

  async listByDraft(draftId: string, limit: number, beforeVersionNumber: number | null): Promise<FormVersion[]> {
    const rows = await this.database.query<FormVersionRow>(
      `SELECT ${VERSION_COLUMNS} FROM form_versions
       WHERE draft_id = $1 AND ($2::integer IS NULL OR version_number < $2::integer)
       ORDER BY version_number DESC
       LIMIT $3`,
      [draftId, beforeVersionNumber, limit],
    );
    return rows.map((row) => this.toEntity(row));
  }

  private toEntity(row: FormVersionRow): FormVersion {
    return FormVersion.restore({
      id: row.id,
      draftId: row.draft_id,
      versionNumber: Number(row.version_number),
      schema: row.schema,
      source: row.source,
      createdAt: row.created_at,
    });
  }
}
