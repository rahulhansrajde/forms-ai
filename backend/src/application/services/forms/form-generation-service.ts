import type { FormSchema } from '@forms-ai/contracts';
import type { AIConversationContext, AIProvider } from '../../../domain/interfaces/ai-provider.js';
import type { FormBlueprintBuilder } from '../../../domain/services/form-blueprint-builder.js';
import { AIOutputRejectedError, ValidationError } from '../../../shared/errors/application-errors.js';
import type { AIOutputSanitizer } from '../ai/ai-output-sanitizer.js';

export class FormGenerationService {
  constructor(
    private readonly ai: AIProvider,
    private readonly sanitizer: AIOutputSanitizer,
    private readonly blueprints: FormBlueprintBuilder,
  ) {}

  async generate(instruction: string, basis: FormSchema | null, context: AIConversationContext): Promise<FormSchema> {
    const output = await this.ai.generateForm({ instruction, basis, context });
    try {
      return this.blueprints.build(this.sanitizer.sanitize(output));
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new AIOutputRejectedError('The AI generated a form that could not be used.', error.details);
      }
      throw error;
    }
  }
}
