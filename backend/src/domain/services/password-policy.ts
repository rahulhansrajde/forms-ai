import { ValidationError } from '../../shared/errors/application-errors.js';

const MINIMUM_LENGTH = 8;
const MAXIMUM_LENGTH = 128;

export class PasswordPolicy {
  assertAcceptable(password: string, field = 'password'): void {
    if (password.length < MINIMUM_LENGTH) {
      throw new ValidationError(`Password must be at least ${MINIMUM_LENGTH} characters.`, { field });
    }
    if (password.length > MAXIMUM_LENGTH) {
      throw new ValidationError(`Password must be at most ${MAXIMUM_LENGTH} characters.`, { field });
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new ValidationError('Password must contain at least one letter and one number.', { field });
    }
  }

  assertConfirmed(password: string, confirmation: string, field = 'confirmPassword'): void {
    if (password !== confirmation) {
      throw new ValidationError('Passwords do not match.', { field });
    }
  }
}
