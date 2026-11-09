-- Per-room chests: one chest per furniture piece in a rented or owned room.
-- Transfers between an inventory and a chest run in one transaction and are
-- recorded in item_transactions by the server store.
CREATE TABLE IF NOT EXISTS room_chests (
  id text PRIMARY KEY,
  room_key text NOT NULL,
  furniture_id text NOT NULL,
  owner_account_id text,
  capacity integer NOT NULL DEFAULT 12 CHECK (capacity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_key, furniture_id)
);

CREATE TABLE IF NOT EXISTS room_chest_slots (
  chest_id text NOT NULL REFERENCES room_chests(id) ON DELETE CASCADE,
  slot integer NOT NULL CHECK (slot >= 0),
  item_id text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (chest_id, slot)
);

-- Ledger for chest moves. action_id is unique so a repeated request cannot
-- apply the same move twice. item_transactions needs two player profiles, so
-- chest moves are recorded here instead.
CREATE TABLE IF NOT EXISTS room_chest_ledger (
  action_id text PRIMARY KEY,
  chest_id text NOT NULL REFERENCES room_chests(id) ON DELETE CASCADE,
  profile_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  item_id text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
