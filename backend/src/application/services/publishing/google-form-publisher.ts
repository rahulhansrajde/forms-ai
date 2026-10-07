import type { FormSchema } from '@forms-ai/contracts';
import { CreatedGoogleForm } from '../../../domain/entities/created-google-form.js';
import type { FormVersion } from '../../../domain/entities/form-version.js';
import type { GoogleFormSnapshot, GoogleFormsGateway, PublishedFormVerifier } from '../../../domain/interfaces/google.js';
import type { CreatedFormRepository, FormDraftRepository } from '../../../domain/interfaces/repositories.js';
import type { Clock, IdentifierGenerator, TransactionRunner } from '../../../domain/interfaces/system.js';
import { NotFoundError, PublishError } from '../../../shared/errors/application-errors.js';

const REPORTED_MISMATCHES = 3;

export class GoogleFormPublisher {
  constructor(
    private readonly gateway: GoogleFormsGateway,
    private readonly verifier: PublishedFormVerifier,
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

  async readBack(accessToken: string, createdForm: CreatedGoogleForm): Promise<GoogleFormSnapshot> {
    return this.gateway.readForm(accessToken, createdForm.googleFormId);
  }

  verify(version: FormVersion, schema: FormSchema, snapshot: GoogleFormSnapshot): void {
    const verification = this.verifier.verify(schema, snapshot);
    if (verification.mismatches.length === 0) {
      return;
    }
    const { expected, actual, mismatches } = verification;
    throw new PublishError(
      `The Google Form did not match version ${version.versionNumber}: expected ${expected.sections} sections and ${expected.questions} questions, ` +
        `found ${actual.sections} sections and ${actual.questions} questions (${mismatches.slice(0, REPORTED_MISMATCHES).join('; ')}).`,
      { expected, actual, mismatches },
    );
  }

  async recordCompletion(createdForm: CreatedGoogleForm, snapshot: GoogleFormSnapshot): Promise<CreatedGoogleForm> {
    return this.transactions.runInTransaction(async () => {
      const now = this.clock.now();
      const completed = createdForm.complete(snapshot.links.responderUrl, snapshot.links.editUrl, now);
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
