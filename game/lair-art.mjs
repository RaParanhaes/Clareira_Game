import { CLAREIRA } from './theme.mjs';
import { formatLairCountdown } from './lairs.mjs';

// Covil da Caverna do Ninho: morro de ardósia com boca escavada na encosta, em duas
// camadas, e baú. Sem DOM no carregamento do módulo; só as funções de pintura tocam o canvas.

// Grade lógica de 96×88. A âncora (48, 84) é o contato com o chão, no mesmo eixo de
// pivô dos personagens (célula 96×96, pivô em y 84).
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

const CENTER_X = LAIR_MOUTH.anchorX;
const GROUND_Y = LAIR_MOUTH.anchorY;
const MOUND_TOP_Y = 6;
const MOUND_BASE_HALF = 40; // meia largura do morro no chão (x 8–88)
const MOUND_TOP_HALF = 18;  // e no topo
const CAVE_TOP_Y = 40;      // ponta do arco da boca
const CAVE_SPRING_Y = 56;   // onde o arco vira parede reta
const CAVE_HALF_W = 13;     // meia largura interna da boca
const LIP_WIDTH = 3;        // espessura do aro de pedra à frente
const FLOOR_Y = 74;         // a partir daqui o chão da gruta fica mais claro
const DIRT_TOP_Y = 77;      // faixa de terra batida na entrada
const STRATUM_EVERY = 7;    // estratos horizontais na encosta

const rect = (x, y, w, h, color) => ({ x, y, w, h, color });

