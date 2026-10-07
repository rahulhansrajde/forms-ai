import { AIOutputSanitizer } from '../application/services/ai/ai-output-sanitizer.js';
import { AIOutputValidator } from '../application/services/ai/ai-output-validator.js';
import { ConversationAccessService, DraftAccessService } from '../application/services/access/resource-access-service.js';
import { PasswordAuthenticationService } from '../application/services/auth/password-authentication-service.js';
import { SessionService } from '../application/services/auth/session-service.js';
import { ChatContextLoader } from '../application/services/chat/chat-context-loader.js';
import { ChatReplyService } from '../application/services/chat/chat-reply-service.js';
import { ConversationTitlePolicy } from '../application/services/chat/conversation-title-policy.js';
import {
  ClarificationHandler,
  NormalChatHandler,
  PublishRequestHandler,
} from '../application/services/chat/handlers/conversational-handlers.js';
import {
  CreateFormDraftHandler,
  ModifyFormDraftHandler,
  RegenerateFormHandler,
} from '../application/services/chat/handlers/draft-handlers.js';
import { AcceptSuggestionsHandler, SuggestQuestionsHandler } from '../application/services/chat/handlers/suggestion-handlers.js';
import { IntentDispatcher } from '../application/services/chat/intent-dispatcher.js';
import { DraftReplyComposer } from '../application/services/chat/replies/draft-reply-composer.js';
import { OperationSummarizer } from '../application/services/chat/replies/operation-summarizer.js';
import { SuggestionReplyComposer } from '../application/services/chat/replies/suggestion-reply-composer.js';
import { DraftViewService } from '../application/services/forms/draft-view-service.js';
import { FormGenerationService } from '../application/services/forms/form-generation-service.js';
import { FormModificationService } from '../application/services/forms/form-modification-service.js';
import { FormVersionService } from '../application/services/forms/form-version-service.js';
import { GoogleCredentialService } from '../application/services/google/google-credential-service.js';
import { GoogleOAuthService } from '../application/services/google/google-oauth-service.js';
import { AffirmationDetector } from '../application/services/intent/affirmation-detector.js';
import { ClarificationMessages } from '../application/services/intent/clarification-messages.js';
import { IntentDetectionService } from '../application/services/intent/intent-detection-service.js';
import { IntentStatePolicy } from '../application/services/intent/intent-state-policy.js';
import { KeysetCursorCodec } from '../application/services/pagination/keyset-cursor-codec.js';
import { GoogleFormPublisher } from '../application/services/publishing/google-form-publisher.js';
import { PublicationAnnouncer } from '../application/services/publishing/publication-announcer.js';
import { PublishJobTracker } from '../application/services/publishing/publish-job-tracker.js';
import { SuggestionGenerationService } from '../application/services/suggestions/suggestion-generation-service.js';
import { SuggestionSelectionService } from '../application/services/suggestions/suggestion-selection-service.js';
import { SuggestionSetService } from '../application/services/suggestions/suggestion-set-service.js';
import type { AuthUseCases } from '../presentation/controllers/auth-controller.js';
import type { ConversationUseCases } from '../presentation/controllers/conversation-controller.js';
import type { DraftUseCases } from '../presentation/controllers/draft-controller.js';
import type { GoogleIntegrationUseCases, GoogleOAuthUseCases } from '../presentation/controllers/google-controllers.js';
import {
  ChangePasswordUseCase,
  GetCurrentUserUseCase,
  LogInUseCase,
  LogOutUseCase,
  SignUpUseCase,
  UpdateProfileUseCase,
} from '../application/use-cases/auth/auth-use-cases.js';
import { SendChatMessageUseCase } from '../application/use-cases/chat/send-chat-message-use-case.js';
import {
  CreateConversationUseCase,
  DeleteConversationUseCase,
  GetConversationMessagesUseCase,
  GetConversationUseCase,
  ListConversationsUseCase,
} from '../application/use-cases/conversations/conversation-use-cases.js';
import {
  CreateDraftVersionUseCase,
  GetDraftUseCase,
  GetDraftVersionUseCase,
  ListDraftVersionsUseCase,
} from '../application/use-cases/drafts/draft-use-cases.js';
import {
  ConnectGoogleAccountUseCase,
  DisconnectGoogleAccountUseCase,
  GetGoogleConnectionStatusUseCase,
  StartGoogleAuthorizationUseCase,
} from '../application/use-cases/google/google-connection-use-cases.js';
import { CreateGoogleFormUseCase } from '../application/use-cases/publishing/create-google-form-use-case.js';
import { FormBlueprintBuilder } from '../domain/services/form-blueprint-builder.js';
import { FormElementIdFactory } from '../domain/services/form-element-id-factory.js';
import { FormOperationApplier } from '../domain/services/form-operation-applier.js';
import { FormOperationParser } from '../domain/services/form-operation-parser.js';
import { FormSchemaValidator } from '../domain/services/form-schema-validator.js';
import { PasswordPolicy } from '../domain/services/password-policy.js';
import { QuestionFactory } from '../domain/services/question-factory.js';
import { QuestionNormalizer } from '../domain/services/question-normalizer.js';
import { SchemaChangeDetector } from '../domain/services/schema-change-detector.js';
import type { AppConfig } from '../infrastructure/configuration/app-config.js';
import type { InfrastructureModules } from './infrastructure-modules.js';

