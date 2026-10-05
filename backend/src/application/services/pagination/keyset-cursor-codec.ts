import { z } from 'zod';
import type { KeysetCursor } from '../../../domain/interfaces/repositories.js';
import { ValidationError } from '../../../shared/errors/application-errors.js';

const cursorPayloadSchema = z.object({
  t: z.iso.datetime(),
  i: z.uuid(),
});

export class KeysetCursorCodec {
  encode(cursor: KeysetCursor): string {
    return Buffer.from(JSON.stringify({ t: cursor.timestamp.toISOString(), i: cursor.id }), 'utf8').toString('base64url');
  }

  decode(encoded: string | null): KeysetCursor | null {
    if (encoded === null) {
      return null;
    }
    const parsed = cursorPayloadSchema.safeParse(this.parseJson(encoded));
    if (!parsed.success) {
      throw new ValidationError('The pagination cursor is not valid.', { field: 'cursor' });
    }
    return { timestamp: new Date(parsed.data.t), id: parsed.data.i };
  }

  private parseJson(encoded: string): unknown {
    try {
      return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
  }
}
