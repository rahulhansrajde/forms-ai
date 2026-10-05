import { ApiError } from '../services/api-client';

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
}

export function errorField(error: unknown): string | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  if (error.code === 'EMAIL_ALREADY_REGISTERED') {
    return 'email';
  }
  const field = error.details?.field;
  return typeof field === 'string' ? field : null;
}
