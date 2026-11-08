CREATE TABLE IF NOT EXISTS lodging_claims (
  profile_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE RESTRICT,
  building_id text NOT NULL,
  unit_number integer NOT NULL CHECK (unit_number BETWEEN 1 AND 100),
  mode text NOT NULL CHECK (mode IN ('rent', 'owned')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (building_id, mode, unit_number),
  CHECK (building_id <> ''),
  CHECK ((mode = 'rent' AND expires_at IS NOT NULL) OR (mode = 'owned' AND expires_at IS NULL))
);

CREATE INDEX IF NOT EXISTS lodging_claims_expiry_idx ON lodging_claims (expires_at)
  WHERE mode = 'rent';
