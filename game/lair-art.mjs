import { CLAREIRA } from './theme.mjs';

// Covil da Caverna do Ninho: boca procedural em duas camadas e baú.
// Sem DOM no carregamento do módulo; só as funções de pintura tocam o canvas.

// Boca em grade lógica de 96×88. A âncora (48, 84) é o contato com o chão,
// no mesmo eixo de pivô dos personagens (célula 96×96, pivô em y 84).
export const LAIR_MOUTH = Object.freeze({ width: 96, height: 88, anchorX: 48, anchorY: 84 });
export const LAIR_INTERACT_RADIUS = 1.8;
export const LAIR_CHEST_PATH_RADIUS = 0.3;

// PNG de interior já existente (medieval-baus-10, "cofre de relíquias").
// Medido no arquivo: 128×128, parte opaca x 53–75, y 70–95, contato em (64, 95).
export const LAIR_CHEST_CLOSED = Object.freeze({
  url: 'art/room-furniture/medieval-3d-v1/frames/medieval-baus-10-covered-rot0.png',
  size: 128, anchorX: 64, anchorY: 95,
});
// Versão aberta procedural, grade 24×24, contato em (12, 24).
export const LAIR_CHEST_OPEN = Object.freeze({ width: 24, height: 24, anchorX: 12, anchorY: 24 });

const ARCH_CENTER_Y = 52;
const ARCH_TOP_Y = 18;
const ARCH_RADIUS_X = 30;
const CENTER_X = 48;

function archHalfWidth(y) {
  if (y >= ARCH_CENTER_Y) return ARCH_RADIUS_X;
  const t = (ARCH_CENTER_Y - y) / (ARCH_CENTER_Y - ARCH_TOP_Y);
  return ARCH_RADIUS_X * Math.sqrt(Math.max(0, 1 - t * t));
}

// Fundo da caverna: fica ATRÁS do personagem. Aro de pedra, interior escuro e
// uma faixa mais clara no chão da gruta.
function backRects() {
  const rects = [];
  for (let y = ARCH_TOP_Y; y <= LAIR_MOUTH.anchorY; y += 1) {
    const outer = Math.round(archHalfWidth(y + 0.5));
    if (outer <= 0) continue;
    const inner = Math.max(0, outer - 4);
    rects.push({ x: CENTER_X - outer, y, w: outer * 2, h: 1, color: CLAREIRA.lair.rim });
    if (inner > 0) rects.push({ x: CENTER_X - inner, y, w: inner * 2, h: 1, color: y >= 74 ? CLAREIRA.lair.floor : CLAREIRA.lair.cavity });
  }
  rects.push({ x: 40, y: 38, w: 3, h: 2, color: CLAREIRA.lair.recessA }, { x: 56, y: 46, w: 2, h: 2, color: CLAREIRA.lair.recessB });
  return rects;
}

// Lábios de pedra: ficam À FRENTE do personagem. O vão central fica sem
// cobertura, para o personagem aparecer entre as duas camadas.
function frontRects() {
  const rects = [];
  // Pilares laterais, com luz à esquerda e sombra à direita.
  rects.push({ x: 8, y: 36, w: 16, h: 49, color: CLAREIRA.lair.stone }, { x: 8, y: 36, w: 3, h: 49, color: CLAREIRA.lair.stoneLight }, { x: 21, y: 36, w: 3, h: 49, color: CLAREIRA.lair.stoneShade });
  rects.push({ x: 72, y: 36, w: 16, h: 49, color: CLAREIRA.lair.stone }, { x: 85, y: 36, w: 3, h: 49, color: CLAREIRA.lair.stoneShade }, { x: 72, y: 36, w: 3, h: 49, color: CLAREIRA.lair.stoneLight });
  rects.push({ x: 10, y: 50, w: 4, h: 3, color: CLAREIRA.lair.stoneEdge }, { x: 19, y: 66, w: 3, h: 2, color: CLAREIRA.lair.chip }, { x: 74, y: 58, w: 4, h: 3, color: CLAREIRA.lair.stoneEdge }, { x: 80, y: 72, w: 3, h: 2, color: CLAREIRA.lair.chip });
  // Verga e pedra-chave no topo.
  rects.push({ x: 12, y: 14, w: 72, h: 8, color: CLAREIRA.lair.stone }, { x: 12, y: 14, w: 72, h: 1, color: CLAREIRA.lair.stoneLight }, { x: 12, y: 21, w: 72, h: 1, color: CLAREIRA.lair.stoneShade });
  rects.push({ x: 44, y: 10, w: 8, h: 4, color: CLAREIRA.lair.keystone });
  // Lábios que acompanham o arco externo.
  for (let y = 22; y < 36; y += 1) {
    const outer = Math.round(archHalfWidth(y + 0.5));
    if (outer <= 0) continue;
    rects.push({ x: CENTER_X - outer - 3, y, w: 6, h: 1, color: CLAREIRA.lair.stone });
    rects.push({ x: CENTER_X + outer - 3, y, w: 6, h: 1, color: CLAREIRA.lair.stone });
  }
  // Soleira no chão: a última linha é a âncora de contato.
  rects.push({ x: 6, y: 80, w: 84, h: 5, color: CLAREIRA.lair.threshold }, { x: 6, y: 80, w: 84, h: 1, color: CLAREIRA.lair.thresholdLight }, { x: 6, y: 84, w: 84, h: 1, color: CLAREIRA.lair.thresholdShade });
  return rects;
}

