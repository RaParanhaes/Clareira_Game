-- Public money is moved only between the same government's existing funds.
-- No treasury action in this migration creates bronze or pays a player.
CREATE TABLE government_fund_transfers (
  request_id uuid PRIMARY KEY,
  government_id text NOT NULL REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  from_fund text NOT NULL,
  to_fund text NOT NULL,
  amount_bronze bigint NOT NULL CHECK (amount_bronze > 0),
  actor_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  journal_transaction_id uuid NOT NULL UNIQUE REFERENCES economy_journal_transactions(transaction_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (government_id,from_fund) REFERENCES government_fund_accounts(government_id,fund_code) ON DELETE RESTRICT,
  FOREIGN KEY (government_id,to_fund) REFERENCES government_fund_accounts(government_id,fund_code) ON DELETE RESTRICT,
  CHECK (from_fund <> to_fund)
);
CREATE INDEX government_fund_transfers_gov_time ON government_fund_transfers(government_id,created_at DESC);

CREATE TABLE government_project_events (
  event_id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES government_projects(project_id) ON DELETE RESTRICT,
  government_id text NOT NULL REFERENCES world_governments(government_id) ON DELETE RESTRICT,
  actor_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('proposed','funded','cancelled')),
  detail text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX government_project_events_gov_time ON government_project_events(government_id,occurred_at DESC);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='clareira_preview_game') THEN
    GRANT SELECT,INSERT ON government_fund_transfers,government_project_events TO clareira_preview_game;
    GRANT SELECT ON government_projects TO clareira_preview_game;
    REVOKE UPDATE,DELETE ON government_fund_transfers,government_project_events FROM clareira_preview_game;
  END IF;
END $$;
