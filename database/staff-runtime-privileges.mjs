const staffTables = [
  'staff_roles',
  'staff_permission_catalog',
  'staff_role_inheritance',
  'staff_role_permissions',
  'account_role_assignments',
  'staff_audit_events',
  'player_reports',
  'player_sanctions',
];

const staffSequences = [
  'account_role_assignments_assignment_id_seq',
  'staff_audit_events_event_id_seq',
  'player_reports_report_id_seq',
  'player_sanctions_sanction_id_seq',
];

function roleIdentifier(role) {
  if (typeof role !== 'string' || !/^[a-z_][a-z0-9_]{0,62}$/.test(role)) {
    throw new TypeError('Nome de role PostgreSQL inválido.');
  }
  return `"${role}"`;
}

export async function applyStaffRuntimePrivileges(pool, role = 'clareira_preview_game') {
  if (!pool || typeof pool.query !== 'function') {
    throw new TypeError('Um pool PostgreSQL é necessário para configurar permissões de staff.');
  }
  const identifier = roleIdentifier(role);
  await pool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE ON TABLES FROM ${identifier}`);
  await pool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${identifier}`);
  await pool.query(`REVOKE ALL ON ${staffTables.join(', ')} FROM ${identifier}`);
  await pool.query(`GRANT SELECT ON ${staffTables.join(', ')} TO ${identifier}`);
  await pool.query(`REVOKE ALL ON SEQUENCE ${staffSequences.join(', ')} FROM ${identifier}`);
  await pool.query(`REVOKE ALL ON FUNCTION public.staff_session_account_id(bytea), public.staff_actor_has_permission(uuid, text, text), public.staff_actor_highest_level(uuid, text) FROM ${identifier}`);
  await pool.query(`GRANT EXECUTE ON FUNCTION public.staff_create_role_from_session(bytea, text, text, smallint, text), public.staff_assign_role_from_session(bytea, uuid, text, text, text, timestamptz), public.staff_revoke_role_from_session(bytea, bigint, text), public.staff_set_role_permission_from_session(bytea, text, text, boolean, text), public.staff_submit_report_from_session(bytea, uuid, text, text), public.staff_update_report_from_session(bytea, bigint, text, text), public.staff_apply_sanction_from_session(bytea, uuid, text, timestamptz, text, bigint), public.staff_revoke_sanction_from_session(bytea, bigint, text), public.staff_adjust_wallet_from_session(bytea, uuid, bigint, text) TO ${identifier}`);
}
