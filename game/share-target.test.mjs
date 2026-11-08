import test from 'node:test';
import assert from 'node:assert/strict';
import { getNearestShareTarget, SHARE_REACH } from './share-target.mjs';

const player = (id, x, y) => ({ id, x, y });

test('a oferta aponta para a pessoa mais próxima dentro do alcance do servidor', () => {
  const self = player('self', 4, 4);
  const nearer = player('nearer', 5, 4);
  const farther = player('farther', 4, 5.5);
  assert.equal(getNearestShareTarget(self, [self, farther, nearer], 'self'), nearer);
});

test('a oferta não aponta para si, posição inválida ou distância fora do alcance', () => {
  const self = player('self', 4, 4);
  assert.equal(getNearestShareTarget(self, [self], 'self'), null);
  assert.equal(getNearestShareTarget(self, [player('far', 4 + SHARE_REACH + 0.01, 4)], 'self'), null);
  assert.equal(getNearestShareTarget(self, [player('bad', Number.NaN, 4)], 'self'), null);
  assert.equal(getNearestShareTarget({ x: Number.NaN, y: 4 }, [player('near', 4, 4)], 'self'), null);
});

test('o limite do alcance inclui exatamente 1,8 unidade', () => {
  const self = player('self', 4, 4);
  const edge = player('edge', 4 + SHARE_REACH, 4);
  assert.equal(getNearestShareTarget(self, [edge], 'self'), edge);
});

test('o seletor também aceita posições usadas pelos jogadores do servidor', () => {
  const sender = { id: 'sender', position: { x: 4, y: 4 } };
  const target = { id: 'target', position: { x: 5, y: 4 } };
  assert.equal(getNearestShareTarget(sender.position, [sender, target], sender.id), target);
});
