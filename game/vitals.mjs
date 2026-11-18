// Vida do personagem: regras puras. O servidor aplica; o cliente só desenha.
// Desmaiar e morrer são coisas diferentes:
// - Desmaio: a vida chega a 0, o personagem cai NO LOCAL por FAINT_DOWNED_MS e se levanta no mesmo lugar
//   com FAINT_WAKE_FRACTION da vida máxima e FAINT_IMMUNE_MS de imunidade.
// - Morte: só quando, caído, ele acumula FAINT_LETHAL_FRACTION da vida máxima de dano (golpe de misericórdia).
//   Volta ao ponto de renascimento com DEATH_WAKE_FRACTION da vida e DEATH_IMMUNE_MS de imunidade.
export const REGEN_DELAY_MS = 6000;
export const REGEN_PER_SECOND = 1;
export const REGEN_FIRE_MULTIPLIER = 3;
export const FAINT_DOWNED_MS = 10000;
export const FAINT_IMMUNE_MS = 5000;
export const FAINT_WAKE_FRACTION = .3;
export const FAINT_LETHAL_FRACTION = .5;
export const DEATH_WAKE_FRACTION = .5;
export const DEATH_IMMUNE_MS = 10000;
export const DAMAGE_PER_FORCE = 4;

export const maxHealth = level => 40 + 2 * Math.max(1, Math.floor(Number(level) || 1));

// CONTRATO com a branch de equipamento: assinatura e fórmula não mudam.
export const damageFromAttack = (attack, defense = 0) =>
  Math.max(1, Math.round(attack.force * DAMAGE_PER_FORCE) - defense);

export const createVitals = level => ({
  hp: maxHealth(level), downedUntil: 0, lastHitAt: Number.NEGATIVE_INFINITY, immuneUntil: 0,
  fainted: false, faintDamage: 0, deathSeq: 0, deathPlace: '',
});
// Caído é o período do desmaio. Depois de downedUntil, só deixa de valer quando o servidor o acorda (wakeIfDue).
export const isDowned = (vitals, now) => Boolean(vitals) && (vitals.fainted === true || vitals.downedUntil > now);
export const isImmune = (vitals, now) => Boolean(vitals) && vitals.immuneUntil > now;

// Devolve a vida depois de dtMs. Fora da clareira a vida volta cheia; caído não regenera.
export function regenStep(vitals, { now, dtMs, max, nearFire = false, location = 'clearing' }) {
  if (!vitals) return 0;
  if (isDowned(vitals, now)) return vitals.hp;
  if (location !== 'clearing') return max;
  if (vitals.hp >= max) return max;
  if (now - vitals.lastHitAt < REGEN_DELAY_MS) return vitals.hp;
  const rate = REGEN_PER_SECOND * (nearFire ? REGEN_FIRE_MULTIPLIER : 1);
  return Math.min(max, vitals.hp + rate * dtMs / 1000);
}

// Desmaiar não custa item, moeda nem XP.
export const faintOutcome = max => ({
  hp: Math.max(1, Math.ceil(max * FAINT_WAKE_FRACTION)),
  downedMs: FAINT_DOWNED_MS, immuneMs: FAINT_IMMUNE_MS,
  loses: { items: false, coins: false, xp: false },
});

// Morte: a vida volta a DEATH_WAKE_FRACTION. Também não custa item, moeda nem XP.
export const deathOutcome = max => ({
  hp: Math.max(1, Math.ceil(max * DEATH_WAKE_FRACTION)),
  immuneMs: DEATH_IMMUNE_MS,
  loses: { items: false, coins: false, xp: false },
});

// Aplica um golpe.
// - Vivo e sem imunidade: tira vida; ao chegar a zero, desmaia no local (fainted: true).
// - Caído: o golpe não derruba de novo, mas soma ao dano acumulado do desmaio; ao passar de
//   FAINT_LETHAL_FRACTION da vida máxima, devolve dead: true (o servidor aplica a morte).
// - Imune (depois de acordar): ignora o golpe.
export function applyDamage(vitals, damage, now, max) {
  if (!vitals) return { damage: 0, fainted: false, dead: false };
  if (isDowned(vitals, now)) {
    vitals.faintDamage += damage;
    vitals.hp = Math.max(0, vitals.hp - damage);
    vitals.lastHitAt = now;
    return { damage, fainted: false, dead: vitals.faintDamage >= max * FAINT_LETHAL_FRACTION };
  }
  if (isImmune(vitals, now)) return { damage: 0, fainted: false, dead: false };
  vitals.hp = Math.max(0, vitals.hp - damage);
  vitals.lastHitAt = now;
  if (vitals.hp > 0) return { damage, fainted: false, dead: false };
  vitals.fainted = true;
  vitals.faintDamage = 0;
  vitals.downedUntil = now + FAINT_DOWNED_MS;
  vitals.immuneUntil = 0;
  return { damage, fainted: true, dead: false };
}

