import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { decodePng } from '../../scripts/png-codec.mjs';
import { DEFAULT_APPEARANCE } from '../appearance.mjs';
import { selectPaperdollFrame } from './paperdoll-frames.mjs';
import { loadPaperdollManifest, parsePaperdollManifest } from './paperdoll-manifest.mjs';
import { createPaperdollRenderer } from './paperdoll-renderer.mjs';
import { buildMapping, recolorRGBA } from './recolor.mjs';
import * as api from './index.mjs';
import {
  PAPERDOLL_BASE_URL, PAPERDOLL_DIR, cellOf, createDiskImageLoader, createFakeCanvasFactory, fileForUrl, readManifestSync,
} from './test-helpers.mjs';

const manifest = parsePaperdollManifest(readManifestSync());
const select = input => selectPaperdollFrame(manifest, input);
const TOOL_ORDER = ['ferramenta_tras', 'corpo', 'calca_botas', 'tunica', 'gorro', 'ferramenta_frente'];

function setup(options = {}) {
  const calls = [];
  const failing = options.failing || new Set();
  const { createCanvas, canvases } = createFakeCanvasFactory();
  const renderer = createPaperdollRenderer({
    manifest, baseUrl: PAPERDOLL_BASE_URL, loadImage: createDiskImageLoader({ calls, failing }), createCanvas, now: options.now, limits: options.limits,
  });
  return { renderer, calls, canvases, createCanvas };
}

const compositeAtlas = {};
async function composite(anim) {
  compositeAtlas[anim] ??= decodePng(await readFile(path.join(PAPERDOLL_DIR, manifest.animations[anim].composite)));
  return compositeAtlas[anim];
}

test('o quadro composto com a aparência padrão é idêntico à composta aprovada', async () => {
  const { renderer } = setup();
  await renderer.preload(DEFAULT_APPEARANCE);
  let checked = 0;
  for (const [action, frames] of [['idle', [0, 3]], ['walk', [0, 5]], ['chop', [0, 4, 7]]]) {
    for (const direction of [0, 3, 6]) {
      for (const frame of frames) {
        const selection = { ...select({ action, facing: direction }), frame };
        const canvas = renderer.composeFrame(DEFAULT_APPEARANCE, selection);
        assert.ok(canvas, `${action} ${direction} ${frame}`);
        const expected = cellOf(await composite(selection.anim), direction, frame);
        assert.deepEqual([...canvas.data], [...expected], `${selection.anim} direção ${direction} quadro ${frame}`);
        checked++;
      }
    }
  }
  assert.equal(checked, 21);
});

test('as camadas são desenhadas na ordem do manifest (ferramenta atrás, ..., ferramenta na frente)', async () => {
  const { renderer } = setup();
  await renderer.preload(DEFAULT_APPEARANCE);
  const drawn = selection => renderer.composeFrame(DEFAULT_APPEARANCE, selection).log
    .filter(line => line.startsWith('drawImage')).map(line => path.basename(line.split(' ')[1], '.png'));
  assert.deepEqual(drawn(select({ action: 'chop', facing: 'east', progress: .3 })), TOOL_ORDER);
  assert.deepEqual(drawn(select({ action: 'walk', facing: 'north', phase: 1 })), ['corpo', 'calca_botas', 'tunica', 'gorro']);
  // `omit` tira o gorro sem mudar a ordem das demais.
  const noHat = renderer.composeFrame(DEFAULT_APPEARANCE, select({ action: 'idle' }), { omit: ['gorro'] });
  assert.deepEqual(noHat.log.filter(l => l.startsWith('drawImage')).map(l => path.basename(l.split(' ')[1], '.png')), ['corpo', 'calca_botas', 'tunica']);
});

