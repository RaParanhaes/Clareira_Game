import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkKeyFor, chunkCenterFor, shouldRedrawMiniMap, shouldFlashMiniMapUpdate,
  miniMapViewForChunk, playerMarkerOffset, miniMapMarkerScreenPosition, MINI_MAP_UPDATING_MS, MINI_MAP_ZOOM,
} from './mini-map-refresh.mjs';
import { worldMapToScreen, worldMapTransform } from './world-map.mjs';
import { WORLD_SIZE } from './world-scale.mjs';

const CHUNK = 100;
const stay = { prevChunkKey: '1,1', nextChunkKey: '1,1' };

test('chunkKeyFor usa o mesmo tamanho de chunk da exploracao', () => {
  assert.equal(chunkKeyFor({ x: 0, y: 0 }, CHUNK), '0,0');
  assert.equal(chunkKeyFor({ x: 99.9, y: 99.9 }, CHUNK), '0,0');
  assert.equal(chunkKeyFor({ x: 100, y: 0 }, CHUNK), '1,0');
  assert.equal(chunkKeyFor({ x: 250, y: 310 }, CHUNK), '2,3');
});

test('chunkKeyFor recusa posicao ou tamanho invalidos', () => {
  assert.equal(chunkKeyFor(null, CHUNK), null);
  assert.equal(chunkKeyFor({ x: NaN, y: 1 }, CHUNK), null);
  assert.equal(chunkKeyFor({ x: 1, y: 1 }, 0), null);
  assert.equal(chunkKeyFor({ x: 1, y: 1 }, undefined), null);
});

test('mesmo chunk nao redesenha', () => {
  assert.equal(shouldRedrawMiniMap(stay), false);
});

test('chunk novo redesenha', () => {
  assert.equal(shouldRedrawMiniMap({ prevChunkKey: '1,1', nextChunkKey: '2,1' }), true);
});

test('sem posicao nao redesenha por chunk', () => {
  assert.equal(shouldRedrawMiniMap({ prevChunkKey: '1,1', nextChunkKey: null }), false);
});

test('dimensao mudou redesenha', () => {
  assert.equal(shouldRedrawMiniMap({ ...stay, dimensionChanged: true }), true);
});

test('overview mudou redesenha', () => {
  assert.equal(shouldRedrawMiniMap({ ...stay, overviewChanged: true }), true);
});

test('exploracao ganhou chunk redesenha', () => {
  assert.equal(shouldRedrawMiniMap({ ...stay, explorationGainedChunk: true }), true);
});

test('primeiro desenho redesenha', () => {
  assert.equal(shouldRedrawMiniMap({ firstDraw: true }), true);
});

test('dialogo fechou redesenha', () => {
  assert.equal(shouldRedrawMiniMap({ ...stay, dialogJustClosed: true }), true);
});

test('destino ou ver tudo alternado redesenha', () => {
  assert.equal(shouldRedrawMiniMap({ ...stay, selectionChanged: true }), true);
  assert.equal(shouldRedrawMiniMap({ ...stay, revealAllChanged: true }), true);
});

test('flash so ao trocar de chunk na mesma dimensao', () => {
  assert.equal(shouldFlashMiniMapUpdate({ prevChunkKey: '1,1', nextChunkKey: '2,1' }), true);
  assert.equal(shouldFlashMiniMapUpdate({ ...stay }), false);
  assert.equal(shouldFlashMiniMapUpdate({ prevChunkKey: '1,1', nextChunkKey: '2,1', dimensionChanged: true }), false);
  assert.equal(shouldFlashMiniMapUpdate({ prevChunkKey: '1,1', nextChunkKey: '2,1', firstDraw: true }), false);
  assert.equal(shouldFlashMiniMapUpdate({ prevChunkKey: null, nextChunkKey: '2,1' }), false);
  assert.ok(MINI_MAP_UPDATING_MS >= 500 && MINI_MAP_UPDATING_MS <= 700);
});

// --- marcador do jogador ---

const SIZE = { worldSize: 1000, width: 180, height: 132 };

test('chunkCenterFor devolve o centro do chunk', () => {
  assert.deepEqual(chunkCenterFor({ x: 250, y: 10 }, 100), { x: 250, y: 50 });
  assert.equal(chunkCenterFor({ x: 1, y: 1 }, 0), null);
});

test('playerMarkerOffset usa a mesma projecao de drawWorldMap', () => {
  const view = { zoom: 5, panX: 3, panY: -2 };
  const expected = worldMapToScreen({ x: 400, y: 600 }, worldMapTransform({ worldSize: 1000, width: 180, height: 132, ...view }));
  assert.deepEqual(playerMarkerOffset({ x: 400, y: 600 }, view, SIZE), expected);
});

