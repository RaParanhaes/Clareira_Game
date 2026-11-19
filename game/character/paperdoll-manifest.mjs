// Manifest do personagem em camadas (paper doll): carregar, validar e consultar.
// Funções puras; só `loadPaperdollManifest` faz E/S, e por injeção.

export const PAPERDOLL_FACINGS = Object.freeze(['south', 'southeast', 'east', 'northeast', 'north', 'northwest', 'west', 'southwest']);
export const PAPERDOLL_CELL = Object.freeze({ width: 96, height: 96 });
export const PAPERDOLL_PIVOT = Object.freeze({ x: 48, y: 84 });
export const PAPERDOLL_LAYOUT = 'direction-rows-frames-horizontal';
export const PAPERDOLL_REQUIRED_ANIMATIONS = Object.freeze(['parado', 'andar', 'golpear']);
export const PAPERDOLL_ASSET_URL = new URL('../art/avatar-frames/character-paperdoll-v1/', import.meta.url).href;

const HEX = /^#[0-9a-f]{6}$/;

export function validatePaperdollManifest(manifest) {
  const errors = [];
  const fail = message => errors.push(message);
  if (!manifest || typeof manifest !== 'object') return ['manifest ausente ou inválido'];
  if (manifest.schemaVersion !== 1) fail('schemaVersion deve ser 1');
  if (manifest.canvas?.width !== PAPERDOLL_CELL.width || manifest.canvas?.height !== PAPERDOLL_CELL.height) fail('canvas deve ser 96x96');
  if (manifest.pivot?.x !== PAPERDOLL_PIVOT.x || manifest.pivot?.y !== PAPERDOLL_PIVOT.y) fail('pivot deve ser (48, 84)');
  if (JSON.stringify(manifest.facings) !== JSON.stringify(PAPERDOLL_FACINGS)) fail('facings fora da ordem do jogo');
  if (manifest.layout !== PAPERDOLL_LAYOUT) fail(`layout deve ser ${PAPERDOLL_LAYOUT}`);
  if (manifest.sampling !== 'nearest-neighbor') fail('sampling deve ser nearest-neighbor');

  const layers = manifest.layers && typeof manifest.layers === 'object' ? manifest.layers : {};
  if (!Object.keys(layers).length) fail('layers ausente');

  for (const facing of PAPERDOLL_FACINGS) {
    const order = manifest.layerOrder?.[facing];
    if (!Array.isArray(order) || !order.length) { fail(`layerOrder.${facing} ausente`); continue; }
    if (new Set(order).size !== order.length) fail(`layerOrder.${facing} repete camadas`);
    for (const name of order) if (!layers[name]) fail(`layerOrder.${facing} cita camada desconhecida ${name}`);
  }

  const animations = manifest.animations && typeof manifest.animations === 'object' ? manifest.animations : {};
  for (const anim of PAPERDOLL_REQUIRED_ANIMATIONS) {
    const spec = animations[anim];
    if (!spec) { fail(`animação ${anim} ausente`); continue; }
    if (!Number.isInteger(spec.frameCount) || spec.frameCount < 1) fail(`${anim}.frameCount inválido`);
    if (!(spec.frameDurationMs > 0)) fail(`${anim}.frameDurationMs inválido`);
    if (spec.runFrameDurationMs !== undefined && !(spec.runFrameDurationMs > 0)) fail(`${anim}.runFrameDurationMs inválido`);
    if (spec.atlasSize?.width !== spec.frameCount * PAPERDOLL_CELL.width
      || spec.atlasSize?.height !== PAPERDOLL_FACINGS.length * PAPERDOLL_CELL.height) {
      fail(`${anim}.atlasSize incompatível com frameCount x 8 direções`);
    }
    const atlases = spec.atlases || {};
    if (!Object.keys(atlases).length) fail(`${anim} sem atlas`);
    for (const [name, rel] of Object.entries(atlases)) {
      if (!layers[name]) fail(`${anim} tem atlas da camada desconhecida ${name}`);
      if (typeof rel !== 'string' || !rel.endsWith('.png') || rel.startsWith('/') || rel.includes('..')) fail(`${anim}/${name} com caminho inválido`);
    }
  }

  const recolorLayers = manifest.recolor?.layers || {};
  for (const [layerName, layer] of Object.entries(recolorLayers)) {
    if (!layers[layerName]) fail(`recolor cita camada desconhecida ${layerName}`);
    const seen = new Map();
    for (const [rampName, ramp] of Object.entries(layer.ramps || {})) {
      if (!Array.isArray(ramp.colors) || !ramp.colors.length || !ramp.colors.every(color => HEX.test(color))) {
        fail(`recolor.${layerName}.${rampName} com cores inválidas`);
        continue;
      }
      if (!Number.isInteger(ramp.mid) || ramp.mid < 0 || ramp.mid >= ramp.colors.length) fail(`recolor.${layerName}.${rampName}.mid fora da rampa`);
      if (ramp.channel !== null && !['skin', 'hair', 'coat'].includes(ramp.channel)) fail(`recolor.${layerName}.${rampName}.channel inválido`);
      for (const color of ramp.colors) {
        if (seen.has(color)) fail(`recolor.${layerName}: ${color} em duas rampas (${seen.get(color)}, ${rampName})`);
        seen.set(color, rampName);
      }
    }
    for (const fixed of Object.values(manifest.recolor?.fixedColors || {})) {
      if (seen.has(fixed)) fail(`recolor.${layerName}: cor fixa ${fixed} dentro de uma rampa`);
    }
  }

  const hand = manifest.sockets?.hand?.anchors;
  if (!hand) fail('sockets.hand ausente');
  else {
    for (const anim of PAPERDOLL_REQUIRED_ANIMATIONS) {
      for (const facing of PAPERDOLL_FACINGS) {
        const list = hand[anim]?.[facing];
        const count = animations[anim]?.frameCount;
        if (!Array.isArray(list) || list.length !== count || !list.every(item => Array.isArray(item) && item.length === 3 && item.every(Number.isFinite))) {
          fail(`sockets.hand.${anim}.${facing} deveria ter ${count} triplas [x, y, profundidade]`);
        }
      }
    }
  }
  return errors;
}

