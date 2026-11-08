ALTER TABLE worlds
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0);
