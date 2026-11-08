CREATE TABLE economy_goods (
  item_id text NOT NULL CHECK (item_id <> ''),
  region_id text NOT NULL DEFAULT 'global' CHECK (region_id <> ''),
  base_price_bronze bigint NOT NULL CHECK (base_price_bronze > 0),
  target_stock bigint NOT NULL DEFAULT 100 CHECK (target_stock > 0),
  expected_daily_sales bigint NOT NULL DEFAULT 10 CHECK (expected_daily_sales > 0),
  recipe jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(recipe) = 'object'),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, region_id)
);

CREATE TABLE economy_quotes (
  item_id text NOT NULL,
  region_id text NOT NULL,
  buy_price_bronze bigint NOT NULL CHECK (buy_price_bronze > 0),
  sell_price_bronze bigint NOT NULL CHECK (sell_price_bronze > 0),
  demand_ratio numeric(6,3) NOT NULL CHECK (demand_ratio BETWEEN 0 AND 10),
  stock_ratio numeric(6,3) NOT NULL CHECK (stock_ratio BETWEEN 0 AND 10),
  input_cost_bronze bigint NOT NULL DEFAULT 0 CHECK (input_cost_bronze >= 0),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, region_id),
  FOREIGN KEY (item_id, region_id) REFERENCES economy_goods(item_id, region_id) ON DELETE CASCADE,
  CHECK (buy_price_bronze <= sell_price_bronze)
);

CREATE TABLE economy_daily_flows (
  item_id text NOT NULL,
  region_id text NOT NULL,
  flow_day date NOT NULL,
  units_sold_to_npc bigint NOT NULL DEFAULT 0 CHECK (units_sold_to_npc >= 0),
  gross_bronze bigint NOT NULL DEFAULT 0 CHECK (gross_bronze >= 0),
  units_bought_from_npc bigint NOT NULL DEFAULT 0 CHECK (units_bought_from_npc >= 0),
  PRIMARY KEY (item_id, region_id, flow_day),
  FOREIGN KEY (item_id, region_id) REFERENCES economy_goods(item_id, region_id) ON DELETE CASCADE
);

CREATE INDEX economy_daily_flows_window_idx
  ON economy_daily_flows (region_id, flow_day DESC, item_id);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clareira_preview_game') THEN
    GRANT SELECT, INSERT, UPDATE ON economy_goods, economy_quotes, economy_daily_flows TO clareira_preview_game;
    GRANT DELETE ON economy_goods, economy_quotes TO clareira_preview_game;
    REVOKE DELETE ON economy_daily_flows FROM clareira_preview_game;
  END IF;
END $$;
