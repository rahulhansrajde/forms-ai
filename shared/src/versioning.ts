export const VERSION_SOURCES = ['AI', 'MANUAL', 'IMPORT', 'REGENERATION', 'SUGGESTION_ACCEPTANCE'] as const;

export type VersionSource = (typeof VERSION_SOURCES)[number];

export const DRAFT_STATUSES = ['DRAFT', 'PUBLISHED'] as const;

export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const PUBLISH_JOB_STATUSES = ['RUNNING', 'SUCCEEDED', 'FAILED'] as const;

export type PublishJobStatus = (typeof PUBLISH_JOB_STATUSES)[number];

export const PUBLISH_STEPS = [
  'LOAD_DRAFT',
  'VALIDATE_SCHEMA',
  'LOAD_CONNECTION',
  'ENSURE_CREDENTIALS',
  'CREATE_FORM',
  'ADD_ITEMS',
  'APPLY_SETTINGS',
  'RETRIEVE_FORM',
  'PERSIST_RESULT',
  'COMPLETED',
] as const;

export type PublishStep = (typeof PUBLISH_STEPS)[number];

export const CREATED_FORM_STATUSES = ['CREATING', 'CREATED'] as const;

export type CreatedFormStatus = (typeof CREATED_FORM_STATUSES)[number];
