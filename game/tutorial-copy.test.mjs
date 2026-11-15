import test from 'node:test';
import assert from 'node:assert/strict';
import { arrivalTutorialSteps, forestArrivalNotice, toolUseText, ARRIVAL_TUTORIAL_FALLBACK } from './tutorial-copy.mjs';
import { isTouchInput, TOUCH_INPUT_QUERY } from './input-mode.mjs';

const everyText = steps => Object.values(steps).flatMap(([, title, text]) => [title, text]);

test('a lição 3 aponta para Jogador > Aparência do personagem, nunca para Configurações', () => {
  for (const touch of [false, true]) {
    const [, , text] = arrivalTutorialSteps({ touch }).appearance;
    assert.match(text, /Jogador/);
    assert.match(text, /Aparência do personagem/);
    assert.doesNotMatch(text, /Configurações/);
  }
  assert.match(arrivalTutorialSteps({ touch: true }).appearance[2], /Menu/);
});

test('com toque, as lições falam em tocar no chão e não em teclas nem em clique', () => {
  const touch = everyText(arrivalTutorialSteps({ touch: true })).join(' ');
  assert.doesNotMatch(touch, /W, A, S, D|WASD|\bclique\b|\bE\b/);
  assert.match(arrivalTutorialSteps({ touch: true }).lesson[2], /Toque no chão para andar/);
  const keys = arrivalTutorialSteps({ touch: false }).lesson[2];
  assert.match(keys, /W, A, S, D/);
});

test('o aviso de chegada ao bosque é curto e não repete o guia de fabricação', () => {
  const notice = forestArrivalNotice();
  assert.match(notice, /Bosque das Brasas/);
  assert.ok(notice.length <= 130, 'cabe num aviso curto');
  assert.doesNotMatch(notice, /machado de pedra/i);
});

test('a ficha da faca e das ferramentas troca E e H por Usar no toque', () => {
  assert.match(toolUseText('knife'), /use E/);
  assert.match(toolUseText('knife', { touch: true }), /toque em Usar/);
  for (const id of ['stoneAxe', 'copperAxe', 'ironAxe', 'stonePickaxe', 'copperPickaxe', 'ironPickaxe']) {
    assert.match(toolUseText(id), /use H/);
    const touch = toolUseText(id, { touch: true });
    assert.match(touch, /toque em Usar/);
    assert.doesNotMatch(touch, /\bH\b|\bE\b/);
  }
  assert.equal(toolUseText('stone'), null);
});

test('o texto de queda cobre fases desconhecidas', () => {
  assert.equal(ARRIVAL_TUTORIAL_FALLBACK.length, 3);
});

test('o modo de toque usa a mesma consulta do CSS', () => {
  assert.equal(isTouchInput({ matchMedia: query => ({ matches: query === TOUCH_INPUT_QUERY }) }), true);
  assert.equal(isTouchInput({ matchMedia: () => ({ matches: false }) }), false);
  assert.equal(isTouchInput({}), false);
  assert.equal(isTouchInput({ matchMedia() { throw new Error('x'); } }), false);
});
