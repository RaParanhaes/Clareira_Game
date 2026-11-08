import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPFIRE_GATHERING_RADIUS, getCampfireGatheringCount } from './social.mjs';

const fire = { x: 8, y: 8 };
const dancer = (x, y, emoteUntil = 2000) => ({ x, y, emote: 'dance', emoteUntil });
const sitter = (x, y, moving = false) => ({ x, y, emote: 'sit', moving });

test('a fogueira responde a duas pessoas dançando dentro da roda', () => {
  assert.equal(getCampfireGatheringCount(fire, [dancer(7, 8), dancer(8, 9)], 1000), 2);
});

test('duas pessoas sentadas junto ao fogo também merecem uma resposta', () => {
  assert.equal(getCampfireGatheringCount(fire, [sitter(7, 8), sitter(8, 9)], 1000), 2);
});

test('só conta descanso parado e dança ativa dentro da roda', () => {
  const near = dancer(8, 8);
  const resting = sitter(8, 8);
  assert.equal(getCampfireGatheringCount(fire, [near], 1000), 1);
  assert.equal(getCampfireGatheringCount(fire, [near, dancer(8 + CAMPFIRE_GATHERING_RADIUS + 0.01, 8)], 1000), 1);
  assert.equal(getCampfireGatheringCount(fire, [near, dancer(8, 8, 1000)], 1000), 1);
  assert.equal(getCampfireGatheringCount(fire, [near, sitter(8, 8, true)], 1000), 1);
  assert.equal(getCampfireGatheringCount(fire, [resting, dancer(8, 9)], 1000), 2);
});

test('posições inválidas não ativam a resposta da fogueira', () => {
  assert.equal(getCampfireGatheringCount(fire, [dancer(Number.NaN, 8), dancer(8, 8)], 1000), 1);
  assert.equal(getCampfireGatheringCount(null, [dancer(8, 8)], 1000), 0);
});
