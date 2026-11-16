import { randomUUID } from 'node:crypto';
import { gameDayKey } from '../game/game-calendar.mjs';
import { VILLAGE_JOBS, villageJobAtPoint, villageJobById, villageJobSnapshot, villageJobWithinDistance } from '../game/village-jobs.mjs';

export function createVillageJobsServer({ now = Date.now, storage, queueWrite = (_profileId, fn) => fn(), isHearthLit = () => true } = {}) {
  const activeByProfile = new Map();
  const paymentByProfile = new Map();
  const movement = player => {
    const profileId = player.accountId, running = activeByProfile.get(profileId);
    if (!running || running.jobId !== 'firekeeper') return;
    if (player.location !== 'clearing' || player.dimensionId !== running.dimensionId
        || !villageJobWithinDistance(player.position, running.origin, 2.4) || !isHearthLit(player.dimensionId, now())) activeByProfile.delete(profileId);
    else running.lastPositionAt = now();
  };
  const sweep = () => {
    for (const [profileId, running] of activeByProfile) {
      if (running.jobId === 'firekeeper') {
        const player = running.playerRef;
        if (!isHearthLit(running.dimensionId, now()) || !player || player.location !== 'clearing'
            || player.dimensionId !== running.dimensionId || !villageJobWithinDistance(player.position, running.origin, 2.4)) activeByProfile.delete(profileId);
        else running.lastPositionAt = now();
      }
    }
  };

  const snapshot = async player => {
    const dayKey = gameDayKey(now());
    const completions = player.accountId && storage?.getVillageJobCompletions
      ? await storage.getVillageJobCompletions(player.accountId, dayKey) : [];
    return villageJobSnapshot({ dayKey, completions, active:player.accountId ? publicActive(activeByProfile.get(player.accountId) || null) : null,
      lastPayment:player.accountId ? paymentByProfile.get(player.accountId) || null : null, requiresAccount:!player.accountId });
  };

  const cancelForProfile = profileId => { if (profileId) activeByProfile.delete(profileId); };

  const handle = async (player, message) => {
    const profileId = player.accountId;
    for (const [id, running] of activeByProfile) {
      if (running.jobId !== 'firekeeper' || id !== profileId) continue;
      if (player.location !== 'clearing' || player.dimensionId !== running.dimensionId
          || !villageJobWithinDistance(player.position, running.origin, 2.4) || !isHearthLit(player.dimensionId, now())) {
        activeByProfile.delete(id);
        return { ok:false, notice:'O turno da fogueira foi cancelado ao se afastar ou apagar o fogo.' };
      }
      running.lastPositionAt = now();
    }
    if (message.name === 'villageJobStart') {
      const job = villageJobById(message.jobId);
      if (!job) return { ok:false, notice:'Esse ofício não existe.' };
      if (!profileId) return { ok:false, notice:'É preciso ter uma conta para trabalhar.' };
      if (activeByProfile.has(profileId)) return { ok:false, notice:'Você já está em um turno. Termine ou cancele antes.' };
      const point = job.startPointId;
      if (player.location !== 'clearing' || !villageJobAtPoint(point, player.position, player.dimensionId, 'surface')) return { ok:false, notice:'Aproxime-se do ponto de início do ofício.' };
      if (job.id === 'firekeeper' && !isHearthLit(player.dimensionId, now())) return { ok:false, notice:'A fogueira precisa estar acesa durante todo o turno.' };
      const runId = randomUUID(), startedAt = now();
      const active = { runId, jobId:job.id, stage:job.id === 'carrier' ? 'carrying' : 'working', startedAt, readyAt:startedAt + job.minDurationMs, targetId:job.finishPointId, dimensionId:player.dimensionId, origin:{x:player.position.x,y:player.position.y}, lastPositionAt:startedAt, playerRef:player };
      activeByProfile.set(profileId, active);
      return { ok:true, notice:'Turno iniciado.', active:publicActive(active) };
    }
    if (!profileId) return { ok:false, notice:'É preciso ter uma conta para trabalhar.' };
    const active = activeByProfile.get(profileId);
    if (message.name === 'villageJobCancel') {
      if (!active || (message.runId && message.runId !== active.runId)) return { ok:false, notice:'Esse turno não está ativo.' };
      activeByProfile.delete(profileId); return { ok:true, notice:'Turno cancelado sem custo.' };
    }
    if (message.name === 'villageJobFinish') {
      if (!active || message.runId !== active.runId) {
        const paid = paymentByProfile.get(profileId);
        return paid && paid.runId === message.runId ? { ok:true, replay:true, notice:'Pagamento já realizado.', payment:paid } : { ok:false, notice:'Turno inválido ou encerrado.' };
      }
      const job = villageJobById(active.jobId), at = now();
      if (at < active.readyAt) return { ok:false, notice:'O turno ainda não terminou.' };
      if (player.location !== 'clearing' || player.dimensionId !== active.dimensionId
          || !villageJobAtPoint(job.finishPointId, player.position, player.dimensionId, active.dimensionId)) return { ok:false, notice:'Você precisa entregar no ponto correto, na mesma dimensão.' };
      if (job.id === 'firekeeper' && (!isHearthLit(player.dimensionId, at) || active.lastPositionAt < active.readyAt)) { activeByProfile.delete(profileId); return { ok:false, notice:'A fogueira apagou ou a continuidade não pôde ser confirmada; o turno foi cancelado.' }; }
      const claim = { runId:active.runId, jobId:job.id, dayKey:gameDayKey(at) };
      try {
        const outcome = await queueWrite(profileId, () => storage.creditWalletAndSaveProgress(profileId, job.rewardBronze,
          player.inventorySnapshot(), claim));
        const payment = { runId:active.runId, jobId:job.id, amount:job.rewardBronze, paidAt:outcome?.paidAt || at };
        paymentByProfile.set(profileId, payment); activeByProfile.delete(profileId);
        return { ok:true, notice:'Turno concluído: 150 bronzes recebidos.', payment };
      } catch (error) {
        if (error.status === 409) activeByProfile.delete(profileId);
        return { ok:false, notice:error.message || 'Não consegui registrar o pagamento.' };
      }
    }
    return null;
  };
  return { handle, snapshot, cancelForProfile, activeByProfile, movement, sweep };
}

function publicActive(active) { const { dimensionId, origin, playerRef, lastPositionAt, ...value } = active; return value; }
export { VILLAGE_JOBS };
