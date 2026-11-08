CREATE TABLE IF NOT EXISTS cabin_keys (
  building_id text NOT NULL,
  owner_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  holder_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (building_id, holder_profile_id),
  CHECK (owner_profile_id <> holder_profile_id)
);
CREATE INDEX IF NOT EXISTS cabin_keys_holder_idx ON cabin_keys(holder_profile_id);
