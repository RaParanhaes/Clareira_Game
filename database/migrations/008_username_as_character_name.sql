ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_display_name_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_display_name_check
  CHECK (char_length(display_name) BETWEEN 2 AND 20);

UPDATE profiles AS p
SET display_name = a.username
FROM accounts AS a
WHERE p.account_id = a.id;
