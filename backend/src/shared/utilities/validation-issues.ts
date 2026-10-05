import type { ZodError } from 'zod';
import { ValidationError } from '../errors/application-errors.js';

export interface ValidationIssue {
  path: string;
  message: string;
}

export function describeIssues(error: ZodError): ValidationIssue[] {
  return error.issues.slice(0, 10).map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

export function toValidationError(error: ZodError, message: string): ValidationError {
  return new ValidationError(message, { issues: describeIssues(error) });
}
