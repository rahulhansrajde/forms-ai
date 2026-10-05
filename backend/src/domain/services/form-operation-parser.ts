import type { FormOperation } from '@forms-ai/contracts';
import { toValidationError } from '../../shared/utilities/validation-issues.js';
import { formOperationListSchema } from './form-schema-definitions.js';

export class FormOperationParser {
  parse(candidate: unknown): FormOperation[] {
    const parsed = formOperationListSchema.safeParse(candidate);
    if (!parsed.success) {
      throw toValidationError(parsed.error, 'The requested form changes are not valid.');
    }
    return parsed.data;
  }
}