test('trocar túnica e pele recolore só os pixels dessas rampas e o resto fica como na arte', async () => {
  const { renderer } = setup();
  const appearance = { ...DEFAULT_APPEARANCE, coat: 0, skin: 2 };
  await renderer.preload(appearance);
  const selection = { ...select({ action: 'walk', facing: 'southeast' }), frame: 3 };
  const canvas = renderer.composeFrame(appearance, selection);
  const original = renderer.composeFrame(DEFAULT_APPEARANCE, selection);
  const union = {
    ...buildMapping(manifest.recolor.layers.corpo.ramps, appearance),
    ...buildMapping(manifest.recolor.layers.tunica.ramps, appearance),
  };
  const expected = recolorRGBA(cellOf(await composite('andar'), 1, 3), union);
  assert.deepEqual([...canvas.data], [...expected]);
  assert.notDeepEqual([...canvas.data], [...original.data]);
  // alfa nunca muda
  for (let i = 3; i < canvas.data.length; i += 4) assert.equal(canvas.data[i], original.data[i]);
});

test('cache de quadros: segundo pedido igual não recompõe nem recarrega', async () => {
  const { renderer, calls, canvases } = setup();
  await renderer.preload(DEFAULT_APPEARANCE, { anims: ['parado'] });
  assert.equal(calls.length, 4);
  const selection = select({ action: 'idle', nowMs: 260 });
  const first = renderer.composeFrame(DEFAULT_APPEARANCE, selection);
  const made = canvases.length;
  const second = renderer.composeFrame(DEFAULT_APPEARANCE, selection);
  assert.equal(second, first, 'mesmo canvas');
  assert.equal(canvases.length, made, 'nenhum canvas novo');
  assert.deepEqual([renderer.stats().frameHits, renderer.stats().frameMisses], [1, 1]);
  // aparência com o mesmo recolor (índices iguais) usa a mesma chave; outra cor, não.
  assert.equal(renderer.composeFrame({ ...DEFAULT_APPEARANCE }, selection), first);
  await renderer.preload({ ...DEFAULT_APPEARANCE, coat: 1 }, { anims: ['parado'] });
  assert.notEqual(renderer.composeFrame({ ...DEFAULT_APPEARANCE, coat: 1 }, selection), first);
  assert.equal(calls.length, 4, 'atlas carregados uma vez só');
});

test('cache de camadas recoloridas é por (camada, mapeamento): outra pele reaproveita a túnica', async () => {
  const { renderer } = setup();
  const a = { ...DEFAULT_APPEARANCE, coat: 3, skin: 1 };
  const b = { ...DEFAULT_APPEARANCE, coat: 3, skin: 2 };
  await renderer.preload(a, { anims: ['parado'] });
  const selection = select({ action: 'idle' });
  renderer.composeFrame(a, selection);
  assert.deepEqual([renderer.stats().recolorMisses, renderer.stats().recolorHits], [2, 0], 'corpo e túnica');
  renderer.composeFrame(b, selection);
  assert.deepEqual([renderer.stats().recolorMisses, renderer.stats().recolorHits], [3, 1], 'túnica reaproveitada, corpo novo');
});

test('LRU de quadros: respeita o limite e descarta o menos usado', async () => {
  const { renderer } = setup({ limits: { maxFrames: 3 } });
  await renderer.preload(DEFAULT_APPEARANCE, { anims: ['andar'] });
  const at = frame => renderer.composeFrame(DEFAULT_APPEARANCE, { ...select({ action: 'walk' }), frame });
  const f0 = at(0); at(1); at(2);
  assert.equal(at(0), f0, 'quadro 0 usado de novo (vira o mais recente)');
  at(3); // expulsa o quadro 1
  assert.equal(renderer.stats().frames, 3);
  assert.equal(at(0), f0, 'o 0 sobreviveu');
  const missesBefore = renderer.stats().frameMisses;
  at(1);
  assert.equal(renderer.stats().frameMisses, missesBefore + 1, 'o 1 foi descartado e recomposto');
  for (let frame = 0; frame < 8; frame++) at(frame);
  assert.ok(renderer.stats().frames <= 3);
});

