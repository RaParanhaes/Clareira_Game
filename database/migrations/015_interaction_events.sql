CREATE TABLE interaction_events (
  event_id uuid PRIMARY KEY,
  actor_profile_id uuid,
  action text NOT NULL CHECK (action <> ''),
  dimension_id text NOT NULL CHECK (dimension_id <> ''),
  location text NOT NULL CHECK (location IN ('clearing', 'room')),
  place_id text NOT NULL CHECK (place_id <> ''),
  instance_id text,
  position jsonb NOT NULL CHECK (jsonb_typeof(position) = 'object'),
  object_id text,
  object_kind text,
  object_properties jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(object_properties) = 'object'),
  transfer jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(transfer) = 'object'),
  details jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(details) = 'object'),
  happened_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX interaction_events_actor_time_idx ON interaction_events (actor_profile_id, happened_at DESC);
CREATE INDEX interaction_events_place_time_idx ON interaction_events (dimension_id, place_id, happened_at DESC);
CREATE INDEX interaction_events_object_idx ON interaction_events (object_id, happened_at DESC) WHERE object_id IS NOT NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clareira_preview_game') THEN
    GRANT SELECT, INSERT ON interaction_events TO clareira_preview_game;
    REVOKE UPDATE, DELETE ON interaction_events FROM clareira_preview_game;
  END IF;
END $$;
