ALTER TABLE economy_quotes
  ADD COLUMN money_supply_factor numeric(8,6) NOT NULL DEFAULT 1
  CHECK (money_supply_factor BETWEEN 0.5 AND 2);

-- Reference is learned from the first sample; later samples move prices slowly.
CREATE TABLE economy_money_supply_policy (
  region_id text PRIMARY KEY CHECK (region_id <> ''),
  reference_supply_bronze numeric(30,0) NOT NULL DEFAULT 0 CHECK (reference_supply_bronze >= 0),
  price_factor numeric(8,6) NOT NULL DEFAULT 1 CHECK (price_factor BETWEEN 0.5 AND 2),
  sensitivity numeric(5,4) NOT NULL DEFAULT 0.25 CHECK (sensitivity BETWEEN 0 AND 1),
  minimum_factor numeric(8,6) NOT NULL DEFAULT 0.75 CHECK (minimum_factor BETWEEN 0.5 AND 2),
  maximum_factor numeric(8,6) NOT NULL DEFAULT 1.50 CHECK (maximum_factor BETWEEN minimum_factor AND 2),
  smoothing numeric(5,4) NOT NULL DEFAULT 0.20 CHECK (smoothing BETWEEN 0 AND 1),
  max_daily_change numeric(5,4) NOT NULL DEFAULT 0.10 CHECK (max_daily_change BETWEEN 0 AND 1),
  sampled_at timestamptz
);

CREATE TABLE economy_money_supply_history (
  region_id text NOT NULL REFERENCES economy_money_supply_policy(region_id) ON DELETE RESTRICT,
  sample_day date NOT NULL,
  supply_bronze numeric(30,0) NOT NULL CHECK (supply_bronze >= 0),
  reference_supply_bronze numeric(30,0) NOT NULL CHECK (reference_supply_bronze > 0),
  target_factor numeric(8,6) NOT NULL CHECK (target_factor BETWEEN 0.5 AND 2),
  effective_factor numeric(8,6) NOT NULL CHECK (effective_factor BETWEEN 0.5 AND 2),
  sampled_at timestamptz NOT NULL,
  PRIMARY KEY (region_id, sample_day)
);

INSERT INTO economy_money_supply_policy (region_id) VALUES ('global') ON CONFLICT DO NOTHING;
-- Force an initial calculated quote so the first market refresh establishes the baseline.
UPDATE economy_quotes SET calculated_at = 'epoch'::timestamptz;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clareira_preview_game') THEN
    GRANT SELECT, INSERT, UPDATE ON economy_quotes, economy_money_supply_policy, economy_money_supply_history TO clareira_preview_game;
    REVOKE DELETE ON economy_money_supply_policy, economy_money_supply_history FROM clareira_preview_game;
  END IF;
END $$;
