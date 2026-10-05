import type { LogMetadata, Logger } from '../../domain/interfaces/system.js';

type LogLevel = 'info' | 'warn' | 'error';

const SENSITIVE_KEY_PATTERN = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|credential|code/i;
const REDACTED = '[REDACTED]';
const MAX_DEPTH = 4;

export class JsonConsoleLogger implements Logger {
  constructor(private readonly enabled: boolean = true) {}

  info(message: string, metadata?: LogMetadata): void {
    this.write('info', message, metadata);
  }

  warn(message: string, metadata?: LogMetadata): void {
    this.write('warn', message, metadata);
  }

  error(message: string, metadata?: LogMetadata): void {
    this.write('error', message, metadata);
  }

  private write(level: LogLevel, message: string, metadata: LogMetadata | undefined): void {
    if (!this.enabled) {
      return;
    }
    const entry = JSON.stringify({
      level,
      time: new Date().toISOString(),
      message,
      ...(metadata ? { metadata: this.redact(metadata, 0) } : {}),
    });
    if (level === 'error') {
      process.stderr.write(`${entry}\n`);
      return;
    }
    process.stdout.write(`${entry}\n`);
  }

  private redact(value: unknown, depth: number): unknown {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        ...(value.cause !== undefined && depth < MAX_DEPTH ? { cause: this.redact(value.cause, depth + 1) } : {}),
      };
    }
    if (depth >= MAX_DEPTH || value === null || typeof value !== 'object') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.redact(item, depth + 1));
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : this.redact(entry, depth + 1),
      ]),
    );
  }
}
