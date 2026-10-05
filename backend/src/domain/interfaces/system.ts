export interface Clock {
  now(): Date;
}

export interface IdentifierGenerator {
  generate(): string;
}

export interface TransactionRunner {
  runInTransaction<T>(work: () => Promise<T>): Promise<T>;
}

export type LogMetadata = Record<string, unknown>;

export interface Logger {
  info(message: string, metadata?: LogMetadata): void;
  warn(message: string, metadata?: LogMetadata): void;
  error(message: string, metadata?: LogMetadata): void;
}