/** Valida e devolve uma cópia congelada do manifest; lança com todos os erros reunidos. */
export function parsePaperdollManifest(raw) {
  const manifest = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const errors = validatePaperdollManifest(manifest);
  if (errors.length) throw new Error(`Manifest do paper doll inválido:\n- ${errors.join('\n- ')}`);
  return deepFreeze(structuredClone(manifest));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Carrega o manifest. `fetchJson(url)` é injetável (testes e Node); por padrão usa fetch.
 * Devolve { manifest, baseUrl }.
 */
export async function loadPaperdollManifest({ baseUrl = PAPERDOLL_ASSET_URL, fetchJson } = {}) {
  const getJson = fetchJson || (async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Falha ao carregar ${url}: HTTP ${response.status}`);
    return response.json();
  });
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const manifest = parsePaperdollManifest(await getJson(new URL('manifest.json', base).href));
  return { manifest, baseUrl: base };
}

export function paperdollAtlasUrl(manifest, baseUrl, anim, layer) {
  const rel = manifest.animations?.[anim]?.atlases?.[layer];
  return rel ? new URL(rel, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).href : null;
}

/** Camadas a desenhar, em ordem, para (animação, direção): só as que têm atlas e `drawn`. */
export function paperdollLayersFor(manifest, anim, direction) {
  const facing = PAPERDOLL_FACINGS[direction] ?? PAPERDOLL_FACINGS[0];
  const spec = manifest.animations?.[anim];
  if (!spec) return [];
  return (manifest.layerOrder?.[facing] || []).filter(name => spec.atlases?.[name] && manifest.layers?.[name]?.drawn !== false);
}

/** Âncora da mão { x, y, depth } em pixels da célula 96x96 (y para baixo), ou null. */
export function paperdollHandSocket(manifest, anim, direction, frame) {
  const facing = PAPERDOLL_FACINGS[direction];
  const entry = manifest.sockets?.hand?.anchors?.[anim]?.[facing]?.[frame];
  return entry ? { x: entry[0], y: entry[1], depth: entry[2] } : null;
}

/** Origem (sx, sy) do quadro dentro do atlas. */
export function paperdollCellOrigin(direction, frame) {
  return { sx: frame * PAPERDOLL_CELL.width, sy: direction * PAPERDOLL_CELL.height };
}
