import type { z } from 'zod';
import { toValidationError } from '../../shared/utilities/validation-issues.js';

export class RequestValidator {
  body<TSchema extends z.ZodType>(schema: TSchema, body: unknown): z.infer<TSchema> {
    return this.parse(schema, body ?? {}, 'The request is not valid.');
  }

  params<TSchema extends z.ZodType>(schema: TSchema, params: unknown): z.infer<TSchema> {
    return this.parse(schema, params, 'The requested address is not valid.');
  }

  query<TSchema extends z.ZodType>(schema: TSchema, query: unknown): z.infer<TSchema> {
    return this.parse(schema, query, 'The request parameters are not valid.');
  }

  private parse<TSchema extends z.ZodType>(schema: TSchema, value: unknown, message: string): z.infer<TSchema> {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw toValidationError(parsed.error, message);
    }
    return parsed.data;
  }
}
