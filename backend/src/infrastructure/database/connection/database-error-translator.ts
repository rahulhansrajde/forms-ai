import { DatabaseError } from '../../../shared/errors/application-errors.js';

const UNIQUE_VIOLATION = '23505';

export class UniqueConstraintViolation extends Error {
  constructor(readonly constraint: string) {
    super(`Unique constraint violated: ${constraint}`);
    this.name = 'UniqueConstraintViolation';
  }
}

interface DriverError {
  code?: unknown;
  constraint?: unknown;
}

export class DatabaseErrorTranslator {
  translate(error: unknown): Error {
    const driverError = (typeof error === 'object' && error !== null ? error : {}) as DriverError;
    if (driverError.code === UNIQUE_VIOLATION) {
      return new UniqueConstraintViolation(String(driverError.constraint ?? 'unknown'));
    }
    return new DatabaseError('The database could not complete the request.', undefined, { cause: error });
  }
}
