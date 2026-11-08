CREATE TABLE lodging_leases (
  lease_id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  building_id text NOT NULL CHECK (building_id <> ''),
  unit_number integer NOT NULL CHECK (unit_number BETWEEN 1 AND 100),
  government_id text NOT NULL REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  rent_bronze bigint NOT NULL CHECK (rent_bronze > 0),
  period_ms bigint NOT NULL CHECK (period_ms BETWEEN 60000 AND 7776000000),
  periods_paid integer NOT NULL DEFAULT 1 CHECK (periods_paid > 0),
  next_charge_at timestamptz NOT NULL,
  auto_renew boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended','payment_failed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE UNIQUE INDEX lodging_leases_active_profile_idx ON lodging_leases(profile_id) WHERE status='active';
CREATE UNIQUE INDEX lodging_leases_active_unit_idx ON lodging_leases(building_id,unit_number) WHERE status='active';
CREATE INDEX lodging_leases_due_idx ON lodging_leases(next_charge_at) WHERE status='active';

CREATE TABLE lodging_lease_charges (
  charge_id uuid PRIMARY KEY,
  lease_id uuid NOT NULL REFERENCES lodging_leases(lease_id) ON DELETE RESTRICT,
  period_number integer NOT NULL CHECK (period_number > 0),
  due_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('paid','failed','expired')),
  rent_bronze bigint NOT NULL CHECK (rent_bronze >= 0),
  tax_bronze bigint NOT NULL CHECK (tax_bronze BETWEEN 0 AND rent_bronze),
  journal_transaction_id uuid UNIQUE REFERENCES economy_journal_transactions(transaction_id) ON DELETE RESTRICT,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lease_id,period_number),
  CHECK ((status='paid' AND rent_bronze > 0 AND journal_transaction_id IS NOT NULL)
    OR (status<>'paid' AND journal_transaction_id IS NULL))
);
CREATE INDEX lodging_lease_charges_history_idx ON lodging_lease_charges(lease_id,period_number DESC);

INSERT INTO government_tax_policies (
  government_id, tax_code, version, base_rate_bps, minimum_rate_bps, maximum_rate_bps,
  treasury_target_bronze, treasury_sensitivity_bps
) VALUES ('surface:arrival', 'lease_income', 1, 0, 0, 500, 300000, 100)
ON CONFLICT DO NOTHING;
INSERT INTO government_tax_quotes (government_id, tax_code, policy_version, rate_bps, treasury_balance_bronze)
VALUES ('surface:arrival', 'lease_income', 1, 0, 0)
ON CONFLICT DO NOTHING;

CREATE TABLE government_tax_remainders (
  government_id text NOT NULL,
  tax_code text NOT NULL,
  remainder_numerator integer NOT NULL DEFAULT 0 CHECK (remainder_numerator BETWEEN 0 AND 9999),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (government_id,tax_code),
  FOREIGN KEY (government_id,tax_code) REFERENCES government_tax_quotes(government_id,tax_code) ON DELETE RESTRICT
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clareira_preview_game') THEN
    GRANT SELECT, INSERT, UPDATE ON lodging_leases TO clareira_preview_game;
    GRANT SELECT, INSERT ON lodging_lease_charges TO clareira_preview_game;
    GRANT SELECT, INSERT, UPDATE ON government_tax_remainders TO clareira_preview_game;
    REVOKE DELETE, TRUNCATE ON lodging_leases, lodging_lease_charges, government_tax_remainders FROM clareira_preview_game;
  END IF;
END $$;