export function lairMouthRects(layer) {
  if (layer === 'back') return backRects();
  if (layer === 'front') return frontRects();
  throw new Error(`Camada de boca desconhecida: ${layer}`);
}

export function lairChestOpenRects() {
  return [
    { x: 2, y: 0, w: 20, h: 4, color: CLAREIRA.lair.woodTop }, { x: 2, y: 3, w: 20, h: 1, color: CLAREIRA.lair.woodRim },
    { x: 3, y: 4, w: 18, h: 4, color: CLAREIRA.lair.woodDeep },
    { x: 5, y: 6, w: 14, h: 3, color: CLAREIRA.lair.gold }, { x: 7, y: 6, w: 3, h: 1, color: CLAREIRA.lair.goldLight }, { x: 13, y: 6, w: 3, h: 1, color: CLAREIRA.lair.goldLight },
    { x: 2, y: 10, w: 20, h: 2, color: CLAREIRA.lair.woodBand },
    { x: 2, y: 12, w: 20, h: 11, color: CLAREIRA.lair.wood }, { x: 2, y: 22, w: 20, h: 1, color: CLAREIRA.lair.woodFoot },
    { x: 2, y: 12, w: 2, h: 11, color: CLAREIRA.lair.woodRim }, { x: 20, y: 12, w: 2, h: 11, color: CLAREIRA.lair.woodRim },
    { x: 6, y: 12, w: 2, h: 11, color: CLAREIRA.lair.iron }, { x: 15, y: 12, w: 2, h: 11, color: CLAREIRA.lair.iron },
  ];
}

// Pinta retângulos em escala inteira. origin é o canto superior esquerdo do canvas.
export function paintLairRects(ctx, rects, scale, originX = 0, originY = 0) {
  for (const rect of rects) {
    ctx.fillStyle = rect.color;
    ctx.fillRect(originX + rect.x * scale, originY + rect.y * scale, rect.w * scale, rect.h * scale);
  }
}

// Canto superior esquerdo da boca para um ponto de contato projetado na tela.
export function lairMouthOrigin(point, scale) {
  return { x: Math.round(point.x - LAIR_MOUTH.anchorX * scale), y: Math.round(point.y - LAIR_MOUTH.anchorY * scale) };
}

export function drawLairMouthLayer(ctx, point, layer, scale, cache) {
  const image = cache.get(`lair-mouth:${layer}:${scale}`, LAIR_MOUTH.width * scale, LAIR_MOUTH.height * scale,
    context => paintLairRects(context, lairMouthRects(layer), scale));
  const origin = lairMouthOrigin(point, scale);
  ctx.drawImage(image, origin.x, origin.y);
}

// Estado 'cooldown' e 'empty' mostram o baú aberto; 'guarded' e 'ready' fechado.
export function lairChestIsOpen(state) {
  return state === 'cooldown' || state === 'empty';
}

// Área que recebe toque no baú: só as partes opacas do sprite (fechado: x 53–75,
// y 70–95 do PNG de 128 px). Boca, sombras e adornos não entram aqui.
export function lairChestHitRect(state, point, scale) {
  if (lairChestIsOpen(state)) {
    return { x: point.x - LAIR_CHEST_OPEN.anchorX * scale, y: point.y - LAIR_CHEST_OPEN.anchorY * scale,
      w: LAIR_CHEST_OPEN.width * scale, h: LAIR_CHEST_OPEN.height * scale };
  }
  const { anchorX, anchorY } = LAIR_CHEST_CLOSED;
  return { x: point.x + (53 - anchorX) * scale, y: point.y + (70 - anchorY) * scale, w: (76 - 53) * scale, h: (96 - 70) * scale };
}

