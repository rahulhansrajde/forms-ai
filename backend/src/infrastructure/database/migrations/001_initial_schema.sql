CREATE TABLE users (
  id UUID PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_email_lowercase CHECK (email = lower(email))
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sessions_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX conversations_user_id_idx ON conversations (user_id);
CREATE INDEX conversations_user_updated_idx ON conversations (user_id, updated_at DESC, id DESC);

CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  intent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT messages_role_check CHECK (role IN ('USER', 'ASSISTANT')),
  CONSTRAINT messages_intent_check CHECK (
    intent IS NULL OR intent IN (
      'NORMAL_CHAT', 'CREATE_FORM', 'SUGGEST_QUESTIONS', 'ACCEPT_SUGGESTIONS',
      'MODIFY_FORM', 'REGENERATE_FORM', 'CREATE_GOOGLE_FORM', 'CLARIFICATION_REQUIRED'
    )
  )
);

CREATE INDEX messages_conversation_id_idx ON messages (conversation_id);
CREATE INDEX messages_conversation_created_idx ON messages (conversation_id, created_at DESC, id DESC);

CREATE TABLE form_drafts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  current_version_id UUID,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT form_drafts_status_check CHECK (status IN ('DRAFT', 'PUBLISHED'))
);

CREATE INDEX form_drafts_user_id_idx ON form_drafts (user_id);
CREATE INDEX form_drafts_conversation_created_idx ON form_drafts (conversation_id, created_at DESC);

CREATE TABLE form_versions (
  id UUID PRIMARY KEY,
  draft_id UUID NOT NULL REFERENCES form_drafts (id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  schema JSONB NOT NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT form_versions_number_unique UNIQUE (draft_id, version_number),
  CONSTRAINT form_versions_number_positive CHECK (version_number > 0),
  CONSTRAINT form_versions_source_check CHECK (
    source IN ('AI', 'MANUAL', 'IMPORT', 'REGENERATION', 'SUGGESTION_ACCEPTANCE')
  )
);

ALTER TABLE form_drafts
  ADD CONSTRAINT form_drafts_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES form_versions (id) ON DELETE SET NULL;

CREATE TABLE suggestion_sets (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  draft_id UUID REFERENCES form_drafts (id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  form_title TEXT NOT NULL,
  base_questions JSONB NOT NULL,
  suggestions JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT suggestion_sets_status_check CHECK (
    status IN ('PENDING', 'CONFIRMATION_REQUESTED', 'ACCEPTED', 'SUPERSEDED')
  )
);

CREATE INDEX suggestion_sets_conversation_created_idx ON suggestion_sets (conversation_id, created_at DESC);

CREATE TABLE connected_accounts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  provider_account_email TEXT NOT NULL,
  scopes TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT connected_accounts_user_provider_unique UNIQUE (user_id, provider),
  CONSTRAINT connected_accounts_provider_check CHECK (provider IN ('GOOGLE'))
);

CREATE TABLE created_forms (
  id UUID PRIMARY KEY,
  draft_id UUID NOT NULL REFERENCES form_drafts (id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES form_versions (id) ON DELETE CASCADE,
  google_form_id TEXT NOT NULL,
  responder_url TEXT,
  edit_url TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT created_forms_version_unique UNIQUE (version_id),
  CONSTRAINT created_forms_status_check CHECK (status IN ('CREATING', 'CREATED'))
);

CREATE INDEX created_forms_draft_id_idx ON created_forms (draft_id);

CREATE TABLE publish_jobs (
  id UUID PRIMARY KEY,
  draft_id UUID NOT NULL REFERENCES form_drafts (id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES form_versions (id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  current_step TEXT NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT publish_jobs_status_check CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED'))
);

CREATE INDEX publish_jobs_draft_created_idx ON publish_jobs (draft_id, created_at DESC);
CREATE UNIQUE INDEX publish_jobs_single_running_idx ON publish_jobs (version_id) WHERE status = 'RUNNING';
