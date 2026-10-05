export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'AUTHENTICATION_REQUIRED',
  'INVALID_CREDENTIALS',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'EMAIL_ALREADY_REGISTERED',
  'VERSION_CONFLICT',
  'GOOGLE_NOT_CONNECTED',
  'GOOGLE_RECONNECT_REQUIRED',
  'GOOGLE_OAUTH_FAILED',
  'GOOGLE_FORMS_FAILED',
  'AI_UNAVAILABLE',
  'PUBLISH_FAILED',
  'PUBLISH_IN_PROGRESS',
  'EXTERNAL_SERVICE_FAILED',
  'DATABASE_UNAVAILABLE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}
