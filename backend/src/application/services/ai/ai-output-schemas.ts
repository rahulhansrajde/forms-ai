import { CHAT_INTENTS } from '@forms-ai/contracts';
import { z } from 'zod';
import { questionInputSchema } from '../../../domain/services/form-schema-definitions.js';

const clarificationSchema = z.string().trim().min(1).max(500).nullable().optional();

export const intentClassificationOutputSchema = z.object({
  intent: z.enum(CHAT_INTENTS),
  clarificationQuestion: clarificationSchema,
});

export const formOperationPlanOutputSchema = z.object({
  operations: z.array(z.unknown()).max(100),
  clarificationQuestion: clarificationSchema,
});

const MAX_SUGGESTIONS = 12;

export const suggestionProposalOutputSchema = z.object({
  formTitle: z.string().trim().min(1).max(300),
  baseQuestions: z.array(questionInputSchema).max(50).default([]),
  suggestions: z.array(questionInputSchema).max(MAX_SUGGESTIONS),
});

export const suggestionSelectionOutputSchema = z.object({
  acceptedIds: z.array(z.string().trim().min(1).max(64)).max(50),
});
