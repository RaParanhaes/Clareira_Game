CREATE TABLE player_map_exploration (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dimension_id text NOT NULL CHECK (dimension_id ~ '^[a-z0-9][a-z0-9-]{0,47}$'),
  chunks smallint[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, dimension_id),
  CHECK (cardinality(chunks) <= 2304),
  CHECK (array_position(chunks, NULL) IS NULL)
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clareira_preview_game') THEN
    GRANT SELECT, INSERT, UPDATE ON player_map_exploration TO clareira_preview_game;
  END IF;
END $$;
