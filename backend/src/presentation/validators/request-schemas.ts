import { CONVERSATION_PAGE_SIZE, MESSAGE_MAX_LENGTH, MESSAGE_PAGE_SIZE, VERSION_PAGE_SIZE } from '@forms-ai/contracts';
import { z } from 'zod';

const shortText = (max: number) => z.string().max(max);

export const signUpBodySchema = z
  .object({
    firstName: shortText(200),
    lastName: shortText(200),
    email: shortText(320),
    password: shortText(256),
    confirmPassword: shortText(256),
  })
  .strict();

export const logInBodySchema = z.object({ email: shortText(320), password: shortText(256) }).strict();

export const updateProfileBodySchema = z.object({ firstName: shortText(200), lastName: shortText(200) }).strict();

export const changePasswordBodySchema = z
  .object({ currentPassword: shortText(256), newPassword: shortText(256), confirmPassword: shortText(256) })
  .strict();

export const createConversationBodySchema = z.object({ title: shortText(200).optional() }).strict();

export const sendMessageBodySchema = z
  .object({ content: z.string().trim().min(1, 'Message cannot be empty.').max(MESSAGE_MAX_LENGTH) })
  .strict();

const cursorSchema = z.string().min(1).max(512).optional();

const pageQuerySchema = (defaultLimit: number) =>
  z.object({
    limit: z.coerce.number().int().min(1).max(100).default(defaultLimit),
    cursor: cursorSchema,
  });

export const conversationPageQuerySchema = pageQuerySchema(CONVERSATION_PAGE_SIZE);
export const messagePageQuerySchema = pageQuerySchema(MESSAGE_PAGE_SIZE);

export const versionPageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(VERSION_PAGE_SIZE),
  cursor: z.coerce.number().int().min(1).optional(),
});

export const conversationParamsSchema = z.object({ conversationId: z.uuid() });
export const draftParamsSchema = z.object({ draftId: z.uuid() });
export const draftVersionParamsSchema = z.object({ draftId: z.uuid(), versionId: z.uuid() });

export const createDraftVersionBodySchema = z.union([
  z.object({ baseVersionId: z.uuid(), operations: z.array(z.unknown()).min(1).max(100) }).strict(),
  z.object({ baseVersionId: z.uuid(), restoreVersionId: z.uuid() }).strict(),
]);

export const publishBodySchema = z.object({ draftId: z.uuid(), versionId: z.uuid() }).strict();

export const googleAuthorizationQuerySchema = z.object({ returnTo: z.string().max(512).optional() });

export const googleCallbackQuerySchema = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(512).optional(),
  error: z.string().max(200).optional(),
});
