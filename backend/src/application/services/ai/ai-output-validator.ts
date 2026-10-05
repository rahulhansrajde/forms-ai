import type { z } from 'zod';
import { AIOutputRejectedError } from '../../../shared/errors/application-errors.js';
import { describeIssues } from '../../../shared/utilities/validation-issues.js';
import type { AIOutputSanitizer } from './ai-output-sanitizer.js';

export class AIOutputValidator {
  constructor(private readonly sanitizer: AIOutputSanitizer) {}

  parse<TSchema extends z.ZodType>(schema: TSchema, output: unknown, purpose: string): z.infer<TSchema> {
    const parsed = schema.safeParse(this.sanitizer.sanitize(output));
    if (!parsed.success) {
      throw new AIOutputRejectedError(`The AI response for ${purpose} could not be used.`, {
        issues: describeIssues(parsed.error),
      });
    }
    return parsed.data;
  }
}
