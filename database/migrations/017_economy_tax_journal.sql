CREATE TABLE economy_tax_rules (
  tax_code text NOT NULL CHECK (tax_code <> ''),
  version integer NOT NULL CHECK (version > 0),
  rate_basis_points integer NOT NULL CHECK (rate_basis_points BETWEEN 0 AND 10000),
  active boolean NOT NULL DEFAULT true,
  effective_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tax_code, version)
);

CREATE UNIQUE INDEX economy_tax_one_active_version_idx ON economy_tax_rules (tax_code) WHERE active = true;

INSERT INTO economy_tax_rules (tax_code, version, rate_basis_points) VALUES
  ('market_sale', 1, 200),
  ('property_transfer', 1, 200),
  ('lease_income', 1, 0)
ON CONFLICT (tax_code, version) DO NOTHING;

CREATE TABLE economy_journal_transactions (
  transaction_id uuid PRIMARY KEY,
  event_type text NOT NULL CHECK (event_type <> ''),
  actor_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  idempotency_key text UNIQUE,
  reference_id text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE economy_journal_lines (
  transaction_id uuid NOT NULL REFERENCES economy_journal_transactions(transaction_id) ON DELETE RESTRICT,
  line_number smallint NOT NULL CHECK (line_number > 0),
  account_code text NOT NULL CHECK (account_code IN ('profile', 'market_treasury', 'tax_treasury', 'property_treasury')),
  profile_id uuid REFERENCES profiles(id) ON DELETE RESTRICT,
  amount_bronze bigint NOT NULL CHECK (amount_bronze <> 0),
  PRIMARY KEY (transaction_id, line_number),
  CHECK ((account_code = 'profile' AND profile_id IS NOT NULL)
    OR (account_code <> 'profile' AND profile_id IS NULL))
);

CREATE INDEX economy_journal_actor_time_idx
  ON economy_journal_transactions (actor_profile_id, occurred_at DESC);
CREATE INDEX economy_journal_reference_idx
  ON economy_journal_transactions (reference_id) WHERE reference_id IS NOT NULL;

CREATE FUNCTION economy_assert_balanced_journal() RETURNS trigger AS $$
DECLARE
  checked_transaction uuid;
  balance numeric;
BEGIN
  checked_transaction := COALESCE(NEW.transaction_id, OLD.transaction_id);
  SELECT COALESCE(sum(amount_bronze), 0) INTO balance
    FROM economy_journal_lines WHERE transaction_id = checked_transaction;
  IF balance <> 0 THEN
    RAISE EXCEPTION 'Unbalanced economy journal transaction %: % bronzes', checked_transaction, balance;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER economy_journal_balanced
  AFTER INSERT OR UPDATE OR DELETE ON economy_journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION economy_assert_balanced_journal();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clareira_preview_game') THEN
    GRANT SELECT, INSERT ON economy_journal_transactions, economy_journal_lines TO clareira_preview_game;
    GRANT SELECT ON economy_tax_rules TO clareira_preview_game;
    REVOKE UPDATE, DELETE ON economy_tax_rules, economy_journal_transactions, economy_journal_lines FROM clareira_preview_game;
  END IF;
END $$;
