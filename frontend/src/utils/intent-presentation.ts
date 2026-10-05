import type { ChatIntent } from '@forms-ai/contracts';

const PREVIEW_INTENTS: ReadonlySet<ChatIntent> = new Set([
  'CREATE_FORM',
  'MODIFY_FORM',
  'REGENERATE_FORM',
  'ACCEPT_SUGGESTIONS',
  'CREATE_GOOGLE_FORM',
]);

export function offersPreview(intent: ChatIntent | null): boolean {
  return intent !== null && PREVIEW_INTENTS.has(intent);
}
