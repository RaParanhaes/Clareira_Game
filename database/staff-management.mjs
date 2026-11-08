import { gameDayKey } from '../game/game-calendar.mjs';
import { createHash } from 'node:crypto';
import { createStaffAuthorizationStore } from './staff-authorization.mjs';
import { MAX_WALLET_VALUE } from '../game/lodging-catalog.mjs';
import { inventoryFromRows } from '../game/inventory.mjs';
import { CONTENT } from '../game/content-catalog.mjs';
const itemLabels = new Map(CONTENT.filter(item => item.category === 'item').map(item => [item.kind, item.label]));

function sessionHash(token) {
  if (typeof token !== 'string' || token.length < 40 || token.length > 100) {
    throw Object.assign(new Error('Sua sessão expirou. Entre de novo.'), { status: 401 });
  }
  return createHash('sha256').update(token).digest();
}

function reasonText(value) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 500) {
    throw Object.assign(new Error('Informe um motivo de 1 a 500 caracteres.'), { status: 400 });
  }
  return value.trim();
}

function mapDatabaseError(error) {
  if (error.code === '42501') return Object.assign(new Error('Você não tem permissão para essa ação.'), { status: 403 });
  if (error.code === '23505') return Object.assign(new Error('Essa atribuição já está ativa.'), { status: 409 });
  if (error.code === 'P0002') return Object.assign(new Error('A conta, cargo ou capacidade não foi encontrada.'), { status: 404 });
  if (error.code === '22023') return Object.assign(new Error('Os dados enviados são inválidos.'), { status: 400 });
  return error;
}