test('playerMarkerOffset do centro do chunk cai no centro do canvas', () => {
  const view = miniMapViewForChunk({ x: 420, y: 430 }, 100, SIZE);
  const point = playerMarkerOffset({ x: 450, y: 450 }, view, SIZE);
  assert.ok(Math.abs(point.x - 90) < 1e-6, `x=${point.x}`);
  assert.ok(Math.abs(point.y - 66) < 1e-6, `y=${point.y}`);
});

test('playerMarkerOffset recusa dados invalidos', () => {
  const view = { zoom: 5, panX: 0, panY: 0 };
  assert.equal(playerMarkerOffset({ x: NaN, y: 1 }, view, SIZE), null);
  assert.equal(playerMarkerOffset({ x: 1, y: 1 }, null, SIZE), null);
  assert.equal(playerMarkerOffset({ x: 1, y: 1 }, view, { ...SIZE, width: 0 }), null);
  assert.equal(playerMarkerOffset({ x: 1, y: 1 }, view, { ...SIZE, worldSize: 0 }), null);
});

test('miniMapMarkerScreenPosition converte px do canvas com metricas em cache', () => {
  const metrics = { offsetLeft: 10, offsetTop: 20, clientLeft: 1, clientTop: 2, clientWidth: 360, clientHeight: 264 };
  // Canvas interno 180x132 desenhado; CSS mostra o dobro: o ponto (90,66) cai no centro do conteudo.
  assert.deepEqual(miniMapMarkerScreenPosition({ x: 90, y: 66 }, { width: 180, height: 132 }, metrics), { left: 10 + 1 + 180, top: 20 + 2 + 132 });
  assert.deepEqual(miniMapMarkerScreenPosition({ x: 0, y: 0 }, { width: 180, height: 132 }, metrics), { left: 11, top: 22 });
  assert.equal(miniMapMarkerScreenPosition({ x: 0, y: 0 }, { width: 180, height: 132 }, null), null);
  assert.equal(miniMapMarkerScreenPosition(null, { width: 180, height: 132 }, metrics), null);
  assert.equal(miniMapMarkerScreenPosition({ x: 1, y: 1 }, { width: 0, height: 132 }, metrics), null);
});

test('miniMapViewForChunk usa zoom fixo do minimapa', () => {
  assert.equal(miniMapViewForChunk({ x: 1, y: 1 }, 100, SIZE).zoom, MINI_MAP_ZOOM);
  assert.equal(miniMapViewForChunk(null, 100, SIZE), null);
});

// --- cobertura: o jogador sempre cabe na area visivel enquanto estiver no chunk ---
// Area visivel = recorte do desenho compacto, rect(12, 12, w-24, h-24).
// Canvas CSS: largura 116..236 px (breakpoints de style.css), altura = largura * 11/15.
test('o recorte centrado no chunk cobre o jogador em todos os chunks do mundo', () => {
  const chunkSize = Math.ceil(WORLD_SIZE / 48);
  const widths = [116, 138, 164, 190, 236];
  const samples = [[0.001, 0.001], [0.999, 0.001], [0.001, 0.999], [0.999, 0.999], [0.5, 0.5]];
  let worstMargin = Infinity, worstCanvas = Infinity;
  for (const width of widths) {
    const height = Math.round(width * 11 / 15);
    for (let cy = 0; cy < 48; cy++) for (let cx = 0; cx < 48; cx++) {
      const view = miniMapViewForChunk({ x: (cx + 0.5) * chunkSize, y: (cy + 0.5) * chunkSize }, chunkSize, { worldSize: WORLD_SIZE, width, height });
      for (const [fx, fy] of samples) {
        const point = playerMarkerOffset({ x: (cx + fx) * chunkSize, y: (cy + fy) * chunkSize }, view, { worldSize: WORLD_SIZE, width, height });
        const margin = Math.min(point.x - 12, width - 12 - point.x, point.y - 12, height - 12 - point.y);
        const canvasMargin = Math.min(point.x, width - point.x, point.y, height - point.y);
        worstMargin = Math.min(worstMargin, margin);
        worstCanvas = Math.min(worstCanvas, canvasMargin);
        // Dentro do canvas com folga para o marcador (8 px, raio 4 + 4 de respiro).
        assert.ok(canvasMargin >= 8, `fora do canvas: chunk ${cx},${cy} largura ${width} ponto ${fx},${fy} -> ${point.x.toFixed(1)},${point.y.toFixed(1)}`);
        // Recorte do desenho (inset 12): so pode faltar no rim do mundo, por ate ~2.5 px.
        assert.ok(margin >= -2.5, `alem do rim: chunk ${cx},${cy} largura ${width} ponto ${fx},${fy}`);
      }
    }
  }
  // Numeros medidos: pior distancia ao canvas e ao recorte de 12 px (para o relatorio).
  console.log(`cobertura: pior distancia ao canvas=${worstCanvas.toFixed(2)} px, pior margem ao recorte 12 px=${worstMargin.toFixed(2)} px`);
});
