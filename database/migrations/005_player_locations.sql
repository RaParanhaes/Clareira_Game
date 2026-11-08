CREATE TABLE IF NOT EXISTS player_locations (
  profile_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  location text NOT NULL CHECK (location IN ('clearing', 'room')),
  x double precision NOT NULL CHECK (x BETWEEN -100000 AND 100000),
  y double precision NOT NULL CHECK (y BETWEEN -100000 AND 100000),
  room_key text NOT NULL DEFAULT '',
  room_owner_name varchar(64) NOT NULL DEFAULT '',
  color smallint NOT NULL DEFAULT 0 CHECK (color BETWEEN 0 AND 3),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(room_key) <= 128)
);
