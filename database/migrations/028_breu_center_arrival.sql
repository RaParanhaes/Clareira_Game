-- The expanded map center is (2966.5, 2966.5); move only dark-world arrivals.
UPDATE dimension_catalog AS catalog
SET dimensions = (
  SELECT jsonb_agg(
    CASE WHEN entry.value->>'id' = 'breu' THEN
      jsonb_set(
        jsonb_set(entry.value, '{spawn}', '{"x":2966.5,"y":2966.5}'::jsonb, true),
        '{campfire}', '{"x":2966.5,"y":2966.5}'::jsonb, true)
    ELSE entry.value END
    ORDER BY entry.ordinality)
  FROM jsonb_array_elements(catalog.dimensions) WITH ORDINALITY AS entry(value, ordinality)
),
revision = revision + 1
WHERE catalog.id = true
  AND catalog.dimensions @> '[{"id":"breu"}]'::jsonb;

-- Preserve each player's distance from the old arrival point when the Breu moves.
UPDATE player_dimension_positions
SET x = x + 2547,
    y = y + 2547,
    world_version = 3,
    updated_at = now()
WHERE (dimension_id = 'breu' OR dimension_id LIKE 'arrival-%')
  AND world_version < 3;

UPDATE player_locations
SET x = x + 2547,
    y = y + 2547,
    world_version = 3,
    updated_at = now()
WHERE (dimension_id = 'breu' OR dimension_id LIKE 'arrival-%')
  AND world_version < 3;

-- Saved permanent arrival flames follow their dimension to the new center.
UPDATE dimension_campfires AS saved
SET fires = (
  SELECT COALESCE(jsonb_agg(
    CASE WHEN fire.value->>'id' = 'arrival' AND fire.value->>'permanent' = 'true' THEN
      jsonb_set(
        jsonb_set(fire.value, '{x}', '2966.5'::jsonb, true),
        '{y}', '2966.5'::jsonb, true)
    ELSE fire.value END), '[]'::jsonb)
  FROM jsonb_array_elements(saved.fires) AS fire(value)
),
updated_at = now()
WHERE (saved.dimension_id = 'breu' OR saved.dimension_id LIKE 'arrival-%')
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(saved.fires) AS fire(value)
    WHERE fire.value->>'id' = 'arrival' AND fire.value->>'permanent' = 'true'
  );
