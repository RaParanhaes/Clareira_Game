CREATE TABLE IF NOT EXISTS resource_contract_completions (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contract_day date NOT NULL,
  contract_id text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, contract_day, contract_id),
  CHECK (contract_id <> '')
);

CREATE INDEX IF NOT EXISTS resource_contract_day_idx
  ON resource_contract_completions (contract_day, profile_id);
