ALTER TABLE messages DROP CONSTRAINT messages_intent_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_intent_check CHECK (
    intent IS NULL OR intent IN (
      'NORMAL_CHAT', 'CREATE_FORM', 'SUGGEST_QUESTIONS', 'ACCEPT_SUGGESTIONS',
      'MODIFY_FORM', 'REGENERATE_FORM', 'CREATE_GOOGLE_FORM', 'CLARIFICATION_REQUIRED',
      'CREATE_SHEET', 'MODIFY_SHEET', 'READ_SHEET', 'LINK_SHEET'
    )
  );

ALTER TABLE spreadsheets
  ADD COLUMN origin TEXT NOT NULL DEFAULT 'CREATED_BY_FORMS_AI',
  ADD COLUMN activated_at TIMESTAMPTZ;

UPDATE spreadsheets SET activated_at = created_at WHERE activated_at IS NULL;

ALTER TABLE spreadsheets
  ALTER COLUMN activated_at SET NOT NULL,
  ALTER COLUMN activated_at SET DEFAULT now(),
  ADD CONSTRAINT spreadsheets_origin_check CHECK (origin IN ('CREATED_BY_FORMS_AI', 'LINKED_EXISTING')),
  DROP CONSTRAINT spreadsheets_user_google_unique,
  ADD CONSTRAINT spreadsheets_conversation_google_unique UNIQUE (conversation_id, google_spreadsheet_id);

CREATE INDEX spreadsheets_conversation_active_idx ON spreadsheets (conversation_id, activated_at DESC);

ALTER TABLE sheet_actions DROP CONSTRAINT sheet_actions_kind_check;

ALTER TABLE sheet_actions
  ADD CONSTRAINT sheet_actions_kind_check CHECK (kind IN ('CREATE', 'MODIFY', 'READ', 'LINK'));
