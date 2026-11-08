CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY,
  username varchar(20) NOT NULL UNIQUE,
  password_salt bytea NOT NULL CHECK (octet_length(password_salt) = 16),
  password_hash bytea NOT NULL CHECK (octet_length(password_hash) = 64),
  scrypt_n integer NOT NULL CHECK (scrypt_n IN (16384, 32768, 65536, 131072)),
  created_at timestamptz NOT NULL,
  CHECK (username = lower(username)),
  CHECK (username ~ '^[a-z0-9_]{3,20}$')
);

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY,
  account_id uuid UNIQUE REFERENCES accounts(id) ON DELETE RESTRICT,
  display_name varchar(64) NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 16),
  is_guest boolean NOT NULL,
  created_at timestamptz NOT NULL,
  CHECK ((is_guest AND account_id IS NULL) OR (NOT is_guest AND account_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS sessions_profile_idx ON sessions (profile_id);

CREATE TABLE IF NOT EXISTS inventory_items (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 0 AND 999),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, item_id),
  CHECK (item_id <> '')
);

CREATE TABLE IF NOT EXISTS appearances (
  profile_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  version smallint NOT NULL DEFAULT 3 CHECK (version IN (2, 3)),
  body_id text NOT NULL CHECK (body_id <> ''),
  skin_id text,
  hair_color_id text,
  hair_style_id text,
  height numeric(3,2) CHECK (height BETWEEN 0.50 AND 2.50),
  muscle smallint CHECK (muscle BETWEEN 0 AND 100),
  coat_id text,
  outfit_id text,
  held_item_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (version = 2 AND skin_id IS NOT NULL AND hair_color_id IS NOT NULL AND hair_style_id IS NOT NULL
      AND height IS NOT NULL AND muscle IS NOT NULL AND coat_id IS NOT NULL AND outfit_id IS NOT NULL
      AND held_item_id IS NOT NULL)
    OR (version = 3 AND skin_id IS NULL AND hair_color_id IS NULL AND hair_style_id IS NULL
      AND height IS NULL AND muscle IS NULL AND coat_id IS NULL AND outfit_id IS NULL AND held_item_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY,
  owner_profile_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  version smallint NOT NULL DEFAULT 1 CHECK (version = 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_objects (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  object_id text NOT NULL,
  furniture_id text NOT NULL,
  x double precision NOT NULL CHECK (x BETWEEN 0 AND 64),
  y double precision NOT NULL CHECK (y BETWEEN 0 AND 64),
  rotation smallint NOT NULL CHECK (rotation BETWEEN 0 AND 3),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, object_id),
  CHECK (object_id <> ''),
  CHECK (furniture_id <> '')
);

CREATE TABLE IF NOT EXISTS worlds (
  id text PRIMARY KEY,
  seed bigint NOT NULL,
  generation_version integer NOT NULL CHECK (generation_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (id <> '')
);

CREATE TABLE IF NOT EXISTS world_chunk_changes (
  world_id text NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  dimension_id text NOT NULL,
  chunk_x integer NOT NULL,
  chunk_y integer NOT NULL,
  entity_id text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('upsert', 'delete')),
  payload jsonb,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (world_id, dimension_id, chunk_x, chunk_y, entity_id),
  CHECK (dimension_id <> ''),
  CHECK (entity_id <> ''),
  CHECK ((operation = 'upsert' AND payload IS NOT NULL) OR operation = 'delete')
);

CREATE TABLE IF NOT EXISTS item_transactions (
  transaction_id uuid PRIMARY KEY,
  from_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  to_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  item_id text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_profile_id <> to_profile_id),
  CHECK (item_id <> '')
);

CREATE INDEX IF NOT EXISTS item_transactions_from_idx ON item_transactions (from_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS item_transactions_to_idx ON item_transactions (to_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chunk_changes_dimension_idx
  ON world_chunk_changes (world_id, dimension_id, chunk_y, chunk_x);
