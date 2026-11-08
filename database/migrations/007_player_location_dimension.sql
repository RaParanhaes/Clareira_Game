ALTER TABLE player_locations
  ADD COLUMN IF NOT EXISTS dimension_id text NOT NULL DEFAULT 'surface'
  CHECK (dimension_id ~ '^[a-z0-9][a-z0-9-]{0,47}$');