// Ruído determinístico por linha: -1, 0 ou 1. Mesma entrada, mesmo desenho (cache estável).
function rowJitter(y, salt) {
  const n = Math.sin((y + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return Math.floor((n - Math.floor(n)) * 3) - 1;
}

// Meia largura do morro em y: base larga no chão, topo mais estreito, bordas irregulares.
function moundHalfWidth(y) {
  const t = Math.min(1, Math.max(0, (GROUND_Y - y) / (GROUND_Y - MOUND_TOP_Y)));
  return MOUND_BASE_HALF - (MOUND_BASE_HALF - MOUND_TOP_HALF) * t ** 1.4 + rowJitter(y, 2);
}

// Meia largura interna da boca em y (0 acima da ponta do arco).
function caveHalfWidth(y) {
  if (y < CAVE_TOP_Y) return 0;
  if (y >= CAVE_SPRING_Y) return CAVE_HALF_W;
  const t = (CAVE_SPRING_Y - y) / (CAVE_SPRING_Y - CAVE_TOP_Y);
  return CAVE_HALF_W * Math.sqrt(Math.max(0, 1 - t * t));
}

// Parede da boca com bordas irregulares. Camada de fundo e aro usam esta mesma linha,
// então as duas camadas encaixam sem fresta.
function caveEdge(y) {
  const half = caveHalfWidth(y);
  return half > 0 ? Math.max(1, Math.round(half + rowJitter(y, 5))) : 0;
}

// Fundo da caverna (ATRÁS do personagem): o morro, a terra da entrada e a boca escura.
function moundRects() {
  const S = CLAREIRA.lair;
  const rects = [];
  for (let y = MOUND_TOP_Y; y < GROUND_Y; y += 1) {
    const half = Math.round(moundHalfWidth(y));
    const left = CENTER_X - half;
    const width = half * 2;
    rects.push(rect(left, y, width, 1, S.slate));
    rects.push(rect(left, y, 5, 1, S.slateLight));              // face iluminada à esquerda
    rects.push(rect(left + width - 7, y, 7, 1, S.slateShade));  // face em sombra à direita
    if (y % STRATUM_EVERY === 3) rects.push(rect(left + 6, y, width - 14, 1, S.slateShade));
    rects.push(rect(left, y, 1, 1, S.slateEdge), rect(left + width - 1, y, 1, 1, S.slateEdge));
  }
  // Musgo: manto no topo e gotas escorrendo pela borda esquerda da encosta.
  for (let y = MOUND_TOP_Y; y < 30; y += 1) {
    const half = Math.round(moundHalfWidth(y));
    if (y < MOUND_TOP_Y + 3) rects.push(rect(CENTER_X - half + 2, y, half * 2 - 4, 1, S.moss));
    else if (y % 3 === 0) rects.push(rect(CENTER_X - half + 2 + (y % 4), y, 2, 1, S.mossDark));
    if (y > MOUND_TOP_Y + 3 && y % 4 === 1) rects.push(rect(CENTER_X - half + 3, y, 2, 1, S.mossLight));
  }
  return rects;
}

// Terra batida na frente da boca: faixa que se alarga até o contato com o chão.
function dirtRects() {
  const S = CLAREIRA.lair;
  const rects = [];
  for (let y = DIRT_TOP_Y; y <= GROUND_Y; y += 1) {
    const half = 24 + (y - DIRT_TOP_Y);
    rects.push(rect(CENTER_X - half, y, half * 2, 1, S.dirt));
    rects.push(rect(CENTER_X - half + 3 + ((y * 7) % 18), y, 3, 1, S.dirtLight));
    rects.push(rect(CENTER_X + half - 6 - ((y * 5) % 12), y, 4, 1, S.dirtShade));
  }
  return rects;
}

// Vão escuro escavado na encosta: arco irregular, parede em sombra e chão da gruta.
// Vem depois da terra, então a boca fica por cima da faixa de terra.
function caveRects() {
  const S = CLAREIRA.lair;
  const rects = [];
  for (let y = CAVE_TOP_Y; y < GROUND_Y; y += 1) {
    const edge = caveEdge(y);
    if (edge <= 0) continue;
    const color = y >= FLOOR_Y ? S.floor : y < CAVE_TOP_Y + 4 ? S.slateShade : S.cavity;
    rects.push(rect(CENTER_X - edge, y, edge * 2, 1, color));
  }
  // Fendas da parede, para o fundo não ser um buraco liso.
  rects.push(rect(38, 50, 3, 2, S.recessA), rect(57, 60, 2, 2, S.recessB), rect(42, 66, 2, 1, S.recessB));
  return rects;
}

// Aro de pedra à frente do personagem: só nas bordas da boca. O vão central fica
// sem cobertura, para o personagem aparecer entre as duas camadas.
function lipRects() {
  const S = CLAREIRA.lair;
  const rects = [];
  for (let y = CAVE_TOP_Y - LIP_WIDTH; y < GROUND_Y - 1; y += 1) {
    const edge = caveEdge(y);
    if (edge > 0) {
      rects.push(rect(CENTER_X - edge - LIP_WIDTH, y, LIP_WIDTH - 1, 1, S.slateLight));
      rects.push(rect(CENTER_X - edge - 1, y, 1, 1, S.slateEdge));
      rects.push(rect(CENTER_X + edge, y, 1, 1, S.slateEdge));
      rects.push(rect(CENTER_X + edge + 1, y, LIP_WIDTH - 1, 1, S.slateShade));
    } else {
      rects.push(rect(CENTER_X - LIP_WIDTH, y, LIP_WIDTH * 2, 1, S.slate)); // ponta do arco
    }
  }
  // Pedra-chave no topo do arco.
  rects.push(rect(CENTER_X - 5, CAVE_TOP_Y - 6, 10, 4, S.slateLight));
  rects.push(rect(CENTER_X - 5, CAVE_TOP_Y - 3, 10, 1, S.slateShade));
  return rects;
}

// Pedras soltas em volta da entrada, longe do vão: [x, y, largura, altura] na grade.
const LOOSE_STONES = Object.freeze([[10, 76, 7, 5], [20, 82, 6, 3], [25, 70, 3, 2], [71, 81, 7, 4], [79, 74, 6, 5], [86, 80, 4, 3]]);

function stoneRects([x, y, w, h]) {
  const S = CLAREIRA.lair;
  return [
    rect(x, y, w, h, S.slate),
    rect(x, y, w, 1, S.slateLight),
    rect(x, y + h - 1, w, 1, S.slateShade),
    rect(x + 1, y, 2, 1, S.mossDark),
  ];
}

export function lairMouthRects(layer) {
  if (layer === 'back') return [...moundRects(), ...dirtRects(), ...caveRects()];
  if (layer === 'front') return [...lipRects(), ...LOOSE_STONES.flatMap(stoneRects)];
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

// Texto do botão de ação (aria-label/title) para o baú próximo.
export function lairPromptText(lair, now) {
  if (lair?.state === 'guarded') return 'Guardiões vigiam o baú';
  if (lair?.state === 'ready') return 'Abrir o baú do covil';
  if (lair?.state === 'cooldown') return Number.isFinite(lair.readyAt) ? `Baú vazio · volta em ${formatLairCountdown(lair.readyAt - now)}` : 'Baú vazio · volta em breve';
  if (lair?.state === 'empty') return 'Baú vazio';
  return 'Baú do covil';
}

// Texto do objetivo e do aviso local. O sucesso ("+2 pratas e Espada curta de
// ferro") vem do servidor; o cliente não o inventa.
export function lairStatusText(lair, now) {
  if (lair?.state === 'guarded') return 'Os guardiões ainda vigiam o baú.';
  if (lair?.state === 'ready') return 'O covil está limpo. Pressione E ou toque em Usar para abrir o baú.';
  if (lair?.state === 'cooldown') return Number.isFinite(lair.readyAt) ? `O baú volta a encher em ${formatLairCountdown(lair.readyAt - now)}.` : 'O baú volta a encher em breve.';
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
