CREATE TABLE player_dimension_positions (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dimension_id text NOT NULL CHECK (dimension_id ~ '^[a-z0-9][a-z0-9-]{0,47}$'),
  x double precision NOT NULL CHECK (x BETWEEN -100000 AND 100000),
  y double precision NOT NULL CHECK (y BETWEEN -100000 AND 100000),
  world_version smallint NOT NULL DEFAULT 2 CHECK (world_version BETWEEN 1 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id,dimension_id)
);
