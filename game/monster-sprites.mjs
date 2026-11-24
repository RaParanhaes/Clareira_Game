import { getFacingFromVector } from './avatar.mjs';

const EIGHT = ['south', 'southeast', 'east', 'northeast', 'north', 'northwest', 'west', 'southwest'];
const FOUR = ['southeast', 'northeast', 'southwest', 'northwest'];
const MIRROR = Object.freeze({
  east: 'west', northeast: 'northwest', southeast: 'southwest',
  west: 'east', northwest: 'northeast', southwest: 'southeast',
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function speciesTable(manifest) {
  return manifest?.especies || {};
}

function atlasURL(id, animation) {
  return new URL(`./art/monsters/${encodeURIComponent(id)}/${encodeURIComponent(animation)}.png`, import.meta.url).href;
}

function animationFor(animal, time) {
  if ((animal.hp != null && finite(animal.hp, 1) <= 0) || animal.morto || animal.state === 'morto' || animal.state === 'morrendo') return 'morrer';
  if (animal.state === 'dormindo' || animal.state === 'recolhido') return 'parado';
  if (animal.state === 'atacando' || (Number.isFinite(animal.attackAt) && time - animal.attackAt < 500 && time >= animal.attackAt)) return 'atacar';
  if (Math.hypot(finite(animal.vx), finite(animal.vy)) > .22) return 'andar';
  return 'parado';
}

function directionFor(animal, directions) {
  const facing = animal.facing || animal.direction;
  const radial = directions === '4' || directions === 4;
  const renderDirs = radial ? FOUR : directions === '8e' ? ['south', 'southeast', 'east', 'northeast', 'north'] : EIGHT;
  const requested = EIGHT.includes(facing)
    ? facing
    : getFacingFromVector(animal.vx, animal.vy, 1, 1, radial ? 'southeast' : 'south');

  if (renderDirs.includes(requested)) return { facing: requested, row: renderDirs.indexOf(requested), mirror: false };
  if (radial) {
    // Radial sprites use diagonal quadrants; choose the nearest rendered quadrant.
    const nearest = {
      south: 'southeast', east: 'southeast', north: 'northeast', west: 'northwest',
    }[requested] || requested;
    return { facing: nearest, row: FOUR.indexOf(nearest), mirror: false };
  }
  const mirrored = MIRROR[requested];
  if (mirrored && renderDirs.includes(mirrored)) return { facing: mirrored, row: renderDirs.indexOf(mirrored), mirror: true };
  return { facing: 'south', row: 0, mirror: false };
}

export function createMonsterSprites({ manifest, loadImage } = {}) {
  if (typeof loadImage !== 'function') throw new TypeError('loadImage must be a function');
  const species = speciesTable(manifest);
  const images = new Map();
  const pending = new Map();
  let generation = 0;

  function has(speciesId) {
    const entry = species[speciesId];
    return Boolean(entry && Object.keys(entry.anims || {}).length);
  }

  async function preload(ids = []) {
    const jobs = [];
    for (const id of new Set(ids)) {
      const entry = species[id];
      if (!entry) continue;
      for (const animation of Object.keys(entry.anims || {})) {
        const key = `${id}:${animation}`;
        if (images.has(key)) continue;
        if (!pending.has(key)) {
          const startedInGeneration = generation;
          const promise = Promise.resolve().then(() => loadImage(atlasURL(id, animation)))
            .then(image => { if (image && generation === startedInGeneration) images.set(key, image); return image; })
            .finally(() => pending.delete(key));
          pending.set(key, promise);
        }
        jobs.push({ key, promise: pending.get(key) });
      }
    }
    const settled = await Promise.allSettled(jobs.map(job => job.promise));
    return {
      loaded: settled.flatMap((result, index) => result.status === 'fulfilled' && result.value ? [jobs[index].key] : []),
      failed: settled.flatMap((result, index) => result.status === 'rejected' || !result.value ? [jobs[index].key] : []),
    };
  }

  function draw(ctx, animal, { px, py, scale = 1, time = 0, reducedMotion = false } = {}) {
    const id = animal?.speciesId || animal?.id;
    const entry = species[id];
    if (!entry) return false;
    const clock = finite(time);
    let animation = animationFor(animal || {}, clock);
    if (!entry.anims?.[animation]) animation = entry.anims?.parado ? 'parado' : Object.keys(entry.anims || {})[0];
    const clip = entry.anims?.[animation];
    const image = images.get(`${id}:${animation}`);
    if (!clip || !image || !ctx?.drawImage) return false;

    const dirs = entry.dirs;
    const direction = directionFor(animal || {}, dirs);
    const frameCount = Math.max(1, Math.floor(finite(clip.frames, 1)));
    const fps = Math.max(0, finite(clip.fps, 0));
    const rawStart = animation === 'morrer'
      ? animal?.diedAt ?? animal?.animationStartedAt
      : animal?.animationStartedAt ?? animal?.attackAt ?? animal?.bornAt ?? 0;
    const start = finite(rawStart, 0);
    const elapsedFrames = rawStart == null ? 0 : Math.max(0, Math.floor(((clock - start) / 1000) * fps));
    const frame = (reducedMotion && animation === 'parado') ? 0 : animation === 'morrer' || clip.loop === false
      ? Math.min(frameCount - 1, elapsedFrames)
      : fps ? elapsedFrames % frameCount : 0;
    const cell = typeof entry.cell === 'number' ? entry.cell : finite(entry.cell?.width, 96);
    const cellH = typeof entry.cell === 'number' ? entry.cell : finite(entry.cell?.height, cell);
    const pivotX = Array.isArray(entry.pivo) ? finite(entry.pivo[0], cell / 2) : finite(entry.pivo?.x, cell / 2);
    const pivotY = Array.isArray(entry.pivo) ? finite(entry.pivo[1], cellH) : finite(entry.pivo?.y, cellH);
    const sx = frame * cell;
    const sy = direction.row * cellH;
    const integerScale = Math.max(1, Math.round(finite(scale, 1)));
    const destW = Math.round(cell * integerScale);
    const destH = Math.round(cellH * integerScale);
    const dx = Math.round(finite(px) - pivotX * integerScale);
    const dy = Math.round(finite(py) - pivotY * integerScale);
    ctx.imageSmoothingEnabled = false;
    if (direction.mirror) {
      ctx.save?.();
      ctx.translate?.(dx + destW, 0);
      ctx.scale?.(-1, 1);
      ctx.drawImage(image, sx, sy, cell, cellH, 0, dy, destW, destH);
      ctx.restore?.();
    } else {
      ctx.drawImage(image, sx, sy, cell, cellH, dx, dy, destW, destH);
    }
    return true;
  }

  function release() {
    generation += 1;
    for (const image of images.values()) image?.close?.();
    images.clear();
    pending.clear();
  }

  return { has, preload, draw, release };
}