// Acorda no mesmo lugar quando o desmaio termina. Devolve true só na transição.
export function wakeIfDue(vitals, now, max) {
  if (!vitals?.fainted || vitals.downedUntil > now) return false;
  const outcome = faintOutcome(max);
  vitals.fainted = false;
  vitals.faintDamage = 0;
  vitals.hp = outcome.hp;
  vitals.immuneUntil = now + outcome.immuneMs;
  return true;
}

// Para onde a morte leva: o respawnPoint do jogador (a boca da caverna, na masmorra) ou o spawn da dimensão (a vila).
export function deathDestination(respawnPoint, spawn, dimensionId = 'surface') {
  const hasPoint = Boolean(respawnPoint) && Number.isFinite(respawnPoint.x) && Number.isFinite(respawnPoint.y);
  if (hasPoint) return { x: respawnPoint.x, y: respawnPoint.y, place: respawnPoint.place || 'no ponto de renascimento' };
  return { x: spawn.x, y: spawn.y, place: dimensionId === 'surface' ? 'na vila' : 'no ponto de partida' };
}

// Aplica a morte: vida parcial, imunidade e contagem para o cliente mostrar a tela breve.
export function applyDeath(vitals, now, max, place) {
  const outcome = deathOutcome(max);
  vitals.fainted = false;
  vitals.faintDamage = 0;
  vitals.downedUntil = 0;
  vitals.hp = outcome.hp;
  vitals.lastHitAt = now;
  vitals.immuneUntil = now + outcome.immuneMs;
  vitals.deathSeq = (vitals.deathSeq || 0) + 1;
  vitals.deathPlace = place;
  return outcome;
}

// Caído, só passa o que é seguro e necessário: ping, chat de texto, pedido de snapshot (view), reconexão,
// movimento (o servidor o zera) e telemetria. Todo o resto é recusado, inclusive tipos novos.
export const DOWNED_ALLOWED_MESSAGES = ['join', 'clockPing', 'chat', 'view', 'recoverMovement', 'input',
  'clientDiagnostics', 'performanceMetrics', 'objectCatalogReady'];
export const DOWNED_NOTICE = 'Você ainda está se recompondo…';

// Ponto único de recusa para quem está caído.
export function downedRefusal(message, vitals, now) {
  if (!isDowned(vitals, now) || DOWNED_ALLOWED_MESSAGES.includes(message?.type)) return null;
  return {
    text: DOWNED_NOTICE,
    details: message?.type === 'dimensionTravel' ? { action: 'dimensionTravel', requestId: message.requestId, result: 'rejected' } : null,
  };
}

// Resposta enviada ao cliente quando o desmaio cancela uma viagem já iniciada: o cliente a trata como recusa e desfaz a tela de viagem.
export const dimensionTravelCancelledDetails = transitId => ({ action: 'dimensionTravel', result: 'rejected', cancelled: true, transitId });

// No desmaio só perdem o alvo o agressor e os animais provocados por este jogador; os provocados por outros seguem.
export function releaseAnimalsFromPlayer(animals, playerId, attackerId, now) {
  for (const animal of animals) {
    const provokedByPlayer = animal.provokedBy === playerId && animal.provokedUntil > now;
    if (animal.id !== attackerId && !provokedByPlayer) continue;
    if (animal.provokedBy === playerId) { animal.provokedUntil = 0; animal.provokedBy = null; }
    animal.state = 'explorando';
  }
}

export const vitalsSnapshot = (vitals, max) => ({
  hp: Math.max(vitals.hp > 0 ? 1 : 0, Math.floor(vitals.hp)), max, downedUntil: vitals.downedUntil,
  deathSeq: vitals.deathSeq || 0, deathPlace: vitals.deathPlace || '',
});
