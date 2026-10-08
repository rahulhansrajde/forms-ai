export const CHAT_INTENTS = [
  'NORMAL_CHAT',
  'CREATE_FORM',
  'SUGGEST_QUESTIONS',
  'ACCEPT_SUGGESTIONS',
  'MODIFY_FORM',
  'REGENERATE_FORM',
  'CREATE_GOOGLE_FORM',
  'CLARIFICATION_REQUIRED',
  'CREATE_SHEET',
  'MODIFY_SHEET',
  'READ_SHEET',
  'LINK_SHEET',
] as const;

export const SHEET_INTENTS: readonly ChatIntent[] = ['CREATE_SHEET', 'MODIFY_SHEET', 'READ_SHEET', 'LINK_SHEET'];

export type ChatIntent = (typeof CHAT_INTENTS)[number];

export const DRAFT_CHANGING_INTENTS: readonly ChatIntent[] = [
  'CREATE_FORM',
  'MODIFY_FORM',
  'REGENERATE_FORM',
  'ACCEPT_SUGGESTIONS',
];

export function isChatIntent(value: unknown): value is ChatIntent {
  return typeof value === 'string' && (CHAT_INTENTS as readonly string[]).includes(value);
}
