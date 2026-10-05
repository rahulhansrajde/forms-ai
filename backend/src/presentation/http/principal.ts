import type { Response } from 'express';
import type { AuthenticatedPrincipal } from '../../application/services/auth/session-service.js';
import { AuthenticationError } from '../../shared/errors/application-errors.js';

interface PrincipalLocals {
  principal?: AuthenticatedPrincipal;
}

export function attachPrincipal(response: Response, principal: AuthenticatedPrincipal): void {
  (response.locals as PrincipalLocals).principal = principal;
}

export function principalOf(response: Response): AuthenticatedPrincipal {
  const principal = (response.locals as PrincipalLocals).principal;
  if (!principal) {
    throw new AuthenticationError();
  }
  return principal;
}
