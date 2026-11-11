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

test('drops that meet a roof vanish on it: no circular splash on the roof, none on the ground beneath', () => {
  const frames = scan(s => rainFrame({ center: { x: 5, y: 3 }, count: 400, seconds: s, roofs: [roof] }));
  assert.equal(frames.some(f => f.splashes.some(p => p.kind === 'roof')), false, 'sem respingo circular no telhado');
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

test('rain that lands on open ground makes splashes there', () => {
  const frames = scan(s => rainFrame({ center: { x: 0, y: 0 }, count: 200, seconds: s, roofs: [], trees: [] }), 2);
  const ground = frames.reduce((n, f) => n + f.splashes.filter(p => p.kind === 'ground').length, 0);
  assert.ok(ground > 20, 'deve haver respingos de chão ao longo de 2 segundos');
});

test('runoff reaches the real eave of the roof', () => {
  const frames = scan(s => rainFrame({ center: { x: 5, y: 3 }, count: 400, seconds: s, roofs: [roof] }));
  const longest = frames.flatMap(f => f.runoffs).reduce((best, r) => Math.max(best, Math.hypot(r.x1 - r.x0, r.y1 - r.y0)), 0);
  assert.ok(longest > 1.6, 'o filete deve chegar à beirada, não parar em um traço curto');
});

test('roofs drip from their eaves', () => {
  const frames = scan(s => rainFrame({ center: { x: 5, y: 3 }, count: 40, seconds: s, roofs: [roof] }));
  assert.ok(frames.some(f => f.drops.some(d => d.eave)), 'deve haver pingadas da beirada');
});

test('rain is fixed to the world: the same drops stay in place when the camera moves', () => {
  const at = (cx) => rainFrame({ center: { x: cx, y: 0 }, count: 200, seconds: 3.1 }).drops
    .map(d => `${d.x.toFixed(3)},${d.y.toFixed(3)}`).sort();
  const a = at(0), b = at(4);
  const shared = a.filter(k => b.includes(k)).length;
  assert.ok(shared > 0.5 * a.length, 'a maior parte das gotas deve ser a mesma quando a câmera anda');
});
