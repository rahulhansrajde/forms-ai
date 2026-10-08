ALTER TABLE messages DROP CONSTRAINT messages_intent_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_intent_check CHECK (
    intent IS NULL OR intent IN (
      'NORMAL_CHAT', 'CREATE_FORM', 'SUGGEST_QUESTIONS', 'ACCEPT_SUGGESTIONS',
      'MODIFY_FORM', 'REGENERATE_FORM', 'CREATE_GOOGLE_FORM', 'CLARIFICATION_REQUIRED',
      'CREATE_SHEET', 'MODIFY_SHEET', 'READ_SHEET'
    )
  );

CREATE TABLE spreadsheets (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  google_spreadsheet_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  tabs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT spreadsheets_user_google_unique UNIQUE (user_id, google_spreadsheet_id)
);

CREATE INDEX spreadsheets_conversation_created_idx ON spreadsheets (conversation_id, created_at DESC);

CREATE TABLE sheet_actions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  spreadsheet_id UUID REFERENCES spreadsheets (id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  operations JSONB NOT NULL,
  status TEXT NOT NULL,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sheet_actions_kind_check CHECK (kind IN ('CREATE', 'MODIFY', 'READ')),
  CONSTRAINT sheet_actions_status_check CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'))
);

CREATE INDEX sheet_actions_conversation_idx ON sheet_actions (conversation_id);

ALTER TABLE messages
  ADD COLUMN sheet_action_id UUID REFERENCES sheet_actions (id) ON DELETE SET NULL;
