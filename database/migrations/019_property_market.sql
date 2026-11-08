CREATE TABLE property_market_listings (
  building_id text NOT NULL CHECK (building_id <> ''),
  unit_number integer NOT NULL CHECK (unit_number BETWEEN 1 AND 100),
  seller_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  government_id text NOT NULL REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  asking_price_bronze bigint NOT NULL CHECK (asking_price_bronze > 0),
  listed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (building_id, unit_number)
);
CREATE INDEX property_market_listings_seller_idx ON property_market_listings(seller_profile_id);

CREATE TABLE property_transfer_records (
  transfer_id uuid PRIMARY KEY,
  building_id text NOT NULL,
  unit_number integer NOT NULL,
  seller_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  buyer_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  government_id text NOT NULL REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  gross_price_bronze bigint NOT NULL CHECK (gross_price_bronze > 0),
  tax_bronze bigint NOT NULL CHECK (tax_bronze >= 0 AND tax_bronze <= gross_price_bronze),
  journal_transaction_id uuid NOT NULL UNIQUE REFERENCES economy_journal_transactions(transaction_id) ON DELETE RESTRICT,
  transferred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (seller_profile_id <> buyer_profile_id)
);
CREATE INDEX property_transfer_records_property_idx ON property_transfer_records(building_id, unit_number, transferred_at DESC);

INSERT INTO government_tax_policies (
  government_id, tax_code, version, base_rate_bps, minimum_rate_bps, maximum_rate_bps,
  treasury_target_bronze, treasury_sensitivity_bps
) VALUES ('surface:arrival', 'property_transfer', 1, 200, 0, 500, 300000, 100)
ON CONFLICT DO NOTHING;

INSERT INTO government_tax_quotes (government_id, tax_code, policy_version, rate_bps, treasury_balance_bronze)
VALUES ('surface:arrival', 'property_transfer', 1, 200, 0)
ON CONFLICT DO NOTHING;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clareira_preview_game') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON property_market_listings TO clareira_preview_game;
    GRANT SELECT, INSERT ON property_transfer_records TO clareira_preview_game;
    REVOKE UPDATE, DELETE, TRUNCATE ON property_transfer_records FROM clareira_preview_game;
    REVOKE TRUNCATE ON property_market_listings FROM clareira_preview_game;
  END IF;
END $$;
