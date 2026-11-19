// Mundo da masmorra por nível. Uma definição por (seed + nível) é compartilhada por todas as instâncias do nível,
// para que alternar entre instâncias não reaplique a geometria a cada tick.
import { emptyWorldDefinition, normalizeWorldDefinition } from './world-edits.mjs';
import { DUNGEON_SEED, dungeonModelId, parseDungeonDimensionId } from './dungeon-ids.mjs';

const definitionsByLevel = new Map();

export function dungeonWorldDefinition(level) {
  const modelId = dungeonModelId(level);
  let definition = definitionsByLevel.get(modelId);
  if (!definition) {
    definition = normalizeWorldDefinition({ ...emptyWorldDefinition(modelId), seed: DUNGEON_SEED, theme: 'cave' });
    definitionsByLevel.set(modelId, definition);
  }
  return definition;
}

// Ativa a dimensão do jogador: escolhe a definição e a grade da masmorra, e só chama applyWorldDefinition quando
// a chave (modelo ou dimensão comum) ou a revisão muda. Alternar entre instâncias do mesmo nível não aplica nada.
export function createWorldActivator({ applyWorldDefinition, setActiveDungeonLevel, dungeonLevel, definitionFor, hasDefinition }) {
  let activeKey = null;
  let activeRevision = -1;
  let applyCount = 0;
  return {
    activate(dimensionId) {
      const dungeon = parseDungeonDimensionId(dimensionId);
      const key = dungeon ? dungeon.modelId : (hasDefinition(dimensionId) ? dimensionId : 'surface');
      const definition = dungeon ? dungeonWorldDefinition(dungeon.level) : definitionFor(key);
      // A grade da masmorra acompanha a dimensão ativa (canOccupy usa a grade); fora dela o terreno volta ao normal.
      setActiveDungeonLevel(dungeon ? dungeonLevel(dungeon.level) : null);
      if (key !== activeKey || definition.revision !== activeRevision) {
        applyWorldDefinition(definition);
        applyCount += 1;
        activeKey = key;
        activeRevision = definition.revision;
      }
      return definition;
    },
    // Esquece a última aplicação: a próxima ativação reaplica (catálogo de objetos mudou ou o mundo foi recarregado).
    reset() { activeKey = null; activeRevision = -1; },
    get applyCount() { return applyCount; },
  };
}
