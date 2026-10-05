import type { AIProvider } from '../domain/interfaces/ai-provider.js';
import type { GoogleFormsGateway, OAuthGateway } from '../domain/interfaces/google.js';
import type { Clock, IdentifierGenerator, Logger } from '../domain/interfaces/system.js';
import { AIProviderFactory } from '../infrastructure/ai/ai-provider-factory.js';
import type { AppConfig } from '../infrastructure/configuration/app-config.js';
import type { Database } from '../infrastructure/database/connection/database.js';
import { PostgresConnectedAccountRepository } from '../infrastructure/database/repositories/postgres-connected-account-repository.js';
import { PostgresConversationRepository } from '../infrastructure/database/repositories/postgres-conversation-repository.js';
import { PostgresCreatedFormRepository } from '../infrastructure/database/repositories/postgres-created-form-repository.js';
import { PostgresFormDraftRepository } from '../infrastructure/database/repositories/postgres-form-draft-repository.js';
import { PostgresFormVersionRepository } from '../infrastructure/database/repositories/postgres-form-version-repository.js';
import { PostgresMessageRepository } from '../infrastructure/database/repositories/postgres-message-repository.js';
import { PostgresPublishJobRepository } from '../infrastructure/database/repositories/postgres-publish-job-repository.js';
import { PostgresSessionRepository } from '../infrastructure/database/repositories/postgres-session-repository.js';
import { PostgresSuggestionSetRepository } from '../infrastructure/database/repositories/postgres-suggestion-set-repository.js';
import { PostgresUserRepository } from '../infrastructure/database/repositories/postgres-user-repository.js';
import { GoogleFormRequestBuilder } from '../infrastructure/google/google-form-request-builder.js';
import { GoogleFormsApiGateway } from '../infrastructure/google/google-forms-api-gateway.js';
import { GoogleOAuthHttpGateway } from '../infrastructure/google/google-oauth-http-gateway.js';
import { FetchHttpClient } from '../infrastructure/http/http-client.js';
import { AesGcmTokenEncryptionService } from '../infrastructure/security/aes-gcm-token-encryption-service.js';
import { CryptoRandomTokenGenerator, Sha256TokenDigester } from '../infrastructure/security/opaque-token-services.js';
import { ScryptPasswordHasher } from '../infrastructure/security/scrypt-password-hasher.js';
import { UuidIdentifierGenerator } from '../infrastructure/system/system-services.js';

export interface InfrastructureOverrides {
  aiProvider?: AIProvider;
  oauthGateway?: OAuthGateway;
  formsGateway?: GoogleFormsGateway;
}

export class InfrastructureModules {
  readonly identifiers: IdentifierGenerator = new UuidIdentifierGenerator();
  readonly passwordHasher = new ScryptPasswordHasher();
  readonly tokenGenerator = new CryptoRandomTokenGenerator();
  readonly tokenDigester = new Sha256TokenDigester();
  readonly users: PostgresUserRepository;
  readonly sessions: PostgresSessionRepository;
  readonly conversations: PostgresConversationRepository;
  readonly messages: PostgresMessageRepository;
  readonly drafts: PostgresFormDraftRepository;
  readonly versions: PostgresFormVersionRepository;
  readonly suggestionSets: PostgresSuggestionSetRepository;
  readonly connectedAccounts: PostgresConnectedAccountRepository;
  readonly createdForms: PostgresCreatedFormRepository;
  readonly publishJobs: PostgresPublishJobRepository;
  readonly aiProvider: AIProvider;
  readonly oauthGateway: OAuthGateway;
  readonly formsGateway: GoogleFormsGateway;

  constructor(
    config: AppConfig,
    readonly database: Database,
    readonly logger: Logger,
    readonly clock: Clock,
    overrides: InfrastructureOverrides,
  ) {
    this.users = new PostgresUserRepository(database);
    this.sessions = new PostgresSessionRepository(database);
    this.conversations = new PostgresConversationRepository(database);
    this.messages = new PostgresMessageRepository(database);
    this.drafts = new PostgresFormDraftRepository(database);
    this.versions = new PostgresFormVersionRepository(database);
    this.suggestionSets = new PostgresSuggestionSetRepository(database);
    this.connectedAccounts = new PostgresConnectedAccountRepository(
      database,
      new AesGcmTokenEncryptionService(config.tokenEncryptionKey),
    );
    this.createdForms = new PostgresCreatedFormRepository(database);
    this.publishJobs = new PostgresPublishJobRepository(database);
    const http = new FetchHttpClient();
    this.aiProvider = overrides.aiProvider ?? new AIProviderFactory(logger).create(config.ai);
    this.oauthGateway = overrides.oauthGateway ?? new GoogleOAuthHttpGateway(config.google, http, logger);
    this.formsGateway = overrides.formsGateway ?? new GoogleFormsApiGateway(http, new GoogleFormRequestBuilder(), logger);
  }
}
