import type { NextFunction, Request, Response } from 'express';
import { AuthorizationError } from '../../shared/errors/application-errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export class OriginGuard {
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(allowedOrigins: readonly string[]) {
    this.allowedOrigins = new Set(allowedOrigins.map((origin) => origin.replace(/\/$/, '')));
  }

  readonly verify = (request: Request, _response: Response, next: NextFunction): void => {
    const origin = request.get('origin');
    if (!SAFE_METHODS.has(request.method) && origin && !this.allowedOrigins.has(origin)) {
      throw new AuthorizationError('Requests from this origin are not allowed.');
    }
    next();
  };
}
