const byId = id => document.getElementById(id);
let playerOverviewRequest = 0, economyOverviewRequest = 0;
const state = { roles: [], permissions: [], activeRole: null, account: null, auditBefore: null, busy: false, capabilities: {}, reportRequest: 0, accountRequest: 0, accountTarget: '', sanctionRequest: 0, sanctionTarget: '', auditRequest: 0, auditLoading: false };
const notice = byId('notice');
const apiPrefix = window.location.pathname.startsWith('/dev/') ? '/dev' : '';
import { drawWorldMap, screenToWorldMap, worldMapToScreen, worldMapTransform } from '../game/world-map.mjs';
let noticeTimer;

async function api(url, options = {}) {
  const response = await fetch(`${apiPrefix}${url}`, {
    credentials: 'same-origin', ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers },
  });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `A solicitação falhou (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function showNotice(message, kind = 'success') {
  window.clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.className = `notice notice-${kind}`;
  notice.hidden = false;
  if (kind === 'success') noticeTimer = window.setTimeout(() => { notice.hidden = true; }, 5200);
}

function cell(row, value, className = '') {
  const td = document.createElement('td');
  td.textContent = value ?? '—';
  if (className) td.className = className;
  row.append(td);
  return td;
}

function button(label, className, handler, ariaLabel = label) {
  const element = document.createElement('button');
  element.type = 'button'; element.className = className; element.textContent = label;
  element.setAttribute('aria-label', ariaLabel); element.addEventListener('click', handler);
  return element;
}

function formatDate(value) {
  if (!value) return 'Sem validade';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data inválida' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function roleRank(role) {
  if (role.role_key === 'owner') return 'Autoridade total';
  if (role.role_kind === 'world') return 'Mundo';
  return `Nível ${role.hierarchy_level ?? '—'}`;
}

function renderRoles() {
  const body = byId('roles-body'); body.replaceChildren();
  const query = byId('role-search').value.trim().toLocaleLowerCase('pt-BR');
  const visible = state.roles.filter(role => `${role.display_name} ${role.role_key}`.toLocaleLowerCase('pt-BR').includes(query));
  if (!visible.length) {
    const row = body.insertRow(); const td = cell(row, state.roles.length ? 'Nenhum cargo corresponde à busca.' : 'Nenhum cargo cadastrado.', 'table-state'); td.colSpan = 5;
  }
  for (const role of visible) {
    const row = body.insertRow(); row.className = state.activeRole === role.role_key ? 'is-selected' : '';
    const name = cell(row, role.display_name, 'role-name');
    const sub = document.createElement('small'); sub.className = 'subtext'; sub.textContent = role.role_key; name.append(sub);
    cell(row, roleRank(role)); cell(row, String(role.member_count ?? 0), 'numeric');
    cell(row, String((role.permissions || []).length), 'numeric');
    const status = document.createElement('span'); status.className = role.active ? 'pill pill-green' : 'pill pill-muted'; status.textContent = role.active ? 'Ativo' : 'Inativo';
    const statusCell = row.insertCell(); statusCell.append(status);
    row.tabIndex = 0; row.dataset.roleKey = role.role_key; row.setAttribute('role', 'button');
    row.setAttribute('aria-expanded', String(state.activeRole === role.role_key));
    row.setAttribute('aria-label', `${role.display_name}, ${roleRank(role)}, ${role.member_count ?? 0} integrantes`);
    row.addEventListener('click', () => selectRole(role.role_key));
    row.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      selectRole(role.role_key);
      // Rendering replaces the table rows; return focus to the selected row
      // so keyboard users do not lose their place.
      [...body.rows].find(item => item.dataset.roleKey === role.role_key)?.focus({ preventScroll: true });
    });
  }
  const staffCount = state.roles.filter(role => role.is_staff).length;
  const peopleCount = state.roles.reduce((sum, role) => sum + Number(role.member_count || 0), 0);
  const cards = [['Cargos ativos', String(state.roles.filter(role => role.active).length), 'Estrutura cadastrada'], ['Cargos de equipe', String(staffCount), 'Acesso administrativo'], ['Atribuições ativas', String(peopleCount), 'Contagem por cargo']];
  const summary = byId('role-summary'); summary.replaceChildren();
  for (const [label, value, detail] of cards) {
    const card = document.createElement('article'); card.className = 'summary-card';
    const heading = document.createElement('span'); heading.textContent = label;
    const number = document.createElement('strong'); number.textContent = value;
    const caption = document.createElement('small'); caption.textContent = detail;
    card.append(heading, number, caption); summary.append(card);
  }
}

async function selectRole(roleKey) {
  state.activeRole = roleKey; renderRoles();
  const role = state.roles.find(item => item.role_key === roleKey);
  const detail = byId('role-detail'); detail.replaceChildren(); detail.hidden = false;
  const head = document.createElement('div'); head.className = 'detail-heading';
  const titleBlock = document.createElement('div');
  const title = document.createElement('h3'); title.textContent = `Permissões de ${role.display_name}`;
  const summary = document.createElement('p'); summary.textContent = 'Conceda apenas capacidades previstas para o seu acesso. Toda mudança exige motivo.';
  titleBlock.append(title, summary); head.append(titleBlock); detail.append(head);
  const groups = new Map();
  for (const permission of state.permissions) {
    if (!groups.has(permission.domain)) groups.set(permission.domain, []);
    groups.get(permission.domain).push(permission);
  }
  if (!state.permissions.length) {
    const message = document.createElement('p'); message.className = 'inline-state'; message.textContent = 'Seu cargo não pode delegar capacidades ou o catálogo não está disponível.'; detail.append(message); return;
  }
  const matrix = document.createElement('div'); matrix.className = 'permission-matrix';
  for (const [domain, permissions] of groups) {
    const group = document.createElement('section'); group.className = 'permission-group';
    const heading = document.createElement('h4'); heading.textContent = domainLabel(domain); group.append(heading);
    for (const permission of permissions) {
      const row = document.createElement('label'); row.className = 'permission-row';
      const check = document.createElement('input'); check.type = 'checkbox';
      const inherited = (role.inherited_permissions || []).includes(permission.permission_key);
      const directlyGranted = role.permissions.includes(permission.permission_key);
      const granted = directlyGranted || inherited;
      check.checked = granted;
      check.disabled = state.busy || inherited || (!granted && !permission.canDelegate);
      check.setAttribute('aria-label', `${granted ? 'Remover' : 'Conceder'} ${permission.description}`);
      check.addEventListener('change', () => changePermission(role, permission, check, granted));
      const copy = document.createElement('span'); copy.className = 'permission-copy';
      const name = document.createElement('strong'); name.textContent = permission.description;
      const key = document.createElement('small'); key.textContent = permission.permission_key;
      copy.append(name, key); row.append(check, copy);
      if (inherited) { const lock = document.createElement('span'); lock.className = 'lock-mark'; lock.textContent = 'Herdada'; row.append(lock); }
      else if (!granted && !permission.canDelegate) { const lock = document.createElement('span'); lock.className = 'lock-mark'; lock.textContent = 'Sem acesso'; row.append(lock); }
      group.append(row);
    }
    matrix.append(group);
  }
  detail.append(matrix);
}

function domainLabel(domain) {
  return ({ all: 'Autoridade total', staff: 'Equipe', moderation: 'Moderação', players: 'Jogadores', world: 'Mundos', community: 'Comunidade', economy: 'Economia', homes: 'Casas', inventory: 'Inventário', game: 'Jogo', operations: 'Operações' })[domain] || domain;
}

function askConfirmation({ title, copy, actionLabel = 'Confirmar', warning = false }) {
  const dialog = byId('confirm-dialog');
  byId('confirm-title').textContent = title; byId('confirm-copy').textContent = copy;
  byId('confirm-submit').textContent = actionLabel;
  byId('confirm-submit').className = warning ? 'button button-danger' : 'button button-primary';
  byId('confirm-reason').value = '';
  return new Promise(resolve => {
    const form = byId('confirm-form');
    const onClose = () => { form.removeEventListener('submit', onSubmit); dialog.removeEventListener('close', onClose); resolve(null); };
    const onSubmit = event => {
      event.preventDefault();
      if (event.submitter?.value === 'cancel') { dialog.close('cancel'); return; }
      const reason = byId('confirm-reason').value.trim();
      if (!reason) return;
      form.removeEventListener('submit', onSubmit); dialog.removeEventListener('close', onClose); dialog.close('confirm'); resolve(reason);
    };
    form.addEventListener('submit', onSubmit); dialog.addEventListener('close', onClose, { once: true }); dialog.showModal();
    byId('confirm-reason').focus();
  });
}

async function changePermission(role, permission, checkbox, wasGranted) {
  const grant = checkbox.checked;
  const isWildcard = permission.permission_key === '*';
  const reason = await askConfirmation({
    title: grant ? (isWildcard ? 'Delegar autoridade total' : 'Conceder capacidade') : 'Remover capacidade',
    copy: grant
      ? `${permission.description} será ${isWildcard ? 'delegada integralmente' : 'concedida'} ao cargo ${role.display_name}. Essa mudança pode ampliar o acesso da equipe.`
      : `${permission.description} será removida do cargo ${role.display_name}.`,
    actionLabel: grant ? 'Conceder acesso' : 'Remover acesso', warning: grant || wasGranted,
  });
  if (!reason) { checkbox.checked = wasGranted; return; }
  checkbox.disabled = true;
  try {
    await api(`/staff/roles/${encodeURIComponent(role.role_key)}/permissions`, { method: 'POST', body: JSON.stringify({ permissionKey: permission.permission_key, granted: grant, reason }) });
    role.permissions = grant ? [...new Set([...role.permissions, permission.permission_key])].sort() : role.permissions.filter(key => key !== permission.permission_key);
    showNotice(`Permissão ${grant ? 'concedida' : 'removida'} e registrada na auditoria.`);
    await selectRole(role.role_key);
  } catch (error) {
    checkbox.checked = wasGranted; checkbox.disabled = false;
    showNotice(error.message, error.status === 403 ? 'error' : 'error');
  }
}

async function loadRoles() {
  const body = byId('roles-body'); body.innerHTML = '<tr><td colspan="5" class="table-state">Carregando cargos…</td></tr>';
  try {
    const data = await api('/staff/roles'); state.roles = data.roles || [];
    try { state.permissions = (await api('/staff/permissions')).permissions || []; }
    catch (error) { state.permissions = []; if (error.status !== 403) throw error; }
    renderRoles();
  } catch (error) {
    body.replaceChildren(); const row = body.insertRow(); const td = cell(row, error.status === 403 ? 'Acesso negado. Seu cargo não pode consultar os cargos da equipe.' : `Não foi possível carregar os cargos: ${error.message}`, 'table-state'); td.colSpan = 5;
    showNotice(error.message, 'error');
  }
}

function renderAssignments(account, assignments) {
  const panel = byId('account-panel'); panel.replaceChildren(); panel.hidden = false;
  const heading = document.createElement('div'); heading.className = 'panel-heading account-title';
  const title = document.createElement('div'); const h3 = document.createElement('h3'); h3.textContent = account.username;
  const p = document.createElement('p'); p.textContent = 'Cargos ativos e registros anteriores desta conta.'; title.append(h3, p); heading.append(title);
  panel.append(heading);
  const form = document.createElement('form'); form.className = 'assign-form';
  const roleLabel = document.createElement('label'); roleLabel.textContent = 'Cargo'; const roleSelect = document.createElement('select'); roleSelect.name = 'roleKey'; roleSelect.required = true;
  for (const role of state.roles.filter(item => item.active)) { const option = document.createElement('option'); option.value = role.role_key; option.textContent = `${role.display_name} · ${roleRank(role)}`; roleSelect.append(option); }
  roleLabel.append(roleSelect);
  const scopeLabel = document.createElement('label'); scopeLabel.textContent = 'Escopo'; const scope = document.createElement('input'); scope.value = 'global'; scope.name = 'scopeKey'; scope.maxLength = 160; scope.required = true; scopeLabel.append(scope);
  const expiryLabel = document.createElement('label'); expiryLabel.textContent = 'Validade (opcional)'; const expiry = document.createElement('input'); expiry.type = 'datetime-local'; expiry.name = 'expiresAt'; expiryLabel.append(expiry);
  const reasonLabel = document.createElement('label'); reasonLabel.textContent = 'Motivo'; const reason = document.createElement('input'); reason.name = 'reason'; reason.maxLength = 500; reason.placeholder = 'Motivo obrigatório'; reason.required = true; reasonLabel.append(reason);
  const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'button button-primary'; submit.textContent = 'Atribuir cargo'; form.append(roleLabel, scopeLabel, expiryLabel, reasonLabel, submit);
  form.addEventListener('submit', async event => {
    event.preventDefault(); submit.disabled = true;
    try {
      const expiresAt = expiry.value ? new Date(expiry.value).toISOString() : null;
      await api('/staff/assignments', { method: 'POST', body: JSON.stringify({ username: account.username, roleKey: roleSelect.value, scopeKey: scope.value.trim(), reason: reason.value.trim(), expiresAt }) });
      showNotice(`Cargo ${roleSelect.selectedOptions[0].textContent} atribuído a ${account.username}.`);
      if (state.accountTarget === account.username.toLowerCase()) await lookupAccount(account.username);
    } catch (error) { showNotice(error.message, 'error'); submit.disabled = false; }
  });
  panel.append(form);
  const hint = document.createElement('p'); hint.className = 'role-table-hint'; hint.textContent = 'Deslize a tabela para ver todas as colunas.'; panel.append(hint);
  const tableWrap = document.createElement('div'); tableWrap.className = 'table-wrap'; tableWrap.tabIndex = 0; tableWrap.setAttribute('role', 'region'); tableWrap.setAttribute('aria-label', 'Cargos da conta; use a rolagem horizontal para ver todas as colunas'); const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Cargo</th><th>Escopo</th><th>Atribuído em</th><th>Validade</th><th>Estado</th><th></th></tr></thead>';
  const tbody = document.createElement('tbody');
  if (!assignments.length) { const row = tbody.insertRow(); const td = cell(row, 'Esta conta ainda não tem cargos atribuídos.', 'table-state'); td.colSpan = 6; }
  for (const assignment of assignments) {
    const row = tbody.insertRow(); cell(row, assignment.display_name); cell(row, assignment.scope_key);
    cell(row, formatDate(assignment.created_at)); cell(row, formatDate(assignment.expires_at));
    const active = !assignment.revoked_at && (!assignment.expires_at || new Date(assignment.expires_at).getTime() > Date.now());
    const badge = document.createElement('span'); badge.className = active ? 'pill pill-green' : 'pill pill-muted'; badge.textContent = active ? 'Ativo' : assignment.revoked_at ? 'Revogado' : 'Expirado';
    row.insertCell().append(badge);
    const actions = row.insertCell();
    if (active) actions.append(button('Revogar', 'button button-small button-danger-outline', async () => {
      const why = await askConfirmation({ title: 'Revogar atribuição', copy: `O cargo ${assignment.display_name} será removido de ${account.username}.`, actionLabel: 'Revogar cargo', warning: true });
      if (!why) return;
      try { await api(`/staff/assignments/${assignment.assignment_id}/revoke`, { method: 'POST', body: JSON.stringify({ reason: why }) }); showNotice('Cargo revogado e registrado na auditoria.'); if (state.accountTarget === account.username.toLowerCase()) await lookupAccount(account.username); }
      catch (error) { showNotice(error.message, 'error'); }
    }, `Revogar cargo ${assignment.display_name} de ${account.username}`));
  }
  table.append(tbody); tableWrap.append(table); panel.append(tableWrap);
}

async function lookupAccount(username) {
  const request = ++state.accountRequest;
  state.accountTarget = username.toLowerCase();
  const panel = byId('account-panel'); panel.hidden = false; panel.textContent = 'Consultando conta…';
  try {
    const [result, roleResult] = await Promise.all([api(`/staff/accounts/${encodeURIComponent(username.toLowerCase())}/roles`), api('/staff/roles')]);
    if (request !== state.accountRequest) return;
    state.roles = roleResult.roles || []; state.account = result.account; renderAssignments(result.account, result.assignments || []);
  } catch (error) { if (request !== state.accountRequest) return; panel.textContent = error.status === 404 ? 'Conta não encontrada.' : error.message; showNotice(error.message, 'error'); }
}

const auditActionLabels = {
  'role.created': 'Cargo criado', 'role.permission.granted': 'Permissão concedida', 'role.permission.revoked': 'Permissão removida',
  'role.assignment.granted': 'Cargo atribuído', 'role.assignment.revoked': 'Cargo revogado', 'owner.bootstrapped': 'Proprietário inicial definido',
  'owner.expired.bootstrap_recovered': 'Acesso inicial recuperado',
  'player.report.submitted': 'Denúncia enviada', 'player.report.claim': 'Denúncia assumida', 'player.report.resolve': 'Denúncia concluída',
  'player.report.dismiss': 'Denúncia arquivada', 'player.report.reopen': 'Denúncia reaberta',
  'player.sanction.warning': 'Advertência aplicada', 'player.sanction.mute': 'Silenciamento aplicado',
  'player.sanction.kick': 'Expulsão aplicada', 'player.sanction.suspend': 'Suspensão aplicada',
  'player.sanction.ban': 'Banimento aplicado', 'player.sanction.revoked': 'Sanção revogada',
  'player.wallet.adjusted': 'Saldo ajustado',
};

async function loadAudit(append = false) {
  const body = byId('audit-body');
  const more = byId('audit-more');
  if (append && (state.auditLoading || !state.auditBefore)) return;
  const request = ++state.auditRequest;
  state.auditLoading = true; more.disabled = true;
  if (!append) { state.auditBefore = null; more.hidden = true; body.innerHTML = '<tr><td colspan="5" class="table-state">Carregando histórico…</td></tr>'; }
  try {
    const query = new URLSearchParams({ limit: '50' }); if (append && state.auditBefore) query.set('before', String(state.auditBefore));
    const data = await api(`/staff/audit?${query}`); const events = data.events || [];
    if (request !== state.auditRequest) return;
    if (!append) body.replaceChildren();
    if (!events.length && !append) { const row = body.insertRow(); const td = cell(row, 'Nenhum evento de auditoria registrado.', 'table-state'); td.colSpan = 5; }
    for (const event of events) {
      const row = body.insertRow(); cell(row, formatDate(event.happened_at)); cell(row, auditActionLabels[event.action] || event.action);
      cell(row, event.actor_username || 'Sistema'); cell(row, event.target_username || '—'); cell(row, event.reason);
    }
    state.auditBefore = events.length ? Number(events.at(-1).event_id) : state.auditBefore;
    more.hidden = events.length < 50;
  } catch (error) {
    if (request !== state.auditRequest) return;
    if (!append || error.status === 403) { more.hidden = true; state.auditBefore = null; body.replaceChildren(); const row = body.insertRow(); const td = cell(row, error.status === 403 ? 'Seu cargo não tem acesso à auditoria.' : `Não foi possível carregar o histórico: ${error.message}`, 'table-state'); td.colSpan = 5; }
    showNotice(error.message, 'error');
  } finally {
    if (request === state.auditRequest) { state.auditLoading = false; more.disabled = false; }
  }
}

const reportStatusLabels = { open: 'Aberta', claimed: 'Em análise', resolved: 'Resolvida', dismissed: 'Arquivada' };
const reportCategoryLabels = { harassment: 'Assédio', cheating: 'Trapaça', exploit: 'Exploração de falha', impersonation: 'Falsidade', other: 'Outro' };

async function updateReport(report, action) {
  const labels = { claim: 'Assumir denúncia', resolve: 'Concluir análise', dismiss: 'Arquivar denúncia', reopen: 'Reabrir denúncia' };
  const reason = await askConfirmation({
    title: labels[action], copy: `${labels[action]} sobre ${report.target_username}. O motivo ficará registrado na auditoria.`,
    actionLabel: labels[action], warning: action === 'dismiss',
  });
  if (!reason) return;
  try {
    await api(`/staff/reports/${report.report_id}`, { method: 'POST', body: JSON.stringify({ action, reason }) });
    showNotice(`Denúncia ${reportStatusLabels[action === 'claim' ? 'claimed' : action === 'resolve' ? 'resolved' : action === 'dismiss' ? 'dismissed' : 'open'].toLowerCase()}.`);
    await loadReports();
  } catch (error) { showNotice(error.message, 'error'); }
}

async function loadReports() {
  const request = ++state.reportRequest;
  const body = byId('reports-body');
  body.innerHTML = '<tr><td colspan="6" class="table-state">Carregando denúncias…</td></tr>';
  try {
    const status = byId('reports-status').value;
    const data = await api(`/staff/reports?status=${encodeURIComponent(status)}&limit=100`);
    if (request !== state.reportRequest) return;
    const reports = data.reports || []; body.replaceChildren();
    if (!reports.length) { const row = body.insertRow(); const td = cell(row, 'Nenhuma denúncia neste estado.', 'table-state'); td.colSpan = 6; return; }
    for (const report of reports) {
      const row = body.insertRow();
      cell(row, formatDate(report.created_at)); cell(row, report.reporter_username || 'Conta removida');
      const target = cell(row, report.target_username); target.className = 'role-name';
      const details = cell(row, `${reportCategoryLabels[report.category] || report.category}: ${report.description}`, 'report-description');
      details.title = report.description;
      const statusCell = row.insertCell(); const pill = document.createElement('span'); pill.className = `pill ${report.status === 'open' ? 'pill-amber' : report.status === 'claimed' ? 'pill-blue' : 'pill-muted'}`; pill.textContent = reportStatusLabels[report.status] || report.status; statusCell.append(pill);
      const actions = row.insertCell(); actions.className = 'action-cell';
      if (state.capabilities.manageReports) {
        if (report.status === 'open') actions.append(button('Assumir', 'button button-small button-secondary', () => updateReport(report, 'claim')));
        if (report.status === 'claimed') {
          actions.append(button('Concluir', 'button button-small button-primary', () => updateReport(report, 'resolve')));
          actions.append(button('Arquivar', 'button button-small button-danger-outline', () => updateReport(report, 'dismiss')));
        }
        if (['resolved', 'dismissed'].includes(report.status)) actions.append(button('Reabrir', 'button button-small button-secondary', () => updateReport(report, 'reopen')));
      }
      if (state.capabilities.readPlayers) actions.append(button('Ver conta', 'button button-small button-secondary', () => {
        byId('sanction-username').value = report.target_username || '';
        lookupSanctions(report.target_username || '');
        byId('sanction-account').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }));
    }
  } catch (error) {
    if (request !== state.reportRequest) return;
    body.replaceChildren(); const row = body.insertRow(); const td = cell(row, error.status === 403 ? 'Seu cargo pode abrir o painel, mas não consultar a fila de denúncias.' : `Não foi possível carregar a fila: ${error.message}`, 'table-state'); td.colSpan = 6;
  }
}

const sanctionLabels = { warning: 'Advertência', mute: 'Silenciamento', kick: 'Expulsão', suspend: 'Suspensão temporária', ban: 'Banimento permanente' };
const sanctionPermission = { warning: 'warnPlayers', mute: 'mutePlayers', kick: 'kickPlayers', suspend: 'suspendPlayers', ban: 'banPlayers' };

function renderSanctions(account, sanctions) {
  const panel = byId('sanction-account'); panel.replaceChildren(); panel.hidden = false;
  const heading = document.createElement('div'); heading.className = 'sanction-account-heading';
  const title = document.createElement('h3'); title.textContent = account.username;
  const count = document.createElement('span'); count.className = 'pill pill-muted'; count.textContent = `${sanctions.length} registro${sanctions.length === 1 ? '' : 's'}`;
  heading.append(title, count); panel.append(heading);

  const sanctionKinds = Object.keys(sanctionLabels).filter(kind => state.capabilities[sanctionPermission[kind]]);
  if (sanctionKinds.length) {
    const form = document.createElement('form'); form.className = 'sanction-form';
    const kindLabel = document.createElement('label'); kindLabel.append(document.createTextNode('Medida'));
    const kind = document.createElement('select'); kind.name = 'kind'; kind.required = true;
    for (const key of sanctionKinds) { const option = document.createElement('option'); option.value = key; option.textContent = sanctionLabels[key]; kind.append(option); }
    kindLabel.append(kind);
    const durationLabel = document.createElement('label'); durationLabel.append(document.createTextNode('Duração'));
    const duration = document.createElement('select'); duration.name = 'duration';
    for (const [value, label] of [['15', '15 minutos'], ['60', '1 hora'], ['1440', '24 horas'], ['10080', '7 dias']]) { const option = document.createElement('option'); option.value = value; option.textContent = label; duration.append(option); }
    durationLabel.append(duration);
    const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'button button-danger'; submit.textContent = 'Aplicar medida';
    const updateDuration = () => { durationLabel.hidden = !['mute', 'suspend'].includes(kind.value); };
    kind.addEventListener('change', updateDuration); updateDuration();
    form.append(kindLabel, durationLabel, submit);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const selectedKind = kind.value;
      const expiresAt = ['mute', 'suspend'].includes(selectedKind) ? new Date(Date.now() + Number(duration.value) * 60_000).toISOString() : null;
      const confirm = await askConfirmation({
        title: `Aplicar ${sanctionLabels[selectedKind].toLowerCase()}`,
        copy: `${sanctionLabels[selectedKind]} em ${account.username}${expiresAt ? ` até ${formatDate(expiresAt)}` : ''}. Informe o motivo; ele ficará no histórico e na auditoria.`,
        actionLabel: 'Aplicar medida', warning: true,
      });
      if (!confirm) return;
      submit.disabled = true;
      try {
        await api('/staff/sanctions', { method: 'POST', body: JSON.stringify({ username: account.username, kind: selectedKind, expiresAt, reason: confirm }) });
        showNotice(`${sanctionLabels[selectedKind]} aplicada a ${account.username}.`);
        if (state.sanctionTarget === account.username.toLowerCase()) await lookupSanctions(account.username);
      } catch (error) { showNotice(error.message, 'error'); submit.disabled = false; }
    });
    panel.append(form);
  }

  const hint = document.createElement('p'); hint.className = 'role-table-hint'; hint.textContent = 'Deslize a tabela para ver o motivo e as ações.'; panel.append(hint);
  const tableWrap = document.createElement('div'); tableWrap.className = 'table-wrap'; tableWrap.tabIndex = 0; tableWrap.setAttribute('role', 'region'); tableWrap.setAttribute('aria-label', 'Histórico de sanções; use a rolagem horizontal para ver todas as colunas'); const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Medida</th><th>Aplicada em</th><th>Validade</th><th>Estado</th><th>Motivo</th><th></th></tr></thead>';
  const body = document.createElement('tbody');
  if (!sanctions.length) { const row = body.insertRow(); const td = cell(row, 'Esta conta não tem sanções registradas.', 'table-state'); td.colSpan = 6; }
  for (const sanction of sanctions) {
    const row = body.insertRow(); cell(row, sanctionLabels[sanction.kind] || sanction.kind); cell(row, formatDate(sanction.created_at));
    cell(row, sanction.expires_at ? formatDate(sanction.expires_at) : sanction.kind === 'ban' ? 'Permanente' : '—');
    const active = !sanction.lifted_at && (!sanction.expires_at || new Date(sanction.expires_at).getTime() > Date.now());
    const stateCell = row.insertCell(); const badge = document.createElement('span'); badge.className = `pill ${active ? 'pill-amber' : 'pill-muted'}`; badge.textContent = active ? 'Ativa' : sanction.lifted_at ? 'Revogada' : 'Expirada'; stateCell.append(badge);
    cell(row, sanction.reason, 'sanction-reason');
    const actions = row.insertCell();
    if (active && state.capabilities.revokeSanctions) actions.append(button('Revogar', 'button button-small button-danger-outline', async () => {
      const why = await askConfirmation({ title: 'Revogar sanção', copy: `${sanctionLabels[sanction.kind]} ativa de ${account.username} será removida.`, actionLabel: 'Revogar medida', warning: true });
      if (!why) return;
      try { await api(`/staff/sanctions/${sanction.sanction_id}/revoke`, { method: 'POST', body: JSON.stringify({ reason: why }) }); showNotice('Sanção revogada e registrada na auditoria.'); if (state.sanctionTarget === account.username.toLowerCase()) await lookupSanctions(account.username); }
      catch (error) { showNotice(error.message, 'error'); }
    }));
  }
  table.append(body); tableWrap.append(table); panel.append(tableWrap);
}

async function lookupSanctions(username) {
  const request = ++state.sanctionRequest;
  state.sanctionTarget = username.toLowerCase();
  const panel = byId('sanction-account'); panel.hidden = false; panel.textContent = 'Consultando sanções…';
  try {
    const data = await api(`/staff/accounts/${encodeURIComponent(username.toLowerCase())}/sanctions`);
    if (request !== state.sanctionRequest) return;
    renderSanctions({ username }, data.sanctions || []);
  } catch (error) { if (request !== state.sanctionRequest) return; panel.textContent = error.status === 404 ? 'Conta não encontrada.' : error.message; showNotice(error.message, 'error'); }
}

function setView(name) {
  for (const view of document.querySelectorAll('.view')) { const active = view.id === `view-${name}`; view.hidden = !active; view.classList.toggle('is-visible', active); }
  for (const item of document.querySelectorAll('.nav-item')) { const active = item.dataset.view === name; item.classList.toggle('is-active', active); if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current'); }
  if (name === 'economy') loadEconomy(); if (name === 'realms') loadRealms(); if (name === 'map' && state.capabilities.manageRealms) loadTerritories().catch(error => showNotice(error.message, 'error')); if (name === 'roles') loadRoles(); if (name === 'audit') loadAudit(); if (name === 'moderation' && state.capabilities.readReports) loadReports();
}

function appendTextLine(parent, label, value) {
  const p = document.createElement('p'); const strong = document.createElement('strong');
  strong.textContent = `${label}: `; p.append(strong, document.createTextNode(value)); parent.append(p);
}

byId('player-overview-form').addEventListener('submit', async event => {
  event.preventDefault(); const request = ++playerOverviewRequest; const result = byId('player-overview-result'); result.replaceChildren(); result.textContent = 'Carregando ficha…';
  try {
    const { player } = await api(`/staff/players/${encodeURIComponent(byId('player-overview-username').value.trim().toLowerCase())}`);
    if (request !== playerOverviewRequest) return;
    result.replaceChildren(); const heading = document.createElement('h3'); heading.textContent = `${player.displayName} · ${player.username}`; result.append(heading);
    appendTextLine(result, 'Progressão', `Nível ${player.progression.level} · ${player.progression.xp} XP · ${player.progression.attributePoints} pontos de atributo`);
    appendTextLine(result, 'Atributos', Object.entries(player.progression.attributes).map(([key, value]) => `${({force:'Força',attack:'Ataque',defense:'Defesa',agility:'Agilidade',magic:'Magia',speed:'Velocidade'})[key] || key}: ${value}`).join(' · '));
    appendTextLine(result, 'Carteira', `${player.wallet.gold} ouro · ${player.wallet.silver} prata · ${player.wallet.bronze} bronze`);
    appendTextLine(result, 'Aparência salva', player.appearance ? `corpo ${player.appearance.body_id}` : 'Ainda não cadastrada');
    appendTextLine(result, 'Imóveis', player.properties.map(item => `${item.building_id} / ${item.unit_number} (${item.mode === 'owned' ? 'próprio' : 'alugado'}${item.tenant_username ? `; locatário ${item.tenant_username}` : ''})`).join(' · ') || 'Nenhum imóvel registrado');
    appendTextLine(result, 'Contratos ativos', player.leases.map(item => `${item.building_id} / ${item.unit_number}; proprietário ${item.landlord_username || 'não informado'}; aluguel ${item.rent_bronze} bronze`).join(' · ') || 'Nenhum contrato ativo');
    if (state.capabilities.adjustEconomy) result.append(button('Ajustar carteira', 'button button-secondary', () => { byId('wallet-username').value = player.username; setView('economy'); byId('wallet-operation').focus(); }));
  } catch (error) { if (request === playerOverviewRequest) result.textContent = error.message; }
});

async function loadEconomy() {
  const request = ++economyOverviewRequest; const status = byId('economy-status'), body = byId('economy-goods'), banks = byId('economy-banks');
  status.textContent = 'Carregando mercado…'; body.replaceChildren(); banks.replaceChildren();
  try {
    const data = await api('/staff/economy-overview');
    if (request !== economyOverviewRequest) return;
    for (const good of data.goods) { const row = body.insertRow(); for (const value of [good.label || good.item_id, good.buy_price_bronze, good.sell_price_bronze, good.available, good.sold_last_7_days]) cell(row, value); }
    if (!data.goods.length) { const row = body.insertRow(); const td = cell(row, 'Nenhum produto registrado.', 'table-state'); td.colSpan = 5; }
    const heading = document.createElement('h3'); heading.textContent = 'Bancos e juros'; banks.append(heading);
    if (!data.banks.length) appendTextLine(banks, 'Bancos', 'Nenhum banco registrado');
    for (const bank of data.banks) appendTextLine(banks, bank.bank_id, bank.rate_bps == null ? 'Taxa ainda não calculada' : `${Number(bank.rate_bps) / 100}% · reserva ${bank.reserve_balance_bronze} bronze · crédito disponível ${bank.available_credit_bronze} bronze`);
    status.textContent = 'Os números refletem os registros do mercado, não toda a produção do mundo.';
  } catch (error) { if (request === economyOverviewRequest) status.textContent = error.message; }
}
byId('economy-refresh').addEventListener('click', loadEconomy);

byId('wallet-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const username = byId('wallet-username').value.trim().toLowerCase();
  const operation = byId('wallet-operation').value;
  const amount = Number(byId('wallet-amount').value);
  const adding = operation === 'credit';
  const reason = await askConfirmation({
    title: adding ? 'Adicionar saldo' : 'Retirar saldo',
    copy: `${adding ? 'Adicionar' : 'Retirar'} ${amount.toLocaleString('pt-BR')} moedas da conta ${username}. O ajuste será registrado na auditoria.`,
    actionLabel: adding ? 'Adicionar moedas' : 'Retirar moedas', warning: !adding,
  });
  if (!reason) return;
  const submit = form.querySelector('button[type="submit"]');
  const result = byId('wallet-result'); submit.disabled = true; result.hidden = false; result.textContent = 'Processando ajuste…';
  try {
    const data = await api('/staff/wallet', { method: 'POST', body: JSON.stringify({ username, operation, amount, reason }) });
    const wallet = data.wallet;
    result.textContent = `Saldo de ${data.username}: ${wallet.gold} ouro, ${wallet.silver} prata e ${wallet.bronze} bronze · ${wallet.total.toLocaleString('pt-BR')} moedas no total.`;
    showNotice('Saldo ajustado e registrado na auditoria.');
  } catch (error) { result.textContent = error.message; showNotice(error.message, 'error'); }
  finally { submit.disabled = false; }
});

document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => setView(item.dataset.view)));
byId('role-search').addEventListener('input', renderRoles);
byId('create-role-open').addEventListener('click', () => byId('role-dialog').showModal());
byId('role-cancel').addEventListener('click', () => byId('role-dialog').close('cancel'));
byId('role-dialog-close').addEventListener('click', () => byId('role-dialog').close('cancel'));
byId('confirm-cancel').addEventListener('click', () => byId('confirm-dialog').close('cancel'));
byId('confirm-dialog-close').addEventListener('click', () => byId('confirm-dialog').close('cancel'));
byId('role-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (event.submitter?.value === 'cancel') { byId('role-dialog').close('cancel'); return; }
  const form = event.currentTarget; const submit = byId('role-submit'); submit.disabled = true;
  const values = new FormData(form);
  try {
    const result = await api('/staff/roles', { method: 'POST', body: JSON.stringify({ roleKey: values.get('roleKey'), displayName: values.get('displayName'), hierarchyLevel: Number(values.get('hierarchyLevel')), reason: values.get('reason') }) });
    byId('role-dialog').close(); form.reset(); showNotice(`Cargo ${result.roleKey} criado sem permissões.`); await loadRoles();
  } catch (error) { showNotice(error.message, 'error'); } finally { submit.disabled = false; }
});
byId('lookup-form').addEventListener('submit', event => { event.preventDefault(); lookupAccount(byId('lookup-username').value.trim()); });
byId('audit-refresh').addEventListener('click', () => loadAudit());
byId('audit-more').addEventListener('click', () => loadAudit(true));
byId('reports-refresh').addEventListener('click', () => loadReports());
byId('reports-status').addEventListener('change', () => loadReports());
byId('sanction-lookup-form').addEventListener('submit', event => { event.preventDefault(); lookupSanctions(byId('sanction-username').value.trim()); });

const realmsState = { governments: [], selected: null };
const typeLabels = { realm: 'Império', kingdom: 'Reino', city: 'Cidade', castle: 'Castelo', village: 'Vila' };
const postJson = (url, body) => api(url, { method: 'POST', body: JSON.stringify(body) });
const newKey = () => `staff-${crypto.randomUUID()}`;
const bronzeText = value => `${Number(value ?? 0).toLocaleString('pt-BR')} bronze`;

// Splits `total` by weights; the remainder goes to the first target so the sum is exact.
function splitByWeights(total, weights) {
  const sum = weights.reduce((acc, item) => acc + item.weight, 0);
  if (!Number.isSafeInteger(total) || total < 1 || !weights.length || weights.some(item => !(item.weight > 0)) || sum <= 0) return null;
  const parts = weights.map(item => ({ governmentId: item.governmentId, amountBronze: Math.floor(total * item.weight / sum) }));
  parts[0].amountBronze += total - parts.reduce((acc, item) => acc + item.amountBronze, 0);
  return parts.every(item => item.amountBronze > 0) ? parts : null;
}

function realmsReason(id) { return byId(id).value.trim(); }

function setRealmsForms() {
  const caps = state.capabilities;
  byId('realms-issue-form').hidden = !caps.issueTreasury;
  byId('realms-distribute-form').hidden = !caps.distributeTreasury;
  for (const id of ['realms-wage-form', 'realms-tariff-form', 'realms-interest-form']) byId(id).hidden = !caps.manageGovernance;
  byId('realms-create-panel').hidden = !caps.manageRealms;
  byId('realms-budget-panel').hidden = !caps.manageGovernance;
}

async function selectGovernment(government) {
  realmsState.selected = government;
  byId('realms-selected-panel').hidden = false;
  byId('realms-selected-title').textContent = `${government.place_name || government.government_id} · ${typeLabels[government.government_type] || government.government_type}`;
  const policies = await api(`/staff/governments/${encodeURIComponent(government.government_id)}/policies`);
  const tariffs = policies.tariffs.map(item => `${item.direction === 'import' ? 'importação' : 'exportação'} ${item.base_rate_bps} bps`).join(' · ') || 'sem tarifas';
  const banks = policies.banks.map(item => `juros ${item.base_rate_bps} bps`).join(' · ') || 'sem banco';
  byId('realms-policies').textContent = `Salário mínimo: ${policies.wage ? bronzeText(policies.wage.wage_bronze) : 'não definido'} · ${tariffs} · ${banks}`;
  const select = byId('realms-interest-bank'); select.replaceChildren();
  for (const bank of policies.banks) { const option = document.createElement('option'); option.value = bank.bank_id; option.textContent = bank.bank_id; select.append(option); }
}

async function loadRealms() {
  const status = byId('realms-status'); status.textContent = 'Carregando…';
  setRealmsForms();
  try {
    const data = await api('/staff/governments');
    realmsState.governments = data.governments;
    const body = byId('realms-body'); body.replaceChildren();
    for (const item of data.governments) {
      const row = document.createElement('tr');
      cell(row, `${'— '.repeat(item.depth || 0)}${item.government_id}`);
      cell(row, typeLabels[item.government_type] || item.government_type);
      cell(row, item.place_name);
      cell(row, bronzeText(item.general_balance_bronze), 'number');
      cell(row, bronzeText(item.total_balance_bronze), 'number');
      const actions = document.createElement('td');
      actions.append(button('Selecionar', 'button button-small button-secondary', () => selectGovernment(item).catch(error => showNotice(error.message, 'error'))));
      row.append(actions); body.append(row);
    }
    status.textContent = data.governments.length ? '' : 'Nenhum governo cadastrado ainda.';
    if (state.capabilities.manageGovernance) {
      const budget = await api('/staff/budget-templates');
      const rows = byId('realms-budget-body'); rows.replaceChildren();
      for (const item of budget.templates) {
        const row = document.createElement('tr');
        cell(row, item.world_id); cell(row, typeLabels[item.government_type]); cell(row, bronzeText(item.starting_treasury_bronze));
        cell(row, bronzeText(item.starting_bank_capital_bronze)); cell(row, String(item.version)); rows.append(row);
      }
      byId('realms-budget-missing').textContent = budget.missing.length
        ? `Sem modelo: ${budget.missing.map(item => `${item.world_id}/${typeLabels[item.government_type]}`).join(', ')}.`
        : 'Todos os tipos em uso têm modelo de orçamento.';
    }
  } catch (error) { status.textContent = error.message; showNotice(error.message, 'error'); }
}

async function realmsAction(event, run, done) {
  event.preventDefault();
  const submit = event.submitter; if (submit) submit.disabled = true;
  try { await run(); showNotice(done); await loadRealms(); if (realmsState.selected) await selectGovernment(realmsState.selected); }
  catch (error) { showNotice(error.message, 'error'); }
  finally { if (submit) submit.disabled = false; }
}
const selectedId = () => { if (!realmsState.selected) throw new Error('Selecione um governo na tabela.'); return realmsState.selected.government_id; };
const intValue = id => Number(byId(id).value);

byId('realms-refresh').addEventListener('click', () => loadRealms());
byId('realms-issue-form').addEventListener('submit', event => realmsAction(event,
  () => postJson('/staff/treasury/issue', { governmentId: selectedId(), amountBronze: intValue('realms-issue-amount'), reason: realmsReason('realms-issue-reason'), idempotencyKey: newKey() }), 'Moedas emitidas.'));
byId('realms-distribute-form').addEventListener('submit', event => realmsAction(event, async () => {
  const weights = byId('realms-distribute-weights').value.split(',').map(part => part.trim()).filter(Boolean).map(part => {
    const [governmentId, weight] = part.split('='); return { governmentId: governmentId?.trim(), weight: Number(weight) };
  });
  const allocations = splitByWeights(intValue('realms-distribute-total'), weights);
  if (!allocations) throw new Error('Informe destinos no formato id=peso, com pesos positivos e valor suficiente para cada um.');
  await postJson('/staff/treasury/distribute', { sourceId: selectedId(), allocations, reason: realmsReason('realms-distribute-reason'), idempotencyKey: newKey() });
}, 'Valor distribuído.'));
byId('realms-wage-form').addEventListener('submit', event => realmsAction(event,
  () => postJson('/staff/policies/wage', { governmentId: selectedId(), wageBronze: intValue('realms-wage'), reason: realmsReason('realms-wage-reason') }), 'Salário atualizado.'));
byId('realms-tariff-form').addEventListener('submit', event => realmsAction(event,
  () => postJson('/staff/policies/tariff', { governmentId: selectedId(), direction: byId('realms-tariff-direction').value, baseBps: intValue('realms-tariff-base'), minBps: intValue('realms-tariff-min'), maxBps: intValue('realms-tariff-max'), reason: realmsReason('realms-tariff-reason') }), 'Tarifa atualizada.'));
byId('realms-interest-form').addEventListener('submit', event => realmsAction(event,
  () => postJson('/staff/policies/interest', { bankId: byId('realms-interest-bank').value, baseBps: intValue('realms-interest-base'), minBps: intValue('realms-interest-min'), maxBps: intValue('realms-interest-max'), reason: realmsReason('realms-interest-reason') }), 'Juros atualizados.'));
byId('realms-create-form').addEventListener('submit', event => realmsAction(event,
  () => postJson('/staff/governments', { governmentId: byId('realms-create-id').value.trim(), worldId: byId('realms-create-world').value.trim(), placeId: byId('realms-create-place').value.trim(), type: byId('realms-create-type').value, parent: byId('realms-create-parent').value.trim() || null, title: byId('realms-create-title').value.trim() || null, reason: realmsReason('realms-create-reason') }), 'Governo criado.'));
byId('realms-budget-form').addEventListener('submit', event => realmsAction(event,
  () => postJson('/staff/budget-templates', { worldId: byId('realms-budget-world').value.trim(), type: byId('realms-budget-type').value, treasuryBronze: intValue('realms-budget-treasury'), bankCapitalBronze: intValue('realms-budget-bank'), reason: realmsReason('realms-budget-reason') }), 'Modelo de orçamento salvo.'));

// Mapa e territórios. Coordenadas do cliente vão de 0 a MAP_SIZE; o servidor valida geometria, sobreposição e versão.
const MAP_SIZE = 10000;
const mapCanvas = byId('map-canvas');
const mapCtx = mapCanvas.getContext('2d');
const mapRasterCanvas = document.createElement('canvas');
mapRasterCanvas.width = mapCanvas.width; mapRasterCanvas.height = mapCanvas.height;
const mapRasterCtx = mapRasterCanvas.getContext('2d');
const mapState = { dimension: 'surface', territories: [], points: [], editing: null, version: 0, hover: null, transform: null, pixelScale: 1 };
const treeState = { revision: null, dimension: null, bounds: null, overview: null, details: null, trees: [], tiles: [], placements: [], removals: [], tileChanges: [], moves: [], moving: null };
const TREE_CHANGE_LIMIT = 200;
const TREE_PICK_RADIUS = 150;
const mapMode = () => document.querySelector('input[name="map-mode"]:checked').value;
const wholeMap = { left: 0, top: 0, right: MAP_SIZE, bottom: MAP_SIZE };
const mapBounds = () => mapMode() === 'territory' ? wholeMap : treeState.bounds || wholeMap;
const mapToCanvas = point => {
  if (mapMode() !== 'territory' && mapState.transform) {
    const base = worldMapToScreen(point, mapState.transform), centerX = mapCanvas.width / 2, centerY = mapCanvas.height / 2;
    return { x: centerX + (base.x - centerX) * mapState.pixelScale, y: centerY + (base.y - centerY) * mapState.pixelScale };
  }
  const { left, top, right, bottom } = mapBounds();
  return { x: (point.x - left) / (right - left) * mapCanvas.width,
    y: (point.y - top) / (bottom - top) * mapCanvas.height };
};
function canvasPointFromEvent(event) {
  const rect = mapCanvas.getBoundingClientRect(), bounds = mapBounds();
  const x = Math.max(0, Math.min(1 - Number.EPSILON, (event.clientX - rect.left) / rect.width)) * mapCanvas.width;
  const y = Math.max(0, Math.min(1 - Number.EPSILON, (event.clientY - rect.top) / rect.height)) * mapCanvas.height;
  if (mapMode() !== 'territory' && mapState.transform) {
    const centerX = mapCanvas.width / 2, centerY = mapCanvas.height / 2;
    const world = screenToWorldMap({ x: centerX + (x - centerX) / mapState.pixelScale, y: centerY + (y - centerY) / mapState.pixelScale }, mapState.transform);
    return mapMode() === 'tile' ? { x: Math.floor(world.x), y: Math.floor(world.y) } : world;
  }
  const project = mapMode() === 'territory' ? Math.round : value => value;
  return { x: project(bounds.left + x / mapCanvas.width * (bounds.right - bounds.left)),
    y: project(bounds.top + y / mapCanvas.height * (bounds.bottom - bounds.top)) };
}

function tracePath(points) {
  mapCtx.beginPath();
  points.forEach((point, index) => {
    const pixel = mapToCanvas(point);
    if (index === 0) mapCtx.moveTo(pixel.x, pixel.y); else mapCtx.lineTo(pixel.x, pixel.y);
  });
}

function renderMap() {
  const bounds = mapMode() === 'territory' ? wholeMap : treeState.bounds;
  if (treeState.overview && bounds) {
    const worldSize = treeState.overview.worldSize;
    const viewport = { worldSize, width: mapCanvas.width, height: mapCanvas.height };
    const zoom = worldSize / Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top);
    const centerX = (bounds.left + bounds.right) / 2, centerY = (bounds.top + bounds.bottom) / 2;
    const base = worldMapTransform({ ...viewport, zoom });
    const view = { zoom, panX: mapCanvas.width / 2 - (base.originX + centerX * base.scale), panY: mapCanvas.height / 2 - (base.originY + centerY * base.scale) };
    mapState.transform = worldMapTransform({ ...viewport, ...view });
    const detailFeatures = treeState.details ? { ...treeState.details, trees: [] } : null;
    mapRasterCtx.setTransform(1, 0, 0, 1, 0, 0);
    drawWorldMap(mapRasterCtx, { overview: treeState.overview, width: mapCanvas.width, height: mapCanvas.height,
      view, revealAll: true, detailFeatures, filters: { grid: true }, compact: false });
    const regionWidth = bounds.right - bounds.left, regionHeight = bounds.bottom - bounds.top;
    mapState.pixelScale = Math.max(.1, Math.min(24,
      (mapCanvas.width - 40) / (regionWidth * mapState.transform.scale),
      (mapCanvas.height - 40) / (regionHeight * mapState.transform.scale)));
    mapCtx.fillStyle = '#10191b'; mapCtx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
    mapCtx.imageSmoothingEnabled = false;
    const inset = (1 - mapState.pixelScale) / 2;
    mapCtx.drawImage(mapRasterCanvas, mapCanvas.width * inset, mapCanvas.height * inset,
      mapCanvas.width * mapState.pixelScale, mapCanvas.height * mapState.pixelScale);
  } else {
    mapState.transform = null; mapState.pixelScale = 1;
    mapCtx.fillStyle = '#1b1710'; mapCtx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
  }
  for (const territory of mapState.territories) {
    if (territory.territory_id === mapState.editing || !territory.geometry?.points?.length) continue;
    tracePath(territory.geometry.points);
    mapCtx.closePath();
    mapCtx.fillStyle = 'rgba(120, 160, 255, 0.12)';
    mapCtx.fill();
    mapCtx.strokeStyle = 'rgba(160, 190, 255, 0.6)';
    mapCtx.lineWidth = 1;
    mapCtx.stroke();
  }
  if (mapMode() !== 'territory') {
    drawTileChanges();
    drawTrees();
  }
  const points = mapState.points;
  if (points.length >= 2) {
    tracePath(points);
    if (points.length >= 3) mapCtx.closePath();
    mapCtx.fillStyle = 'rgba(255, 215, 0, 0.18)';
    if (points.length >= 3) mapCtx.fill();
    mapCtx.strokeStyle = '#ffd700';
    mapCtx.lineWidth = 2;
    mapCtx.stroke();
  }
  if (mapMode() === 'territory' && points.length && mapState.hover) {
    const last = mapToCanvas(points[points.length - 1]);
    const cursor = mapToCanvas(mapState.hover);
    mapCtx.setLineDash([6, 4]);
    mapCtx.beginPath(); mapCtx.moveTo(last.x, last.y); mapCtx.lineTo(cursor.x, cursor.y);
    mapCtx.strokeStyle = 'rgba(255, 215, 0, 0.7)'; mapCtx.stroke();
    mapCtx.setLineDash([]);
  }
  for (const point of points) {
    const pixel = mapToCanvas(point);
    mapCtx.beginPath(); mapCtx.arc(pixel.x, pixel.y, 3, 0, Math.PI * 2);
    mapCtx.fillStyle = '#ffd700'; mapCtx.fill();
  }
  byId('map-point-count').textContent = String(points.length);
}

const removedTreeIds = () => new Set(treeState.removals.map(removal => removal.targetId));
const pendingTreeChanges = () => treeState.placements.length + treeState.removals.length + treeState.tileChanges.length + treeState.moves.length;

function drawTileChanges() {
  const latest = new Map();
  for (const tile of [...treeState.tiles, ...treeState.tileChanges]) latest.set(`${tile.x},${tile.y}`, tile);
  const draw = (tile, color) => {
    const start = mapToCanvas(tile), end = mapToCanvas({ x: tile.x + 1, y: tile.y + 1 });
    mapCtx.fillStyle = color;
    mapCtx.fillRect(start.x, start.y, Math.max(1, end.x - start.x), Math.max(1, end.y - start.y));
  };
  for (const tile of latest.values()) {
    if (tile.surface !== 'reset') draw(tile, tile.surface === 'path' ? '#b48b5d' : '#6e9a58');
  }
  if (mapMode() === 'tile' && treeState.bounds && mapState.hover) {
    const surface = byId('tile-surface').value;
    const { left, right, top, bottom } = treeState.bounds;
    const color = right - left > 100 || bottom - top > 100 ? '#ed776b99'
      : surface === 'path' ? '#e4b68299' : surface === 'ground' ? '#9ad57699' : '#e4dfc999';
    draw(mapState.hover, color);
    const start = mapToCanvas(mapState.hover), end = mapToCanvas({ x: mapState.hover.x + 1, y: mapState.hover.y + 1 });
    mapCtx.strokeStyle = color;
    mapCtx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
  }
}

function drawTrees() {
  const removed = removedTreeIds();
  const moved = new Map(treeState.moves.map(move => [move.targetId, move]));
  for (const tree of treeState.trees) {
    if (removed.has(tree.targetId)) continue;
    const pixel = mapToCanvas(moved.get(tree.targetId) || tree);
    mapCtx.beginPath(); mapCtx.arc(pixel.x, pixel.y, 3, 0, Math.PI * 2);
    mapCtx.fillStyle = treeState.moving?.targetId === tree.targetId ? '#ffd70077'
      : moved.has(tree.targetId) ? '#8fe38f99' : tree.source === 'staff' ? '#8fe38f' : '#4f7a3f';
    mapCtx.fill();
  }
  for (const placement of treeState.placements) {
    const pixel = mapToCanvas(placement);
    mapCtx.beginPath(); mapCtx.arc(pixel.x, pixel.y, 5, 0, Math.PI * 2);
    mapCtx.strokeStyle = '#b6ff9e'; mapCtx.lineWidth = 2; mapCtx.stroke();
  }
  const hover = mapState.hover;
  if (!hover) return;
  const mode = mapMode();
  if (mode === 'tree-place' || mode === 'tree-move' && treeState.moving) {
    const pixel = mapToCanvas(hover);
    mapCtx.beginPath(); mapCtx.arc(pixel.x, pixel.y, 6, 0, Math.PI * 2);
    mapCtx.fillStyle = 'rgba(143, 227, 143, 0.45)'; mapCtx.fill();
  }
  if (mode === 'tree-remove') {
    const target = nearestPendingTree(hover);
    if (target) {
      const pixel = mapToCanvas(target);
      mapCtx.beginPath(); mapCtx.arc(pixel.x, pixel.y, 7, 0, Math.PI * 2);
      mapCtx.strokeStyle = '#ff6b6b'; mapCtx.lineWidth = 2; mapCtx.stroke();
    }
  }
}

function nearestPendingTree(point) {
  const removed = removedTreeIds();
  let best = null;
  const bounds = mapBounds();
  let bestDistance = Math.min(TREE_PICK_RADIUS, Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top) * .015);
  for (const tree of treeState.trees) {
    if (removed.has(tree.targetId) || treeState.moves.some(move => move.targetId === tree.targetId)) continue;
    const distance = Math.hypot(tree.x - point.x, tree.y - point.y);
    if (distance <= bestDistance) { best = tree; bestDistance = distance; }
  }
  return best;
}

function updateTreePending() {
  byId('trees-pending').textContent = String(pendingTreeChanges());
}

function requireLoadedTrees() {
  if (treeState.revision === null || treeState.dimension !== byId('map-dimension').value.trim()) { showNotice('Carregue a área antes de editar.', 'error'); return false; }
  if (pendingTreeChanges() >= TREE_CHANGE_LIMIT) { showNotice(`Limite de ${TREE_CHANGE_LIMIT} alterações por envio. Salve antes de continuar.`, 'error'); return false; }
  return true;
}

function addTreePlacement(point) {
  if (requireLoadedTrees()) treeState.placements.push(point);
  updateTreePending();
}

function addTreeRemoval(point) {
  if (!requireLoadedTrees()) return;
  const tree = nearestPendingTree(point);
  if (!tree) { showNotice('Nenhuma árvore perto do clique. Aproxime a área e tente de novo.', 'error'); return; }
  treeState.removals.push({ targetId: tree.targetId, x: tree.x, y: tree.y });
  updateTreePending();
}

function stageTreeMove(point) {
  if (!requireLoadedTrees()) return;
  if (!treeState.moving) {
    const tree = nearestPendingTree(point);
    if (tree?.source !== 'staff') {
      showNotice('Selecione uma árvore plantada pela equipe.', 'error');
      return;
    }
    treeState.moving = tree;
    showNotice('Selecione o destino da árvore.');
    return;
  }
  treeState.moves.push({ ...point, targetId: treeState.moving.targetId });
  treeState.moving = null;
  updateTreePending();
}

async function loadTrees() {
  const dimension = byId('map-dimension').value.trim();
  const params = new URLSearchParams({
    dimension,
    left: byId('trees-left').value, top: byId('trees-top').value,
    right: Number(byId('trees-left').value) + Number(byId('trees-width').value),
    bottom: Number(byId('trees-top').value) + Number(byId('trees-height').value),
  });
  const data = await api(`/staff/world/trees?${params}`);
  if (Number(params.get('right')) > data.worldSize || Number(params.get('bottom')) > data.worldSize) {
    throw new Error(`A área escolhida ultrapassa o limite do mundo (${data.worldSize} tiles).`);
  }
  mapState.dimension = dimension;
  treeState.overview = data.overview || null;
  treeState.details = data.details || null;
  treeState.revision = data.revision;
  treeState.dimension = dimension;
  treeState.bounds = Object.fromEntries(['left', 'top', 'right', 'bottom'].map(key => [key, Number(params.get(key))]));
  treeState.tiles = data.tiles || [];
  treeState.tileChanges = [];
  treeState.moves = [];
  treeState.moving = null;
  treeState.trees = data.trees || [];
  treeState.placements = [];
  treeState.removals = [];
  byId('trees-status').textContent = `${treeState.trees.length} árvores nesta área (revisão ${data.revision}).`
    + (data.truncated ? ' A lista foi limitada: reduza a área para ver as demais.' : '');
  updateTreePending();
  renderMap();
}

function resetMapEditor() {
  mapState.editing = null; mapState.version = 0; mapState.points = [];
  byId('map-territory-form').reset();
  byId('map-territory-id').readOnly = false;
  renderMap();
}

function selectTerritory(territory) {
  mapState.editing = territory.territory_id;
  mapState.version = territory.version;
  mapState.points = territory.geometry.points.map(point => ({ x: point.x, y: point.y }));
  byId('map-territory-id').value = territory.territory_id;
  byId('map-territory-id').readOnly = true;
  byId('map-realm').value = territory.realm_id;
  byId('map-name').value = territory.name;
  byId('map-tenure').value = territory.tenure;
  byId('map-archive').checked = false;
  renderMap();
}

function renderMapTable() {
  const body = byId('map-body'); body.replaceChildren();
  for (const territory of mapState.territories) {
    const row = document.createElement('tr');
    const cells = [territory.territory_id, territory.realm_id, territory.tenure, String(territory.geometry?.points?.length ?? 0), String(territory.version)];
    for (const text of cells) { const cell = document.createElement('td'); cell.textContent = text; row.append(cell); }
    const action = document.createElement('td');
    const button = document.createElement('button');
    button.className = 'button button-secondary'; button.type = 'button'; button.textContent = 'Editar';
    button.addEventListener('click', () => selectTerritory(territory));
    action.append(button); row.append(action);
    body.append(row);
  }
  byId('map-status').textContent = mapState.territories.length ? `${mapState.territories.length} territórios ativos.` : 'Nenhum território nesta dimensão.';
}

async function loadTerritories() {
  const dimension = byId('map-dimension').value.trim();
  const realm = byId('map-realm-filter').value.trim();
  const params = new URLSearchParams({ dimension });
  if (realm) params.set('realm', realm);
  const data = await api(`/staff/territories?${params}`);
  mapState.dimension = dimension;
  mapState.territories = data.territories || [];
  renderMapTable();
  renderMap();
}

mapCanvas.addEventListener('click', event => {
  const point = canvasPointFromEvent(event);
  const mode = mapMode();
  if (mode === 'territory') mapState.points.push(point);
  else if (mode === 'tile') {
    if (!requireLoadedTrees()) return;
    const { left, right, top, bottom } = mapBounds();
    if (right - left > 100 || bottom - top > 100) {
      showNotice('Carregue uma área de até 100×100 para selecionar um tile.', 'error');
      return;
    }
    treeState.tileChanges.push({ ...point, surface: byId('tile-surface').value });
    updateTreePending();
  } else if (mode === 'tree-place') addTreePlacement(point);
  else if (mode === 'tree-move') stageTreeMove(point);
  else addTreeRemoval(point);
  renderMap();
});
document.querySelectorAll('input[name="map-mode"]').forEach(input => input.addEventListener('change', () => { mapState.hover = null; treeState.moving = null; renderMap(); }));
byId('tile-surface').addEventListener('change', renderMap);
mapCanvas.addEventListener('pointermove', event => { mapState.hover = canvasPointFromEvent(event); renderMap(); });
mapCanvas.addEventListener('mouseleave', () => { mapState.hover = null; renderMap(); });
byId('map-undo').addEventListener('click', () => {
  const mode = mapMode();
  if (mode === 'territory') mapState.points.pop();
  else if (mode === 'tile') treeState.tileChanges.pop();
  else if (mode === 'tree-place') treeState.placements.pop();
  else if (mode === 'tree-move') {
    if (treeState.moving) treeState.moving = null;
    else treeState.moves.pop();
  } else treeState.removals.pop();
  updateTreePending();
  renderMap();
});
byId('trees-load-form').addEventListener('submit', event => {
  event.preventDefault();
  loadTrees().catch(error => showNotice(error.message, 'error'));
});
byId('trees-discard').addEventListener('click', () => {
  treeState.tileChanges = [];
  treeState.moves = [];
  treeState.moving = null;
  treeState.placements = [];
  treeState.removals = [];
  updateTreePending();
  renderMap();
});
byId('trees-save').addEventListener('click', async event => {
  if (!pendingTreeChanges()) { showNotice('Nenhuma alteração de mapa pendente.', 'error'); return; }
  const submit = event.currentTarget; submit.disabled = true;
  try {
    const result = await postJson('/staff/world/trees', { dimension: treeState.dimension, expectedRevision: treeState.revision, placements: treeState.placements, removals: treeState.removals, tiles: treeState.tileChanges, moves: treeState.moves });
    showNotice(`Alterações salvas. Revisão ${result.revision}.`);
    await loadTrees();
  } catch (error) { showNotice(error.message, 'error'); }
  finally { submit.disabled = false; }
});
byId('map-clear').addEventListener('click', () => resetMapEditor());
byId('map-load-form').addEventListener('submit', event => {
  event.preventDefault();
  loadTerritories().catch(error => showNotice(error.message, 'error'));
});
byId('map-territory-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (mapState.points.length < 3) { showNotice('Marque pelo menos 3 pontos no mapa para formar o território.', 'error'); return; }
  const submit = event.submitter; if (submit) submit.disabled = true;
  try {
    await postJson('/staff/territories', {
      territoryId: byId('map-territory-id').value.trim(),
      realmId: byId('map-realm').value.trim(),
      dimensionId: mapState.dimension,
      name: byId('map-name').value.trim(),
      tenure: byId('map-tenure').value,
      geometry: { type: 'polygon', points: mapState.points },
      expectedVersion: mapState.version,
      archive: byId('map-archive').checked,
      reason: byId('map-reason').value.trim(),
    });
    showNotice('Território salvo.');
    resetMapEditor();
    await loadTerritories();
  } catch (error) { showNotice(error.message, 'error'); }
  finally { if (submit) submit.disabled = false; }
});
renderMap();
updateTreePending();

async function initializePanel() {
  try {
    state.capabilities = (await api('/staff/capabilities')).capabilities || {};
    const access = {
      moderation: state.capabilities.readReports || state.capabilities.readPlayers,
      roles: state.capabilities.manageRoles, assignments: state.capabilities.manageRoles, audit: state.capabilities.readAudit,
      economy: state.capabilities.adjustEconomy, players: state.capabilities.inspectPlayers, sky: state.capabilities.setSky,
      realms: state.capabilities.auditTreasury || state.capabilities.manageGovernance,
      map: state.capabilities.manageRealms || state.capabilities.operateWorld,
    };
    const canEditWorld = state.capabilities.operateWorld === true;
    const canEditTerritories = state.capabilities.manageRealms === true;
    byId('trees-panel').hidden = !canEditWorld;
    byId('map-territory-form').parentElement.hidden = !canEditTerritories;
    if (!canEditTerritories) byId('trees-discard').before(byId('map-undo'));
    byId('map-realm-filter').closest('label').hidden = !canEditTerritories;
    byId('map-load-form').querySelector('button').hidden = !canEditTerritories;
    for (const mode of document.querySelectorAll('input[name="map-mode"]')) {
      mode.closest('label').hidden = mode.value === 'territory' ? !canEditTerritories : !canEditWorld;
    }
    byId('tile-surface').closest('label').hidden = !canEditWorld;
    if (canEditWorld && !canEditTerritories) document.querySelector('input[value="tile"][name="map-mode"]').checked = true;
    renderMap();
    byId('reports-panel').hidden = !state.capabilities.readReports;
    byId('reports-refresh').hidden = !state.capabilities.readReports;
    byId('moderation-player-panel').hidden = !state.capabilities.readPlayers;
    if (!state.capabilities.readReports) byId('moderation-description').textContent = 'Consulte o histórico das contas que seu cargo pode acessar.';
    else if (!state.capabilities.readPlayers) byId('moderation-description').textContent = 'Consulte as denúncias disponíveis para o seu cargo.';
    if (!Object.values(sanctionPermission).some(key => state.capabilities[key]) && !state.capabilities.revokeSanctions) {
      byId('sanction-description').textContent = 'Consulte o histórico de sanções da conta.';
    }
    for (const item of document.querySelectorAll('.nav-item')) item.hidden = !access[item.dataset.view];
    for (const view of document.querySelectorAll('.view')) view.hidden = true;
    const first = ['players', 'moderation', 'roles', 'assignments', 'audit', 'economy', 'sky', 'realms', 'map'].find(view => access[view]);
    if (!first) throw Object.assign(new Error('Seu cargo não tem ferramentas disponíveis.'), { status: 403 });
    setView(first);
  } catch (error) {
    showNotice(error.message, 'error');
    for (const view of document.querySelectorAll('.view')) view.hidden = true;
  }
}
// Owner sky controls: only the owner's account can reach these calls (the server checks the '*' permission).
const skyLevels = { sunIntensity: [0, 2, 1, 'Intensidade do sol'], moonIntensity: [0, 1, 0.5, 'Intensidade da lua'], darkness: [0, 1, 0.6, 'Escuridão da noite'] };
function syncSkyFields() {
  const key = byId('sky-control').value;
  const shown = key === 'hour' ? 'hour' : key === 'weather' ? 'weather' : key === 'moonColor' ? 'color' : 'level';
  for (const element of document.querySelectorAll('[data-sky-field]')) element.hidden = element.dataset.skyField !== shown;
  if (skyLevels[key]) {
    const [min, max, value, name] = skyLevels[key];
    const input = byId('sky-level');
    input.min = String(min); input.max = String(max); input.value = String(value);
    byId('sky-level-name').textContent = name;
  }
}
byId('sky-control').addEventListener('change', syncSkyFields);
byId('sky-form').addEventListener('submit', async event => {
  event.preventDefault();
  const key = byId('sky-control').value;
  const scope = document.querySelector('input[name="sky-scope"]:checked').value;
  const value = key === 'hour' ? Number(byId('sky-hour').value)
    : key === 'weather' ? { kind: byId('sky-weather').value, intensity: Number(byId('sky-intensity').value), extremeSun: byId('sky-extreme').checked }
      : key === 'moonColor' ? byId('sky-color').value
        : Number(byId('sky-level').value);
  try {
    await api('/staff/sky', { method: 'POST', body: JSON.stringify({ override: { key, value, scope } }) });
    byId('sky-status').textContent = 'Ajuste aplicado. Os jogadores veem a mudança em instantes.';
  } catch (error) { byId('sky-status').textContent = error.message; }
});
byId('sky-clear').addEventListener('click', async () => {
  try {
    await api('/staff/sky', { method: 'POST', body: JSON.stringify({ clear: true }) });
    byId('sky-status').textContent = 'Ajustes removidos.';
  } catch (error) { byId('sky-status').textContent = error.message; }
});
syncSkyFields();
initializePanel();
