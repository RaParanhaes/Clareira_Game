-- Currency quantities share inventory_items with ordinary objects, but their
-- balances need more than the 999-item stack limit used by game objects.
ALTER TABLE public.inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_quantity_check;

ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_quantity_check
  CHECK (quantity >= 0 AND (item_id IN ('gold', 'silver', 'bronze') OR quantity <= 999));

-- Remove the artificial 999,999-per-operation and 9,999,999-total wallet caps.
-- The technical ceiling is the largest normalized balance representable by
-- the existing INTEGER currency rows (gold INTEGER max, plus 999 silver/bronze).
CREATE OR REPLACE FUNCTION public.staff_adjust_wallet_from_session(
  p_session_hash bytea,
  p_target_account_id uuid,
  p_delta bigint,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid;
  actor_level smallint;
  target_level smallint;
  target_profile_id uuid;
  is_owner boolean;
  current_total bigint;
  next_total bigint;
  next_gold integer;
  next_silver integer;
  next_bronze integer;
  wallet jsonb;
BEGIN
  actor_id := public.staff_session_account_id(p_session_hash);
  IF actor_id IS NULL OR p_target_account_id IS NULL OR p_delta IS NULL OR p_delta = 0
     OR p_delta < -21474836479999 OR p_delta > 21474836479999
     OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500
     OR NOT public.staff_actor_has_permission(actor_id, 'economy.adjust', 'global') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Permissão ou dados do ajuste inválidos.';
  END IF;

  is_owner := public.staff_actor_has_permission(actor_id, '*', 'global');
  actor_level := public.staff_actor_highest_level(actor_id, 'global');
  target_level := public.staff_actor_highest_level(p_target_account_id, 'global');
  IF NOT is_owner AND (actor_id = p_target_account_id OR (target_level IS NOT NULL
      AND (actor_level IS NULL OR actor_level <= target_level))) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Não é possível alterar a bolsa desta conta.';
  END IF;

  SELECT profile.id INTO target_profile_id
    FROM public.profiles profile
   WHERE profile.account_id = p_target_account_id AND NOT profile.is_guest
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Conta de destino não encontrada.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lodging-profile'), hashtext(target_profile_id::text));
  SELECT COALESCE(sum(item.quantity::bigint * CASE item.item_id
      WHEN 'gold' THEN 10000 WHEN 'silver' THEN 100 ELSE 1 END), 0)
    INTO current_total
    FROM public.inventory_items item
   WHERE item.profile_id = target_profile_id AND item.item_id IN ('gold','silver','bronze');
  next_total := current_total + p_delta;
  IF next_total < 0 THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'O saldo não pode ficar negativo.'; END IF;
  IF next_total > 21474836479999 THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A carteira atingiu a capacidade técnica do armazenamento.'; END IF;

  next_gold := floor(next_total / 10000.0)::integer;
  next_silver := floor((next_total - next_gold::bigint * 10000) / 100.0)::integer;
  next_bronze := (next_total - next_gold::bigint * 10000 - next_silver::bigint * 100)::integer;
  INSERT INTO public.inventory_items (profile_id, item_id, quantity)
  VALUES (target_profile_id, 'gold', next_gold), (target_profile_id, 'silver', next_silver), (target_profile_id, 'bronze', next_bronze)
  ON CONFLICT (profile_id, item_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now();
  wallet := jsonb_build_object('gold', next_gold, 'silver', next_silver, 'bronze', next_bronze,
    'total', next_total, 'delta', p_delta);

  INSERT INTO public.staff_audit_events (actor_account_id, target_account_id, action, scope_key, reason, details)
  VALUES (actor_id, p_target_account_id, 'player.wallet.adjusted', 'global', btrim(p_reason),
    jsonb_build_object('delta', p_delta, 'previous_total', current_total, 'new_total', next_total, 'wallet', wallet));
  RETURN wallet;
END
$$;

REVOKE ALL ON FUNCTION public.staff_adjust_wallet_from_session(bytea, uuid, bigint, text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clareira_preview_game') THEN
    GRANT EXECUTE ON FUNCTION public.staff_adjust_wallet_from_session(bytea, uuid, bigint, text) TO clareira_preview_game;
  END IF;
END $$;
