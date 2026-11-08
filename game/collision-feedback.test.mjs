import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { updateCollisionFeedback, getCollisionFeedbackFrame } from './collision-feedback.mjs';
import { SOLID_TREES, PLAYER_RADIUS, stepPlayer, WORLD_TILE_X, WORLD_TILE_Y } from './world.mjs';

test('andar contra uma árvore cria um único sinal enquanto a direção fica pressionada', () => {
  const tree = SOLID_TREES[0];
  const start = { x: tree.x-tree.r-PLAYER_RADIUS, y:tree.y };
  const input = { x: 1, y: 0 };
  const blockedPosition = stepPlayer(start, input, 1 / 60);
  assert.deepEqual(blockedPosition, start);

  let state = { blocked: false, feedback: null };
  state = updateCollisionFeedback(state, start, blockedPosition, input, 100, WORLD_TILE_X, WORLD_TILE_Y);
  const firstContact = state.feedback;
  assert.ok(firstContact, 'o bloqueio precisa deixar um sinal visível');
  assert.equal(state.blocked, true);

  state = updateCollisionFeedback(state, start, blockedPosition, input, 150, WORLD_TILE_X, WORLD_TILE_Y);
  assert.equal(state.feedback, firstContact, 'manter a tecla não deve reiniciar o sinal');
  assert.ok(Math.abs(getCollisionFeedbackFrame(state.feedback, 180, false)?.direction.x - 1) < 0.15);
});

test('soltar e caminhar liberam um novo sinal no próximo contato', () => {
  const tree = SOLID_TREES[0];
  const start = { x: tree.x-tree.r-PLAYER_RADIUS, y:tree.y };
  const input = { x: 1, y: 0 };
  let state = updateCollisionFeedback({ blocked: false, feedback: null }, start, start, input, 100, WORLD_TILE_X, WORLD_TILE_Y);
  const firstContact = state.feedback;

  state = updateCollisionFeedback(state, start, start, { x: 0, y: 0 }, 150, WORLD_TILE_X, WORLD_TILE_Y);
  assert.equal(state.blocked, false);
  const moved = { x: start.x, y: start.y + 0.05 };
  state = updateCollisionFeedback(state, start, moved, input, 200, WORLD_TILE_X, WORLD_TILE_Y);
  state = updateCollisionFeedback(state, moved, moved, input, 250, WORLD_TILE_X, WORLD_TILE_Y);

  assert.notEqual(state.feedback, firstContact);
  assert.equal(state.feedback.startedAt, 250);
});

test('movimento reduzido mantém o sinal parado e o encerra no prazo', () => {
  const feedback = { startedAt: 100, direction: { x: 1, y: 0 } };
  assert.deepEqual(getCollisionFeedbackFrame(feedback, 220, true), {
    direction: { x: 1, y: 0 }, alpha: 0.86, spread: 0, lift: 0,
  });
  assert.equal(getCollisionFeedbackFrame(feedback, 500, true), null);
});

test('o cliente desenha o sinal de colisão com a assinatura da Clareira', async () => {
  const main = await readFile(new URL('./main.js', import.meta.url), 'utf8');
  assert.match(main, /updateCollisionFeedback/);
  assert.match(main, /drawCollisionResponse/);
  assert.match(main, /CLAREIRA\.signature\.ember/);
  assert.match(main, /CLAREIRA\.signature\.leaf/);
});
