import type { PublicationView, PublishRequest, PublishStep } from '@forms-ai/contracts';
import type { FormDraft } from '../../../domain/entities/form-draft.js';
import type { FormVersion } from '../../../domain/entities/form-version.js';
import type { PublishJob } from '../../../domain/entities/publish-job.js';
import type { CreatedFormRepository } from '../../../domain/interfaces/repositories.js';
import type { FormSchemaValidator } from '../../../domain/services/form-schema-validator.js';
import { ConflictError, GoogleOAuthError, PublishError } from '../../../shared/errors/application-errors.js';
import { toPublicationView } from '../../dto/view-mappers.js';
import type { DraftAccessService } from '../../services/access/resource-access-service.js';
import type { DraftViewService } from '../../services/forms/draft-view-service.js';
import type { FormVersionService } from '../../services/forms/form-version-service.js';
import type { GoogleCredentialService } from '../../services/google/google-credential-service.js';
import type { GoogleFormPublisher } from '../../services/publishing/google-form-publisher.js';
import type { PublishJobTracker } from '../../services/publishing/publish-job-tracker.js';

interface PublishTarget {
  draft: FormDraft;
  version: FormVersion;
}

interface JobProgress {
  job: PublishJob;
}

export class CreateGoogleFormUseCase {
  constructor(
    private readonly access: DraftAccessService,
    private readonly versions: FormVersionService,
    private readonly validator: FormSchemaValidator,
    private readonly credentials: GoogleCredentialService,
    private readonly publisher: GoogleFormPublisher,
    private readonly tracker: PublishJobTracker,
    private readonly createdForms: CreatedFormRepository,
    private readonly draftViews: DraftViewService,
  ) {}

  async execute(userId: string, request: PublishRequest): Promise<PublicationView> {
    const target = await this.loadTarget(userId, request);
    const alreadyPublished = await this.findCompletedPublication(target);
    if (alreadyPublished) {
      return alreadyPublished;
    }
    await this.credentials.requireConnection(userId);
    const progress: JobProgress = { job: await this.tracker.begin(target.draft.id, target.version.id) };
    try {
      return await this.publish(userId, target, progress);
    } catch (error) {
      const failedJob = await this.tracker.fail(progress.job, error);
      throw this.toPublishFailure(error, toPublicationView(failedJob, null));
    }
  }

  private async publish(userId: string, target: PublishTarget, progress: JobProgress): Promise<PublicationView> {
    const schema = await this.step(progress, 'VALIDATE_SCHEMA', async () => this.validator.validate(target.version.schema));
    await this.step(progress, 'LOAD_CONNECTION', () => this.credentials.requireConnection(userId));
    const accessToken = await this.step(progress, 'ENSURE_CREDENTIALS', () => this.credentials.accessTokenFor(userId));
    const createdForm = await this.step(progress, 'CREATE_FORM', () =>
      this.publisher.createOrResume(accessToken, target.version, schema),
    );
    await this.step(progress, 'ADD_ITEMS', () => this.publisher.addItems(accessToken, createdForm, schema));
    await this.step(progress, 'APPLY_SETTINGS', () => this.publisher.applySettings(accessToken, createdForm, schema));
    const links = await this.step(progress, 'RETRIEVE_FORM', () => this.publisher.retrieveLinks(accessToken, createdForm));
    const completed = await this.step(progress, 'PERSIST_RESULT', () => this.publisher.recordCompletion(createdForm, links));
    return toPublicationView(await this.tracker.succeed(progress.job), completed);
  }

  private async step<T>(progress: JobProgress, step: PublishStep, work: () => Promise<T>): Promise<T> {
    progress.job = await this.tracker.advance(progress.job, step);
    return work();
  }

  private async loadTarget(userId: string, request: PublishRequest): Promise<PublishTarget> {
    const draft = await this.access.requireOwned(request.draftId, userId);
    const version = await this.versions.loadVersionOfDraft(draft, request.versionId);
    if (!draft.isCurrentVersion(version.id)) {
      throw new ConflictError('VERSION_CONFLICT', 'Your draft changed. Review the latest version before creating the Google Form.', {
        currentVersionId: draft.currentVersionId,
      });
    }
    return { draft, version };
  }

  private async findCompletedPublication(target: PublishTarget): Promise<PublicationView | null> {
    const createdForm = await this.createdForms.findByVersion(target.version.id);
    if (!createdForm?.isComplete()) {
      return null;
    }
    return this.draftViews.describePublication(target.draft.id);
  }

  private toPublishFailure(error: unknown, publication: PublicationView): Error {
    if (error instanceof GoogleOAuthError) {
      return error;
    }
    return new PublishError(publication.error ?? 'The Google Form could not be created.', { publication }, { cause: error });
  }
}
