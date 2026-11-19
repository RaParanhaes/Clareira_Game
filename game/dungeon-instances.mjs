// Instâncias da masmorra do Covil do Ninho (ARQUITETURA.md §1).
// Cada grupo tem a sua instância efêmera. O id da dimensão é dg-ninho-n<N>-<inst>; o id-modelo dg-ninho-n<N>
// é o mesmo para todas as instâncias de um nível (cache de geometria e definição do mundo).
// Sem persistência: a instância some 30 s depois que o último jogador sai.
import { createHash } from 'node:crypto';
import { generateDungeon } from './dungeon-gen.mjs';
import { DUNGEON_SEED, dungeonDimensionId } from './dungeon-ids.mjs';

// Os ids e a seed ficam em dungeon-ids.mjs (sem node:crypto), para o cliente também usá-los.
export { DUNGEON_LAIR_ID, DUNGEON_SEED, dungeonModelId, dungeonDimensionId, parseDungeonDimensionId, isDungeonDimensionId } from './dungeon-ids.mjs';
export const DUNGEON_MAX_ACTIVE = 12;
export const DUNGEON_IDLE_MS = 30_000;

// Chave de grupo: a conta (convidado: a sessão). Reconectar não ocupa outra vaga.
export function instanceIdFor(groupKey) {
  return createHash('sha256').update(`ninho:${groupKey}`).digest('hex').slice(0, 10);
}

const levelCache = new Map();
// Nível gerado uma vez por processo (o gerador é determinístico, então o cliente chega ao mesmo resultado).
export function dungeonLevel(level) {
  if (!levelCache.has(level)) levelCache.set(level, generateDungeon(DUNGEON_SEED, level));
  return levelCache.get(level);
}

// Ponto de chegada: centro da célula de entrada.
export function dungeonEntranceSpawn(level) {
  const { entrance } = dungeonLevel(level);
  return { x: entrance.x + 0.5, y: entrance.y + 0.5 };
}

export function createDungeonRegistry({ now = () => Date.now(), maxActive = DUNGEON_MAX_ACTIVE, idleMs = DUNGEON_IDLE_MS } = {}) {
  const instances = new Map();

  const acquire = (groupKey, level, playerKey) => {
    const instanceId = instanceIdFor(groupKey);
    const dimensionId = dungeonDimensionId(level, instanceId);
    let instance = instances.get(dimensionId);
    if (!instance) {
      if (instances.size >= maxActive) return { ok: false, reason: 'cheia' };
      instance = { dimensionId, instanceId, level, groupKey, players: new Set(), emptySince: null };
      instances.set(dimensionId, instance);
    }
    instance.players.add(playerKey);
    instance.emptySince = null;
    return { ok: true, instance };
  };

  const release = (dimensionId, playerKey) => {
    const instance = instances.get(dimensionId);
    if (!instance) return;
    instance.players.delete(playerKey);
    if (instance.players.size === 0) instance.emptySince = now();
  };

  // Remove as instâncias vazias há idleMs ou mais. Devolve os ids removidos para o servidor limpar o estado.
  const collect = () => {
    const at = now();
    const removed = [];
    for (const [dimensionId, instance] of instances) {
      if (instance.players.size === 0 && instance.emptySince !== null && at - instance.emptySince >= idleMs) {
        instances.delete(dimensionId);
        removed.push(dimensionId);
      }
    }
    return removed;
  };

  return {
    acquire, release, collect,
    get: dimensionId => instances.get(dimensionId) || null,
    count: () => instances.size,
    ids: () => [...instances.keys()],
  };
}
