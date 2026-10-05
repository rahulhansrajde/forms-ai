import { ValidationError } from '../../shared/errors/application-errors.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LENGTH = 254;

export class EmailAddress {
  private constructor(readonly value: string) {}

  static parse(raw: string): EmailAddress {
    const normalized = raw.trim().toLowerCase();
    if (normalized.length === 0 || normalized.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(normalized)) {
      throw new ValidationError('Enter a valid email address.', { field: 'email' });
    }
    return new EmailAddress(normalized);
  }

  equals(other: EmailAddress): boolean {
    return this.value === other.value;
  }
}
