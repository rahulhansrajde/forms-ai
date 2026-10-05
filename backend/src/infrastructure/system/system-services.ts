import { randomUUID } from 'node:crypto';
import type { Clock, IdentifierGenerator } from '../../domain/interfaces/system.js';

export class MonotonicSystemClock implements Clock {
  private lastIssued = 0;

  now(): Date {
    const current = Math.max(Date.now(), this.lastIssued + 1);
    this.lastIssued = current;
    return new Date(current);
  }
}

export class UuidIdentifierGenerator implements IdentifierGenerator {
  generate(): string {
    return randomUUID();
  }
}
