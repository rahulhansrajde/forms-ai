import type { Request, Response } from 'express';
import type {
  ConnectGoogleAccountUseCase,
  DisconnectGoogleAccountUseCase,
  GetGoogleConnectionStatusUseCase,
  StartGoogleAuthorizationUseCase,
} from '../../application/use-cases/google/google-connection-use-cases.js';
import type { CreateGoogleFormUseCase } from '../../application/use-cases/publishing/create-google-form-use-case.js';
import type { Logger } from '../../domain/interfaces/system.js';
import type { OAuthStateCookie } from '../http/cookies.js';
import { principalOf } from '../http/principal.js';
import type { ReturnPathPolicy } from '../http/return-path-policy.js';
import { googleAuthorizationQuerySchema, googleCallbackQuerySchema, publishBodySchema } from '../validators/request-schemas.js';
import type { RequestValidator } from '../validators/request-validator.js';

export interface GoogleOAuthUseCases {
  start: StartGoogleAuthorizationUseCase;
  connect: ConnectGoogleAccountUseCase;
}

export interface GoogleOAuthControllerDependencies {
  useCases: GoogleOAuthUseCases;
  stateCookie: OAuthStateCookie;
  returnPaths: ReturnPathPolicy;
  validator: RequestValidator;
  frontendOrigin: string;
  logger: Logger;
}

export class GoogleOAuthController {
  constructor(private readonly dependencies: GoogleOAuthControllerDependencies) {}

  readonly start = (request: Request, response: Response): void => {
    const { returnTo } = this.dependencies.validator.query(googleAuthorizationQuerySchema, request.query);
    const authorization = this.dependencies.useCases.start.execute();
    this.dependencies.stateCookie.write(response, {
      state: authorization.state,
      returnTo: this.dependencies.returnPaths.sanitize(returnTo),
    });
    response.redirect(302, authorization.url);
  };

  readonly callback = async (request: Request, response: Response): Promise<void> => {
    const { frontendOrigin, returnPaths, stateCookie, validator } = this.dependencies;
    const query = validator.query(googleCallbackQuerySchema, request.query);
    const stored = stateCookie.read(request);
    stateCookie.clear(response);
    const returnTo = stored?.returnTo ?? '';
    if (query.error || !query.code || !query.state) {
      response.redirect(302, returnPaths.withStatus(frontendOrigin, returnTo, 'denied'));
      return;
    }
    const status = await this.connect(principalOf(response).userId, query.code, query.state, stored?.state ?? null);
    response.redirect(302, returnPaths.withStatus(frontendOrigin, returnTo, status));
  };

  private async connect(userId: string, code: string, state: string, expectedState: string | null): Promise<'connected' | 'error'> {
    try {
      await this.dependencies.useCases.connect.execute(userId, { code, state, expectedState });
      return 'connected';
    } catch (error) {
      this.dependencies.logger.warn('Google account connection failed', { userId, error });
      return 'error';
    }
  }
}

export interface GoogleIntegrationUseCases {
  status: GetGoogleConnectionStatusUseCase;
  disconnect: DisconnectGoogleAccountUseCase;
  publish: CreateGoogleFormUseCase;
}

export class GoogleIntegrationController {
  constructor(
    private readonly useCases: GoogleIntegrationUseCases,
    private readonly validator: RequestValidator,
  ) {}

  readonly status = async (_request: Request, response: Response): Promise<void> => {
    response.json({ connection: await this.useCases.status.execute(principalOf(response).userId) });
  };

  readonly disconnect = async (_request: Request, response: Response): Promise<void> => {
    await this.useCases.disconnect.execute(principalOf(response).userId);
    response.status(204).end();
  };

  readonly publish = async (request: Request, response: Response): Promise<void> => {
    const body = this.validator.body(publishBodySchema, request.body);
    response.json({ publication: await this.useCases.publish.execute(principalOf(response).userId, body) });
  };
}
