import type { PublicationView, PublishRequest, PublishResult, PublishStep } from '@forms-ai/contracts';
import type { FormDraft } from '../../../domain/entities/form-draft.js';
import type { FormVersion } from '../../../domain/entities/form-version.js';
import type { PublishJob } from '../../../domain/entities/publish-job.js';
import type { CreatedFormRepository } from '../../../domain/interfaces/repositories.js';
import type { TransactionRunner } from '../../../domain/interfaces/system.js';
import type { FormSchemaValidator } from '../../../domain/services/form-schema-validator.js';
import { ConflictError, GoogleOAuthError, PublishError } from '../../../shared/errors/application-errors.js';
import { toMessageView, toPublicationView } from '../../dto/view-mappers.js';
import type { DraftAccessService } from '../../services/access/resource-access-service.js';
import type { DraftViewService } from '../../services/forms/draft-view-service.js';
import type { FormVersionService } from '../../services/forms/form-version-service.js';
import type { GoogleCredentialService } from '../../services/google/google-credential-service.js';
import type { GoogleFormPublisher } from '../../services/publishing/google-form-publisher.js';
import type { PublicationAnnouncer } from '../../services/publishing/publication-announcer.js';
import type { PublishJobTracker } from '../../services/publishing/publish-job-tracker.js';

interface PublishTarget {
  draft: FormDraft;
  version: FormVersion;
}

interface JobProgress {
  job: PublishJob;
}

export interface PublishCollaborators {
  publisher: GoogleFormPublisher;
  tracker: PublishJobTracker;
  announcer: PublicationAnnouncer;
  createdForms: CreatedFormRepository;
  draftViews: DraftViewService;
  transactions: TransactionRunner;
}

export class CreateGoogleFormUseCase {
  constructor(
    private readonly access: DraftAccessService,
    private readonly versions: FormVersionService,
    private readonly validator: FormSchemaValidator,
    private readonly credentials: GoogleCredentialService,
    private readonly collaborators: PublishCollaborators,
  ) {}

  async execute(userId: string, request: PublishRequest): Promise<PublishResult> {
    const target = await this.loadTarget(userId, request);
    const alreadyPublished = await this.findCompletedPublication(target);
    if (alreadyPublished) {
      return { publication: alreadyPublished, message: null };
    }
    await this.credentials.requireConnection(userId);
    const { tracker } = this.collaborators;
    const progress: JobProgress = { job: await tracker.begin(target.draft.id, target.version.id) };
    try {
      return await this.publish(userId, target, progress);
    } catch (error) {
      const failedJob = await tracker.fail(progress.job, error);
      throw await this.toPublishFailure(error, target, toPublicationView(failedJob, null));
    }
  }

  private async publish(userId: string, target: PublishTarget, progress: JobProgress): Promise<PublishResult> {
    const { publisher, announcer, tracker, transactions } = this.collaborators;
    const schema = await this.step(progress, 'VALIDATE_SCHEMA', async () => this.validator.validate(target.version.schema));
    await this.step(progress, 'LOAD_CONNECTION', () => this.credentials.requireConnection(userId));
    const accessToken = await this.step(progress, 'ENSURE_CREDENTIALS', () => this.credentials.accessTokenFor(userId));
    const createdForm = await this.step(progress, 'CREATE_FORM', () => publisher.createOrResume(accessToken, target.version, schema));
    await this.step(progress, 'ADD_ITEMS', () => publisher.addItems(accessToken, createdForm, schema));
    await this.step(progress, 'APPLY_SETTINGS', () => publisher.applySettings(accessToken, createdForm, schema));
    const snapshot = await this.step(progress, 'RETRIEVE_FORM', () => publisher.readBack(accessToken, createdForm));
    await this.step(progress, 'VERIFY_FORM', async () => publisher.verify(target.version, schema, snapshot));
    const outcome = await this.step(progress, 'PERSIST_RESULT', () =>
      transactions.runInTransaction(async () => {
        const completed = await publisher.recordCompletion(createdForm, snapshot);
        return { completed, message: await announcer.announceSuccess(target.draft, target.version, completed) };
      }),
    );
    return {
      publication: toPublicationView(await tracker.succeed(progress.job), outcome.completed),
      message: toMessageView(outcome.message),
    };
  }

  private async step<T>(progress: JobProgress, step: PublishStep, work: () => Promise<T>): Promise<T> {
    progress.job = await this.collaborators.tracker.advance(progress.job, step);
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
    const createdForm = await this.collaborators.createdForms.findByVersion(target.version.id);
    if (!createdForm?.isComplete()) {
      return null;
    }
    return this.collaborators.draftViews.describePublication(target.draft.id);
  }

  private async toPublishFailure(error: unknown, target: PublishTarget, publication: PublicationView): Promise<Error> {
    if (error instanceof GoogleOAuthError) {
      return error;
    }
    const reason = publication.error ?? 'The Google Form could not be created.';
    const message = await this.collaborators.announcer.announceFailure(target.draft, target.version, reason);
    return new PublishError(reason, { publication, message: toMessageView(message) }, { cause: error });
  }
}
