-- Staff changes are exposed as narrow transactional functions. The game
-- runtime can execute them, but cannot edit role or audit tables directly.

CREATE OR REPLACE FUNCTION public.staff_session_account_id(p_session_hash bytea)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT profile.account_id
    FROM public.sessions session
    JOIN public.profiles profile ON profile.id = session.profile_id
   WHERE session.token_hash = p_session_hash
     AND session.expires_at > statement_timestamp()
     AND profile.account_id IS NOT NULL
     AND NOT profile.is_guest
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.staff_actor_has_permission(
  p_account_id uuid,
  p_permission_key text,
  p_scope_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH RECURSIVE role_chain(assignment_id, role_key) AS (
    SELECT assignment.assignment_id, assignment.role_key
      FROM public.account_role_assignments assignment
      JOIN public.staff_roles role
        ON role.role_key = assignment.role_key AND role.active
     WHERE assignment.account_id = p_account_id
       AND assignment.revoked_at IS NULL
       AND (assignment.expires_at IS NULL OR assignment.expires_at > statement_timestamp())
       AND (assignment.scope_key = 'global' OR assignment.scope_key = p_scope_key)
    UNION
    SELECT chain.assignment_id, inheritance.inherits_role_key
      FROM role_chain chain
      JOIN public.staff_role_inheritance inheritance ON inheritance.role_key = chain.role_key
      JOIN public.staff_roles role
        ON role.role_key = inheritance.inherits_role_key AND role.active
  )
  SELECT EXISTS (
    SELECT 1
      FROM role_chain chain
      JOIN public.staff_role_permissions role_permission ON role_permission.role_key = chain.role_key
     WHERE role_permission.permission_key IN (p_permission_key, '*')
  )
$$;

CREATE OR REPLACE FUNCTION public.staff_actor_highest_level(
  p_account_id uuid,
  p_scope_key text
)
RETURNS smallint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH RECURSIVE role_chain(assignment_id, role_key) AS (
    SELECT assignment.assignment_id, assignment.role_key
      FROM public.account_role_assignments assignment
      JOIN public.staff_roles role
        ON role.role_key = assignment.role_key AND role.active
     WHERE assignment.account_id = p_account_id
       AND assignment.revoked_at IS NULL
       AND (assignment.expires_at IS NULL OR assignment.expires_at > statement_timestamp())
       AND (assignment.scope_key = 'global' OR assignment.scope_key = p_scope_key)
    UNION
    SELECT chain.assignment_id, inheritance.inherits_role_key
      FROM role_chain chain
      JOIN public.staff_role_inheritance inheritance ON inheritance.role_key = chain.role_key
      JOIN public.staff_roles role
        ON role.role_key = inheritance.inherits_role_key AND role.active
  )
  SELECT max(role.hierarchy_level)::smallint
    FROM role_chain chain
    JOIN public.staff_roles role ON role.role_key = chain.role_key
$$;

CREATE OR REPLACE FUNCTION public.staff_create_role_from_session(
  p_session_hash bytea,
  p_role_key text,
  p_display_name text,
  p_hierarchy_level smallint,
  p_reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid;
  actor_level smallint;
  is_owner boolean;
BEGIN
  actor_id := public.staff_session_account_id(p_session_hash);
  IF actor_id IS NULL OR NOT public.staff_actor_has_permission(actor_id, 'roles.manage', 'global') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Permissão insuficiente.';
  END IF;
  IF p_role_key IS NULL OR p_role_key !~ '^[a-z][a-z0-9_]{1,47}$'
     OR p_display_name IS NULL OR char_length(btrim(p_display_name)) NOT BETWEEN 2 AND 64
     OR p_hierarchy_level IS NULL OR p_hierarchy_level NOT BETWEEN 0 AND 5
     OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Dados do cargo inválidos.';
  END IF;
  is_owner := public.staff_actor_has_permission(actor_id, '*', 'global');
  actor_level := public.staff_actor_highest_level(actor_id, 'global');
  IF NOT is_owner AND (actor_level IS NULL OR p_hierarchy_level >= actor_level) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Não é possível criar um cargo no mesmo nível ou acima do seu.';
  END IF;

  INSERT INTO public.staff_roles (role_key, display_name, role_kind, hierarchy_level, is_staff)
  VALUES (p_role_key, btrim(p_display_name), 'staff', p_hierarchy_level, true);
  INSERT INTO public.staff_audit_events (actor_account_id, action, scope_key, reason, details)
  VALUES (actor_id, 'role.created', 'global', btrim(p_reason),
    jsonb_build_object('role_key', p_role_key, 'display_name', btrim(p_display_name),
      'hierarchy_level', p_hierarchy_level));
  RETURN p_role_key;
END
$$;

CREATE OR REPLACE FUNCTION public.staff_assign_role_from_session(
  p_session_hash bytea,
  p_target_account_id uuid,
  p_role_key text,
  p_scope_key text,
  p_reason text,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid;
  actor_level smallint;
  target_level smallint;
  is_owner boolean;
  new_assignment_id bigint;
BEGIN
  actor_id := public.staff_session_account_id(p_session_hash);
  IF actor_id IS NULL OR p_scope_key IS NULL OR char_length(btrim(p_scope_key)) NOT BETWEEN 1 AND 160
     OR NOT public.staff_actor_has_permission(actor_id, 'roles.manage', p_scope_key) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Permissão insuficiente.';
  END IF;
  IF p_target_account_id IS NULL OR p_role_key IS NULL
     OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500
     OR (p_expires_at IS NOT NULL AND p_expires_at <= statement_timestamp()) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Dados da atribuição inválidos.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_target_account_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Conta de destino não encontrada.';
  END IF;
  SELECT hierarchy_level INTO target_level
    FROM public.staff_roles WHERE role_key = p_role_key AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Cargo não encontrado ou inativo.';
  END IF;
  is_owner := public.staff_actor_has_permission(actor_id, '*', 'global');
  actor_level := public.staff_actor_highest_level(actor_id, p_scope_key);
  IF NOT is_owner AND (target_level IS NULL OR actor_level IS NULL OR target_level >= actor_level) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Não é possível atribuir um cargo no mesmo nível ou acima do seu.';
  END IF;

  INSERT INTO public.account_role_assignments
    (account_id, role_key, scope_key, assigned_by_account_id, reason, expires_at)
  VALUES (p_target_account_id, p_role_key, btrim(p_scope_key), actor_id, btrim(p_reason), p_expires_at)
  RETURNING assignment_id INTO new_assignment_id;
  INSERT INTO public.staff_audit_events
    (actor_account_id, target_account_id, action, scope_key, reason, details)
  VALUES (actor_id, p_target_account_id, 'role.assignment.granted', btrim(p_scope_key), btrim(p_reason),
    jsonb_build_object('assignment_id', new_assignment_id, 'role_key', p_role_key,
      'expires_at', p_expires_at));
  RETURN new_assignment_id;
END
$$;

CREATE OR REPLACE FUNCTION public.staff_revoke_role_from_session(
  p_session_hash bytea,
  p_assignment_id bigint,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid;
  actor_level smallint;
  target_level smallint;
  assignment_row public.account_role_assignments%ROWTYPE;
  is_owner boolean;
BEGIN
  actor_id := public.staff_session_account_id(p_session_hash);
  IF actor_id IS NULL OR p_assignment_id IS NULL
     OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Permissão insuficiente.';
  END IF;
  SELECT * INTO assignment_row
    FROM public.account_role_assignments
   WHERE assignment_id = p_assignment_id AND revoked_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT public.staff_actor_has_permission(actor_id, 'roles.manage', assignment_row.scope_key) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Permissão insuficiente.';
  END IF;
  SELECT hierarchy_level INTO target_level FROM public.staff_roles WHERE role_key = assignment_row.role_key;
  is_owner := public.staff_actor_has_permission(actor_id, '*', 'global');
  actor_level := public.staff_actor_highest_level(actor_id, assignment_row.scope_key);
  IF NOT is_owner AND (target_level IS NULL OR actor_level IS NULL OR target_level >= actor_level) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Não é possível revogar um cargo no mesmo nível ou acima do seu.';
  END IF;

  UPDATE public.account_role_assignments SET revoked_at = statement_timestamp()
   WHERE assignment_id = p_assignment_id;
  INSERT INTO public.staff_audit_events
    (actor_account_id, target_account_id, action, scope_key, reason, details)
  VALUES (actor_id, assignment_row.account_id, 'role.assignment.revoked', assignment_row.scope_key, btrim(p_reason),
    jsonb_build_object('assignment_id', assignment_row.assignment_id, 'role_key', assignment_row.role_key));
  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION public.staff_set_role_permission_from_session(
  p_session_hash bytea,
  p_role_key text,
  p_permission_key text,
  p_granted boolean,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid;
  actor_level smallint;
  target_level smallint;
  is_owner boolean;
  permission_is_assignable boolean;
  changed boolean := false;
BEGIN
  actor_id := public.staff_session_account_id(p_session_hash);
  IF actor_id IS NULL OR p_role_key IS NULL OR p_permission_key IS NULL OR p_granted IS NULL
     OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500
     OR NOT public.staff_actor_has_permission(actor_id, 'permissions.delegate', 'global') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Permissão insuficiente.';
  END IF;
  SELECT hierarchy_level INTO target_level FROM public.staff_roles WHERE role_key = p_role_key AND active;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.staff_permission_catalog WHERE permission_key = p_permission_key
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Cargo ou capacidade não encontrados.';
  END IF;
  is_owner := public.staff_actor_has_permission(actor_id, '*', 'global');
  actor_level := public.staff_actor_highest_level(actor_id, 'global');
  IF NOT is_owner AND (target_level IS NULL OR actor_level IS NULL OR target_level >= actor_level) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Não é possível editar permissões de um cargo no mesmo nível ou acima do seu.';
  END IF;
  SELECT assignable INTO permission_is_assignable
    FROM public.staff_permission_catalog WHERE permission_key = p_permission_key;
  IF p_granted AND NOT is_owner AND (
    NOT permission_is_assignable
    OR NOT public.staff_actor_has_permission(actor_id, p_permission_key, 'global')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Não é possível delegar uma capacidade que você não possui.';
  END IF;

  IF p_granted THEN
    INSERT INTO public.staff_role_permissions (role_key, permission_key)
    VALUES (p_role_key, p_permission_key)
    ON CONFLICT (role_key, permission_key) DO NOTHING;
    changed := FOUND;
  ELSE
    DELETE FROM public.staff_role_permissions
     WHERE role_key = p_role_key AND permission_key = p_permission_key;
    changed := FOUND;
  END IF;
  IF changed THEN
    INSERT INTO public.staff_audit_events (actor_account_id, action, scope_key, reason, details)
    VALUES (actor_id, CASE WHEN p_granted THEN 'role.permission.granted' ELSE 'role.permission.revoked' END,
      'global', btrim(p_reason),
      jsonb_build_object('role_key', p_role_key, 'permission_key', p_permission_key,
        'previous', NOT p_granted, 'current', p_granted));
  END IF;
  RETURN changed;
END
$$;

REVOKE ALL ON FUNCTION public.staff_session_account_id(bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_actor_has_permission(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_actor_highest_level(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_create_role_from_session(bytea, text, text, smallint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_assign_role_from_session(bytea, uuid, text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_revoke_role_from_session(bytea, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_set_role_permission_from_session(bytea, text, text, boolean, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clareira_preview_game') THEN
    GRANT EXECUTE ON FUNCTION public.staff_create_role_from_session(bytea, text, text, smallint, text) TO clareira_preview_game;
    GRANT EXECUTE ON FUNCTION public.staff_assign_role_from_session(bytea, uuid, text, text, text, timestamptz) TO clareira_preview_game;
    GRANT EXECUTE ON FUNCTION public.staff_revoke_role_from_session(bytea, bigint, text) TO clareira_preview_game;
    GRANT EXECUTE ON FUNCTION public.staff_set_role_permission_from_session(bytea, text, text, boolean, text) TO clareira_preview_game;
  END IF;
END
$$;
