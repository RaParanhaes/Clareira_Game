import { DUNGEON_SEED, parseDungeonDimensionId } from './dungeon-ids.mjs';
import { generateDungeon } from './dungeon-gen.mjs';
import { createDungeonArt } from './dungeon-art.mjs';
import { loadDungeonTileset } from './dungeon-tileset.mjs';
import { drawDungeonFrame } from './dungeon-render.mjs';
import { setActiveDungeonLevel } from './world.mjs';

// Mantém o protocolo cliente da masmorra fora de main.js: snapshot, colisão, título e quadro.
export function createDungeonClient({ createCanvas, loadTileset = loadDungeonTileset, warn = console.warn } = {}) {
  let view = null;
  let art = null;
  let artRequest = null;
  const levels = new Map();

  function ensureArt() {
    if (art || artRequest) return;
    artRequest = loadTileset().then(tileset => {
      art = createDungeonArt({ createCanvas, tileset });
      artRequest = null;
    }).catch(error => {
      artRequest = null;
      warn('Arte da masmorra não carregou; a cena fica preta até a próxima entrada.', error);
    });
  }

  function sync(dimensionId, snapshotDungeon) {
    const parsed = parseDungeonDimensionId(dimensionId);
    if (!parsed) {
      if (view) { view = null; setActiveDungeonLevel(null); }
      return;
    }
    if (view?.dimensionId === dimensionId) return;
    const seed = Number.isInteger(snapshotDungeon?.seed) ? snapshotDungeon.seed : DUNGEON_SEED;
    const key = `${seed}:${parsed.level}`;
    if (!levels.has(key)) levels.set(key, generateDungeon(seed, parsed.level));
    view = { dimensionId, level: levels.get(key) };
    setActiveDungeonLevel(view.level);
    ensureArt();
  }

  return {
    sync,
    title(dimensionId) {
      const parsed = parseDungeonDimensionId(dimensionId);
      return parsed ? `Covil do Ninho · Nível ${parsed.level}` : null;
    },
    isActive(dimensionId) { return Boolean(view && view.dimensionId === dimensionId); },
    exit(dimensionId, position) {
      if (!view || view.dimensionId !== dimensionId) return null;
      const { x, y } = view.level.exit;
      const distance = Math.hypot(position.x - (x + .5), position.y - (y + .5));
      return distance <= 1.5 ? { x: x + .5, y: y + .5, distance } : null;
    },
    draw(ctx, { dimensionId, camera, viewport, player, actors = [], time, reducedMotion, drawActor, drawEntity }) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, viewport.width, viewport.height);
      if (!art || !view || view.dimensionId !== dimensionId) return;
      drawDungeonFrame(ctx, { grid: view.level, camera, viewport, player, actors, time, reducedMotion, art, drawActor, drawEntity });
    },
  };
}