// Baú sob o ponteiro (coordenadas do canvas). toScreen(chest) projeta o contato
// do baú do mesmo modo que o desenho.
export function findLairChestAtPoint(lairs, pointer, toScreen, scale) {
  if (!pointer || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return null;
  for (const lair of Array.isArray(lairs) ? lairs : []) {
    const chest = lair?.chest;
    if (!Number.isFinite(chest?.x) || !Number.isFinite(chest?.y)) continue;
    const rect = lairChestHitRect(lair.state, toScreen(chest), scale);
    if (pointer.x >= rect.x && pointer.x < rect.x + rect.w && pointer.y >= rect.y && pointer.y < rect.y + rect.h) return lair;
  }
  return null;
}

let closedChestImage = null;
// Carregamento preguiçoso: o laço de render é contínuo, então o PNG aparece
// no quadro seguinte ao fim do carregamento, sem callback.
export function closedLairChestImage() {
  if (!closedChestImage && typeof Image === 'function') {
    closedChestImage = new Image();
    closedChestImage.src = new URL(LAIR_CHEST_CLOSED.url, import.meta.url).href;
  }
  return closedChestImage?.complete && closedChestImage.naturalWidth > 0 ? closedChestImage : null;
}

export function drawLairChest(ctx, point, state, scale, cache) {
  if (lairChestIsOpen(state)) {
    const image = cache.get(`lair-chest-open:${scale}`, LAIR_CHEST_OPEN.width * scale, LAIR_CHEST_OPEN.height * scale,
      context => paintLairRects(context, lairChestOpenRects(), scale));
    ctx.drawImage(image, Math.round(point.x - LAIR_CHEST_OPEN.anchorX * scale), Math.round(point.y - LAIR_CHEST_OPEN.anchorY * scale));
    return;
  }
  const image = closedLairChestImage();
  if (!image) return;
  const size = LAIR_CHEST_CLOSED.size * scale;
  ctx.drawImage(image, Math.round(point.x - LAIR_CHEST_CLOSED.anchorX * scale), Math.round(point.y - LAIR_CHEST_CLOSED.anchorY * scale), size, size);
}

// Coisas da cena para o laço de desenho. Boca de fundo e de frente têm chaves
// de profundidade separadas, para o personagem poder ficar entre elas.
// Profundidade relativa ao contato da boca: o fundo fica 1,2 unidade atrás da
// soma x+y do contato, e os lábios ficam logo à frente dele.
export const LAIR_BACK_DEPTH_OFFSET = -0.6;
export const LAIR_FRONT_DEPTH_OFFSET = 0.01;

export function lairSceneThings(lairs) {
  const things = [];
  for (const lair of Array.isArray(lairs) ? lairs : []) {
    if (!Number.isFinite(lair?.mouth?.x) || !Number.isFinite(lair?.mouth?.y)) continue;
    if (!Number.isFinite(lair?.chest?.x) || !Number.isFinite(lair?.chest?.y)) continue;
    const { x, y } = lair.mouth;
    things.push({ type: 'lair-mouth', layer: 'back', lairId: lair.id, x, y, sortX: x + LAIR_BACK_DEPTH_OFFSET, sortY: y + LAIR_BACK_DEPTH_OFFSET });
    things.push({ type: 'lair-mouth', layer: 'front', lairId: lair.id, x, y, sortX: x + LAIR_FRONT_DEPTH_OFFSET, sortY: y + LAIR_FRONT_DEPTH_OFFSET });
    things.push({ type: 'lair-chest', lairId: lair.id, x: lair.chest.x, y: lair.chest.y, state: lair.state });
  }
  return things;
}

// Escolhe o baú alcançável mais próximo. hasPath(from, to) é injetado: no
// cliente é hasClearInteractionPath; nos testes, uma função falsa.
export function findNearestLairChest(lairs, position, { hasPath, radius = LAIR_INTERACT_RADIUS } = {}) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  let nearest = null;
  let gap = radius;
  for (const lair of Array.isArray(lairs) ? lairs : []) {
    const chest = lair?.chest;
    if (!Number.isFinite(chest?.x) || !Number.isFinite(chest?.y)) continue;
    const distance = Math.hypot(position.x - chest.x, position.y - chest.y);
    if (distance > gap) continue;
    if (typeof hasPath === 'function' && !hasPath(position, chest)) continue;
    nearest = lair;
    gap = distance;
  }
  return nearest ? { ...nearest, distance: gap } : null;
}

function formatRemaining(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

// Texto do botão de ação (aria-label/title) para o baú próximo.
export function lairPromptText(lair, now) {
  if (lair?.state === 'guarded') return 'Guardiões vigiam o baú';
  if (lair?.state === 'ready') return 'Abrir o baú do covil';
  if (lair?.state === 'cooldown') return Number.isFinite(lair.readyAt) ? `Baú vazio · volta em ${formatRemaining(lair.readyAt - now)}` : 'Baú vazio · volta em breve';
  if (lair?.state === 'empty') return 'Baú vazio';
  return 'Baú do covil';
}

// Texto do objetivo e do aviso local. O sucesso ("+2 pratas e Espada curta de
// ferro") vem do servidor; o cliente não o inventa.
export function lairStatusText(lair, now) {
  if (lair?.state === 'guarded') return 'Os guardiões ainda vigiam o baú.';
  if (lair?.state === 'ready') return 'O covil está limpo. Pressione E ou toque em Usar para abrir o baú.';
  if (lair?.state === 'cooldown') return Number.isFinite(lair.readyAt) ? `O baú volta a encher em ${formatRemaining(lair.readyAt - now)}.` : 'O baú volta a encher em breve.';
  if (lair?.state === 'empty') return 'O baú está vazio por enquanto.';
  return '';
}

export const LAIR_TREASURE_REWARD_TEXT = '+2 pratas e Espada curta de ferro.';

// Cor da última camada que cobre o ponto (x, y); usada só pelos testes.
export function rectColorAt(rects, x, y) {
  let color = null;
  for (const rect of rects) {
    if (x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h) color = rect.color;
  }
  return color;
}
