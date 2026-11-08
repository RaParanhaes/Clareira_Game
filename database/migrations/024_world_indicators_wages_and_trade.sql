-- Versioned minimum pay, cross-border trade and auditable production facts.
-- Indicator snapshots are derived summaries; event tables remain the source of truth.
CREATE TABLE government_minimum_wage_policies (
  government_id text NOT NULL REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  minimum_wage_bronze_per_shift numeric(30,0) NOT NULL CHECK (minimum_wage_bronze_per_shift >= 0),
  effective_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (government_id,version)
);
CREATE UNIQUE INDEX government_minimum_wage_one_active_idx
  ON government_minimum_wage_policies(government_id) WHERE active;

CREATE TABLE government_wage_payments (
  payment_id uuid PRIMARY KEY,
  government_id text NOT NULL REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  wage_policy_version integer NOT NULL,
  worker_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  employer_kind text NOT NULL CHECK (employer_kind IN ('player','government','business','public_project')),
  employer_reference text NOT NULL CHECK (employer_reference <> ''),
  completed_shifts integer NOT NULL CHECK (completed_shifts > 0),
  minimum_wage_bronze_per_shift numeric(30,0) NOT NULL CHECK (minimum_wage_bronze_per_shift >= 0),
  gross_wage_bronze numeric(30,0) NOT NULL CHECK (gross_wage_bronze >= 0),
  income_tax_bronze numeric(30,0) NOT NULL DEFAULT 0 CHECK (income_tax_bronze BETWEEN 0 AND gross_wage_bronze),
  net_wage_bronze numeric(30,0) NOT NULL CHECK (net_wage_bronze >= 0),
  journal_transaction_id uuid NOT NULL UNIQUE REFERENCES economy_journal_transactions(transaction_id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL UNIQUE CHECK (idempotency_key <> ''),
  paid_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (government_id,wage_policy_version)
    REFERENCES government_minimum_wage_policies(government_id,version) ON DELETE RESTRICT,
  CHECK (gross_wage_bronze >= minimum_wage_bronze_per_shift * completed_shifts),
  CHECK (gross_wage_bronze = income_tax_bronze + net_wage_bronze)
);
CREATE INDEX government_wages_worker_period_idx ON government_wage_payments(worker_profile_id,paid_at DESC);
CREATE INDEX government_wages_employer_period_idx ON government_wage_payments(government_id,employer_kind,paid_at DESC);

CREATE TABLE economic_production_events (
  event_id uuid PRIMARY KEY,
  government_id text NOT NULL REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  producer_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  production_kind text NOT NULL CHECK (production_kind IN ('goods','service','public_service')),
  output_item_id text NOT NULL CHECK (output_item_id <> ''),
  output_quantity numeric(30,3) NOT NULL CHECK (output_quantity > 0),
  output_value_bronze numeric(30,0) NOT NULL CHECK (output_value_bronze >= 0),
  intermediate_input_cost_bronze numeric(30,0) NOT NULL CHECK (intermediate_input_cost_bronze >= 0),
  value_added_bronze numeric(30,0) GENERATED ALWAYS AS (output_value_bronze-intermediate_input_cost_bronze) STORED,
  source_reference text,
  idempotency_key text NOT NULL UNIQUE CHECK (idempotency_key <> ''),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (intermediate_input_cost_bronze <= output_value_bronze)
);
CREATE INDEX economic_production_government_period_idx ON economic_production_events(government_id,occurred_at DESC);

CREATE TABLE government_trade_tariff_policies (
  government_id text NOT NULL REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  direction text NOT NULL CHECK (direction IN ('import','export')),
  version integer NOT NULL CHECK (version > 0),
  base_rate_bps integer NOT NULL CHECK (base_rate_bps BETWEEN 0 AND 10000),
  minimum_rate_bps integer NOT NULL CHECK (minimum_rate_bps BETWEEN 0 AND 10000),
  maximum_rate_bps integer NOT NULL CHECK (maximum_rate_bps BETWEEN minimum_rate_bps AND 10000),
  effective_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (government_id,direction,version),
  CHECK (minimum_rate_bps <= base_rate_bps AND base_rate_bps <= maximum_rate_bps)
);
CREATE UNIQUE INDEX government_trade_tariff_one_active_idx
  ON government_trade_tariff_policies(government_id,direction) WHERE active;

CREATE TABLE intergovernmental_trade_records (
  trade_id uuid PRIMARY KEY,
  exporter_government_id text NOT NULL REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  importer_government_id text NOT NULL REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  exporter_tariff_direction text NOT NULL DEFAULT 'export' CHECK (exporter_tariff_direction='export'),
  exporter_tariff_version integer NOT NULL,
  importer_tariff_direction text NOT NULL DEFAULT 'import' CHECK (importer_tariff_direction='import'),
  importer_tariff_version integer NOT NULL,
  item_id text NOT NULL CHECK (item_id <> ''),
  quantity numeric(30,3) NOT NULL CHECK (quantity > 0),
  unit_price_bronze numeric(30,0) NOT NULL CHECK (unit_price_bronze > 0),
  gross_value_bronze numeric(30,0) GENERATED ALWAYS AS (round(quantity*unit_price_bronze)) STORED,
  export_duty_bps integer NOT NULL CHECK (export_duty_bps BETWEEN 0 AND 10000),
  import_duty_bps integer NOT NULL CHECK (import_duty_bps BETWEEN 0 AND 10000),
  export_duty_bronze numeric(30,0) NOT NULL DEFAULT 0 CHECK (export_duty_bronze >= 0),
  import_duty_bronze numeric(30,0) NOT NULL DEFAULT 0 CHECK (import_duty_bronze >= 0),
  freight_bronze numeric(30,0) NOT NULL DEFAULT 0 CHECK (freight_bronze >= 0),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','in_transit','delivered','settled','rejected','cancelled')),
  journal_transaction_id uuid UNIQUE REFERENCES economy_journal_transactions(transaction_id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL UNIQUE CHECK (idempotency_key <> ''),
  proposed_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  FOREIGN KEY (exporter_government_id,exporter_tariff_direction,exporter_tariff_version)
    REFERENCES government_trade_tariff_policies(government_id,direction,version) ON DELETE RESTRICT,
  FOREIGN KEY (importer_government_id,importer_tariff_direction,importer_tariff_version)
    REFERENCES government_trade_tariff_policies(government_id,direction,version) ON DELETE RESTRICT,
  CHECK (exporter_government_id <> importer_government_id),
  CHECK (export_duty_bronze <= gross_value_bronze AND import_duty_bronze <= gross_value_bronze)
);
CREATE INDEX intergovernmental_trade_exporter_status_idx ON intergovernmental_trade_records(exporter_government_id,status,proposed_at DESC);
CREATE INDEX intergovernmental_trade_importer_status_idx ON intergovernmental_trade_records(importer_government_id,status,proposed_at DESC);

CREATE TABLE economy_indicator_snapshots (
  scope_kind text NOT NULL CHECK (scope_kind IN ('global','world','government')),
  scope_id text NOT NULL CHECK (scope_id <> ''),
  period_month date NOT NULL CHECK (extract(day FROM period_month)=1),
  gdp_value_added_bronze numeric(30,0) NOT NULL DEFAULT 0 CHECK (gdp_value_added_bronze >= 0),
  wages_paid_bronze numeric(30,0) NOT NULL DEFAULT 0 CHECK (wages_paid_bronze >= 0),
  exports_bronze numeric(30,0) NOT NULL DEFAULT 0 CHECK (exports_bronze >= 0),
  imports_bronze numeric(30,0) NOT NULL DEFAULT 0 CHECK (imports_bronze >= 0),
  trade_balance_bronze numeric(31,0) GENERATED ALWAYS AS (exports_bronze-imports_bronze) STORED,
  taxes_collected_bronze numeric(30,0) NOT NULL DEFAULT 0 CHECK (taxes_collected_bronze >= 0),
  public_spending_bronze numeric(30,0) NOT NULL DEFAULT 0 CHECK (public_spending_bronze >= 0),
  circulating_supply_bronze numeric(30,0) CHECK (circulating_supply_bronze >= 0),
  treasury_bronze numeric(30,0) NOT NULL DEFAULT 0 CHECK (treasury_bronze >= 0),
  bank_reserve_bronze numeric(30,0) NOT NULL DEFAULT 0 CHECK (bank_reserve_bronze >= 0),
  credit_outstanding_bronze numeric(30,0) NOT NULL DEFAULT 0 CHECK (credit_outstanding_bronze >= 0),
  minimum_wage_bronze_per_shift numeric(30,0) CHECK (minimum_wage_bronze_per_shift >= 0),
  bank_lending_rate_bps integer CHECK (bank_lending_rate_bps BETWEEN 0 AND 10000),
  circulation_source text NOT NULL DEFAULT 'unattributed' CHECK (circulation_source IN ('wallet_aggregate','world_attribution','unattributed')),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_kind,scope_id,period_month),
  CHECK ((scope_kind='global' AND scope_id='global') OR scope_kind<>'global'),
  CHECK (circulating_supply_bronze IS NOT NULL OR circulation_source='unattributed')
);
CREATE INDEX economy_indicator_scope_period_idx ON economy_indicator_snapshots(scope_kind,scope_id,period_month DESC);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='clareira_preview_game') THEN
    GRANT SELECT,INSERT,UPDATE ON government_minimum_wage_policies,government_wage_payments,
      economic_production_events,government_trade_tariff_policies,intergovernmental_trade_records,
      economy_indicator_snapshots TO clareira_preview_game;
    REVOKE DELETE ON government_minimum_wage_policies,government_wage_payments,economic_production_events,
      government_trade_tariff_policies,intergovernmental_trade_records,economy_indicator_snapshots FROM clareira_preview_game;
  END IF;
END $$;
