export function hasStaffPermission(rows, permissionKey, {
  scopeKey = 'global',
  now = Date.now(),
} = {}) {
  if (typeof permissionKey !== 'string' || !permissionKey || !Array.isArray(rows)) return false;
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  return rows.some(row => {
    if (!row || (row.scope_key !== 'global' && row.scope_key !== scopeKey)) return false;
    if (row.revoked_at) return false;
    if (row.expires_at != null && new Date(row.expires_at).getTime() <= nowMs) return false;
    return row.permission_key === '*' || row.permission_key === permissionKey;
  });
}

export function createStaffAuthorizationStore(pool) {
  if (!pool || typeof pool.query !== 'function') {
    throw new TypeError('Um pool PostgreSQL é necessário para autorizar ações de staff.');
  }

  return {
    async hasPermission(accountId, permissionKey, {
      scopeKey = 'global',
      now = new Date(),
    } = {}) {
      if (typeof accountId !== 'string' || !accountId
          || typeof permissionKey !== 'string' || !permissionKey
          || typeof scopeKey !== 'string' || !scopeKey) return false;
      const result = await pool.query(
        `WITH RECURSIVE role_chain(assignment_id, role_key) AS (
           SELECT assignment.assignment_id, assignment.role_key
             FROM account_role_assignments assignment
             JOIN staff_roles role ON role.role_key = assignment.role_key AND role.active
            WHERE assignment.account_id = $1
              AND assignment.revoked_at IS NULL
              AND (assignment.expires_at IS NULL OR assignment.expires_at > $2)
              AND (assignment.scope_key = 'global' OR assignment.scope_key = $3)
           UNION
           SELECT chain.assignment_id, inheritance.inherits_role_key
             FROM role_chain chain
             JOIN staff_role_inheritance inheritance ON inheritance.role_key = chain.role_key
             JOIN staff_roles role ON role.role_key = inheritance.inherits_role_key AND role.active
         )
         SELECT chain.role_key, assignment.scope_key, assignment.expires_at,
                assignment.revoked_at, permission.permission_key
           FROM role_chain chain
           JOIN account_role_assignments assignment ON assignment.assignment_id = chain.assignment_id
           JOIN staff_role_permissions role_permission ON role_permission.role_key = chain.role_key
           JOIN staff_permission_catalog permission
             ON permission.permission_key = role_permission.permission_key
          WHERE permission.permission_key IN ($4, '*')`,
        [accountId, now, scopeKey, permissionKey],
      );
      return hasStaffPermission(result.rows, permissionKey, { scopeKey, now });
    },
  };
}
