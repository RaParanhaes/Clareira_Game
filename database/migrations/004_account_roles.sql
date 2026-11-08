ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'player';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'accounts_role_check' AND conrelid = 'accounts'::regclass
  ) THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_role_check CHECK (role IN ('player', 'admin'));
  END IF;
END
$$;
