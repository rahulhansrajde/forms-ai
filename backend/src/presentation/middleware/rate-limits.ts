import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { ErrorResponder } from './error-responder.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_MINUTE = 60 * 1000;

export class RateLimits {
  readonly authentication: RequestHandler;
  readonly chat: RequestHandler;
  readonly publishing: RequestHandler;
  readonly sheets: RequestHandler;

  constructor(
    private readonly errors: ErrorResponder,
    enabled: boolean,
  ) {
    this.authentication = this.create(enabled, FIFTEEN_MINUTES, 30, 'Too many sign-in attempts. Please wait a few minutes.');
    this.chat = this.create(enabled, ONE_MINUTE, 30, 'You are sending messages too quickly. Please slow down.');
    this.publishing = this.create(enabled, ONE_MINUTE, 10, 'Too many publish attempts. Please wait a moment.');
    this.sheets = this.create(enabled, ONE_MINUTE, 20, 'Too many Google Sheets actions. Please wait a moment.');
  }

  private create(enabled: boolean, windowMs: number, limit: number, message: string): RequestHandler {
    return rateLimit({
      windowMs,
      limit,
      skip: () => !enabled,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_request, response) => this.errors.respond(response, 'RATE_LIMITED', message),
    });
  }
}
