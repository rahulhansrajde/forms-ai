import type { FormSchema, VersionSource } from '@forms-ai/contracts';
import { FormDraft } from '../../../domain/entities/form-draft.js';
import { FormVersion } from '../../../domain/entities/form-version.js';
import type { FormDraftRepository, FormVersionRepository } from '../../../domain/interfaces/repositories.js';
import type { Clock, IdentifierGenerator, TransactionRunner } from '../../../domain/interfaces/system.js';
import type { FormSchemaValidator } from '../../../domain/services/form-schema-validator.js';
import { ConflictError, NotFoundError } from '../../../shared/errors/application-errors.js';

export interface VersionedDraft {
  draft: FormDraft;
  version: FormVersion;
}

export interface VersionCommitRequest {
  draftId: string;
  baseVersionId: string;
  schema: FormSchema;
  source: VersionSource;
}

export interface NewDraftRequest {
  userId: string;
  conversationId: string;
  schema: FormSchema;
  source: VersionSource;
}

export class FormVersionService {
  constructor(
    private readonly drafts: FormDraftRepository,
    private readonly versions: FormVersionRepository,
    private readonly validator: FormSchemaValidator,
    private readonly transactions: TransactionRunner,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
  ) {}

  async createDraft(request: NewDraftRequest): Promise<VersionedDraft> {
    const schema = this.validator.validate(request.schema);
    return this.transactions.runInTransaction(async () => {
      const draft = FormDraft.open(
        this.identifiers.generate(),
        request.userId,
        request.conversationId,
        schema.title,
        this.clock.now(),
      );
      await this.drafts.insert(draft);
      return this.appendVersion(draft, schema, request.source, 1);
    });
  }

  async commitVersion(request: VersionCommitRequest): Promise<VersionedDraft> {
    const validated = this.validator.validate(request.schema);
    return this.transactions.runInTransaction(async () => {
      const lockedDraft = await this.requireLocked(request.draftId);
      if (!lockedDraft.isCurrentVersion(request.baseVersionId)) {
        throw new ConflictError('VERSION_CONFLICT', 'This draft has changed in the meantime. Reload to continue.', {
          currentVersionId: lockedDraft.currentVersionId,
        });
      }
      const nextNumber = (await this.versions.findLatestVersionNumber(lockedDraft.id)) + 1;
      return this.appendVersion(lockedDraft, validated, request.source, nextNumber);
    });
  }

  async requireLocked(draftId: string): Promise<FormDraft> {
    const draft = await this.drafts.lockById(draftId);
    if (!draft) {
      throw new NotFoundError('Form draft');
    }
    return draft;
  }

  async loadCurrentVersion(draft: FormDraft): Promise<FormVersion> {
    const version = draft.currentVersionId ? await this.versions.findById(draft.currentVersionId) : null;
    if (!version) {
      throw new NotFoundError('Form version');
    }
    return version;
  }

  async loadVersionOfDraft(draft: FormDraft, versionId: string): Promise<FormVersion> {
    const version = await this.versions.findById(versionId);
    if (!version || version.draftId !== draft.id) {
      throw new NotFoundError('Form version');
    }
    return version;
  }

  private async appendVersion(
    draft: FormDraft,
    schema: FormSchema,
    source: VersionSource,
    versionNumber: number,
  ): Promise<VersionedDraft> {
    const now = this.clock.now();
    const version = FormVersion.create({
      id: this.identifiers.generate(),
      draftId: draft.id,
      versionNumber,
      schema,
      source,
      createdAt: now,
    });
    await this.versions.insert(version);
    const updatedDraft = draft.adoptVersion(version, now);
    await this.drafts.update(updatedDraft);
    return { draft: updatedDraft, version };
  }
}
