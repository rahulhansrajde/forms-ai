import type { ApiErrorBody, ErrorCode } from '@forms-ai/contracts';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../../domain/interfaces/system.js';
import { ApplicationError } from '../../shared/errors/application-errors.js';

const STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  AUTHENTICATION_REQUIRED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  EMAIL_ALREADY_REGISTERED: 409,
  VERSION_CONFLICT: 409,
  GOOGLE_NOT_CONNECTED: 409,
  GOOGLE_RECONNECT_REQUIRED: 409,
  GOOGLE_SHEETS_ACCESS_REQUIRED: 409,
  CONFIRMATION_REQUIRED: 409,
  PUBLISH_IN_PROGRESS: 409,
  RATE_LIMITED: 429,
  GOOGLE_OAUTH_FAILED: 502,
  GOOGLE_FORMS_FAILED: 502,
  GOOGLE_SHEETS_FAILED: 502,
  PUBLISH_FAILED: 502,
  EXTERNAL_SERVICE_FAILED: 502,
  AI_UNAVAILABLE: 503,
  DATABASE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

const CODES_WITH_PUBLIC_DETAILS: ReadonlySet<ErrorCode> = new Set([
  'VALIDATION_FAILED',
  'VERSION_CONFLICT',
  'PUBLISH_FAILED',
  'GOOGLE_SHEETS_FAILED',
  'CONFIRMATION_REQUIRED',
]);

interface BodyParserError {
  type?: unknown;
  status?: unknown;
}

export class ErrorResponder {
  constructor(private readonly logger: Logger) {}

  readonly handle = (error: unknown, request: Request, response: Response, _next: NextFunction): void => {
    const body = this.toBody(error);
    const status = this.statusFor(error, body.error.code);
    if (status >= 500) {
      this.logger.error('Request failed', { method: request.method, path: request.path, status, error });
    }
    response.status(status).json(body);
  };

  readonly notFound = (_request: Request, response: Response): void => {
    response.status(404).json(this.body('NOT_FOUND', 'The requested resource was not found.'));
  };

  respond(response: Response, code: ErrorCode, message: string): void {
    response.status(STATUS_BY_CODE[code]).json(this.body(code, message));
  }

  private toBody(error: unknown): ApiErrorBody {
    if (error instanceof ApplicationError) {
      return this.body(error.code, error.message, CODES_WITH_PUBLIC_DETAILS.has(error.code) ? error.details : undefined);
    }
    const bodyParserError = this.asBodyParserError(error);
    if (bodyParserError === 'entity.parse.failed') {
      return this.body('VALIDATION_FAILED', 'The request body must be valid JSON.');
    }
    if (bodyParserError === 'entity.too.large') {
      return this.body('VALIDATION_FAILED', 'The request body is too large.');
    }
    return this.body('INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }

  private statusFor(error: unknown, code: ErrorCode): number {
    return this.asBodyParserError(error) === 'entity.too.large' ? 413 : STATUS_BY_CODE[code];
  }

  private asBodyParserError(error: unknown): string | null {
    const candidate = (typeof error === 'object' && error !== null ? error : {}) as BodyParserError;
    return typeof candidate.type === 'string' && typeof candidate.status === 'number' ? candidate.type : null;
  }

  private body(code: ErrorCode, message: string, details?: Record<string, unknown>): ApiErrorBody {
    return { error: { code, message, ...(details ? { details } : {}) } };
  }
}
