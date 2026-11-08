CREATE TABLE economy_market_stock (
  market_id text NOT NULL CHECK (market_id <> ''),
  item_id text NOT NULL,
  region_id text NOT NULL DEFAULT 'global',
  quantity bigint NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved bigint NOT NULL DEFAULT 0 CHECK (reserved BETWEEN 0 AND quantity),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (market_id, item_id, region_id),
  FOREIGN KEY (item_id, region_id) REFERENCES economy_goods(item_id, region_id) ON DELETE CASCADE
);

CREATE INDEX economy_market_stock_region_item_idx
  ON economy_market_stock (region_id, item_id, market_id);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clareira_preview_game') THEN
    GRANT SELECT, INSERT, UPDATE ON economy_market_stock TO clareira_preview_game;
    REVOKE DELETE ON economy_market_stock FROM clareira_preview_game;
  END IF;
END $$;
