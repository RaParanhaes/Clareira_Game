-- Government-scoped economic delegates. These are not global admin roles.
CREATE TABLE government_economy_roles (
  government_id text NOT NULL REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('minister','treasurer','auditor')),
  appointed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (government_id,profile_id)
);

CREATE TABLE government_economy_role_events (
  event_id uuid PRIMARY KEY,
  government_id text NOT NULL REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  actor_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  target_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  previous_role text CHECK (previous_role IS NULL OR previous_role IN ('minister','treasurer','auditor')),
  next_role text CHECK (next_role IS NULL OR next_role IN ('minister','treasurer','auditor')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (previous_role IS DISTINCT FROM next_role)
);
CREATE INDEX government_economy_role_events_time_idx ON government_economy_role_events(government_id,occurred_at DESC);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='clareira_preview_game') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON government_economy_roles TO clareira_preview_game;
    GRANT SELECT,INSERT ON government_economy_role_events TO clareira_preview_game;
    REVOKE UPDATE,DELETE ON government_economy_role_events FROM clareira_preview_game;
  END IF;
END $$;
