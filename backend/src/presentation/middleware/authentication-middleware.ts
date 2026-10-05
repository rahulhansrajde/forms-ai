import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedPrincipal, SessionService } from '../../application/services/auth/session-service.js';
import { AuthenticationError } from '../../shared/errors/application-errors.js';
import type { SessionCookie } from '../http/cookies.js';
import { attachPrincipal } from '../http/principal.js';

export class AuthenticationMiddleware {
  constructor(
    private readonly sessions: SessionService,
    private readonly sessionCookie: SessionCookie,
    private readonly loginUrl: string,
  ) {}

  readonly requireUser = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    const principal = await this.resolve(request, response);
    if (!principal) {
      throw new AuthenticationError('AUTHENTICATION_REQUIRED', 'Your session has expired. Please log in again.');
    }
    attachPrincipal(response, principal);
    next();
  };

  readonly requireUserOrRedirect = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    const principal = await this.resolve(request, response);
    if (!principal) {
      response.redirect(302, this.loginUrl);
      return;
    }
    attachPrincipal(response, principal);
    next();
  };

  private async resolve(request: Request, response: Response): Promise<AuthenticatedPrincipal | null> {
    const token = this.sessionCookie.read(request);
    const principal = token ? await this.sessions.resolve(token) : null;
    if (token && !principal) {
      this.sessionCookie.clear(response);
    }
    return principal;
  }
}
