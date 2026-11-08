CREATE TABLE world_governments (
  government_id text PRIMARY KEY CHECK (government_id <> ''),
  world_id text NOT NULL CHECK (world_id <> ''),
  settlement_id text NOT NULL CHECK (settlement_id <> ''),
  government_type text NOT NULL CHECK (government_type IN ('village', 'kingdom', 'realm', 'castle')),
  leader_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'dissolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, settlement_id)
);

CREATE TABLE government_fund_accounts (
  government_id text NOT NULL REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  fund_code text NOT NULL CHECK (fund_code IN ('general', 'donations', 'materials', 'construction', 'territory', 'diplomacy')),
  balance_bronze bigint NOT NULL DEFAULT 0 CHECK (balance_bronze >= 0),
  reserved_bronze bigint NOT NULL DEFAULT 0 CHECK (reserved_bronze BETWEEN 0 AND balance_bronze),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (government_id, fund_code)
);

CREATE TABLE government_tax_policies (
  government_id text NOT NULL REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  tax_code text NOT NULL CHECK (tax_code <> ''),
  version integer NOT NULL CHECK (version > 0),
  base_rate_bps integer NOT NULL CHECK (base_rate_bps BETWEEN 0 AND 10000),
  minimum_rate_bps integer NOT NULL CHECK (minimum_rate_bps BETWEEN 0 AND 10000),
  maximum_rate_bps integer NOT NULL CHECK (maximum_rate_bps BETWEEN minimum_rate_bps AND 10000),
  treasury_target_bronze bigint NOT NULL DEFAULT 0 CHECK (treasury_target_bronze >= 0),
  treasury_sensitivity_bps integer NOT NULL DEFAULT 0 CHECK (treasury_sensitivity_bps BETWEEN 0 AND 10000),
  active boolean NOT NULL DEFAULT true,
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (government_id, tax_code, version),
  CHECK (base_rate_bps BETWEEN minimum_rate_bps AND maximum_rate_bps)
);
CREATE UNIQUE INDEX government_tax_one_active_version_idx
  ON government_tax_policies (government_id, tax_code) WHERE active = true;

CREATE TABLE government_tax_quotes (
  government_id text NOT NULL,
  tax_code text NOT NULL,
  policy_version integer NOT NULL,
  rate_bps integer NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  treasury_balance_bronze bigint NOT NULL CHECK (treasury_balance_bronze >= 0),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (government_id, tax_code),
  FOREIGN KEY (government_id, tax_code, policy_version)
    REFERENCES government_tax_policies(government_id, tax_code, version) ON DELETE RESTRICT
);

CREATE TABLE government_projects (
  project_id uuid PRIMARY KEY,
  government_id text NOT NULL REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  project_type text NOT NULL CHECK (project_type IN ('donation', 'material_purchase', 'construction', 'territory_expansion', 'diplomacy')),
  fund_code text NOT NULL CHECK (fund_code IN ('donations', 'materials', 'construction', 'territory', 'diplomacy')),
  title text NOT NULL CHECK (title <> ''),
  target_reference text,
  budget_bronze bigint NOT NULL CHECK (budget_bronze > 0),
  spent_bronze bigint NOT NULL DEFAULT 0 CHECK (spent_bronze BETWEEN 0 AND budget_bronze),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'funded', 'in_progress', 'completed', 'cancelled')),
  proposed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX government_projects_status_idx ON government_projects (government_id, status, created_at DESC);

CREATE TABLE government_territory_state (
  government_id text PRIMARY KEY REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  parent_government_id text REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  current_land_units integer NOT NULL DEFAULT 1 CHECK (current_land_units > 0),
  land_limit integer NOT NULL DEFAULT 1 CHECK (land_limit >= current_land_units),
  expansion_price_bronze bigint NOT NULL DEFAULT 0 CHECK (expansion_price_bronze >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_government_id IS NULL OR parent_government_id <> government_id)
);

CREATE TABLE territory_expansion_requests (
  request_id uuid PRIMARY KEY,
  applicant_government_id text NOT NULL REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  parent_government_id text NOT NULL REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  land_units integer NOT NULL CHECK (land_units > 0),
  price_bronze bigint NOT NULL CHECK (price_bronze > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid', 'cancelled')),
  requested_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  decided_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  journal_transaction_id uuid REFERENCES economy_journal_transactions(transaction_id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  paid_at timestamptz,
  CHECK (applicant_government_id <> parent_government_id)
);
CREATE INDEX territory_requests_government_idx
  ON territory_expansion_requests (parent_government_id, status, requested_at);

INSERT INTO world_governments (government_id, world_id, settlement_id, government_type)
VALUES ('surface:arrival', 'surface', 'arrival', 'village')
ON CONFLICT (government_id) DO NOTHING;

INSERT INTO government_fund_accounts (government_id, fund_code)
SELECT 'surface:arrival', fund_code FROM unnest(ARRAY['general','donations','materials','construction','territory','diplomacy']) AS fund_code
ON CONFLICT DO NOTHING;

INSERT INTO government_tax_policies (
  government_id, tax_code, version, base_rate_bps, minimum_rate_bps, maximum_rate_bps,
  treasury_target_bronze, treasury_sensitivity_bps
) VALUES ('surface:arrival', 'market_sale', 1, 200, 0, 500, 300000, 100)
ON CONFLICT DO NOTHING;

INSERT INTO government_tax_quotes (government_id, tax_code, policy_version, rate_bps, treasury_balance_bronze)
VALUES ('surface:arrival', 'market_sale', 1, 200, 0)
ON CONFLICT DO NOTHING;

ALTER TABLE economy_journal_lines
  ADD COLUMN government_id text,
  ADD COLUMN fund_code text;
ALTER TABLE economy_journal_lines
  DROP CONSTRAINT economy_journal_lines_account_code_check;
ALTER TABLE economy_journal_lines
  ADD CONSTRAINT economy_journal_lines_account_code_check
    CHECK (account_code IN ('profile', 'market_treasury', 'tax_treasury', 'property_treasury', 'government_treasury')),
  ADD CONSTRAINT economy_journal_lines_government_account_check
    CHECK ((account_code = 'government_treasury' AND government_id IS NOT NULL AND fund_code IS NOT NULL)
      OR (account_code <> 'government_treasury' AND government_id IS NULL AND fund_code IS NULL));
ALTER TABLE economy_journal_lines
  ADD CONSTRAINT economy_journal_lines_government_fkey
    FOREIGN KEY (government_id, fund_code) REFERENCES government_fund_accounts(government_id, fund_code) ON DELETE RESTRICT;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clareira_preview_game') THEN
    GRANT SELECT, INSERT, UPDATE ON world_governments, government_fund_accounts, government_tax_policies,
      government_tax_quotes, government_projects, government_territory_state, territory_expansion_requests TO clareira_preview_game;
    GRANT SELECT, INSERT, UPDATE ON economy_journal_lines TO clareira_preview_game;
    REVOKE DELETE ON world_governments, government_fund_accounts, government_tax_policies,
      government_tax_quotes, government_projects, government_territory_state, territory_expansion_requests,
      economy_journal_lines FROM clareira_preview_game;
  END IF;
END $$;
