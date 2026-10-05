import type { FormSchema } from '@forms-ai/contracts';
import { CreatedGoogleForm } from '../../../domain/entities/created-google-form.js';
import type { FormVersion } from '../../../domain/entities/form-version.js';
import type { GoogleFormLinks, GoogleFormsGateway } from '../../../domain/interfaces/google.js';
import type { CreatedFormRepository, FormDraftRepository } from '../../../domain/interfaces/repositories.js';
import type { Clock, IdentifierGenerator, TransactionRunner } from '../../../domain/interfaces/system.js';
import { NotFoundError } from '../../../shared/errors/application-errors.js';

export class GoogleFormPublisher {
  constructor(
    private readonly gateway: GoogleFormsGateway,
    private readonly createdForms: CreatedFormRepository,
    private readonly drafts: FormDraftRepository,
    private readonly transactions: TransactionRunner,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
  ) {}

  async createOrResume(accessToken: string, version: FormVersion, schema: FormSchema): Promise<CreatedGoogleForm> {
    const existing = await this.createdForms.findByVersion(version.id);
    if (existing) {
      return existing;
    }
    const googleFormId = await this.gateway.createForm(accessToken, schema.title);
    const createdForm = CreatedGoogleForm.begin(this.identifiers.generate(), version.draftId, version.id, googleFormId, this.clock.now());
    await this.createdForms.insert(createdForm);
    return createdForm;
  }

  async addItems(accessToken: string, createdForm: CreatedGoogleForm, schema: FormSchema): Promise<void> {
    await this.gateway.replaceItems(accessToken, createdForm.googleFormId, schema);
  }

  async applySettings(accessToken: string, createdForm: CreatedGoogleForm, schema: FormSchema): Promise<void> {
    await this.gateway.applySettings(accessToken, createdForm.googleFormId, schema);
  }

  async retrieveLinks(accessToken: string, createdForm: CreatedGoogleForm): Promise<GoogleFormLinks> {
    return this.gateway.fetchLinks(accessToken, createdForm.googleFormId);
  }

  async recordCompletion(createdForm: CreatedGoogleForm, links: GoogleFormLinks): Promise<CreatedGoogleForm> {
    return this.transactions.runInTransaction(async () => {
      const now = this.clock.now();
      const completed = createdForm.complete(links.responderUrl, links.editUrl, now);
      await this.createdForms.update(completed);
      const draft = await this.drafts.lockById(createdForm.draftId);
      if (!draft) {
        throw new NotFoundError('Form draft');
      }
      await this.drafts.update(draft.markPublished(now));
      return completed;
    });
  }
}
