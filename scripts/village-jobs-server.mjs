import { randomUUID } from 'node:crypto';
import { gameDayKey } from '../game/game-calendar.mjs';
import { CURRENCY_KEYS } from '../game/lodging-catalog.mjs';
import { VILLAGE_JOBS, villageJobAtPoint, villageJobById, villageJobSnapshot } from '../game/village-jobs.mjs';

const RUN_ID = /^[0-9a-f-]{36}$/i;

export function createVillageJobsServer({ now = Date.now, storage, queueWrite = (_profileId, fn) => fn(), isHearthLit = () => true } = {}) {
  const activeByProfile = new Map();
  const paymentByProfile = new Map();
  // Conclusões do dia por conta: lidas do ledger uma vez e servidas do cache. Invalidadas em
  // início, cancelamento, conclusão e desconexão; virar o dia de jogo muda a chave e recarrega.
  const completionCache = new Map();

  const invalidate = profileId => { if (profileId) completionCache.delete(profileId); };
  const cancelTurn = profileId => { activeByProfile.delete(profileId); invalidate(profileId); };

  const loadCompletions = (profileId, dayKey) => {
    const cached = completionCache.get(profileId);
    if (cached?.dayKey === dayKey) return cached.promise;
    const entry = { dayKey, rows:null, promise:null };
    entry.promise = Promise.resolve().then(() => storage?.getVillageJobCompletions ? storage.getVillageJobCompletions(profileId, dayKey) : [])
      .then(rows => { if (completionCache.get(profileId) === entry) entry.rows = rows; return rows; },
        error => { if (completionCache.get(profileId) === entry) completionCache.delete(profileId); throw error; });
    completionCache.set(profileId, entry);
    return entry.promise;
  };

  // Estado para o pacote personalizado: síncrono e sem SQL. Devolve undefined até o cache do dia existir.
  const state = player => {
    const profileId = player.accountId, dayKey = gameDayKey(now());
    if (!profileId) return villageJobSnapshot({ dayKey, completions:[], active:null, lastPayment:null, requiresAccount:true });
    const cached = completionCache.get(profileId);
    if (!cached || cached.dayKey !== dayKey) { loadCompletions(profileId, dayKey).catch(() => {}); return undefined; }
    if (!cached.rows) return undefined;
    return villageJobSnapshot({ dayKey, completions:cached.rows, active:publicActive(activeByProfile.get(profileId) || null),
      lastPayment:paymentByProfile.get(profileId) || null, requiresAccount:false });
  };

  const movement = player => {
    const profileId = player.accountId, running = activeByProfile.get(profileId);
    if (!running || running.jobId !== 'firekeeper') return;
    if (player.location !== 'clearing' || player.dimensionId !== running.dimensionId
        || !villageJobAtPoint('hearth', player.position, player.dimensionId, running.dimensionId) || !isHearthLit(player.dimensionId, now())) cancelTurn(profileId);
    else running.lastPositionAt = now();
  };
  const sweep = () => {
    for (const [profileId, running] of activeByProfile) {
      if (running.jobId === 'firekeeper') {
        const player = running.playerRef;
        if (!isHearthLit(running.dimensionId, now()) || !player || player.location !== 'clearing'
            || player.dimensionId !== running.dimensionId || !villageJobAtPoint('hearth', player.position, player.dimensionId, running.dimensionId)) cancelTurn(profileId);
        else running.lastPositionAt = now();
      }
    }
  };

  const cancelForProfile = profileId => { if (profileId) cancelTurn(profileId); };

  // Espelha a carteira confirmada no jogador real; o próximo salvamento grava o valor atual.
  const mirrorWallet = (player, wallet) => {
    if (wallet && player.inventory) for (const key of CURRENCY_KEYS) player.inventory[key] = wallet[key] || 0;
  };

  const handle = async (player, message, context = {}) => {
    const profileId = player.accountId;
    for (const [id, running] of activeByProfile) {
      if (running.jobId !== 'firekeeper' || id !== profileId) continue;
      if (player.location !== 'clearing' || player.dimensionId !== running.dimensionId
          || !villageJobAtPoint('hearth', player.position, player.dimensionId, running.dimensionId) || !isHearthLit(player.dimensionId, now())) {
        cancelTurn(id);
        return { ok:false, notice:'O turno da fogueira foi cancelado ao se afastar ou apagar o fogo.' };
      }
      running.lastPositionAt = now();
    }
    if (message.name === 'villageJobStart') {
      const job = villageJobById(message.jobId);
      if (!job) return { ok:false, notice:'Esse ofício não existe.' };
      if (!profileId) return { ok:false, notice:'É preciso ter uma conta para trabalhar.' };
      // A cota vem do cache do ledger; a espera fica antes das checagens síncronas, então nada se corre.
      const rows = await loadCompletions(profileId, gameDayKey(now()));
      if (rows.filter(row => row.jobId === job.id).length >= job.dailyLimit) return { ok:false, notice:'A cota deste ofício já foi completada hoje.' };
      if (activeByProfile.has(profileId)) return { ok:false, notice:'Você já está em um turno. Termine ou cancele antes.' };
      const point = job.startPointId;
      if (player.location !== 'clearing' || !villageJobAtPoint(point, player.position, player.dimensionId, 'surface')) return { ok:false, notice:'Aproxime-se do ponto de início do ofício.' };
      if (job.id === 'firekeeper' && !isHearthLit(player.dimensionId, now())) return { ok:false, notice:'A fogueira precisa estar acesa durante todo o turno.' };
      const runId = randomUUID(), startedAt = now();
      const active = { runId, jobId:job.id, stage:job.id === 'carrier' ? 'carrying' : 'working', startedAt, readyAt:startedAt + job.minDurationMs, targetId:job.finishPointId, dimensionId:player.dimensionId, origin:{x:player.position.x,y:player.position.y}, lastPositionAt:startedAt, playerRef:player };
      activeByProfile.set(profileId, active);
      invalidate(profileId);
      return { ok:true, notice:'Turno iniciado.', active:publicActive(active) };
    }
    if (!profileId) return { ok:false, notice:'É preciso ter uma conta para trabalhar.' };
    const active = activeByProfile.get(profileId);
    if (message.name === 'villageJobCancel') {
      if (!active || (message.runId && message.runId !== active.runId)) return { ok:false, notice:'Esse turno não está ativo.' };
      cancelTurn(profileId); return { ok:true, notice:'Turno cancelado sem custo.' };
    }
    if (message.name === 'villageJobFinish') {
      if (!active || message.runId !== active.runId) {
        // Sem turno ativo: só um pagamento já gravado no ledger pode responder replay (não depende da memória).
        if (typeof message.runId !== 'string' || !RUN_ID.test(message.runId) || !storage?.getVillageJobReplay) return { ok:false, notice:'Turno inválido ou encerrado.' };
        const replay = await storage.getVillageJobReplay(profileId, message.runId);
        if (!replay) return { ok:false, notice:'Turno inválido ou encerrado.' };
        mirrorWallet(player, replay.wallet);
        return { ok:true, replay:true, notice:'Pagamento já realizado.', payment:{ runId:message.runId, jobId:replay.jobId, amount:replay.amount, paidAt:replay.paidAt }, wallet:replay.wallet };
      }
      const job = villageJobById(active.jobId), at = now();
      if (at < active.readyAt) return { ok:false, notice:'O turno ainda não terminou.' };
      if (player.location !== 'clearing' || player.dimensionId !== active.dimensionId
          || !villageJobAtPoint(job.finishPointId, player.position, player.dimensionId, active.dimensionId)) return { ok:false, notice:'Você precisa entregar no ponto correto, na mesma dimensão.' };
      if (job.id === 'firekeeper' && (!isHearthLit(player.dimensionId, at) || active.lastPositionAt < active.readyAt)) { cancelTurn(profileId); return { ok:false, notice:'A fogueira apagou ou a continuidade não pôde ser confirmada; o turno foi cancelado.' }; }
      const claim = { runId:active.runId, jobId:job.id, dayKey:gameDayKey(at), dailyLimit:job.dailyLimit, rewardBronze:job.rewardBronze };
      let outcome;
      try {
        outcome = await queueWrite(profileId, () => storage.creditWalletAndSaveProgress(profileId, job.rewardBronze,
          context.inventorySnapshot(), claim));
      } catch (error) {
        invalidate(profileId);
        // Só a cota cancela o turno; carteira cheia mantém o trabalho para tentar de novo.
        if (error.status === 409 && error.code === 'village_quota' && activeByProfile.get(profileId) === active) cancelTurn(profileId);
        return { ok:false, notice:error.message || 'Não consegui registrar o pagamento.' };
      }
      invalidate(profileId);
      if (activeByProfile.get(profileId) === active) activeByProfile.delete(profileId);
      const payment = { runId:active.runId, jobId:job.id, amount:outcome?.amount ?? job.rewardBronze, paidAt:outcome?.paidAt ?? at };
      paymentByProfile.set(profileId, payment);
      mirrorWallet(player, outcome?.wallet);
      if (outcome?.replay) return { ok:true, replay:true, notice:'Pagamento já realizado.', payment, wallet:outcome.wallet };
      return { ok:true, notice:`Turno concluído: ${job.rewardBronze} bronzes recebidos.`, payment, wallet:outcome?.wallet };
    }
    return null;
  };
  return { handle, state, invalidate, cancelForProfile, activeByProfile, movement, sweep };
}

function publicActive(active) { if (!active) return null; const { dimensionId, origin, playerRef, lastPositionAt, ...value } = active; return value; }
export { VILLAGE_JOBS };
