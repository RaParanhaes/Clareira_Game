CREATE TABLE IF NOT EXISTS village_job_completions (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  job_id text NOT NULL CHECK (job_id IN ('carrier','firekeeper')),
  game_day date NOT NULL,
  amount_bronze integer NOT NULL CHECK (amount_bronze BETWEEN 1 AND 1000),
  paid_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, run_id)
);
CREATE INDEX IF NOT EXISTS village_job_completions_profile_job_day
  ON village_job_completions (profile_id, job_id, game_day);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clareira_preview_game') THEN
    GRANT SELECT, INSERT ON village_job_completions TO clareira_preview_game;
    REVOKE UPDATE, DELETE, TRUNCATE ON village_job_completions FROM clareira_preview_game;
  END IF;
END $$;
