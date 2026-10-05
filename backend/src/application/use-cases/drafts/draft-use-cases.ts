import type {
  CreateDraftVersionRequest,
  CursorPage,
  DraftView,
  FormSchema,
  FormVersionSummary,
  FormVersionView,
} from '@forms-ai/contracts';
import type { FormDraft } from '../../../domain/entities/form-draft.js';
import type { FormVersion } from '../../../domain/entities/form-version.js';
import type { FormVersionRepository } from '../../../domain/interfaces/repositories.js';
import type { FormOperationApplier } from '../../../domain/services/form-operation-applier.js';
import type { FormOperationParser } from '../../../domain/services/form-operation-parser.js';
import type { SchemaChangeDetector } from '../../../domain/services/schema-change-detector.js';
import { toVersionSummary, toVersionView } from '../../dto/view-mappers.js';
import type { DraftAccessService } from '../../services/access/resource-access-service.js';
import type { DraftViewService } from '../../services/forms/draft-view-service.js';
import type { FormVersionService } from '../../services/forms/form-version-service.js';
import { pageFromOverfetch } from '../../services/pagination/overfetch-page.js';

export class GetDraftUseCase {
  constructor(
    private readonly access: DraftAccessService,
    private readonly views: DraftViewService,
  ) {}

  async execute(userId: string, draftId: string): Promise<DraftView> {
    return this.views.describe(await this.access.requireOwned(draftId, userId));
  }
}

export class ListDraftVersionsUseCase {
  constructor(
    private readonly access: DraftAccessService,
    private readonly versions: FormVersionRepository,
  ) {}

  async execute(
    userId: string,
    draftId: string,
    limit: number,
    beforeVersionNumber: number | null,
  ): Promise<CursorPage<FormVersionSummary>> {
    const draft = await this.access.requireOwned(draftId, userId);
    const versions = await this.versions.listByDraft(draft.id, limit + 1, beforeVersionNumber);
    const page = pageFromOverfetch(versions, limit, (last) => String(last.versionNumber));
    return { items: page.items.map(toVersionSummary), nextCursor: page.nextCursor };
  }
}

export class GetDraftVersionUseCase {
  constructor(
    private readonly access: DraftAccessService,
    private readonly versions: FormVersionService,
  ) {}

  async execute(userId: string, draftId: string, versionId: string): Promise<FormVersionView> {
    const draft = await this.access.requireOwned(draftId, userId);
    return toVersionView(await this.versions.loadVersionOfDraft(draft, versionId));
  }
}

export class CreateDraftVersionUseCase {
  constructor(
    private readonly access: DraftAccessService,
    private readonly versions: FormVersionService,
    private readonly parser: FormOperationParser,
    private readonly applier: FormOperationApplier,
    private readonly changeDetector: SchemaChangeDetector,
    private readonly views: DraftViewService,
  ) {}

  async execute(userId: string, draftId: string, request: CreateDraftVersionRequest): Promise<DraftView> {
    const draft = await this.access.requireOwned(draftId, userId);
    const base = await this.versions.loadVersionOfDraft(draft, request.baseVersionId);
    const nextSchema = await this.resolveNextSchema(draft, base, request);
    if (!this.changeDetector.hasChanged(base.schema, nextSchema)) {
      return this.views.describe(draft);
    }
    const committed = await this.versions.commitVersion({
      draftId: draft.id,
      baseVersionId: base.id,
      schema: nextSchema,
      source: 'MANUAL',
    });
    return this.views.describe(committed.draft, committed.version);
  }

  private async resolveNextSchema(draft: FormDraft, base: FormVersion, request: CreateDraftVersionRequest): Promise<FormSchema> {
    if ('restoreVersionId' in request) {
      return (await this.versions.loadVersionOfDraft(draft, request.restoreVersionId)).schema;
    }
    return this.applier.apply(base.schema, this.parser.parse(request.operations));
  }
}
