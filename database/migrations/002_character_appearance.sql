ALTER TABLE appearances
  ADD COLUMN IF NOT EXISTS archetype_id text,
  ADD COLUMN IF NOT EXISTS body_shape_id text,
  ADD COLUMN IF NOT EXISTS aura_id text;

ALTER TABLE appearances DROP CONSTRAINT IF EXISTS appearances_check;
ALTER TABLE appearances DROP CONSTRAINT IF EXISTS appearances_version_check;

ALTER TABLE appearances
  ADD CONSTRAINT appearances_version_check CHECK (version IN (2, 3, 4));

ALTER TABLE appearances
  ADD CONSTRAINT appearances_check CHECK (
    (version = 2
      AND skin_id IS NOT NULL AND hair_color_id IS NOT NULL AND hair_style_id IS NOT NULL
      AND height IS NOT NULL AND muscle IS NOT NULL AND coat_id IS NOT NULL
      AND outfit_id IS NOT NULL AND held_item_id IS NOT NULL
      AND archetype_id IS NULL AND body_shape_id IS NULL AND aura_id IS NULL)
    OR (version = 3
      AND skin_id IS NULL AND hair_color_id IS NULL AND hair_style_id IS NULL
      AND height IS NULL AND muscle IS NULL AND coat_id IS NULL
      AND outfit_id IS NULL AND held_item_id IS NULL
      AND archetype_id IS NULL AND body_shape_id IS NULL AND aura_id IS NULL)
    OR (version = 4
      AND skin_id IS NULL AND hair_color_id IS NULL AND hair_style_id IS NULL
      AND height IS NULL AND muscle IS NULL AND coat_id IS NULL
      AND archetype_id IS NOT NULL AND archetype_id <> ''
      AND body_shape_id IS NOT NULL AND body_shape_id <> ''
      AND outfit_id IS NOT NULL AND outfit_id <> ''
      AND held_item_id IS NOT NULL AND held_item_id <> ''
      AND aura_id IS NOT NULL AND aura_id <> '')
  );
