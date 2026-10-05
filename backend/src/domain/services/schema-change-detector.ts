import { isDeepStrictEqual } from 'node:util';
import type { FormSchema } from '@forms-ai/contracts';

export class SchemaChangeDetector {
  hasChanged(before: FormSchema, after: FormSchema): boolean {
    return !isDeepStrictEqual(before, after);
  }
}
