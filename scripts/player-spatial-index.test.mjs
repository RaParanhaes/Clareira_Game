import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerSpatialIndex } from './player-spatial-index.mjs';

test('spatial queries match brute force across positive, negative and cell-boundary positions', () => {
  const index = new PlayerSpatialIndex();
  const players = [];
  for (let y = -24; y <= 24; y += 3.25) {
    for (let x = -24; x <= 24; x += 2.75) {
      const player = { id: `${x}:${y}`, position: { x, y } };
      players.push(player);
      index.upsert(player.id, 'surface', player.position, player);
    }
  }
  for (const position of [{ x: 0, y: 0 }, { x: 7.999, y: 8.001 }, { x: -8, y: -8 }, { x: 23, y: -11 }]) {
    for (const radius of [0.25, 1, 8, 17.5]) {
      const expected = players.filter(player => Math.hypot(
        player.position.x - position.x,
        player.position.y - position.y,
      ) <= radius).map(player => player.id).sort();
      const actual = index.query('surface', position, radius).map(player => player.id).sort();
      assert.deepEqual(actual, expected);
    }
  }
  assert.equal(index.size, players.length);
});

test('upsert moves a player between contexts and cells; remove cleans empty buckets', () => {
  const index = new PlayerSpatialIndex();
  const player = { id: 'p', position: { x: 7.9, y: 0 } };
  assert.equal(index.upsert('p', 'surface', player.position, player), true);
  assert.equal(index.upsert('p', 'surface', player.position, player), false);
  assert.deepEqual(index.query('surface', { x: 8.1, y: 0 }, 0.3), [player]);

  player.position = { x: 40, y: 40 };
  index.upsert('p', 'interior:hotel:4', player.position, player);
  assert.deepEqual(index.query('surface', { x: 7.9, y: 0 }, 1), []);
  assert.deepEqual(index.query('interior:hotel:4', { x: 40, y: 40 }, 0), [player]);
  assert.equal(index.remove('p'), true);
  assert.equal(index.remove('p'), false);
  assert.equal(index.size, 0);
  assert.deepEqual(index.query('interior:hotel:4', { x: 40, y: 40 }, 8), []);
});

test('a finer cell size can index dense collision neighborhoods without changing query results', () => {
  const index = new PlayerSpatialIndex({ cellSize: 2 });
  const players = Array.from({ length: 100 }, (_, id) => ({
    id,
    position: { x: (id % 10) * 0.6, y: Math.floor(id / 10) * 0.6 },
  }));
  for (const player of players) index.upsert(player.id, 'clearing', player.position, player);
  const center = { x: 2.4, y: 2.4 };
  const expected = players.filter(player => Math.hypot(
    player.position.x - center.x,
    player.position.y - center.y,
  ) <= 1).map(player => player.id).sort((a, b) => a - b);
  const actual = index.query('clearing', center, 1).map(player => player.id).sort((a, b) => a - b);
  assert.deepEqual(actual, expected);
});
