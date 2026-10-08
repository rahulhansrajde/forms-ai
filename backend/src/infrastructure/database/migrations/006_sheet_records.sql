ALTER TABLE sheet_actions
  ADD COLUMN steps JSONB;

CREATE TABLE sheet_record_contexts (
  conversation_id UUID PRIMARY KEY REFERENCES conversations (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  spreadsheet_id UUID NOT NULL REFERENCES spreadsheets (id) ON DELETE CASCADE,
  subject JSONB,
  pending JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
