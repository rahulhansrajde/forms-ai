import { ValidationError } from '../../shared/errors/application-errors.js';

const NAME_MAX_LENGTH = 100;

export class PersonName {
  private constructor(
    readonly firstName: string,
    readonly lastName: string,
  ) {}

  static parse(firstName: string, lastName: string): PersonName {
    return new PersonName(
      PersonName.normalizePart(firstName, 'firstName', 'First name'),
      PersonName.normalizePart(lastName, 'lastName', 'Last name'),
    );
  }

  private static normalizePart(raw: string, field: string, label: string): string {
    const normalized = raw.trim().replace(/\s+/g, ' ');
    if (normalized.length === 0) {
      throw new ValidationError(`${label} is required.`, { field });
    }
    if (normalized.length > NAME_MAX_LENGTH) {
      throw new ValidationError(`${label} must be at most ${NAME_MAX_LENGTH} characters.`, { field });
    }
    return normalized;
  }
}
