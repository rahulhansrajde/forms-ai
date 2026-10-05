import type { FormDraft } from '../../../../domain/entities/form-draft.js';
import type { FormVersion } from '../../../../domain/entities/form-version.js';
import type { SchemaChangeDetector } from '../../../../domain/services/schema-change-detector.js';
import type { FormGenerationService } from '../../forms/form-generation-service.js';
import type { FormModificationService } from '../../forms/form-modification-service.js';
import type { FormVersionService } from '../../forms/form-version-service.js';
import type { SuggestionSetService } from '../../suggestions/suggestion-set-service.js';
import type { ChatTurnContext, IntentDecision, IntentOutcome } from '../chat-turn-context.js';
import type { DraftReplyComposer } from '../replies/draft-reply-composer.js';
import type { OperationSummarizer } from '../replies/operation-summarizer.js';
import { replyOnly, type IntentHandler } from './intent-handler.js';

interface ExistingDraft {
  draft: FormDraft;
  version: FormVersion;
}

function requireExistingDraft(context: ChatTurnContext): ExistingDraft {
  if (!context.draft || !context.currentVersion) {
    throw new Error('A draft is required for this intent.');
  }
  return { draft: context.draft, version: context.currentVersion };
}

export class CreateFormDraftHandler implements IntentHandler {
  readonly intent = 'CREATE_FORM';

  constructor(
    private readonly generation: FormGenerationService,
    private readonly versions: FormVersionService,
    private readonly suggestionSets: SuggestionSetService,
    private readonly composer: DraftReplyComposer,
  ) {}

  async handle(message: string, _decision: IntentDecision, context: ChatTurnContext): Promise<IntentOutcome> {
    const schema = await this.generation.generate(message, null, context.ai);
    const created = await this.versions.createDraft({
      userId: context.userId,
      conversationId: context.conversation.id,
      schema,
      source: 'AI',
    });
    await this.suggestionSets.closeOpen(context.conversation.id);
    return { intent: this.intent, reply: this.composer.created(created.version.schema), changedDraft: created };
  }
}

export class ModifyFormDraftHandler implements IntentHandler {
  readonly intent = 'MODIFY_FORM';

  constructor(
    private readonly modification: FormModificationService,
    private readonly versions: FormVersionService,
    private readonly changeDetector: SchemaChangeDetector,
    private readonly summarizer: OperationSummarizer,
    private readonly composer: DraftReplyComposer,
  ) {}

  async handle(message: string, _decision: IntentDecision, context: ChatTurnContext): Promise<IntentOutcome> {
    const existing = requireExistingDraft(context);
    const before = existing.version.schema;
    const result = await this.modification.modify(message, before, context.ai);
    if (result.kind === 'clarification') {
      return replyOnly('CLARIFICATION_REQUIRED', result.question);
    }
    if (!this.changeDetector.hasChanged(before, result.schema)) {
      return replyOnly(this.intent, this.composer.unchanged());
    }
    const committed = await this.versions.commitVersion({
      draftId: existing.draft.id,
      baseVersionId: existing.version.id,
      schema: result.schema,
      source: 'AI',
    });
    return {
      intent: this.intent,
      reply: this.composer.modified(this.summarizer.describe(result.operations, before), committed.version.versionNumber),
      changedDraft: committed,
    };
  }
}

export class RegenerateFormHandler implements IntentHandler {
  readonly intent = 'REGENERATE_FORM';

  constructor(
    private readonly generation: FormGenerationService,
    private readonly versions: FormVersionService,
    private readonly composer: DraftReplyComposer,
  ) {}

  async handle(message: string, _decision: IntentDecision, context: ChatTurnContext): Promise<IntentOutcome> {
    const existing = requireExistingDraft(context);
    const schema = await this.generation.generate(message, existing.version.schema, context.ai);
    const committed = await this.versions.commitVersion({
      draftId: existing.draft.id,
      baseVersionId: existing.version.id,
      schema,
      source: 'REGENERATION',
    });
    return {
      intent: this.intent,
      reply: this.composer.regenerated(committed.version.schema, committed.version.versionNumber),
      changedDraft: committed,
    };
  }
}
