CREATE TABLE IF NOT EXISTS lair_treasure_claims (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lair_id text NOT NULL CHECK (lair_id ~ '^[a-z0-9][a-z0-9-]{0,47}$'),
  claimed_at timestamptz NOT NULL,
  available_at timestamptz NOT NULL,
  claim_count int NOT NULL DEFAULT 1 CHECK (claim_count > 0),
  last_action_id text,
  PRIMARY KEY (profile_id, lair_id)
);
CREATE INDEX IF NOT EXISTS lair_treasure_claims_lair_available_idx
  ON lair_treasure_claims (lair_id, available_at);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clareira_preview_game') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON lair_treasure_claims TO clareira_preview_game;
  END IF;
END $$;