export function createStaffManagementStore(pool) {
  if (!pool || typeof pool.query !== 'function') {
    throw new TypeError('Um pool PostgreSQL é necessário para operações de staff.');
  }
  const authorization = createStaffAuthorizationStore(pool);

  async function call(sql, values) {
    try { return (await pool.query(sql, values)).rows[0]; }
    catch (error) { throw mapDatabaseError(error); }
  }

  return {
    authorization,

    async findAccountByUsername(username) {
      if (typeof username !== 'string' || !/^[a-z0-9_]{3,20}$/u.test(username)) return null;
      const result = await pool.query(
        'SELECT id, username FROM accounts WHERE username = $1',
        [username.toLowerCase()],
      );
      return result.rows[0] || null;
    },

    async getPlayerOverview(username) {
      const result = await pool.query(
        `SELECT a.username, a.created_at, p.id AS profile_id, p.display_name
           FROM accounts a JOIN profiles p ON p.account_id = a.id WHERE a.username = $1`, [username]);
      const account = result.rows[0];
      if (!account) return null;
      const columns = await pool.query(`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lodging_leases' AND column_name='landlord_profile_id') AS has_landlord`);
      const hasLandlord = columns.rows[0].has_landlord;
      const [items, appearance, claims, leases] = await Promise.all([
        pool.query('SELECT item_id, quantity FROM inventory_items WHERE profile_id = $1', [account.profile_id]),
        pool.query('SELECT version, body_id, skin_id, hair_color_id, hair_style_id, coat_id, outfit_id FROM appearances WHERE profile_id = $1', [account.profile_id]),
        pool.query(hasLandlord ? `SELECT c.building_id, c.unit_number, c.mode, c.expires_at,
          tenant.username AS tenant_username FROM lodging_claims c
          LEFT JOIN lodging_leases l ON l.building_id=c.building_id AND l.unit_number=c.unit_number
            AND l.status='active' AND l.landlord_profile_id=c.profile_id
          LEFT JOIN profiles tp ON tp.id=l.profile_id LEFT JOIN accounts tenant ON tenant.id=tp.account_id
          WHERE c.profile_id=$1 ORDER BY c.building_id,c.unit_number` :
          `SELECT building_id,unit_number,mode,expires_at,NULL::text AS tenant_username FROM lodging_claims WHERE profile_id=$1 ORDER BY building_id,unit_number`, [account.profile_id]),
        pool.query(hasLandlord ? `SELECT l.building_id,l.unit_number,l.rent_bronze,l.next_charge_at,
          landlord.username AS landlord_username FROM lodging_leases l
          LEFT JOIN profiles lp ON lp.id=l.landlord_profile_id LEFT JOIN accounts landlord ON landlord.id=lp.account_id
          WHERE l.profile_id=$1 AND l.status='active' ORDER BY l.building_id,l.unit_number` :
          `SELECT building_id,unit_number,rent_bronze,next_charge_at,NULL::text AS landlord_username FROM lodging_leases WHERE profile_id=$1 AND status='active' ORDER BY building_id,unit_number`, [account.profile_id]),
      ]);
      const inventory = inventoryFromRows(items.rows.map(row => ({ itemId: row.item_id, quantity: Number(row.quantity) })));
      return { username: account.username, displayName: account.display_name, createdAt: account.created_at,
        progression: { level: inventory.level, xp: inventory.xp, attributePoints: inventory.attributePoints,
          skillPoints: inventory.skillPoints, attributes: inventory.attributes },
        wallet: { gold: inventory.gold, silver: inventory.silver, bronze: inventory.bronze },
        appearance: appearance.rows[0] || null, properties: claims.rows, leases: leases.rows };
    },

    async getEconomyOverview() {
      const [goods, banks] = await Promise.all([
        pool.query(`SELECT g.item_id,g.base_price_bronze,q.buy_price_bronze,q.sell_price_bronze,
          q.stock_ratio,q.demand_ratio,q.calculated_at,COALESCE(s.available,0) AS available,
          COALESCE(f.sold,0) AS sold_last_7_days
          FROM economy_goods g LEFT JOIN economy_quotes q USING (item_id,region_id)
          LEFT JOIN (SELECT item_id,region_id,SUM(quantity-reserved) AS available FROM economy_market_stock GROUP BY item_id,region_id) s USING (item_id,region_id)
          LEFT JOIN (SELECT item_id,region_id,SUM(units_sold_to_npc) AS sold FROM economy_daily_flows
            WHERE flow_day >= $1::date - 6 GROUP BY item_id,region_id) f USING (item_id,region_id)
          WHERE g.region_id='global' AND g.enabled ORDER BY g.item_id LIMIT 200`,[gameDayKey()]),
        pool.query(`SELECT b.bank_id,b.status,q.rate_bps,q.reserve_balance_bronze,
          q.outstanding_credit_bronze,q.available_credit_bronze,q.calculated_at
          FROM world_banks b LEFT JOIN bank_interest_quotes q ON q.bank_id=b.bank_id
          ORDER BY b.bank_id LIMIT 100`),
      ]);
      return { goods: goods.rows.map(row => ({ ...row, label: itemLabels.get(row.item_id) || row.item_id })), banks: banks.rows };
    },

    async listRoles() {
      const result = await pool.query(
        `WITH RECURSIVE inherited_roles(role_key, inherited_role_key) AS (
           SELECT role_key, inherits_role_key FROM staff_role_inheritance
           UNION
           SELECT inherited.role_key, next.inherits_role_key
             FROM inherited_roles inherited
             JOIN staff_role_inheritance next ON next.role_key = inherited.inherited_role_key
         )
         SELECT role.role_key, role.display_name, role.role_kind, role.hierarchy_level,
                role.is_staff, role.active,
                (SELECT count(*)::integer
                   FROM account_role_assignments assignment
                  WHERE assignment.role_key = role.role_key
                    AND assignment.revoked_at IS NULL
                    AND (assignment.expires_at IS NULL OR assignment.expires_at > now())) AS member_count,
                COALESCE(array_agg(permission.permission_key ORDER BY permission.permission_key)
                  FILTER (WHERE permission.permission_key IS NOT NULL), ARRAY[]::text[]) AS permissions,
                ARRAY(
                  SELECT DISTINCT inherited_permission.permission_key
                    FROM inherited_roles inherited
                    JOIN staff_role_permissions inherited_grant ON inherited_grant.role_key = inherited.inherited_role_key
                    JOIN staff_permission_catalog inherited_permission ON inherited_permission.permission_key = inherited_grant.permission_key
                   WHERE inherited.role_key = role.role_key
                   ORDER BY inherited_permission.permission_key
                ) AS inherited_permissions
           FROM staff_roles role
           LEFT JOIN staff_role_permissions role_permission ON role_permission.role_key = role.role_key
           LEFT JOIN staff_permission_catalog permission ON permission.permission_key = role_permission.permission_key
          GROUP BY role.role_key
          ORDER BY role.hierarchy_level NULLS LAST, role.display_name`);
      return result.rows;
    },

    async listPermissionsForActor(accountId) {
      const result = await pool.query(
        `WITH RECURSIVE role_chain(role_key) AS (
           SELECT assignment.role_key
             FROM account_role_assignments assignment
             JOIN staff_roles role ON role.role_key = assignment.role_key AND role.active
            WHERE assignment.account_id = $1 AND assignment.revoked_at IS NULL
              AND (assignment.expires_at IS NULL OR assignment.expires_at > now())
              AND assignment.scope_key = 'global'
           UNION
           SELECT inheritance.inherits_role_key
             FROM role_chain chain
             JOIN staff_role_inheritance inheritance ON inheritance.role_key = chain.role_key
             JOIN staff_roles role ON role.role_key = inheritance.inherits_role_key AND role.active
         ), actor_permissions AS (
           SELECT DISTINCT permission.permission_key
             FROM role_chain chain
             JOIN staff_role_permissions role_permission ON role_permission.role_key = chain.role_key
             JOIN staff_permission_catalog permission ON permission.permission_key = role_permission.permission_key
         )
         SELECT catalog.permission_key, catalog.domain, catalog.description, catalog.assignable,
                (catalog.permission_key = '*' AND EXISTS (SELECT 1 FROM actor_permissions WHERE permission_key = '*'))
                OR (catalog.assignable AND (
                  EXISTS (SELECT 1 FROM actor_permissions WHERE permission_key = catalog.permission_key)
                  OR EXISTS (SELECT 1 FROM actor_permissions WHERE permission_key = '*')
                )) AS "canDelegate"
           FROM staff_permission_catalog catalog
          ORDER BY catalog.domain, catalog.permission_key`,
        [accountId],
      );
      return result.rows;
    },

    async listPermissions() {
      const result = await pool.query(
        'SELECT permission_key, domain, description, assignable FROM staff_permission_catalog ORDER BY domain, permission_key',
      );
      return result.rows;
    },

    async listAssignments(accountId) {
      if (typeof accountId !== 'string' || !accountId) {
        throw Object.assign(new Error('Conta de destino inválida.'), { status: 400 });
      }
      const result = await pool.query(
        `SELECT assignment.assignment_id, assignment.account_id, account.username,
                assignment.role_key, role.display_name, assignment.scope_key,
                assignment.assigned_by_account_id, actor.username AS assigned_by_username,
                assignment.reason, assignment.created_at, assignment.expires_at, assignment.revoked_at
           FROM account_role_assignments assignment
           JOIN accounts account ON account.id = assignment.account_id
           JOIN staff_roles role ON role.role_key = assignment.role_key
           LEFT JOIN accounts actor ON actor.id = assignment.assigned_by_account_id
          WHERE assignment.account_id = $1
          ORDER BY assignment.created_at DESC, assignment.assignment_id DESC`,
        [accountId],
      );
      return result.rows;
    },

    async listAudit({ limit = 100, beforeEventId = null } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 200
          || (beforeEventId !== null && (!Number.isSafeInteger(beforeEventId) || beforeEventId < 1))) {
        throw Object.assign(new Error('Parâmetros de auditoria inválidos.'), { status: 400 });
      }
      const result = await pool.query(
        `SELECT event.event_id, event.actor_account_id, actor.username AS actor_username,
                event.target_account_id, target.username AS target_username,
                event.action, event.scope_key, event.reason, event.details, event.happened_at
           FROM staff_audit_events event
           LEFT JOIN accounts actor ON actor.id = event.actor_account_id
           LEFT JOIN accounts target ON target.id = event.target_account_id
          WHERE ($1::bigint IS NULL OR event.event_id < $1)
          ORDER BY event.event_id DESC
          LIMIT $2`,
        [beforeEventId, limit],
      );
      return result.rows;
    },

    async listReports({ limit = 50, beforeReportId = null, status = null, actorAccountId, canManageAll = false } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100
          || (beforeReportId !== null && (!Number.isSafeInteger(beforeReportId) || beforeReportId < 1))
          || (status !== null && !['open', 'claimed', 'resolved', 'dismissed'].includes(status))
          || typeof actorAccountId !== 'string' || !actorAccountId
          || typeof canManageAll !== 'boolean') {
        throw Object.assign(new Error('Parâmetros de denúncias inválidos.'), { status: 400 });
      }
      const result = await pool.query(
        `SELECT report.report_id, report.reporter_account_id, reporter.username AS reporter_username,
                report.target_account_id, target.username AS target_username,
                report.category, report.description, report.status, report.assigned_to_account_id,
                assigned.username AS assigned_to_username, report.scope_key, report.created_at, report.updated_at
           FROM player_reports report
           LEFT JOIN accounts reporter ON reporter.id = report.reporter_account_id
           JOIN accounts target ON target.id = report.target_account_id
           LEFT JOIN accounts assigned ON assigned.id = report.assigned_to_account_id
          WHERE ($1::bigint IS NULL OR report.report_id < $1)
            AND ($2::text IS NULL OR report.status = $2)
            AND ($4::boolean OR report.assigned_to_account_id = $5::uuid)
          ORDER BY report.report_id DESC LIMIT $3`,
        [beforeReportId, status, limit, canManageAll, actorAccountId],
      );
      return result.rows;
    },

    async listSanctions(accountId, { limit = 50 } = {}) {
      if (typeof accountId !== 'string' || !accountId || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw Object.assign(new Error('Parâmetros de sanções inválidos.'), { status: 400 });
      }
      const result = await pool.query(
        `SELECT sanction.sanction_id, sanction.target_account_id, sanction.kind, sanction.reason,
                sanction.created_by_account_id, actor.username AS created_by_username,
                sanction.related_report_id, sanction.created_at, sanction.expires_at,
                sanction.lifted_at, sanction.lifted_by_account_id, sanction.lift_reason
           FROM player_sanctions sanction
           LEFT JOIN accounts actor ON actor.id = sanction.created_by_account_id
          WHERE sanction.target_account_id = $1
          ORDER BY sanction.created_at DESC, sanction.sanction_id DESC LIMIT $2`,
        [accountId, limit],
      );
      return result.rows;
    },

    async activeSanctions(accountIds) {
      if (!Array.isArray(accountIds) || accountIds.some(id => typeof id !== 'string')) {
        throw new TypeError('A lista de contas para consultar sanções é inválida.');
      }
      if (!accountIds.length) return [];
      const result = await pool.query(
        `SELECT sanction_id, target_account_id, kind, created_by_account_id, expires_at
           FROM player_sanctions
          WHERE target_account_id = ANY($1::uuid[]) AND lifted_at IS NULL
            AND (expires_at IS NULL OR expires_at > now())
            AND kind IN ('mute','kick','suspend','ban')
          ORDER BY created_at DESC, sanction_id DESC`,
        [accountIds],
      );
      return result.rows;
    },

    async createRole(token, { roleKey, displayName, hierarchyLevel, reason } = {}) {
      if (typeof roleKey !== 'string' || typeof displayName !== 'string'
          || !Number.isInteger(hierarchyLevel) || hierarchyLevel < 0 || hierarchyLevel > 5) {
        throw Object.assign(new Error('Dados do cargo inválidos.'), { status: 400 });
      }
      const row = await call(
        'SELECT public.staff_create_role_from_session($1, $2, $3, $4, $5) AS role_key',
        [sessionHash(token), roleKey, displayName, hierarchyLevel, reasonText(reason)],
      );
      return row.role_key;
    },

    async assignRole(token, { targetAccountId, roleKey, scopeKey = 'global', reason, expiresAt = null } = {}) {
      if (typeof targetAccountId !== 'string' || !targetAccountId) {
        throw Object.assign(new Error('Conta de destino inválida.'), { status: 400 });
      }
      if (typeof scopeKey !== 'string' || scopeKey.trim().length < 1 || scopeKey.trim().length > 160) {
        throw Object.assign(new Error('Escopo inválido.'), { status: 400 });
      }
      if (expiresAt !== null && (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt)))) {
        throw Object.assign(new Error('Validade inválida.'), { status: 400 });
      }
      const row = await call(
        'SELECT public.staff_assign_role_from_session($1, $2, $3, $4, $5, $6) AS assignment_id',
        [sessionHash(token), targetAccountId, roleKey, scopeKey.trim(), reasonText(reason), expiresAt],
      );
      return row.assignment_id;
    },

    async revokeRole(token, { assignmentId, reason } = {}) {
      const id = typeof assignmentId === 'string' && /^\d+$/.test(assignmentId)
        ? Number(assignmentId)
        : assignmentId;
      if (!Number.isSafeInteger(id) || id < 1) {
        throw Object.assign(new Error('Atribuição inválida.'), { status: 400 });
      }
      const row = await call(
        'SELECT public.staff_revoke_role_from_session($1, $2, $3) AS revoked',
        [sessionHash(token), id, reasonText(reason)],
      );
      return row.revoked;
    },

    async setRolePermission(token, { roleKey, permissionKey, granted, reason } = {}) {
      if (typeof granted !== 'boolean') {
        throw Object.assign(new Error('Informe se a capacidade será concedida ou removida.'), { status: 400 });
      }
      const row = await call(
        'SELECT public.staff_set_role_permission_from_session($1, $2, $3, $4, $5) AS changed',
        [sessionHash(token), roleKey, permissionKey, granted, reasonText(reason)],
      );
      return row.changed;
    },

    async submitReport(token, { targetAccountId, category, description } = {}) {
      if (typeof targetAccountId !== 'string' || !/^[0-9a-f-]{36}$/iu.test(targetAccountId)
          || typeof category !== 'string' || typeof description !== 'string'
          || description.trim().length < 10 || description.trim().length > 1200) {
        throw Object.assign(new Error('Revise a categoria, a conta e a descrição da denúncia.'), { status: 400 });
      }
      const row = await call(
        'SELECT public.staff_submit_report_from_session($1, $2, $3, $4) AS report_id',
        [sessionHash(token), targetAccountId, category, description.trim()],
      );
      return row.report_id;
    },

    async updateReport(token, { reportId, action, reason } = {}) {
      const id = typeof reportId === 'string' && /^\d+$/u.test(reportId) ? Number(reportId) : reportId;
      if (!Number.isSafeInteger(id) || id < 1 || typeof action !== 'string') {
        throw Object.assign(new Error('Ação de denúncia inválida.'), { status: 400 });
      }
      const row = await call(
        'SELECT public.staff_update_report_from_session($1, $2, $3, $4) AS changed',
        [sessionHash(token), id, action, reasonText(reason)],
      );
      return row.changed;
    },

    async applySanction(token, { targetAccountId, kind, expiresAt = null, reason, reportId = null } = {}) {
      if (typeof targetAccountId !== 'string' || !/^[0-9a-f-]{36}$/iu.test(targetAccountId)
          || typeof kind !== 'string' || !['warning', 'mute', 'kick', 'suspend', 'ban'].includes(kind)
          || (expiresAt !== null && (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt))))) {
        throw Object.assign(new Error('Dados da sanção inválidos.'), { status: 400 });
      }
      const id = reportId === null ? null : (typeof reportId === 'string' && /^\d+$/u.test(reportId) ? Number(reportId) : reportId);
      if (id !== null && (!Number.isSafeInteger(id) || id < 1)) {
        throw Object.assign(new Error('Denúncia vinculada inválida.'), { status: 400 });
      }
      const row = await call(
        'SELECT public.staff_apply_sanction_from_session($1, $2, $3, $4, $5, $6) AS sanction_id',
        [sessionHash(token), targetAccountId, kind, expiresAt, reasonText(reason), id],
      );
      return row.sanction_id;
    },

    async revokeSanction(token, { sanctionId, reason } = {}) {
      const id = typeof sanctionId === 'string' && /^\d+$/u.test(sanctionId) ? Number(sanctionId) : sanctionId;
      if (!Number.isSafeInteger(id) || id < 1) {
        throw Object.assign(new Error('Sanção inválida.'), { status: 400 });
      }
      const row = await call(
        'SELECT public.staff_revoke_sanction_from_session($1, $2, $3) AS revoked',
        [sessionHash(token), id, reasonText(reason)],
      );
      return row.revoked;
    },

    async adjustWallet(token, { targetAccountId, delta, reason } = {}) {
      if (typeof targetAccountId !== 'string' || !/^[0-9a-f-]{36}$/iu.test(targetAccountId)
          || !Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > MAX_WALLET_VALUE) {
        throw Object.assign(new Error('Informe a conta e um valor inteiro dentro da capacidade da carteira.'), { status: 400 });
      }
      return call(
        'SELECT public.staff_adjust_wallet_from_session($1, $2, $3, $4) AS wallet',
        [sessionHash(token), targetAccountId, delta, reasonText(reason)],
      ).then(row => row.wallet);
    },
  };
}
