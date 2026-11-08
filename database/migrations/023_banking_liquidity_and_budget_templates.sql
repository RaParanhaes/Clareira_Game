-- Keep liquid currency, public budgets and bank reserves as separate balances.
-- Loans create liquid wallet money on disbursement and record an equal loan asset.
ALTER TABLE economy_money_supply_policy
  ADD COLUMN reference_circulating_supply_bronze numeric(30,0) NOT NULL DEFAULT 0
    CHECK (reference_circulating_supply_bronze >= 0);
ALTER TABLE economy_money_supply_history
  ADD COLUMN circulating_supply_bronze numeric(30,0) CHECK (circulating_supply_bronze >= 0),
  ADD COLUMN government_treasury_bronze numeric(30,0) CHECK (government_treasury_bronze >= 0),
  ADD COLUMN bank_reserve_bronze numeric(30,0) CHECK (bank_reserve_bronze >= 0),
  ADD COLUMN bank_credit_outstanding_bronze numeric(30,0) CHECK (bank_credit_outstanding_bronze >= 0);
-- Old reference values included government accounts; establish a circulating-only
-- baseline on the next market refresh without changing the current factor abruptly.
UPDATE economy_money_supply_policy SET reference_circulating_supply_bronze=0, sampled_at=NULL;

CREATE TABLE government_budget_templates (
  world_id text NOT NULL CHECK (world_id <> ''),
  government_type text NOT NULL CHECK (government_type IN ('village','kingdom','realm','castle')),
  starting_treasury_bronze numeric(30,0) NOT NULL CHECK (starting_treasury_bronze >= 0),
  starting_bank_capital_bronze numeric(30,0) NOT NULL DEFAULT 0 CHECK (starting_bank_capital_bronze >= 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (world_id,government_type,version)
);
CREATE UNIQUE INDEX government_budget_one_active_template_idx ON government_budget_templates(world_id,government_type) WHERE active;

CREATE TABLE world_banks (
  bank_id text PRIMARY KEY CHECK (bank_id <> ''),
  world_id text NOT NULL CHECK (world_id <> ''),
  government_id text NOT NULL UNIQUE REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_id,world_id)
);
CREATE TABLE bank_reserve_accounts (
  bank_id text PRIMARY KEY REFERENCES world_banks(bank_id) ON DELETE RESTRICT,
  balance_bronze numeric(30,0) NOT NULL DEFAULT 0 CHECK (balance_bronze >= 0),
  reserved_bronze numeric(30,0) NOT NULL DEFAULT 0 CHECK (reserved_bronze BETWEEN 0 AND balance_bronze),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE bank_interest_policies (
  bank_id text NOT NULL REFERENCES world_banks(bank_id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  base_rate_bps integer NOT NULL CHECK (base_rate_bps BETWEEN 0 AND 10000),
  minimum_rate_bps integer NOT NULL CHECK (minimum_rate_bps BETWEEN 0 AND 10000),
  maximum_rate_bps integer NOT NULL CHECK (maximum_rate_bps BETWEEN minimum_rate_bps AND 10000),
  reserve_target_bronze numeric(30,0) NOT NULL DEFAULT 0 CHECK (reserve_target_bronze >= 0),
  rate_sensitivity_bps integer NOT NULL DEFAULT 0 CHECK (rate_sensitivity_bps BETWEEN 0 AND 10000),
  credit_capacity_bps integer NOT NULL DEFAULT 0 CHECK (credit_capacity_bps BETWEEN 0 AND 1000000),
  smoothing_bps integer NOT NULL DEFAULT 2000 CHECK (smoothing_bps BETWEEN 0 AND 10000),
  max_daily_change_bps integer NOT NULL DEFAULT 100 CHECK (max_daily_change_bps BETWEEN 0 AND 10000),
  active boolean NOT NULL DEFAULT true,
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bank_id,version),
  CHECK (minimum_rate_bps <= base_rate_bps AND base_rate_bps <= maximum_rate_bps)
);
CREATE UNIQUE INDEX bank_interest_one_active_version_idx ON bank_interest_policies(bank_id) WHERE active;
CREATE TABLE bank_interest_quotes (
  bank_id text PRIMARY KEY REFERENCES world_banks(bank_id) ON DELETE RESTRICT,
  policy_version integer NOT NULL,
  rate_bps integer NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  reserve_balance_bronze numeric(30,0) NOT NULL CHECK (reserve_balance_bronze >= 0),
  outstanding_credit_bronze numeric(30,0) NOT NULL CHECK (outstanding_credit_bronze >= 0),
  available_credit_bronze numeric(30,0) NOT NULL CHECK (available_credit_bronze >= 0),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (bank_id,policy_version) REFERENCES bank_interest_policies(bank_id,version) ON DELETE RESTRICT
);
CREATE TABLE bank_loans (
  loan_id uuid PRIMARY KEY,
  bank_id text NOT NULL REFERENCES world_banks(bank_id) ON DELETE RESTRICT,
  borrower_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  original_principal_bronze numeric(30,0) NOT NULL CHECK (original_principal_bronze > 0),
  outstanding_principal_bronze numeric(30,0) NOT NULL CHECK (outstanding_principal_bronze BETWEEN 0 AND original_principal_bronze),
  accrued_interest_bronze numeric(30,0) NOT NULL DEFAULT 0 CHECK (accrued_interest_bronze >= 0),
  interest_rate_bps integer NOT NULL CHECK (interest_rate_bps BETWEEN 0 AND 10000),
  policy_version integer NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paid','defaulted','forgiven')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  next_due_at timestamptz NOT NULL,
  closed_at timestamptz,
  idempotency_key text NOT NULL UNIQUE CHECK (idempotency_key <> ''),
  FOREIGN KEY (bank_id,policy_version) REFERENCES bank_interest_policies(bank_id,version) ON DELETE RESTRICT
);
CREATE INDEX bank_loans_borrower_status_idx ON bank_loans(borrower_profile_id,status,next_due_at);
CREATE INDEX bank_loans_bank_status_idx ON bank_loans(bank_id,status,next_due_at);
CREATE TABLE bank_loan_events (
  event_id uuid PRIMARY KEY,
  loan_id uuid NOT NULL REFERENCES bank_loans(loan_id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('disbursement','principal_payment','interest_payment','interest_accrual','default','forgiveness')),
  amount_bronze numeric(30,0) NOT NULL CHECK (amount_bronze > 0),
  journal_transaction_id uuid REFERENCES economy_journal_transactions(transaction_id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL UNIQUE CHECK (idempotency_key <> ''),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bank_loan_events_loan_time_idx ON bank_loan_events(loan_id,occurred_at);

-- Bank reserve and receivable lines balance loan creation/repayment in the existing ledger.
ALTER TABLE economy_journal_lines ADD COLUMN bank_id text;
ALTER TABLE economy_journal_lines DROP CONSTRAINT economy_journal_lines_account_code_check;
ALTER TABLE economy_journal_lines DROP CONSTRAINT economy_journal_lines_government_account_check;
ALTER TABLE economy_journal_lines
  ADD CONSTRAINT economy_journal_lines_account_code_check
    CHECK (account_code IN ('profile','market_treasury','tax_treasury','property_treasury','government_treasury','bank_reserve','bank_loan_receivable','currency_issuance')),
  ADD CONSTRAINT economy_journal_lines_government_account_check CHECK (
    (account_code='government_treasury' AND government_id IS NOT NULL AND fund_code IS NOT NULL AND bank_id IS NULL)
    OR (account_code IN ('bank_reserve','bank_loan_receivable') AND government_id IS NULL AND fund_code IS NULL AND bank_id IS NOT NULL)
    OR (account_code NOT IN ('government_treasury','bank_reserve','bank_loan_receivable') AND government_id IS NULL AND fund_code IS NULL AND bank_id IS NULL)
  ),
  ADD CONSTRAINT economy_journal_lines_bank_fkey FOREIGN KEY (bank_id) REFERENCES world_banks(bank_id) ON DELETE RESTRICT;

CREATE TABLE government_initial_budget_issuances (
  government_id text PRIMARY KEY REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  template_world_id text NOT NULL,
  template_government_type text NOT NULL CHECK (template_government_type IN ('village','kingdom','realm','castle')),
  template_version integer NOT NULL CHECK (template_version > 0),
  treasury_amount_bronze numeric(30,0) NOT NULL CHECK (treasury_amount_bronze >= 0),
  bank_capital_bronze numeric(30,0) NOT NULL CHECK (bank_capital_bronze >= 0),
  journal_transaction_id uuid NOT NULL UNIQUE REFERENCES economy_journal_transactions(transaction_id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL UNIQUE CHECK (idempotency_key <> ''),
  issued_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (template_world_id,template_government_type,template_version)
    REFERENCES government_budget_templates(world_id,government_type,version) ON DELETE RESTRICT,
  CHECK (treasury_amount_bronze + bank_capital_bronze > 0)
);

INSERT INTO world_banks(bank_id,world_id,government_id)
VALUES ('surface:arrival:bank','surface','surface:arrival') ON CONFLICT DO NOTHING;
INSERT INTO bank_reserve_accounts(bank_id) VALUES ('surface:arrival:bank') ON CONFLICT DO NOTHING;
INSERT INTO bank_interest_policies(bank_id,version,base_rate_bps,minimum_rate_bps,maximum_rate_bps,
  reserve_target_bronze,rate_sensitivity_bps,credit_capacity_bps)
VALUES ('surface:arrival:bank',1,500,0,2500,0,0,0) ON CONFLICT DO NOTHING;
INSERT INTO bank_interest_quotes(bank_id,policy_version,rate_bps,reserve_balance_bronze,outstanding_credit_bronze,available_credit_bronze)
VALUES ('surface:arrival:bank',1,500,0,0,0) ON CONFLICT DO NOTHING;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='clareira_preview_game') THEN
    GRANT SELECT,INSERT,UPDATE ON government_budget_templates,world_banks,bank_reserve_accounts,
      government_initial_budget_issuances,bank_interest_policies,bank_interest_quotes,bank_loans,bank_loan_events TO clareira_preview_game;
    GRANT SELECT,INSERT,UPDATE ON economy_money_supply_policy,economy_money_supply_history,economy_journal_lines TO clareira_preview_game;
    REVOKE DELETE ON government_budget_templates,world_banks,bank_reserve_accounts,bank_interest_policies,
      government_initial_budget_issuances,bank_interest_quotes,bank_loans,bank_loan_events,economy_money_supply_history,economy_journal_lines FROM clareira_preview_game;
  END IF;
END $$;