class FormDomainServices {
  readonly normalizer = new QuestionNormalizer();
  readonly validator = new FormSchemaValidator(this.normalizer);
  readonly parser = new FormOperationParser();
  readonly changeDetector = new SchemaChangeDetector();
  readonly elementIds: FormElementIdFactory;
  readonly questions: QuestionFactory;
  readonly applier: FormOperationApplier;
  readonly blueprints: FormBlueprintBuilder;

  constructor(infrastructure: InfrastructureModules) {
    this.elementIds = new FormElementIdFactory(infrastructure.identifiers);
    this.questions = new QuestionFactory(this.elementIds, this.normalizer);
    this.applier = new FormOperationApplier(this.elementIds, this.questions, this.normalizer, this.validator);
    this.blueprints = new FormBlueprintBuilder(this.elementIds, this.questions, this.validator);
  }
}

export class ApplicationModules {
  readonly sessions: SessionService;
  readonly auth: AuthUseCases;
  readonly conversations: ConversationUseCases;
  readonly drafts: DraftUseCases;
  readonly googleOAuth: GoogleOAuthUseCases;
  readonly googleIntegration: GoogleIntegrationUseCases;

  private readonly forms: FormDomainServices;
  private readonly versions: FormVersionService;
  private readonly draftViews: DraftViewService;
  private readonly conversationAccess: ConversationAccessService;
  private readonly draftAccess: DraftAccessService;

  constructor(
    config: AppConfig,
    private readonly infrastructure: InfrastructureModules,
  ) {
    const { clock, identifiers, database } = infrastructure;
    this.forms = new FormDomainServices(infrastructure);
    this.sessions = new SessionService(
      infrastructure.sessions,
      infrastructure.tokenGenerator,
      infrastructure.tokenDigester,
      identifiers,
      clock,
      config.sessionTtlMs,
    );
    this.versions = new FormVersionService(
      infrastructure.drafts,
      infrastructure.versions,
      this.forms.validator,
      database,
      identifiers,
      clock,
    );
    this.draftViews = new DraftViewService(this.versions, infrastructure.publishJobs, infrastructure.createdForms);
    this.conversationAccess = new ConversationAccessService(infrastructure.conversations);
    this.draftAccess = new DraftAccessService(infrastructure.drafts);
    this.auth = this.createAuthUseCases();
    this.conversations = this.createConversationUseCases();
    this.drafts = this.createDraftUseCases();
    const google = this.createGoogleUseCases();
    this.googleOAuth = google.oauth;
    this.googleIntegration = google.integration;
  }

  private createAuthUseCases(): AuthUseCases {
    const { users, passwordHasher, identifiers, clock } = this.infrastructure;
    const policy = new PasswordPolicy();
    const authentication = new PasswordAuthenticationService(users, passwordHasher);
    return {
      signUp: new SignUpUseCase(users, passwordHasher, policy, this.sessions, identifiers, clock),
      logIn: new LogInUseCase(authentication, this.sessions),
      logOut: new LogOutUseCase(this.sessions),
      currentUser: new GetCurrentUserUseCase(users),
      updateProfile: new UpdateProfileUseCase(users, clock),
      changePassword: new ChangePasswordUseCase(users, authentication, passwordHasher, policy, this.sessions, clock),
    };
  }

  private createConversationUseCases(): ConversationUseCases {
    const { conversations, messages, drafts, identifiers, clock } = this.infrastructure;
    const cursors = new KeysetCursorCodec();
    const titles = new ConversationTitlePolicy();
    return {
      create: new CreateConversationUseCase(conversations, titles, identifiers, clock),
      list: new ListConversationsUseCase(conversations, cursors),
      get: new GetConversationUseCase(this.conversationAccess, drafts),
      delete: new DeleteConversationUseCase(this.conversationAccess, conversations),
      messages: new GetConversationMessagesUseCase(this.conversationAccess, messages, cursors),
      sendMessage: this.createSendChatMessageUseCase(titles),
    };
  }

