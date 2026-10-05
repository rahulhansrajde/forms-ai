import type { FormOperation, FormSchema } from '@forms-ai/contracts';
import type { AIConversationContext, AIProvider } from '../../../domain/interfaces/ai-provider.js';
import type { FormOperationApplier } from '../../../domain/services/form-operation-applier.js';
import type { FormOperationParser } from '../../../domain/services/form-operation-parser.js';
import { AIOutputRejectedError, ValidationError } from '../../../shared/errors/application-errors.js';
import { formOperationPlanOutputSchema } from '../ai/ai-output-schemas.js';
import type { AIOutputValidator } from '../ai/ai-output-validator.js';

export type FormModificationResult =
  | { kind: 'changes'; schema: FormSchema; operations: FormOperation[] }
  | { kind: 'clarification'; question: string };

export class FormModificationService {
  constructor(
    private readonly ai: AIProvider,
    private readonly outputValidator: AIOutputValidator,
    private readonly parser: FormOperationParser,
    private readonly applier: FormOperationApplier,
  ) {}

  async modify(instruction: string, form: FormSchema, context: AIConversationContext): Promise<FormModificationResult> {
    const plan = this.outputValidator.parse(
      formOperationPlanOutputSchema,
      await this.ai.planFormOperations(instruction, form, context),
      'form changes',
    );
    if (plan.operations.length === 0) {
      return { kind: 'clarification', question: plan.clarificationQuestion ?? this.defaultClarification() };
    }
    return this.applyPlannedOperations(form, plan.operations);
  }

  private applyPlannedOperations(form: FormSchema, plannedOperations: unknown[]): FormModificationResult {
    try {
      const operations = this.parser.parse(plannedOperations);
      return { kind: 'changes', schema: this.applier.apply(form, operations), operations };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new AIOutputRejectedError('The AI proposed form changes that could not be applied.', error.details);
      }
      throw error;
    }
  }

  private defaultClarification(): string {
    return 'Which part of the form should I change? Mention the question or section by name.';
  }
}
