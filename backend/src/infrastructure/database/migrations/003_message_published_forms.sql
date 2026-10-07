ALTER TABLE messages
  ADD COLUMN created_form_id UUID REFERENCES created_forms (id) ON DELETE SET NULL;
