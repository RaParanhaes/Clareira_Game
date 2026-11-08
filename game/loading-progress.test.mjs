import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateInitialMiniProgress, createLoadingProgress, initialLoadingMiniStage } from './loading-progress.mjs';

test('the loading percentage advances only when registered work completes', () => {
  const updates = [];
  const progress = createLoadingProgress([
    { id: 'snapshot', label: 'Recebendo seu personagem', complete: true },
    { id: 'avatar', label: 'Preparando o personagem' },
    { id: 'ground', label: 'Preparando o bosque' },
    { id: 'frame', label: 'Abrindo o local' },
  ], value => updates.push(value));

  assert.deepEqual(progress.snapshot(), {
    known: true, total: 4, completed: 1, percent: 25,
    activeLabel: 'Preparando o personagem', finished: false,
  });
  progress.complete('avatar');
  progress.complete('avatar');
  assert.equal(progress.snapshot().percent, 50, 'duplicate notifications cannot inflate progress');
  assert.equal(progress.snapshot().activeLabel, 'Preparando o bosque');
  progress.complete('ground');
  progress.complete('frame');
  assert.equal(progress.snapshot().percent, 100);
  assert.equal(progress.snapshot().finished, true);
  assert.equal(updates.at(-1).percent, 100);
});

test('unknown or empty work stays indeterminate instead of inventing a percentage', () => {
  const progress = createLoadingProgress();
  assert.deepEqual(progress.snapshot(), {
    known: false, total: 0, completed: 0, percent: null, activeLabel: null, finished: false,
  });
  assert.equal(progress.complete('unknown').percent, null);
});

test('duplicate task IDs are rejected so denominator and numerator remain exact', () => {
  assert.throws(() => createLoadingProgress([
    { id: 'same', label: 'A' }, { id: 'same', label: 'B' },
  ]), /Etapa/);
});


test('the initial mini bar resets per phase and reports only that phase progress', () => {
  assert.equal(calculateInitialMiniProgress({ filesFraction: 0.5 }), 50);
  assert.equal(calculateInitialMiniProgress({ filesFraction: 1 }), 0);
  assert.equal(calculateInitialMiniProgress({
    filesFraction: 1,
    sessionCompleted: true,
    character: { completed: 2, total: 4 },
    scene: { completed: 3, total: 6 },
  }), 50);
  assert.equal(calculateInitialMiniProgress({
    filesFraction: 1,
    sessionCompleted: true,
    character: { completed: 4, total: 4 },
    scene: { completed: 6, total: 6 },
  }), 100);
});

test('the initial mini bar clamps invalid cache progress and incomplete stage counts', () => {
  assert.equal(calculateInitialMiniProgress({
    filesFraction: Number.NaN,
    sessionCompleted: true,
    character: { completed: 2, total: 0 },
    scene: { completed: 99, total: 2 },
  }), 0);
});


test('the initial loader label follows the next unfinished phase for guests and accounts', () => {
  assert.equal(initialLoadingMiniStage({ filesFraction: 0.8 }), 'files');
  assert.equal(initialLoadingMiniStage({ filesFraction: 1 }), 'session');
  assert.equal(initialLoadingMiniStage({ filesFraction: 1, sessionCompleted: true }), 'character');
  assert.equal(initialLoadingMiniStage({
    filesFraction: 1, sessionCompleted: true,
    character: { completed: 1, total: 2 }, scene: { completed: 0, total: 3 },
  }), 'character', 'parallel scene tasks cannot take the character phase label');
  assert.equal(initialLoadingMiniStage({
    filesFraction: 1, sessionCompleted: true,
    character: { completed: 2, total: 2 }, scene: { completed: 1, total: 3 },
  }), 'scene');
});
