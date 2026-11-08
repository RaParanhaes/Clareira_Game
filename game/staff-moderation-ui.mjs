// On-demand staff tools. No polling; all mutations remain permission checked and audited by the API.
export function createStaffModeration({ dialog, panels, capabilities, generation }) {
  const doc = dialog.ownerDocument, $ = id => dialog.querySelector(`#${id}`);
  const section = $('staff-tools-moderation'), open = $('staff-moderation-open');
  const feedback = $('staff-moderation-status'), list = $('staff-moderation-list');
  const form = $('staff-moderation-form'), review = $('staff-moderation-review');
  const permissions = { warning: 'warnPlayers', mute: 'mutePlayers', kick: 'kickPlayers', suspend: 'suspendPlayers', ban: 'banPlayers' };
  const labels = { warning: 'Advertir', mute: 'Silenciar', kick: 'Expulsar', suspend: 'Suspender', ban: 'Banir' };
  const historyLabels = { warning: 'Advertência', mute: 'Silenciamento', kick: 'Expulsão', suspend: 'Suspensão', ban: 'Banimento' };
  const reportLabels = { open: 'Aberta', claimed: 'Em análise', resolved: 'Concluída', dismissed: 'Arquivada' };
  function sanctionState(record) {
    if (record.lifted_at) return 'Revogada';
    if (record.expires_at && new Date(record.expires_at).getTime() <= Date.now()) return 'Expirada';
    if (record.kind === 'warning' || (record.kind === 'kick' && !record.expires_at)) return 'Registrada';
    return record.kind === 'ban' ? 'Ativa · permanente' : 'Ativa';
  }
  function lockForm() {
    for (const control of form.elements) control.disabled = pending;
    $('staff-moderation-confirm').disabled = pending;
  }
  function invalidateReview() {
    if (!draft || pending) return;
    draft = null; review.hidden = true; feedback.textContent = 'Dados alterados. Revise novamente a medida antes de confirmar.';
  }
  form.addEventListener('input', invalidateReview);
  form.addEventListener('change', invalidateReview);
  let request = 0, draft = null, pending = false, resultPermission = null;
  const node = (tag, text) => { const el = doc.createElement(tag); el.textContent = text; return el; };
  const active = (serial, session) => serial === request && session === generation() && panels.current === 'staff-tools' && panels.route === 'moderation';
  async function api(path, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`/dev/staff${path}`, { cache: 'no-store', signal: controller.signal,
        ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'A operação foi recusada pelo servidor.');
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('O servidor demorou para responder.');
      if (error instanceof TypeError || error instanceof SyntaxError) throw new Error('Não foi possível confirmar a resposta do servidor.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function reset() { request++; draft = null; resultPermission = null; review.hidden = true; list.replaceChildren(); feedback.textContent = ''; form.reset(); $('staff-player-lookup').reset(); lockForm(); if (pending) feedback.textContent = 'Há uma medida aguardando resposta do servidor. Consulte o histórico antes de repetir.'; }
  function sync(route) {
    const caps = capabilities();
    if (draft && !caps?.[permissions[draft.kind]]) invalidateReview();
    if (resultPermission && !caps?.[resultPermission]) { request++; list.replaceChildren(); feedback.textContent = 'Seu acesso a esta consulta foi removido.'; resultPermission = null; }
    open.hidden = !caps?.readPlayers && !caps?.readReports;
    section.hidden = route !== 'moderation';
    $('staff-player-lookup').hidden = !caps?.readPlayers;
    $('staff-reports-load').hidden = !caps?.readReports;
    form.hidden = !caps?.readPlayers || !Object.values(permissions).some(permission => caps?.[permission]);
    const select = form.elements.kind, old = select.value;
    select.replaceChildren(...Object.keys(permissions).filter(kind => caps?.[permissions[kind]]).map(kind => { const option = node('option', labels[kind]); option.value = kind; return option; }));
    if ([...select.options].some(option => option.value === old)) select.value = old;
    updateDuration(); lockForm();
  }
  function updateDuration() { $('staff-sanction-duration').hidden = !['mute', 'suspend'].includes(form.elements.kind.value); }
  form.elements.kind.addEventListener('change', updateDuration);
  open.addEventListener('click', () => { reset(); panels.navigate('moderation'); });
  $('staff-moderation-back').addEventListener('click', () => { reset(); panels.back(); });
  async function load(path, type) {
    if (pending) return;
    const permission = type === 'reports' ? 'readReports' : 'readPlayers';
    resultPermission = permission;
    const serial = ++request, session = generation(); list.replaceChildren(); feedback.textContent = 'Consultando servidor…';
    try {
      const result = await api(path); if (!active(serial, session)) return;
      if (!capabilities()?.[permission]) { list.replaceChildren(); feedback.textContent = 'Seu acesso a esta consulta foi removido.'; return; }
      const records = (type === 'reports' ? result.reports : result.sanctions) || [];
      for (const record of records) {
        const card = node('li', '');
        card.append(node('strong', type === 'reports' ? `${record.target_username || 'Conta removida'} · ${reportLabels[record.status] || record.status}` : `${historyLabels[record.kind] || record.kind} · ${sanctionState(record)}`),
          node('p', type === 'reports' ? record.description : record.reason));
        if (record.expires_at) card.append(node('small', `Validade: ${new Date(record.expires_at).toLocaleString('pt-BR')}`));
        list.append(card);
      }
      feedback.textContent = records.length ? `${records.length} registros exibidos${type === 'reports' ? ' · denúncias abertas (até 20)' : ''}.` : 'Nenhum registro encontrado.';
    } catch (error) { if (active(serial, session)) feedback.textContent = error.message; }
  }
  $('staff-player-lookup').addEventListener('submit', event => {
    event.preventDefault(); const lookup = event.currentTarget;
    if (pending || !lookup.reportValidity() || !capabilities()?.readPlayers) return;
    const username = lookup.elements.username.value.trim().toLowerCase(); invalidateReview(); form.elements.username.value = username;
    void load(`/accounts/${encodeURIComponent(username)}/sanctions`, 'sanctions');
  });
  $('staff-reports-load').addEventListener('click', () => { if (capabilities()?.readReports) void load('/reports?status=open&limit=20', 'reports'); });
  form.addEventListener('submit', event => {
    event.preventDefault(); if (pending || !form.reportValidity()) return;
    const username = form.elements.username.value.trim().toLowerCase(), kind = form.elements.kind.value, reason = form.elements.reason.value.trim();
    if (!capabilities()?.[permissions[kind]] || !reason) return;
    draft = { username, kind, reason, duration: ['mute', 'suspend'].includes(kind) ? Number(form.elements.duration.value) : null };
    $('staff-moderation-summary').textContent = `${labels[kind]} @${username}${draft.duration ? ` por ${draft.duration} minutos` : kind === 'ban' ? ' permanentemente' : kind === 'kick' ? ' (retorno bloqueado por 30 segundos)' : ''}. Motivo: ${reason}`;
    review.hidden = false; $('staff-moderation-confirm').focus();
  });
  $('staff-moderation-cancel').addEventListener('click', () => { draft = null; review.hidden = true; form.querySelector('button').focus(); });
  $('staff-moderation-confirm').addEventListener('click', async () => {
    if (!draft || pending || !capabilities()?.[permissions[draft.kind]]) return;
    const action = draft; draft = null; const serial = ++request, session = generation(); pending = true;
    lockForm(); review.setAttribute('aria-busy', 'true'); feedback.textContent = 'Aguardando confirmação do servidor…';
    try {
      await api('/sanctions', { username: action.username, kind: action.kind, reason: action.reason, expiresAt: action.duration ? new Date(Date.now() + action.duration * 60000).toISOString() : null });
      if (active(serial, session)) { feedback.textContent = 'Medida aplicada e registrada na auditoria.'; form.reset(); review.hidden = true; }
    } catch (error) { if (active(serial, session)) { feedback.textContent = `${error.message} Consulte o histórico antes de tentar novamente.`; review.hidden = true; } }
    finally {
      pending = false; lockForm(); review.removeAttribute('aria-busy');
      if (session === generation() && serial !== request && panels.current === 'staff-tools' && panels.route === 'moderation')
        feedback.textContent = 'O envio anterior terminou. Consulte o histórico para confirmar o resultado antes de repetir.';
    }
  });
  return { sync, reset };
}
