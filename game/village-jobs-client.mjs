// Regras de apresentação dos ofícios da vila no cliente.
// Tudo aqui é leitura do snapshot autoritativo (`villageJobs`) ou exibição.
// O cliente nunca calcula pagamento, cota ou conclusão: só decide quais
// botões mostrar e explica por que uma ação está indisponível. O servidor
// refaz alcance, tempo, cota e crédito em cada ação.

// Mesmos rótulos de game/village-jobs.mjs (VILLAGE_JOB_POINTS).
export const VILLAGE_JOB_POINT_LABELS = Object.freeze({
  board: 'Quadro da Recepção',
  delivery: 'Entrega da Pousada dos Pinheiros',
  hearth: 'Fogueira da vila',
});

const JOB_DIRECTIONS = Object.freeze({
  carrier: Object.freeze({
    start: 'Pegue a caixa no quadro da Recepção.',
    finish: 'Leve a caixa até a porta da Pousada dos Pinheiros e entregue no ponto.',
  }),
  firekeeper: Object.freeze({
    start: 'Comece junto à fogueira acesa.',
    finish: 'Fique junto à fogueira sem apagar o fogo. Receba o pagamento no ponto da fogueira.',
  }),
});

export function formatBronze(amount) {
  const value = Math.trunc(Number(amount) || 0);
  return `${value} ${value === 1 ? 'bronze' : 'bronzes'}`;
}

export function normalizeVillageJobs(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.jobs)) return null;
  return {
    dayKey: typeof snapshot.dayKey === 'string' ? snapshot.dayKey : null,
    jobs: snapshot.jobs.filter(job => job && typeof job.id === 'string'),
    active: snapshot.active && typeof snapshot.active === 'object' ? snapshot.active : null,
    lastPayment: snapshot.lastPayment && typeof snapshot.lastPayment === 'object' ? snapshot.lastPayment : null,
    requiresAccount: snapshot.requiresAccount === true,
  };
}

// Só para exibição. `readyAt` vem do servidor; o relógio local apenas mostra a contagem.
export function villageJobRemainingMs(active, nowMs) {
  if (!active || !Number.isFinite(active.readyAt) || !Number.isFinite(nowMs)) return null;
  return Math.max(0, active.readyAt - nowMs);
}

export function villageJobProgress(active, nowMs) {
  if (!active || !Number.isFinite(active.startedAt) || !Number.isFinite(active.readyAt)
    || active.readyAt <= active.startedAt || !Number.isFinite(nowMs)) return 0;
  return Math.min(1, Math.max(0, (nowMs - active.startedAt) / (active.readyAt - active.startedAt)));
}

export function formatJobCountdown(remainingMs) {
  if (!Number.isFinite(remainingMs)) return '';
  if (remainingMs <= 0) return 'Pronto';
  const seconds = Math.ceil(remainingMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function villageJobStageLabel(active) {
  if (!active) return '';
  return active.stage === 'carrying' ? 'Caixa a caminho da Pousada' : 'Turno junto à fogueira';
}

export function villageJobDirections(job) {
  return JOB_DIRECTIONS[job?.id] || { start: '', finish: '' };
}

// Estado do botão de início. `pointId` é o ponto onde o painel foi aberto.
export function villageJobStartState({ job, snapshot, pointId, nearPoint = true, guest = false }) {
  if (!job || !snapshot) return { enabled: false, reason: 'Trabalhos indisponíveis agora.' };
  if (guest || snapshot.requiresAccount) return { enabled: false, reason: 'Entre com uma conta para trabalhar.' };
  if (snapshot.active) return { enabled: false, reason: 'Você já tem um turno ativo. Conclua ou cancele antes.' };
  if (Number.isFinite(job.remaining) && job.remaining <= 0) return { enabled: false, reason: 'Cota de hoje concluída. Volte amanhã.' };
  if (pointId !== job.startPointId) {
    return { enabled: false, reason: `Comece em ${VILLAGE_JOB_POINT_LABELS[job.startPointId] || 'outro ponto'}.` };
  }
  if (!nearPoint) return { enabled: false, reason: 'Aproxime-se do ponto para começar.' };
  return { enabled: true, reason: '' };
}

// Estado do botão de conclusão no ponto de destino. O relógio local só
// habilita o botão cedo ou tarde; a conclusão real é validada no servidor.
export function villageJobFinishState({ active, pointId, nowMs, nearPoint = true, guest = false }) {
  if (!active) return { enabled: false, reason: '' };
  if (guest) return { enabled: false, reason: 'Entre com uma conta para receber.' };
  if (pointId !== active.targetId) {
    return { enabled: false, reason: `Leve até ${VILLAGE_JOB_POINT_LABELS[active.targetId] || 'o ponto indicado'}.` };
  }
  if (!nearPoint) return { enabled: false, reason: 'Aproxime-se do ponto para concluir.' };
  if (villageJobRemainingMs(active, nowMs) > 0) return { enabled: false, reason: 'Ainda não está pronto.' };
  return { enabled: true, reason: '' };
}

export function villageJobCancelAvailable(active, guest = false) {
  return Boolean(active) && !guest;
}

// Aviso de pagamento só existe quando o servidor informa um lastPayment.
export function villageJobPaymentNotice(lastPayment) {
  if (!lastPayment || !Number.isFinite(lastPayment.amount)) return '';
  return `Pagamento recebido: ${formatBronze(lastPayment.amount)} na carteira.`;
}

export function villageJobTurnsLine(job) {
  if (!job) return '';
  const remaining = Number.isFinite(job.remaining) ? job.remaining : 0;
  const limit = Number.isFinite(job.dailyLimit) ? job.dailyLimit : remaining;
  return `Turnos de hoje: ${remaining} de ${limit} restantes.`;
}

// Pacote avulso {type:'villageJobs', villageJobs}: devolve o snapshot a aplicar
// (pode ser null para limpar), ou undefined quando não há o campo ou o pacote
// é de outro tipo. O cliente aplica o mesmo snapshot que o pacote normal de estado.
export function villageJobsPacketSnapshot(message) {
  if (message?.type !== 'villageJobs' || !Object.hasOwn(message, 'villageJobs')) return undefined;
  return message.villageJobs || null;
}
