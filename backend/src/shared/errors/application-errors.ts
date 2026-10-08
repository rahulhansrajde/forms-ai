import type { ErrorCode } from '@forms-ai/contracts';

export type ErrorDetails = Record<string, unknown>;

export abstract class ApplicationError extends Error {
  abstract readonly code: ErrorCode;

  constructor(
    message: string,
    readonly details?: ErrorDetails,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ValidationError extends ApplicationError {
  readonly code = 'VALIDATION_FAILED';
}

export class AuthenticationError extends ApplicationError {
  constructor(
    readonly code: Extract<ErrorCode, 'AUTHENTICATION_REQUIRED' | 'INVALID_CREDENTIALS'> = 'AUTHENTICATION_REQUIRED',
    message = 'Please log in to continue.',
  ) {
    super(message);
  }
}

export class AuthorizationError extends ApplicationError {
  readonly code = 'FORBIDDEN';

  constructor(message = 'You do not have access to this resource.') {
    super(message);
  }
}

export class NotFoundError extends ApplicationError {
  readonly code = 'NOT_FOUND';

  constructor(resource: string) {
    super(`${resource} was not found.`);
  }
}

export class ConflictError extends ApplicationError {
  constructor(
    readonly code: Extract<
      ErrorCode,
      'CONFLICT' | 'EMAIL_ALREADY_REGISTERED' | 'VERSION_CONFLICT' | 'PUBLISH_IN_PROGRESS'
    >,
    message: string,
    details?: ErrorDetails,
  ) {
    super(message, details);
  }
}

export class ExternalServiceError extends ApplicationError {
  readonly code: ErrorCode = 'EXTERNAL_SERVICE_FAILED';
}

export class GoogleOAuthError extends ExternalServiceError {
  constructor(
    override readonly code: Extract<ErrorCode, 'GOOGLE_OAUTH_FAILED' | 'GOOGLE_NOT_CONNECTED' | 'GOOGLE_RECONNECT_REQUIRED' | 'GOOGLE_SHEETS_ACCESS_REQUIRED'>,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, undefined, options);
  }
}

export class GoogleFormsError extends ExternalServiceError {
  override readonly code = 'GOOGLE_FORMS_FAILED';
}

export class GoogleSheetsError extends ExternalServiceError {
  override readonly code = 'GOOGLE_SHEETS_FAILED';
}

export class ConfirmationRequiredError extends ApplicationError {
  readonly code = 'CONFIRMATION_REQUIRED';
}

export class AIProviderError extends ExternalServiceError {
  override readonly code = 'AI_UNAVAILABLE';
}

export class AIOutputRejectedError extends AIProviderError {}

export class DatabaseError extends ApplicationError {
  readonly code = 'DATABASE_UNAVAILABLE';
}

export class PublishError extends ApplicationError {
  readonly code = 'PUBLISH_FAILED';
}
