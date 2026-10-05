import type { PublishStep } from '@forms-ai/contracts';
import { PublishJob } from '../../../domain/entities/publish-job.js';
import type { PublishJobRepository } from '../../../domain/interfaces/repositories.js';
import type { Clock, IdentifierGenerator } from '../../../domain/interfaces/system.js';
import { ApplicationError, ConflictError } from '../../../shared/errors/application-errors.js';

const STALE_JOB_AFTER_MS = 5 * 60 * 1000;
const GENERIC_FAILURE = 'Something went wrong while creating the Google Form. Your draft is safe, so you can try again.';
const INTERRUPTED_FAILURE = 'The previous attempt was interrupted. Your draft is safe, so you can try again.';

export class PublishJobTracker {
  constructor(
    private readonly jobs: PublishJobRepository,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
  ) {}

  async begin(draftId: string, versionId: string): Promise<PublishJob> {
    await this.releaseStaleJob(versionId);
    const job = PublishJob.start(this.identifiers.generate(), draftId, versionId, this.clock.now());
    await this.jobs.insert(job);
    return job;
  }

  async advance(job: PublishJob, step: PublishStep): Promise<PublishJob> {
    const advanced = job.advanceTo(step, this.clock.now());
    await this.jobs.update(advanced);
    return advanced;
  }

  async succeed(job: PublishJob): Promise<PublishJob> {
    const succeeded = job.succeed(this.clock.now());
    await this.jobs.update(succeeded);
    return succeeded;
  }

  async fail(job: PublishJob, error: unknown): Promise<PublishJob> {
    const failed = job.fail(error instanceof ApplicationError ? error.message : GENERIC_FAILURE, this.clock.now());
    await this.jobs.update(failed);
    return failed;
  }

  private async releaseStaleJob(versionId: string): Promise<void> {
    const running = await this.jobs.findRunningByVersion(versionId);
    if (!running) {
      return;
    }
    const now = this.clock.now();
    if (now.getTime() - running.updatedAt.getTime() < STALE_JOB_AFTER_MS) {
      throw new ConflictError('PUBLISH_IN_PROGRESS', 'This form is already being created in Google Forms.');
    }
    await this.jobs.update(running.fail(INTERRUPTED_FAILURE, now));
  }
}
