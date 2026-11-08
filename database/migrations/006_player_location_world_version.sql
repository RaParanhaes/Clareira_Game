ALTER TABLE player_locations
  ADD COLUMN IF NOT EXISTS world_version smallint NOT NULL DEFAULT 1
  CHECK (world_version BETWEEN 1 AND 100);
