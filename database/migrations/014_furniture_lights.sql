-- Existing furniture remains lit by default; only lamps expose this switch.
ALTER TABLE room_objects ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
