// Vida do personagem: regras puras. O servidor aplica; o cliente só desenha.
export const REGEN_DELAY_MS = 6000;
export const REGEN_PER_SECOND = 1;
export const REGEN_FIRE_MULTIPLIER = 3;
export const FAINT_DOWNED_MS = 4000;
export const FAINT_IMMUNE_MS = 10000;
export const FAINT_WAKE_FRACTION = .5;
export const DAMAGE_PER_FORCE = 4;

export const maxHealth = level => 40 + 2 * Math.max(1, Math.floor(Number(level) || 1));

// CONTRATO com a branch de equipamento: assinatura e fórmula não mudam.
export const damageFromAttack = (attack, defense = 0) =>
  Math.max(1, Math.round(attack.force * DAMAGE_PER_FORCE) - defense);

export const createVitals = level => ({ hp: maxHealth(level), downedUntil: 0, lastHitAt: Number.NEGATIVE_INFINITY, immuneUntil: 0 });
export const isDowned = (vitals, now) => Boolean(vitals) && vitals.downedUntil > now;
export const isImmune = (vitals, now) => Boolean(vitals) && vitals.immuneUntil > now;

// Devolve a vida depois de dtMs. Fora da clareira a vida volta cheia; caído não regenera.
export function regenStep(vitals, { now, dtMs, max, nearFire = false, location = 'clearing' }) {
  if (!vitals) return 0;
  if (vitals.downedUntil > now) return vitals.hp;
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

// Aplica um golpe. Ignora se imune ou caído. Ao chegar a zero, deixa o jogador caído com a vida do despertar.
export function applyDamage(vitals, damage, now, max) {
  if (isDowned(vitals, now) || isImmune(vitals, now)) return { damage: 0, fainted: false };
  vitals.hp = Math.max(0, vitals.hp - damage);
  vitals.lastHitAt = now;
  if (vitals.hp > 0) return { damage, fainted: false };
  const outcome = faintOutcome(max);
  vitals.hp = outcome.hp;
  vitals.downedUntil = now + outcome.downedMs;
  vitals.immuneUntil = now + outcome.downedMs + outcome.immuneMs;
  return { damage, fainted: true };
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

export const vitalsSnapshot =(vitals, max) => ({ hp: Math.max(vitals.hp > 0 ? 1 : 0, Math.floor(vitals.hp)), max, downedUntil: vitals.downedUntil });
