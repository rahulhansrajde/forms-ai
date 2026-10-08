import type { Express } from 'express';
import type { Logger } from '../domain/interfaces/system.js';
import type { AppConfig } from '../infrastructure/configuration/app-config.js';
import { AuthController } from '../presentation/controllers/auth-controller.js';
import { ConversationController } from '../presentation/controllers/conversation-controller.js';
import { DraftController } from '../presentation/controllers/draft-controller.js';
import { GoogleIntegrationController, GoogleOAuthController } from '../presentation/controllers/google-controllers.js';
import { SheetsController } from '../presentation/controllers/sheets-controller.js';
import { OAuthStateCookie, SessionCookie } from '../presentation/http/cookies.js';
import { HttpApplicationFactory } from '../presentation/http/http-application-factory.js';
import { ReturnPathPolicy } from '../presentation/http/return-path-policy.js';
import { AuthenticationMiddleware } from '../presentation/middleware/authentication-middleware.js';
import { ErrorResponder } from '../presentation/middleware/error-responder.js';
import { OriginGuard } from '../presentation/middleware/origin-guard.js';
import { RateLimits } from '../presentation/middleware/rate-limits.js';
import { RequestValidator } from '../presentation/validators/request-validator.js';
import type { ApplicationModules } from './application-modules.js';

export class PresentationModules {
  constructor(
    private readonly config: AppConfig,
    private readonly application: ApplicationModules,
    private readonly logger: Logger,
  ) {}

  createApp(): Express {
    const validator = new RequestValidator();
    const sessionCookie = new SessionCookie(this.config.secureCookies);
    const errors = new ErrorResponder(this.logger);
    return new HttpApplicationFactory().create({
      controllers: {
        auth: new AuthController(this.application.auth, validator, sessionCookie),
        conversations: new ConversationController(this.application.conversations, validator),
        drafts: new DraftController(this.application.drafts, validator),
        googleOAuth: new GoogleOAuthController({
          useCases: this.application.googleOAuth,
          stateCookie: new OAuthStateCookie(this.config.secureCookies),
          returnPaths: new ReturnPathPolicy(),
          validator,
          frontendOrigin: this.config.frontendOrigin,
          logger: this.logger,
        }),
        googleIntegration: new GoogleIntegrationController(this.application.googleIntegration, validator),
        sheets: new SheetsController(this.application.sheets, validator),
      },
      authentication: new AuthenticationMiddleware(this.application.sessions, sessionCookie, `${this.config.frontendOrigin}/login`),
      originGuard: new OriginGuard([this.config.frontendOrigin, new URL(this.config.google.redirectUri).origin]),
      rateLimits: new RateLimits(errors, this.config.environment !== 'test'),
      errors,
      trustProxy: this.config.trustProxy,
      frontendDistDirectory: this.config.frontendDistDirectory,
    });
  }
}