test('LRU de células recoloridas respeita o limite', async () => {
  const { renderer } = setup({ limits: { maxRecoloredCells: 4, maxFrames: 100 } });
  const appearance = { ...DEFAULT_APPEARANCE, coat: 4, skin: 3 };
  await renderer.preload(appearance, { anims: ['andar'] });
  for (let frame = 0; frame < 8; frame++) renderer.composeFrame(appearance, { ...select({ action: 'walk' }), frame });
  assert.equal(renderer.stats().recoloredCells, 4);
  assert.equal(renderer.stats().frames, 8);
});

test('draw: usa o pivô (48, 84) x escala, sem suavização, e devolve true', async () => {
  const { renderer, createCanvas } = setup();
  await renderer.preload(DEFAULT_APPEARANCE, { anims: ['parado'] });
  const target = createCanvas(300, 300);
  const context = target.getContext('2d');
  const selection = select({ action: 'idle', facing: 'south' });
  assert.equal(renderer.draw(context, 150, 200, DEFAULT_APPEARANCE, selection), true);
  assert.equal(context.imageSmoothingEnabled, false);
  assert.deepEqual(target.log.filter(l => /^(save|restore|translate|scale)/.test(l)), ['save', 'translate 150 200', 'scale 1', 'restore']);
  const cell = cellOf(await composite('parado'), 0, 0);
  // o pixel do cartaz (48+dx, 84+dy) cai em (150+dx, 200+dy)
  for (const [x, y] of [[48, 84], [40, 60], [50, 20]]) {
    for (let c = 0; c < 4; c++) assert.equal(target.data[((200 - 84 + y) * 300 + 150 - 48 + x) * 4 + c] ?? 0, cell[(y * 96 + x) * 4 + c]);
  }
  // escala 2: célula 192x192 ancorada em (48*2, 84*2)
  const big = createCanvas(400, 400);
  assert.equal(renderer.draw(big.getContext('2d'), 200, 300, DEFAULT_APPEARANCE, selection, { scale: 2 }), true);
  for (const [x, y] of [[48, 84], [40, 60]]) {
    for (let c = 0; c < 4; c++) assert.equal(big.data[((300 - 168 + y * 2) * 400 + 200 - 96 + x * 2) * 4 + c], cell[(y * 96 + x) * 4 + c]);
  }
  // coordenadas fracionárias arredondam
  const frac = createCanvas(300, 300);
  renderer.draw(frac.getContext('2d'), 150.4, 199.6, DEFAULT_APPEARANCE, selection);
  assert.deepEqual(frac.data, target.data);
});

test('draw devolve false sem desenhar: não suportado, sem contexto ou ainda carregando; e dispara a carga', async () => {
  const { renderer, calls, createCanvas } = setup();
  const target = createCanvas(200, 200);
  const context = target.getContext('2d');
  assert.equal(renderer.draw(context, 100, 100, DEFAULT_APPEARANCE, select({ action: 'jump' })), false);
  assert.equal(renderer.draw(null, 100, 100, DEFAULT_APPEARANCE, select({ action: 'idle' })), false);
  assert.equal(renderer.draw(context, 100, 100, DEFAULT_APPEARANCE, undefined), false);
  assert.equal(calls.length, 0, 'nada pedido para ação sem arte');
  const idle = select({ action: 'idle' });
  assert.equal(renderer.draw(context, 100, 100, DEFAULT_APPEARANCE, idle), false, 'atlas ainda não decodificado');
  assert.equal(target.log.length, 0);
  assert.equal(calls.length, 4, 'a primeira tentativa começou a carga');
  assert.equal(renderer.isReady('parado'), false);
  await renderer.preload(DEFAULT_APPEARANCE, { anims: ['parado'] });
  assert.equal(renderer.isReady('parado'), true);
  assert.equal(renderer.draw(context, 100, 100, DEFAULT_APPEARANCE, idle), true);
  assert.equal(calls.length, 4);
  // índice de quadro fora do atlas nunca desenha
  assert.equal(renderer.draw(context, 100, 100, DEFAULT_APPEARANCE, { ...idle, frame: 4 }), false);
  assert.equal(renderer.draw(context, 100, 100, DEFAULT_APPEARANCE, { ...idle, direction: 8 }), false);
});

