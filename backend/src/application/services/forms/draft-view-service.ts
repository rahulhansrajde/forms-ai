import type { DraftView, PublicationView } from '@forms-ai/contracts';
import type { FormDraft } from '../../../domain/entities/form-draft.js';
import type { FormVersion } from '../../../domain/entities/form-version.js';
import type { CreatedFormRepository, PublishJobRepository } from '../../../domain/interfaces/repositories.js';
import { toPublicationView, toVersionView } from '../../dto/view-mappers.js';
import type { FormVersionService } from './form-version-service.js';

export class DraftViewService {
  constructor(
    private readonly versions: FormVersionService,
    private readonly publishJobs: PublishJobRepository,
    private readonly createdForms: CreatedFormRepository,
  ) {}

  async describe(draft: FormDraft, currentVersion?: FormVersion): Promise<DraftView> {
    const version = currentVersion ?? (await this.versions.loadCurrentVersion(draft));
    return {
      id: draft.id,
      conversationId: draft.conversationId,
      title: draft.title,
      status: draft.status,
      currentVersion: toVersionView(version),
      publication: await this.describePublication(draft.id),
      updatedAt: draft.updatedAt.toISOString(),
    };
  }

  async describePublication(draftId: string): Promise<PublicationView | null> {
    const job = await this.publishJobs.findLatestByDraft(draftId);
    if (!job) {
      return null;
    }
    return toPublicationView(job, await this.createdForms.findByVersion(job.versionId));
  }
}
