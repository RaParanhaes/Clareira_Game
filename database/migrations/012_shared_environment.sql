-- Durable environment state previously kept in process-local JSON files.
CREATE TABLE IF NOT EXISTS dimension_catalog (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  revision bigint NOT NULL CHECK (revision >= 0),
  dimensions jsonb NOT NULL CHECK (jsonb_typeof(dimensions) = 'array')
);
CREATE TABLE IF NOT EXISTS dimension_campfires (
  dimension_id text PRIMARY KEY CHECK (dimension_id ~ '^[a-z0-9][a-z0-9-]{0,47}$'),
  fires jsonb NOT NULL CHECK (jsonb_typeof(fires) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE worlds ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'forest';
ALTER TABLE world_chunk_changes ADD COLUMN IF NOT EXISTS edit_index integer NOT NULL DEFAULT 0 CHECK(edit_index >= 0);
