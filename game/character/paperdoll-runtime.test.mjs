import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_APPEARANCE } from '../appearance.mjs';
import { parsePaperdollManifest } from './paperdoll-manifest.mjs';
import {
  PAPERDOLL_DEFAULT_PRELOAD, createPaperdollRuntime, mapGameStateToPaperdollInput, readPaperdollFlag,
} from './paperdoll-runtime.mjs';
import { PAPERDOLL_BASE_URL, createDiskImageLoader, createFakeCanvasFactory, readManifestSync } from './test-helpers.mjs';

const manifest = parsePaperdollManifest(readManifestSync());
const storageWith = value => ({ getItem: key => (key === 'clareira.avatar' ? value : null) });
const throwingStorage = { getItem() { throw new Error('bloqueado'); } };

test('a flag liga por ?avatar=paperdoll e por localStorage, e ?avatar=classic desliga', () => {
  assert.equal(readPaperdollFlag({ search: '?avatar=paperdoll' }), true);
  assert.equal(readPaperdollFlag({ search: '?x=1&avatar=paperdoll' }), true);
  assert.equal(readPaperdollFlag({ search: '', storage: storageWith('paperdoll') }), true);
  assert.equal(readPaperdollFlag({ search: '?avatar=classic', storage: storageWith('paperdoll') }), false);
  assert.equal(readPaperdollFlag({ search: '?avatar=paperdoll', storage: storageWith('classic') }), true);
});

test('sem flag, valor desconhecido ou armazenamento que lança: desligada', () => {
  assert.equal(readPaperdollFlag({}), false);
  assert.equal(readPaperdollFlag({ search: '?avatar=outro' }), false);
  assert.equal(readPaperdollFlag({ search: '?avatar=outro', storage: storageWith('classic') }), false);
  assert.equal(readPaperdollFlag({ search: '', storage: throwingStorage }), false);
  assert.equal(readPaperdollFlag({ search: '', storage: null }), false);
});

test('o mapeamento leva o estado do jogo à entrada de selectPaperdollFrame', () => {
  assert.deepEqual(mapGameStateToPaperdollInput({ action: 'walk', facing: 'east', phase: 1.5, moving: true, nowMs: 10 }), {
    action: 'walk', facing: 'east', phase: 1.5, nowMs: 10, moving: true, running: false, reducedMotion: false,
  });
  const run = mapGameStateToPaperdollInput({ action: 'run', moving: true, running: true, reducedMotion: true });
  assert.equal(run.action, 'run');
  assert.equal(run.running, true);
  assert.equal(run.reducedMotion, true);
  assert.equal(mapGameStateToPaperdollInput({ moving: true }).action, undefined);
  const tool = mapGameStateToPaperdollInput({ action: 'idle', tool: { action: 'chop', progress: 0.5 } });
  assert.equal(tool.action, 'chop');
  assert.equal(tool.progress, 0.5);
  assert.equal(mapGameStateToPaperdollInput({ action: 'walk', tool: { action: 'nada' } }).action, 'walk');
});

function setup(options = {}) {
  const calls = [];
  const { createCanvas } = createFakeCanvasFactory();
  const manifestLoads = [];
  const runtime = createPaperdollRuntime({
    enabled: options.enabled ?? true,
    loadManifest: options.loadManifest || (async () => { manifestLoads.push(1); return { manifest, baseUrl: PAPERDOLL_BASE_URL }; }),
    loadImage: createDiskImageLoader({ calls }),
    createCanvas,
    now: () => 1000,
    onError: options.onError || (() => {}),
    onReady: options.onReady,
  });
  const target = createFakeCanvasFactory().createCanvas(160, 160);
  return { runtime, calls, manifestLoads, ctx: target.getContext('2d'), target };
}

