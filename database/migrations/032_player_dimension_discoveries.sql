CREATE TABLE IF NOT EXISTS player_dimension_discoveries (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dimension_id text NOT NULL CHECK (dimension_id ~ '^[a-z0-9][a-z0-9-]{0,47}$'),
  discovery_source text NOT NULL CHECK (discovery_source IN ('starter', 'legacy', 'portal', 'knowledge')),
  discovered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, dimension_id)
);

-- Existing players retain dimensions they had actually visited. Active staff
-- travel is not a player discovery and must not survive staff revocation.
INSERT INTO player_dimension_discoveries (profile_id, dimension_id, discovery_source)
SELECT profile.id, 'surface', 'starter' FROM profiles profile
ON CONFLICT (profile_id, dimension_id) DO NOTHING;

INSERT INTO player_dimension_discoveries (profile_id, dimension_id, discovery_source)
SELECT profile.id, 'breu', 'starter' FROM profiles profile
ON CONFLICT (profile_id, dimension_id) DO NOTHING;

INSERT INTO player_dimension_discoveries (profile_id, dimension_id, discovery_source)
SELECT position.profile_id, position.dimension_id, 'legacy'
  FROM player_dimension_positions position
 WHERE NOT public.staff_actor_has_permission(position.profile_id, 'dimensions.staff_travel', 'global')
ON CONFLICT (profile_id, dimension_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clareira_preview_game') THEN
    GRANT SELECT, INSERT ON player_dimension_discoveries TO clareira_preview_game;
  END IF;
END $$;
