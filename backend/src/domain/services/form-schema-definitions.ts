import { FORM_LIMITS, QUESTION_TYPES } from '@forms-ai/contracts';
import { z } from 'zod';

const elementIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'Identifiers may only contain letters, numbers, underscores and dashes.');

const formTitleSchema = z.string().trim().min(1, 'A title is required.').max(FORM_LIMITS.titleMaxLength);
const optionalTitleSchema = z.string().trim().max(FORM_LIMITS.titleMaxLength);
const descriptionSchema = z.string().trim().max(FORM_LIMITS.descriptionMaxLength);
const optionSchema = z.string().trim().min(1, 'Options cannot be empty.').max(FORM_LIMITS.optionMaxLength);
const scaleLabelSchema = z.string().trim().max(FORM_LIMITS.scaleLabelMaxLength);

const questionTypeSchema = z.enum(QUESTION_TYPES);

const linearScaleSchema = z
  .object({
    min: z.union([z.literal(0), z.literal(1)]),
    max: z.number().int().min(FORM_LIMITS.scaleMinUpperBound).max(FORM_LIMITS.scaleMaxUpperBound),
    minLabel: scaleLabelSchema.default(''),
    maxLabel: scaleLabelSchema.default(''),
  })
  .strict();

const optionListSchema = z.array(optionSchema).max(FORM_LIMITS.maxOptions);

export const questionInputSchema = z
  .object({
    type: questionTypeSchema,
    title: formTitleSchema,
    description: descriptionSchema.default(''),
    required: z.boolean().default(false),
    options: optionListSchema.optional(),
    scale: linearScaleSchema.optional(),
  })
  .strict();

const questionChangesSchema = z
  .object({
    type: questionTypeSchema.optional(),
    title: formTitleSchema.optional(),
    description: descriptionSchema.optional(),
    required: z.boolean().optional(),
    options: optionListSchema.optional(),
    scale: linearScaleSchema.optional(),
  })
  .strict()
  .refine((changes) => Object.keys(changes).length > 0, 'At least one change is required.');

const storedQuestionSchema = questionInputSchema.extend({ id: elementIdentifierSchema });

const storedSectionSchema = z
  .object({
    id: elementIdentifierSchema,
    title: optionalTitleSchema.default(''),
    description: descriptionSchema.default(''),
    questions: z.array(storedQuestionSchema).max(FORM_LIMITS.maxQuestions),
  })
  .strict();

export const storedFormSchemaSchema = z
  .object({
    title: formTitleSchema,
    description: descriptionSchema.default(''),
    sections: z.array(storedSectionSchema).min(1, 'A form needs at least one section.').max(FORM_LIMITS.maxSections),
  })
  .strict();

const blueprintSectionSchema = z.object({
  title: optionalTitleSchema.default(''),
  description: descriptionSchema.default(''),
  questions: z.array(questionInputSchema).max(FORM_LIMITS.maxQuestions),
});

export const formBlueprintSchema = z.object({
  title: formTitleSchema,
  description: descriptionSchema.default(''),
  sections: z.array(blueprintSectionSchema).min(1).max(FORM_LIMITS.maxSections),
});

export type FormBlueprint = z.infer<typeof formBlueprintSchema>;

const indexSchema = z.number().int().min(0);

export const formOperationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('UPDATE_TITLE'), title: formTitleSchema }).strict(),
  z.object({ type: z.literal('UPDATE_DESCRIPTION'), description: descriptionSchema }).strict(),
  z
    .object({
      type: z.literal('ADD_SECTION'),
      title: optionalTitleSchema,
      description: descriptionSchema.optional(),
      index: indexSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('UPDATE_SECTION'),
      sectionId: elementIdentifierSchema,
      title: optionalTitleSchema.optional(),
      description: descriptionSchema.optional(),
    })
    .strict(),
  z.object({ type: z.literal('REMOVE_SECTION'), sectionId: elementIdentifierSchema }).strict(),
  z.object({ type: z.literal('REORDER_SECTION'), sectionId: elementIdentifierSchema, index: indexSchema }).strict(),
  z
    .object({
      type: z.literal('ADD_QUESTION'),
      question: questionInputSchema,
      sectionId: elementIdentifierSchema.optional(),
      index: indexSchema.optional(),
    })
    .strict(),
  z
    .object({ type: z.literal('UPDATE_QUESTION'), questionId: elementIdentifierSchema, changes: questionChangesSchema })
    .strict(),
  z.object({ type: z.literal('REMOVE_QUESTION'), questionId: elementIdentifierSchema }).strict(),
  z
    .object({
      type: z.literal('REORDER_QUESTION'),
      questionId: elementIdentifierSchema,
      sectionId: elementIdentifierSchema.optional(),
      index: indexSchema,
    })
    .strict(),
]);

const MAX_OPERATIONS_PER_CHANGE = 100;

export const formOperationListSchema = z.array(formOperationSchema).min(1).max(MAX_OPERATIONS_PER_CHANGE);
