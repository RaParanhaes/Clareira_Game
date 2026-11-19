// Decisões puras do minimapa calmo: o mapa fica fixo e só é redesenhado
// quando há um motivo real (chunk novo, dimensão, overview, exploração, etc.).
// O ponto do jogador é um marcador DOM que se move sem redesenhar o canvas.
// O tamanho do chunk vem de worldMapGrid.chunkSize em main.js, o mesmo usado
// pela exploração do mapa (world-map.mjs, worldMapCellIndex).
import { centerWorldMapOn, worldMapToScreen, worldMapTransform } from './world-map.mjs';

export const MINI_MAP_UPDATING_MS = 600;
export const MINI_MAP_UPDATING_LABEL = 'Atualizando…';
// Zoom fixo do minimapa compacto (o mesmo usado no desenho).
export const MINI_MAP_ZOOM = 5;

// Chave do chunk que contém a posição, no mesmo critério de worldMapCellIndex.
// Retorna null quando a posição ou o tamanho do chunk não são válidos.
export function chunkKeyFor(position, chunkSize) {
 const size = Number(chunkSize);
 if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y) || !(size > 0)) return null;
 return `${Math.floor(position.x / size)},${Math.floor(position.y / size)}`;
}

// Centro do chunk que contém a posição, em coordenadas do mundo.
export function chunkCenterFor(position, chunkSize) {
 const size = Number(chunkSize);
 if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y) || !(size > 0)) return null;
 return {
  x: (Math.floor(position.x / size) + 0.5) * size,
  y: (Math.floor(position.y / size) + 0.5) * size,
 };
}

// Decide se o canvas do minimapa precisa ser redesenhado neste momento.
// Parado ou andando dentro do mesmo chunk, nada muda.
export function shouldRedrawMiniMap({
 prevChunkKey = null,
 nextChunkKey = null,
 dimensionChanged = false,
 explorationGainedChunk = false,
 dialogJustClosed = false,
 overviewChanged = false,
 firstDraw = false,
 selectionChanged = false,
 revealAllChanged = false,
} = {}) {
 if (firstDraw || dimensionChanged || overviewChanged || explorationGainedChunk) return true;
 if (dialogJustClosed || selectionChanged || revealAllChanged) return true;
 if (!nextChunkKey) return false;
 return prevChunkKey !== nextChunkKey;
}

// Mostra o "Atualizando…" só quando o jogador troca de chunk na mesma dimensão.
export function shouldFlashMiniMapUpdate({
 prevChunkKey = null,
 nextChunkKey = null,
 dimensionChanged = false,
 firstDraw = false,
} = {}) {
 return !firstDraw && !dimensionChanged && Boolean(prevChunkKey) && Boolean(nextChunkKey) && prevChunkKey !== nextChunkKey;
}

// Vista do minimapa centralizada no CENTRO do chunk atual (não no jogador).
// Usa centerWorldMapOn, a mesma função de main.js, então o recorte é idêntico ao desenho.
export function miniMapViewForChunk(position, chunkSize, { worldSize, width, height, base = { zoom: MINI_MAP_ZOOM, panX: 0, panY: 0 } } = {}) {
 const center = chunkCenterFor(position, chunkSize);
 if (!center) return null;
 return centerWorldMapOn({ ...base, zoom: MINI_MAP_ZOOM }, center, { worldSize, width, height });
}

// Posição de uma coordenada do mundo em px do canvas compacto (0..width, 0..height).
// Usa a mesma projeção de drawWorldMap (worldMapTransform + worldMapToScreen).
// Retorna null quando faltam dados válidos.
export function playerMarkerOffset(position, view, { worldSize, width, height } = {}) {
 if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return null;
 if (!view || !(width > 0) || !(height > 0) || !(worldSize > 0)) return null;
 const transform = worldMapTransform({ worldSize, width, height, ...view });
 return worldMapToScreen(position, transform);
}

// Converte um ponto em px do canvas compacto (0..width, 0..height) para px do elemento
// do marcador, usando métricas de layout já em cache (sem ler layout aqui).
// metrics: { offsetLeft, offsetTop, clientLeft, clientTop, clientWidth, clientHeight }.
export function miniMapMarkerScreenPosition(point, { width, height } = {}, metrics) {
 if (!point || !metrics || !(width > 0) || !(height > 0)) return null;
 const left = metrics.offsetLeft + metrics.clientLeft + (point.x / width) * metrics.clientWidth;
 const top = metrics.offsetTop + metrics.clientTop + (point.y / height) * metrics.clientHeight;
 return Number.isFinite(left) && Number.isFinite(top) ? { left, top } : null;
}
