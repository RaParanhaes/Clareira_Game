// Ids da masmorra do Covil do Ninho. Este módulo não importa nada do Node, para que o cliente (world-edits) também o use.
// O id da instância é dg-ninho-n<N>-<inst>; o id-modelo dg-ninho-n<N> é o mesmo para todas as instâncias de um nível.
export const DUNGEON_LAIR_ID = 'ninho';
// Seed fixa do covil: todas as instâncias de um nível têm o mesmo labirinto.
export const DUNGEON_SEED = 0x4e494e48; // 'NINH'

const DUNGEON_ID_PATTERN = /^dg-ninho-n([1-9][0-9]?)-([0-9a-f]{10})$/;

export const dungeonModelId = level => `dg-${DUNGEON_LAIR_ID}-n${level}`;
export const dungeonDimensionId = (level, instanceId) => `${dungeonModelId(level)}-${instanceId}`;

export function parseDungeonDimensionId(id) {
  const match = typeof id === 'string' ? DUNGEON_ID_PATTERN.exec(id) : null;
  if (!match) return null;
  const level = Number(match[1]);
  return { lairId: DUNGEON_LAIR_ID, level, instanceId: match[2], modelId: dungeonModelId(level) };
}

export const isDungeonDimensionId = id => parseDungeonDimensionId(id) !== null;
