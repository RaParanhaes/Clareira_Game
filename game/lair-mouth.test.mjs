import test from 'node:test';
import assert from 'node:assert/strict';
import { LAIR_INTERACT_RADIUS, LAIR_MOUTH, findLairMouthAtPoint, findNearestLairMouth, lairPromptText, lairSceneThings, lairStatusText } from './lair-art.mjs';

// Covil sem baú no snapshot (é o que o servidor manda no exterior desde a remoção do baú externo).
const mouthOnly = (overrides = {}) => ({ id: 'lair:ninho:0', x: 566, y: 137, mouth: { x: 566, y: 137 }, chest: null, state: 'mouth', readyAt: null, ...overrides });

test('a boca é desenhada mesmo sem baú (é a entrada do covil)', () => {
  const things = lairSceneThings([mouthOnly()]);
  assert.deepEqual(things.map(item => [item.type, item.layer]), [['lair-mouth', 'back'], ['lair-mouth', 'front']]);
});

test('com baú, a cena inclui o baú depois da boca', () => {
  const things = lairSceneThings([mouthOnly({ chest: { x: 566, y: 133.5 }, state: 'ready' })]);
  assert.deepEqual(things.map(item => item.type), ['lair-mouth', 'lair-mouth', 'lair-chest']);
});

test('boca mais próxima sem depender de lair.chest', () => {
  const lairs = [mouthOnly({ id: 'longe', mouth: { x: 1, y: 1 } }), mouthOnly()];
  const near = findNearestLairMouth(lairs, { x: 566, y: 138.2 }, { hasPath: () => true });
  assert.equal(near?.id, 'lair:ninho:0');
  assert.ok(Math.abs(near.distance - 1.2) < 1e-9);
});

test('boca fora do raio ou sem caminho livre não conta', () => {
  const lairs = [mouthOnly()];
  assert.equal(findNearestLairMouth(lairs, { x: 566, y: 137 + LAIR_INTERACT_RADIUS + 0.2 }, { hasPath: () => true }), null);
  assert.equal(findNearestLairMouth(lairs, { x: 566, y: 137 }, { hasPath: () => false }), null);
  assert.equal(findNearestLairMouth(lairs, { x: NaN, y: 137 }), null);
  assert.equal(findNearestLairMouth(undefined, { x: 0, y: 0 }), null);
});

test('toque na arte da boca acerta o retângulo do desenho, não só o ponto de contato', () => {
  const scale = 2;
  const toScreen = mouth => ({ x: mouth.x * 10, y: mouth.y * 10 });
  const lairs = [mouthOnly()];
  const contact = toScreen(lairs[0].mouth);
  const inside = { x: contact.x, y: contact.y - LAIR_MOUTH.anchorY * scale + 4 };
  assert.equal(findLairMouthAtPoint(lairs, inside, toScreen, scale)?.id, 'lair:ninho:0');
  assert.equal(findLairMouthAtPoint(lairs, { x: contact.x + 500, y: contact.y }, toScreen, scale), null);
});

test('textos da boca sem baú falam em entrar, não em abrir baú', () => {
  assert.equal(lairPromptText(mouthOnly(), 0), 'Entrar no covil');
  assert.equal(lairStatusText(mouthOnly(), 0), 'Ande até a boca do covil ou pressione E para entrar.');
});
