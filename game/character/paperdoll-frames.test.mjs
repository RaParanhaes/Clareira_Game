import test from 'node:test';
import assert from 'node:assert/strict';
import { PAPERDOLL_ACTIONS, PAPERDOLL_UNSUPPORTED_ACTIONS, paperdollDirection, selectPaperdollFrame } from './paperdoll-frames.mjs';
import { PAPERDOLL_FACINGS } from './paperdoll-manifest.mjs';
import { readManifestSync } from './test-helpers.mjs';

const manifest = readManifestSync();
const select = input => selectPaperdollFrame(manifest, input);
const TOOL_LAYERS = ['ferramenta_tras', 'corpo', 'calca_botas', 'tunica', 'gorro', 'ferramenta_frente'];

test('as direções seguem a ordem do jogo e aceitam nome, código do Blender e índice', () => {
  assert.deepEqual(PAPERDOLL_FACINGS.map(paperdollDirection), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(['S', 'SE', 'L', 'NE', 'N', 'NO', 'O', 'SO'].map(paperdollDirection), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(paperdollDirection(9), 1);
  assert.equal(paperdollDirection(-1), 7);
  assert.equal(paperdollDirection('nada'), 0);
  assert.equal(paperdollDirection(undefined), 0);
  assert.equal(select({ action: 'idle', facing: 'west' }).direction, 6);
  assert.equal(select({ action: 'idle', facing: 'northeast' }).facing, 'northeast');
});

test('idle vira parado: 4 quadros de 250 ms, pelo relógio, em laço', () => {
  const at = nowMs => select({ action: 'idle', facing: 'south', nowMs });
  assert.deepEqual([0, 249, 250, 500, 750, 999, 1000, 1250].map(ms => at(ms).frame), [0, 0, 1, 2, 3, 3, 0, 1]);
  const first = at(0);
  assert.deepEqual({ supported: first.supported, anim: first.anim, frameCount: first.frameCount, frameDurationMs: first.frameDurationMs },
    { supported: true, anim: 'parado', frameCount: 4, frameDurationMs: 250 });
  assert.equal(select({ action: 'idle', time: 0.5 }).frame, 2, 'time em segundos');
  assert.deepEqual(first.layers, ['corpo', 'calca_botas', 'tunica', 'gorro'], 'parado não tem ferramenta');
});

test('walk vira andar: 8 quadros por fase, como o avatar antigo', () => {
  const at = phase => select({ action: 'walk', facing: 'east', phase }).frame;
  const tau = Math.PI * 2;
  assert.deepEqual([0, tau / 8, tau / 4, tau * 7 / 8, tau - 1e-6, tau, tau * 1.25, -tau / 8].map(at), [0, 1, 2, 7, 7, 0, 2, 7]);
  assert.equal(select({ action: 'walk', phase: 0 }).anim, 'andar');
  assert.equal(select({ action: 'walk', nowMs: 350 }).frame, 3, 'sem fase usa 100 ms por quadro');
});

test('run usa a animação andar com duração menor', () => {
  const walk = select({ action: 'walk', nowMs: 350 });
  const run = select({ action: 'run', nowMs: 350 });
  assert.equal(run.anim, 'andar');
  assert.equal(walk.frameDurationMs, 100);
  assert.ok(run.frameDurationMs < walk.frameDurationMs);
  assert.equal(run.frame, Math.floor(350 / run.frameDurationMs) % 8);
  assert.equal(select({ action: 'run', phase: Math.PI }).frame, 4, 'com fase, o ciclo é o mesmo do andar');
});

test('chop e use-tool viram golpear, por progresso, tempo decorrido ou relógio', () => {
  for (const action of ['chop', 'use-tool']) {
    const s = select({ action, facing: 'north', progress: 0.5 });
    assert.equal(s.anim, 'golpear');
    assert.equal(s.frame, 4);
    assert.equal(s.direction, 4);
    assert.deepEqual(s.layers, TOOL_LAYERS);
  }
  assert.equal(select({ action: 'chop', progress: 0 }).frame, 0);
  assert.equal(select({ action: 'chop', progress: 1 }).frame, 7, 'não passa do último quadro');
  assert.equal(select({ action: 'chop', progress: 9 }).frame, 7);
  assert.equal(select({ action: 'chop', elapsedMs: 270 }).frame, 3, '90 ms por quadro');
  assert.equal(select({ action: 'chop', elapsedMs: 5000 }).frame, 7, 'golpe não faz laço');
  assert.equal(select({ action: 'chop', nowMs: 90 * 9 }).frame, 1, 'só o relógio, em laço');
});

test('ações sem arte devolvem supported:false para o chamador usar o renderizador antigo', () => {
  for (const action of PAPERDOLL_UNSUPPORTED_ACTIONS) {
    assert.equal(Object.hasOwn(PAPERDOLL_ACTIONS, action), false, action);
    const s = select({ action, facing: 'south' });
    assert.deepEqual(s, { supported: false, action, reason: 'sem-arte' });
  }
  assert.deepEqual(PAPERDOLL_UNSUPPORTED_ACTIONS, ['sit-ground', 'sit-chair', 'jump', 'dance', 'wave', 'crouch', 'crouch-walk', 'walk-wave']);
  assert.equal(select({ action: 'voar' }).supported, false);
  assert.equal(select({ action: 'voar' }).reason, 'acao-desconhecida');
});

test('sem ação explícita, moving/running escolhem idle, walk ou run', () => {
  assert.equal(select({}).action, 'idle');
  assert.equal(select({ moving: true }).action, 'walk');
  assert.equal(select({ moving: true, running: true }).action, 'run');
  assert.equal(select({ action: 'idle', moving: true }).action, 'idle');
});

test('reducedMotion fixa o quadro 0 e entradas inválidas não quebram', () => {
  assert.equal(select({ action: 'walk', phase: 3, reducedMotion: true }).frame, 0);
  assert.equal(select({ action: 'idle', nowMs: 900, reducedMotion: true }).frame, 0);
  assert.equal(select({ action: 'chop', progress: .9, reducedMotion: true }).frame, 0);
  const odd = select({ action: 'walk', phase: NaN, nowMs: 'x', facing: {} });
  assert.deepEqual([odd.supported, odd.frame, odd.direction], [true, 0, 0]);
  assert.equal(select({ action: 'idle', nowMs: -500 }).frame, 0);
});

test('a seleção só devolve quadros e direções existentes nos atlas', () => {
  for (const action of Object.keys(PAPERDOLL_ACTIONS)) {
    for (let direction = 0; direction < 8; direction++) {
      for (let step = 0; step < 40; step++) {
        const s = select({ action, facing: direction, phase: step * .37, nowMs: step * 61, progress: step / 39 });
        assert.ok(s.frame >= 0 && s.frame < manifest.animations[s.anim].frameCount);
        assert.ok(s.layers.length >= 4);
        for (const layer of s.layers) assert.ok(manifest.animations[s.anim].atlases[layer], `${s.anim}/${layer}`);
      }
    }
  }
});
