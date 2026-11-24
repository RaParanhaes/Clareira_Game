import test from 'node:test';
import assert from 'node:assert/strict';
import { createMonsterSprites } from './monster-sprites.mjs';

const manifest = {
  versao: 1,
  especies: {
    caveBear: {
      cell: 96, pivo: [48, 84], dirs: '8e', escala: 1,
      anims: Object.fromEntries(['parado', 'andar', 'atacar', 'morrer'].map(name => [name, { frames: 4, fps: 4, loop: name !== 'morrer' }])),
    },
    mossSlime: {
      cell: 96, pivo: [48, 84], dirs: '4', escala: .25,
      anims: Object.fromEntries(['parado', 'andar', 'atacar', 'morrer'].map(name => [name, { frames: 4, fps: 4, loop: name !== 'morrer' }])),
    },
  },
};

function canvas() {
  return {
    calls: [], imageSmoothingEnabled: true,
    drawImage(...args) { this.calls.push(args); },
    save() { this.calls.push(['save']); }, restore() { this.calls.push(['restore']); },
    translate(...args) { this.calls.push(['translate', ...args]); }, scale(...args) { this.calls.push(['scale', ...args]); },
  };
}

test('monster sprites report catalog presence, preload atlases once, and release them', async () => {
  const urls = [];
  const sprites = createMonsterSprites({ manifest, loadImage: async url => { urls.push(url); return { url }; } });
  assert.equal(sprites.has('caveBear'), true);
  assert.equal(sprites.has('unknown'), false);
  await sprites.preload(['caveBear', 'missing', 'caveBear']);
  assert.equal(urls.length, 4);
  const ctx = canvas();
  assert.equal(sprites.draw(ctx, { speciesId: 'caveBear' }, { px: 48, py: 84, time: 0 }), true);
  assert.equal(ctx.calls[0][1], 0);
  sprites.release();
  assert.equal(sprites.draw(ctx, { speciesId: 'caveBear' }, { px: 0, py: 0 }), false);
});

test('animation selection uses state, movement threshold, elapsed frames, and death freeze', async () => {
  const sprites = createMonsterSprites({ manifest, loadImage: async url => ({ url }) });
  await sprites.preload(['caveBear']);
  const ctx = canvas();
  const draw = (animal, time) => sprites.draw(ctx, { speciesId: 'caveBear', ...animal }, { px: 48, py: 84, time });
  draw({ state: 'dormindo', vx: 9 }, 2000);
  assert.equal(ctx.calls.at(-1)[2], 0);
  draw({ vx: .3, vy: 0, animationStartedAt: 0 }, 500);
  assert.equal(ctx.calls.at(-1)[1], 192);
  draw({ state: 'atacando', attackAt: 0 }, 500);
  assert.equal(ctx.calls.at(-1)[0].url.endsWith('/atacar.png'), true);
  draw({ hp: 0, animationStartedAt: 0 }, 5000);
  assert.equal(ctx.calls.at(-1)[0].url.endsWith('/morrer.png'), true);
});

test('eight facing views mirror missing westward rows and four-view sprites select a diagonal', async () => {
  const sprites = createMonsterSprites({ manifest, loadImage: async url => ({ url }) });
  await sprites.preload(['caveBear', 'mossSlime']);
  const ctx = canvas();
  sprites.draw(ctx, { speciesId: 'caveBear', facing: 'west' }, { px: 48, py: 84 });
  assert.ok(ctx.calls.some(call => call[0] === 'scale' && call[1] === -1));
  const radial = canvas();
  sprites.draw(radial, { speciesId: 'mossSlime', facing: 'east' }, { px: 48, py: 84 });
  assert.equal(radial.calls[0][2], 0);
});

test('missing and not-yet-loaded sprites return false for procedural fallback', () => {
  const sprites = createMonsterSprites({ manifest, loadImage: async () => ({}) });
  assert.equal(sprites.draw(canvas(), { speciesId: 'caveBear' }, { px: 0, py: 0 }), false);
  assert.equal(sprites.draw(canvas(), { speciesId: 'other' }, { px: 0, py: 0 }), false);
});
