import { z } from 'zod';
import {
  intentClassificationOutputSchema,
  suggestionProposalOutputSchema,
  suggestionSelectionOutputSchema,
} from '../../../application/services/ai/ai-output-schemas.js';
import { formBlueprintSchema, formOperationSchema } from '../../../domain/services/form-schema-definitions.js';

export interface StructuredOutput {
  name: string;
  jsonSchema: Record<string, unknown>;
}

const operationPlanOutputSchema = z.object({
  operations: z.array(formOperationSchema).max(100),
  clarificationQuestion: z.string().max(500).nullable().optional(),
});

function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema: Record<string, unknown> = { ...z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) };
  delete jsonSchema.$schema;
  return jsonSchema;
}

export const STRUCTURED_OUTPUTS = {
  classifyIntent: { name: 'intent classification', jsonSchema: toJsonSchema(intentClassificationOutputSchema) },
  generateForm: { name: 'form generation', jsonSchema: toJsonSchema(formBlueprintSchema) },
  planOperations: { name: 'form operations', jsonSchema: toJsonSchema(operationPlanOutputSchema) },
  suggestQuestions: { name: 'question suggestions', jsonSchema: toJsonSchema(suggestionProposalOutputSchema) },
  selectSuggestions: { name: 'suggestion selection', jsonSchema: toJsonSchema(suggestionSelectionOutputSchema) },
} satisfies Record<string, StructuredOutput>;
