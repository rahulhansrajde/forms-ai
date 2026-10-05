import type { PublishJobStatus, PublishStep } from '@forms-ai/contracts';
import { PublishJob } from '../../../domain/entities/publish-job.js';
import type { PublishJobRepository } from '../../../domain/interfaces/repositories.js';
import { ConflictError } from '../../../shared/errors/application-errors.js';
import type { Database } from '../connection/database.js';
import { UniqueConstraintViolation } from '../connection/database-error-translator.js';

interface PublishJobRow extends Record<string, unknown> {
  id: string;
  draft_id: string;
  version_id: string;
  status: PublishJobStatus;
  current_step: PublishStep;
  error: string | null;
  created_at: Date;
  updated_at: Date;
}

const PUBLISH_JOB_COLUMNS = 'id, draft_id, version_id, status, current_step, error, created_at, updated_at';

export class PostgresPublishJobRepository implements PublishJobRepository {
  constructor(private readonly database: Database) {}

  async insert(job: PublishJob): Promise<void> {
    try {
      await this.database.query(
        `INSERT INTO publish_jobs (${PUBLISH_JOB_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [job.id, job.draftId, job.versionId, job.status, job.currentStep, job.error, job.createdAt, job.updatedAt],
      );
    } catch (error) {
      if (error instanceof UniqueConstraintViolation) {
        throw new ConflictError('PUBLISH_IN_PROGRESS', 'This form is already being created in Google Forms.');
      }
      throw error;
    }
  }

  async update(job: PublishJob): Promise<void> {
    await this.database.query(
      'UPDATE publish_jobs SET status = $2, current_step = $3, error = $4, updated_at = $5 WHERE id = $1',
      [job.id, job.status, job.currentStep, job.error, job.updatedAt],
    );
  }

  async findLatestByDraft(draftId: string): Promise<PublishJob | null> {
    const rows = await this.database.query<PublishJobRow>(
      `SELECT ${PUBLISH_JOB_COLUMNS} FROM publish_jobs WHERE draft_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [draftId],
    );
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  async findRunningByVersion(versionId: string): Promise<PublishJob | null> {
    const rows = await this.database.query<PublishJobRow>(
      `SELECT ${PUBLISH_JOB_COLUMNS} FROM publish_jobs WHERE version_id = $1 AND status = 'RUNNING' LIMIT 1`,
      [versionId],
    );
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  private toEntity(row: PublishJobRow): PublishJob {
    return PublishJob.restore({
      id: row.id,
      draftId: row.draft_id,
      versionId: row.version_id,
      status: row.status,
      currentStep: row.current_step,
      error: row.error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