test('desligado: não carrega nada nem desenha', async () => {
  const { runtime, calls, manifestLoads, ctx } = setup({ enabled: false });
  assert.equal(runtime.isEnabled(), false);
  assert.equal(runtime.tryDraw(ctx, 80, 120, DEFAULT_APPEARANCE, { action: 'idle', facing: 'south' }), false);
  assert.equal(await runtime.preload(DEFAULT_APPEARANCE), null);
  assert.equal(runtime.state(), 'off');
  assert.deepEqual([calls.length, manifestLoads.length], [0, 0]);
});

test('ligado: false enquanto o manifest e os atlas carregam, depois desenha', async () => {
  const { runtime, ctx, target, manifestLoads } = setup();
  const info = { action: 'idle', facing: 'south' };
  assert.equal(runtime.tryDraw(ctx, 80, 120, DEFAULT_APPEARANCE, info), false, 'manifest ainda carregando');
  assert.equal(runtime.state(), 'loading');
  await runtime.preload(DEFAULT_APPEARANCE);
  assert.equal(runtime.state(), 'ready');
  assert.equal(manifestLoads.length, 1, 'manifest carregado uma só vez');
  assert.equal(runtime.tryDraw(ctx, 80, 120, DEFAULT_APPEARANCE, info), true);
  assert.ok(target.data.some((value, index) => index % 4 === 3 && value > 0), 'pintou pixels');
});

test('o pé fica no pivô: a última linha pintada fica junto da linha do chão (y 118 a 132)', async () => {
  const { runtime, ctx, target } = setup();
  await runtime.preload(DEFAULT_APPEARANCE);
  assert.equal(runtime.tryDraw(ctx, 80, 120, DEFAULT_APPEARANCE, { action: 'idle', facing: 'south' }), true);
  let lowest = -1;
  for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) if (target.data[(y * 160 + x) * 4 + 3] > 0) lowest = Math.max(lowest, y);
  assert.ok(lowest >= 118 && lowest <= 132, `última linha pintada em ${lowest}`);
});

test('ação sem arte devolve false para o chamador usar o desenho antigo', async () => {
  const { runtime, ctx } = setup();
  await runtime.preload(DEFAULT_APPEARANCE);
  for (const action of ['sit-ground', 'sit-chair', 'jump', 'dance', 'wave', 'crouch', 'crouch-walk', 'walk-wave', 'desconhecida']) {
    assert.equal(runtime.tryDraw(ctx, 80, 120, DEFAULT_APPEARANCE, { action, facing: 'south' }), false, action);
  }
});

test('andar não desenha até os atlas de andar estarem prontos; depois desenha as 8 direções', async () => {
  const { runtime, ctx } = setup();
  await runtime.preload(DEFAULT_APPEARANCE, { anims: ['parado'] });
  const info = { action: 'walk', facing: 'east', phase: 0.5, moving: true };
  assert.equal(runtime.tryDraw(ctx, 80, 120, DEFAULT_APPEARANCE, info), false);
  await runtime.preload(DEFAULT_APPEARANCE, { anims: ['andar'] });
  for (const facing of manifest.facings) assert.equal(runtime.tryDraw(ctx, 80, 120, DEFAULT_APPEARANCE, { ...info, facing }), true, facing);
});

test('falha ao carregar o manifest: estado failed, avisa uma vez e nunca desenha', async () => {
  const errors = [];
  const { runtime, ctx } = setup({ loadManifest: async () => { throw new Error('HTTP 404'); }, onError: error => errors.push(error.message) });
  assert.equal(runtime.tryDraw(ctx, 80, 120, DEFAULT_APPEARANCE, { action: 'idle' }), false);
  assert.equal(await runtime.preload(DEFAULT_APPEARANCE), null);
  assert.equal(runtime.state(), 'failed');
  assert.deepEqual(errors, ['HTTP 404']);
  assert.equal(runtime.tryDraw(ctx, 80, 120, DEFAULT_APPEARANCE, { action: 'idle' }), false);
  assert.equal(runtime.error().message, 'HTTP 404');
});