  private createSendChatMessageUseCase(titles: ConversationTitlePolicy): SendChatMessageUseCase {
    const { aiProvider, messages, conversations, drafts, suggestionSets, logger, database, identifiers, clock } = this.infrastructure;
    const sanitizer = new AIOutputSanitizer();
    const outputValidator = new AIOutputValidator(sanitizer);
    const clarifications = new ClarificationMessages();
    const draftReplies = new DraftReplyComposer();
    const suggestionSetService = new SuggestionSetService(suggestionSets, database, identifiers, clock);
    const generation = new FormGenerationService(aiProvider, sanitizer, this.forms.blueprints);
    const handlers = [
      new NormalChatHandler(new ChatReplyService(aiProvider)),
      new ClarificationHandler(clarifications),
      new PublishRequestHandler(draftReplies),
      new CreateFormDraftHandler(generation, this.versions, suggestionSetService, draftReplies),
      new ModifyFormDraftHandler(
        new FormModificationService(aiProvider, outputValidator, this.forms.parser, this.forms.applier),
        this.versions,
        this.forms.changeDetector,
        new OperationSummarizer(),
        draftReplies,
      ),
      new RegenerateFormHandler(generation, this.versions, draftReplies),
      new SuggestQuestionsHandler(
        new SuggestionGenerationService(aiProvider, outputValidator),
        suggestionSetService,
        new SuggestionReplyComposer(),
      ),
      new AcceptSuggestionsHandler(
        new SuggestionSelectionService(aiProvider, outputValidator),
        suggestionSetService,
        this.versions,
        this.forms.applier,
        this.forms.blueprints,
        clarifications,
        draftReplies,
      ),
    ];
    return new SendChatMessageUseCase(
      this.conversationAccess,
      new ChatContextLoader(messages, drafts, this.versions, suggestionSets),
      new IntentDetectionService(
        aiProvider,
        outputValidator,
        new AffirmationDetector(),
        new IntentStatePolicy(clarifications),
        clarifications,
      ),
      new IntentDispatcher(handlers, clarifications, logger),
      suggestionSetService,
      this.draftViews,
      messages,
      conversations,
      titles,
      identifiers,
      clock,
    );
  }

  private createDraftUseCases(): DraftUseCases {
    return {
      get: new GetDraftUseCase(this.draftAccess, this.draftViews),
      listVersions: new ListDraftVersionsUseCase(this.draftAccess, this.infrastructure.versions),
      getVersion: new GetDraftVersionUseCase(this.draftAccess, this.versions),
      createVersion: new CreateDraftVersionUseCase(
        this.draftAccess,
        this.versions,
        this.forms.parser,
        this.forms.applier,
        this.forms.changeDetector,
        this.draftViews,
      ),
    };
  }

  private createGoogleUseCases(): { oauth: GoogleOAuthUseCases; integration: GoogleIntegrationUseCases } {
    const { oauthGateway, formsGateway, formVerifier, connectedAccounts, createdForms, drafts, publishJobs, tokenGenerator, tokenDigester } =
      this.infrastructure;
    const { messages, conversations } = this.infrastructure;
    const { identifiers, clock, logger, database } = this.infrastructure;
    const oauth = new GoogleOAuthService(oauthGateway, connectedAccounts, tokenGenerator, identifiers, clock);
    const credentials = new GoogleCredentialService(oauthGateway, connectedAccounts, clock);
    return {
      oauth: {
        start: new StartGoogleAuthorizationUseCase(oauth),
        connect: new ConnectGoogleAccountUseCase(oauth, tokenDigester),
      },
      integration: {
        status: new GetGoogleConnectionStatusUseCase(connectedAccounts),
        disconnect: new DisconnectGoogleAccountUseCase(connectedAccounts, oauthGateway, logger),
        publish: new CreateGoogleFormUseCase(this.draftAccess, this.versions, this.forms.validator, credentials, {
          publisher: new GoogleFormPublisher(formsGateway, formVerifier, createdForms, drafts, database, identifiers, clock),
          tracker: new PublishJobTracker(publishJobs, identifiers, clock),
          announcer: new PublicationAnnouncer(messages, conversations, identifiers, clock),
          createdForms,
          draftViews: this.draftViews,
          transactions: database,
        }),
      },
    };
  }
}
