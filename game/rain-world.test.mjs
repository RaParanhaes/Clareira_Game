import test from 'node:test';
import assert from 'node:assert/strict';
import { roofHeightAt, rainDropCount, rainFrame } from './rain-world.mjs';

const roof = { x1: 0, x2: 10, y1: 0, y2: 6, axis: 'y', base: 2.2, ridge: 3.4 };

test('roof height rises from the eave to the ridge and is null outside the roof', () => {
  assert.equal(roofHeightAt(roof, -1, 3), null);
  assert.equal(roofHeightAt(roof, 5, 3), 3.4);
  assert.equal(roofHeightAt(roof, 0, 3), 2.2);
  assert.ok(roofHeightAt(roof, 2.5, 3) > 2.2 && roofHeightAt(roof, 2.5, 3) < 3.4);
});

function scan(make, seconds = 4, step = 0.02) {
  const out = [];
  for (let s = 0; s < seconds; s += step) out.push(make(s));
  return out;
}

test('drops that meet a roof splash on it and never splash on the ground beneath', () => {
  const frames = scan(s => rainFrame({ center: { x: 5, y: 3 }, count: 400, seconds: s, roofs: [roof] }));
  assert.ok(frames.some(f => f.splashes.some(p => p.kind === 'roof')), 'deve haver respingo no telhado');
  // Dentro do telhado, nenhuma gota atinge o chão: todo respingo de chão fica fora da área coberta.
  const groundInsideRoof = frames.some(f => f.splashes.some(p => p.kind === 'ground' && roofHeightAt(roof, p.x, p.y) !== null));
  assert.equal(groundInsideRoof, false);
});

test('rain runs off a roof toward its eave', () => {
  const frames = scan(s => rainFrame({ center: { x: 5, y: 3 }, count: 400, seconds: s, roofs: [roof] }));
  const runoff = frames.flatMap(f => f.runoffs)[0];
  assert.ok(runoff, 'deve haver filete de água no telhado');
  assert.ok(Math.abs(runoff.x1 - runoff.x0) > 0.01 || Math.abs(runoff.y1 - runoff.y0) > 0.01);
});

test('drop count stays bounded and grows with intensity', () => {
  assert.ok(rainDropCount(0) < rainDropCount(1));
  assert.ok(rainDropCount(1) <= 200);
});

test('the same instant always gives the same frame (every player sees the same rain)', () => {
  const a = rainFrame({ center: { x: 1, y: 2 }, count: 120, seconds: 7.3, roofs: [roof], trees: [{ x: 3, y: 1, r: 1 }] });
  const b = rainFrame({ center: { x: 1, y: 2 }, count: 120, seconds: 7.3, roofs: [roof], trees: [{ x: 3, y: 1, r: 1 }] });
  assert.deepEqual(a, b);
});

test('tree canopy takes drops and sometimes drips from its edge', () => {
  // Várias copas: só uma parte delas pinga, então o teste precisa de mais de uma.
  const trees = Array.from({ length: 8 }, (_, i) => ({ x: 4 + (i % 4) * 2, y: 4 + Math.floor(i / 4) * 2, r: 1.5 }));
  const frames = scan(s => rainFrame({ center: { x: 4, y: 4 }, count: 400, seconds: s, trees }), 6);
  assert.ok(frames.some(f => f.drops.some(d => d.drip)), 'deve haver pingadas de copa');
  assert.ok(frames.some(f => f.splashes.some(p => p.kind === 'tree')), 'deve haver respingo na copa');
});