test('o preload padrão cobre só parado e andar e avisa o ouvinte', async () => {
  assert.deepEqual([...PAPERDOLL_DEFAULT_PRELOAD], ['parado', 'andar']);
  const ready = [];
  const { runtime, calls } = setup({ onReady: result => ready.push(result) });
  await runtime.preload(DEFAULT_APPEARANCE);
  assert.equal(ready.length, 1);
  assert.equal(ready[0].failed, 0);
  assert.ok(calls.length > 0 && calls.every(url => !url.includes('golpear')), 'golpear não foi carregado');
});

test('só o traje camponês desenha; armadura, manto e aparência legada decidem pelo alias', async () => {
  const { runtime, ctx } = setup();
  await runtime.preload(DEFAULT_APPEARANCE);
  const info = { action: 'idle', facing: 'south' };
  for (const outfitId of ['outfit.commoner', 'outfit.white-base']) {
    assert.equal(runtime.tryDraw(ctx, 80, 120, { ...DEFAULT_APPEARANCE, outfitId }, info), true, outfitId);
  }
  for (const outfitId of ['outfit.dark-armor', 'outfit.light-armor', 'outfit.mage-robe', 'outfit.dimension-coat']) {
    assert.equal(runtime.tryDraw(ctx, 80, 120, { ...DEFAULT_APPEARANCE, outfitId }, info), false, outfitId);
  }
  const { outfitId: _omit, ...legacy } = DEFAULT_APPEARANCE;
  assert.equal(runtime.tryDraw(ctx, 80, 120, { ...legacy, outfit: 'white-base' }, info), true, 'legado camponês');
  assert.equal(runtime.tryDraw(ctx, 80, 120, { ...legacy, outfit: 'dark-armor' }, info), false, 'legado armadura');
  assert.equal(await runtime.preload({ ...DEFAULT_APPEARANCE, outfitId: 'outfit.dark-armor' }), null);
});

test('manifest com falha tenta de novo só depois do intervalo, sem martelar a rede', async () => {
  let clock = 1000;
  let loads = 0;
  const { createCanvas } = createFakeCanvasFactory();
  const runtime = createPaperdollRuntime({
    enabled: true,
    loadManifest: async () => { loads++; if (loads === 1) throw new Error('rede'); return { manifest, baseUrl: PAPERDOLL_BASE_URL }; },
    loadImage: createDiskImageLoader({ calls: [] }),
    createCanvas,
    now: () => clock,
    retryMs: 5000,
    onError: () => {},
  });
  const ctx = createFakeCanvasFactory().createCanvas(160, 160).getContext('2d');
  const info = { action: 'idle', facing: 'south' };
  assert.equal(runtime.tryDraw(ctx, 80, 120, DEFAULT_APPEARANCE, info), false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runtime.state(), 'failed');
  for (let i = 0; i < 20; i++) runtime.tryDraw(ctx, 80, 120, DEFAULT_APPEARANCE, info);
  clock += 4999;
  runtime.tryDraw(ctx, 80, 120, DEFAULT_APPEARANCE, info);
  assert.equal(loads, 1, 'sem nova tentativa antes de 5000 ms');
  clock += 1;
  assert.equal(runtime.tryDraw(ctx, 80, 120, DEFAULT_APPEARANCE, info), false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(loads, 2, 'nova tentativa depois do intervalo');
  await runtime.preload(DEFAULT_APPEARANCE);
  assert.equal(runtime.state(), 'ready');
  assert.equal(runtime.tryDraw(ctx, 80, 120, DEFAULT_APPEARANCE, info), true);
});

test('preload padrão carrega parado E andar (sem troca de estilo no primeiro passo)', async () => {
  const { runtime, ctx } = setup();
  await runtime.preload(DEFAULT_APPEARANCE);
  assert.equal(runtime.tryDraw(ctx, 80, 120, DEFAULT_APPEARANCE, { action: 'idle', facing: 'south' }), true);
  for (const facing of manifest.facings) {
    assert.equal(runtime.tryDraw(ctx, 80, 120, DEFAULT_APPEARANCE, { action: 'walk', facing, phase: 0.3, moving: true }), true, `andar ${facing}`);
  }
});