test('preload carrega cada atlas desenhável uma vez e relata falhas, com nova tentativa depois do prazo', async () => {
  let clock = 1000;
  const failUrl = `${PAPERDOLL_BASE_URL}atlases/andar/gorro.png`;
  const failing = new Set([failUrl]);
  const { renderer, calls } = setup({ failing, now: () => clock });
  const result = await renderer.preload(DEFAULT_APPEARANCE);
  assert.deepEqual(result, { loaded: 13, failed: 1 }, '4 + 4 + 6 desenháveis; a ferramenta inteira não é desenhada');
  assert.equal(calls.filter(url => url.endsWith('ferramenta.png')).length, 0);
  await renderer.preload(DEFAULT_APPEARANCE);
  assert.equal(calls.length, 14, 'sem nova tentativa antes do prazo');
  assert.equal(renderer.isReady('andar'), false);
  assert.equal(renderer.draw(createFakeCanvasFactory().createCanvas(99, 99).getContext('2d'), 50, 50, DEFAULT_APPEARANCE, select({ action: 'walk' })), false);
  failing.clear();
  clock += 5001;
  assert.deepEqual(await renderer.preload(DEFAULT_APPEARANCE), { loaded: 14, failed: 0 });
  assert.equal(calls.length, 15);
  assert.equal(renderer.isReady('andar'), true);
});

test('stats informa o consumo estimado e clear() esvazia os caches', async () => {
  const { renderer } = setup();
  await renderer.preload(DEFAULT_APPEARANCE);
  const stats = renderer.stats();
  assert.equal(stats.loadedImages, 14);
  assert.equal(stats.imageBytes, (4 * 384 * 768 + 4 * 768 * 768 + 6 * 768 * 768) * 4);
  assert.ok(stats.imageBytes < 28 * 1024 * 1024, 'orçamento de atlas decodificados');
  renderer.composeFrame(DEFAULT_APPEARANCE, select({ action: 'idle' }));
  assert.equal(renderer.stats().frames, 1);
  renderer.clear();
  assert.deepEqual([renderer.stats().frames, renderer.stats().recoloredCells], [0, 0]);
});

test('o renderizador exige manifest, loadImage e createCanvas', () => {
  assert.throws(() => createPaperdollRenderer({}), /manifest/);
  assert.throws(() => createPaperdollRenderer({ manifest, baseUrl: 'file:///x/' }), /loadImage/);
});

test('loadPaperdollManifest valida o JSON carregado por fetchJson injetado', async () => {
  const urls = [];
  const loaded = await loadPaperdollManifest({
    baseUrl: PAPERDOLL_BASE_URL.slice(0, -1),
    fetchJson: async url => { urls.push(url); return JSON.parse(await readFile(fileForUrl(url), 'utf8')); },
  });
  assert.deepEqual(urls, [`${PAPERDOLL_BASE_URL}manifest.json`]);
  assert.equal(loaded.baseUrl, PAPERDOLL_BASE_URL);
  assert.equal(loaded.manifest.name, 'character-paperdoll-v1');
  await assert.rejects(loadPaperdollManifest({ fetchJson: async () => ({ schemaVersion: 2 }) }), /inválido/);
});

test('index.mjs exporta a API pública', () => {
  for (const name of ['createPaperdollRenderer', 'selectPaperdollFrame', 'loadPaperdollManifest', 'parsePaperdollManifest',
    'validatePaperdollManifest', 'buildMapping', 'recolorRGBA', 'paperdollHandSocket', 'PAPERDOLL_FACINGS']) {
    assert.ok(api[name], name);
  }
});
