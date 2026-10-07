import type { CreatedGoogleForm } from '../../../domain/entities/created-google-form.js';
import type { FormDraft } from '../../../domain/entities/form-draft.js';
import type { FormVersion } from '../../../domain/entities/form-version.js';
import { Message, type PublishedFormReference } from '../../../domain/entities/message.js';
import type { ConversationRepository, MessageRepository } from '../../../domain/interfaces/repositories.js';
import type { Clock, IdentifierGenerator } from '../../../domain/interfaces/system.js';
import { NotFoundError } from '../../../shared/errors/application-errors.js';

const SUCCESS_CONTENT = 'Google Form created successfully. Your form is ready.';

export class PublicationAnnouncer {
  constructor(
    private readonly messages: MessageRepository,
    private readonly conversations: ConversationRepository,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
  ) {}

  async announceSuccess(draft: FormDraft, version: FormVersion, createdForm: CreatedGoogleForm): Promise<Message> {
    if (!createdForm.responderUrl || !createdForm.editUrl) {
      throw new NotFoundError('Google Form link');
    }
    const publishedForm: PublishedFormReference = {
      createdFormId: createdForm.id,
      title: version.schema.title,
      versionNumber: version.versionNumber,
      responderUrl: createdForm.responderUrl,
      editUrl: createdForm.editUrl,
    };
    return this.post(draft, SUCCESS_CONTENT, publishedForm);
  }

  async announceFailure(draft: FormDraft, version: FormVersion, reason: string): Promise<Message> {
    return this.post(
      draft,
      `The Google Form for version ${version.versionNumber} could not be created. ${reason} Your draft and its versions are safe. Open the preview and click Create GForm to try again.`,
      null,
    );
  }

  private async post(draft: FormDraft, content: string, publishedForm: PublishedFormReference | null): Promise<Message> {
    const now = this.clock.now();
    const message = Message.publicationNotice(this.identifiers.generate(), draft.conversationId, content, publishedForm, now);
    await this.messages.insert(message);
    const conversation = await this.conversations.findById(draft.conversationId);
    if (conversation) {
      await this.conversations.update(conversation.touch(now));
    }
    return message;
  }
}
