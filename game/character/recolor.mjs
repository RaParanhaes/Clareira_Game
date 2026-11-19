// Recolor por paleta do personagem em camadas. Funções puras, sem DOM.
//
// A arte aprovada usa poucas cores exatas por camada. O manifest agrupa essas cores em
// rampas (da sombra para a luz). Cada rampa pertence a um canal de aparência (pele, cabelo,
// túnica) ou é fixa. Recolorir é trocar cor-fonte exata por cor-alvo; nada é interpolado.
//
// REGRA FIXA (documentada porque define o resultado visual):
//  - A arte aprovada corresponde à opção PADRÃO de cada canal (DEFAULT_APPEARANCE.skin/hair/coat).
//    A cor de cada opção é expressa como razão por canal RGB em relação à opção padrão:
//        razão = cor da opção escolhida / cor da opção padrão
//    Assim a aparência padrão é exatamente a identidade (mapeamento vazio) e as demais
//    opções deslocam a arte inteira de forma proporcional.
//  - Cada cor da rampa vira  cor-fonte x razão  (por canal, arredondada). Se algum canal
//    passar de 255, os três canais são reduzidos juntos (mantém o matiz). Sombra e luz saem do
//    mesmo tom médio, na mesma proporção em que já existem na arte.
//  - Pele: SKINS traz base, luz e sombra. Cores da rampa mais escuras que o tom médio usam a
//    razão da sombra, a mais clara usa a da luz e o tom médio usa a da base.
//  - Cabelo e túnica: HAIR_COLORS e COATS têm uma única cor; todas as cores da rampa usam a mesma razão.
//  - Contornos e linhas internas (cores fixas) nunca mudam. Alfa nunca muda.
import { COATS, DEFAULT_APPEARANCE, HAIR_COLORS, SKINS, normalizeAppearance } from '../appearance.mjs';

// Canal de aparência -> opções [{ base, light?, shade? }] e índice padrão (= arte aprovada).
export const RECOLOR_CHANNELS = Object.freeze({
  skin: Object.freeze({
    field: 'skin',
    defaultIndex: DEFAULT_APPEARANCE.skin,
    options: Object.freeze(SKINS.map(([, base, light, shade]) => Object.freeze({ base, light, shade }))),
  }),
  hair: Object.freeze({
    field: 'hair',
    defaultIndex: DEFAULT_APPEARANCE.hair,
    options: Object.freeze(HAIR_COLORS.map(base => Object.freeze({ base }))),
  }),
  coat: Object.freeze({
    field: 'coat',
    defaultIndex: DEFAULT_APPEARANCE.coat,
    options: Object.freeze(COATS.map(base => Object.freeze({ base }))),
  }),
});

export function parseHexColor(value) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value));
  if (!match) throw new Error(`Cor inválida: ${value}`);
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHexColor([r, g, b]) {
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

// Multiplica por razão RGB; se algum canal passar de 255, reduz os três para manter o matiz.
function scaleColor(source, ratio) {
  const scaled = source.map((value, index) => Math.max(0, Math.round(value * ratio[index])));
  const peak = Math.max(...scaled);
  return peak > 255 ? scaled.map(value => Math.round(value * 255 / peak)) : scaled;
}

function ratioBetween(target, reference) {
  const t = parseHexColor(target);
  const r = parseHexColor(reference);
  return t.map((value, index) => value / Math.max(1, r[index]));
}

function tierFor(index, mid) {
  return index < mid ? 'shade' : index > mid ? 'light' : 'base';
}

/**
 * Traduz a aparência em mapeamento cor-fonte -> cor-alvo para as rampas de UMA camada.
 * `ramps` é manifest.recolor.layers[camada].ramps. Retorna objeto { '#rrggbb': '#rrggbb' }
 * só com as cores que mudam; a aparência padrão devolve {} (identidade).
 */
export function buildMapping(ramps, appearance) {
  const normalized = normalizeAppearance(appearance);
  const mapping = {};
  for (const ramp of Object.values(ramps || {})) {
    const channel = RECOLOR_CHANNELS[ramp.channel];
    if (!channel) continue; // rampa fixa
    const selected = channel.options[normalized[channel.field]];
    const reference = channel.options[channel.defaultIndex];
    ramp.colors.forEach((color, index) => {
      const tier = tierFor(index, ramp.mid);
      const target = selected[tier] ?? selected.base;
      const base = reference[tier] ?? reference.base;
      if (target.toLowerCase() === base.toLowerCase()) return;
      const next = toHexColor(scaleColor(parseHexColor(color), ratioBetween(target, base)));
      if (next !== color.toLowerCase()) mapping[color.toLowerCase()] = next;
    });
  }
  return mapping;
}

export function isIdentityMapping(mapping) {
  const entries = mapping instanceof Map ? [...mapping] : Object.entries(mapping || {});
  return entries.every(([from, to]) => String(from).toLowerCase() === String(to).toLowerCase());
}

// Chave estável do mapeamento (para caches). Identidade = ''.
export function mappingKey(mapping) {
  const entries = mapping instanceof Map ? [...mapping] : Object.entries(mapping || {});
  return entries
    .filter(([from, to]) => String(from).toLowerCase() !== String(to).toLowerCase())
    .map(([from, to]) => `${String(from).toLowerCase()}>${String(to).toLowerCase()}`)
    .sort()
    .join(',');
}

function packedLookup(mapping) {
  const lookup = new Map();
  for (const [from, to] of mapping instanceof Map ? mapping : Object.entries(mapping || {})) {
    const [fr, fg, fb] = parseHexColor(from);
    const [tr, tg, tb] = parseHexColor(to);
    lookup.set((fr << 16) | (fg << 8) | fb, [tr, tg, tb]);
  }
  return lookup;
}

/**
 * Troca cores exatas num buffer RGBA. Não altera o original. Alfa e pixels fora do
 * mapeamento são preservados (inclusive o RGB de pixels totalmente transparentes).
 */
export function recolorRGBA(rgba, mapping) {
  const out = new Uint8ClampedArray(rgba);
  const lookup = packedLookup(mapping);
  if (!lookup.size) return out;
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    const target = lookup.get((out[i] << 16) | (out[i + 1] << 8) | out[i + 2]);
    if (target) { out[i] = target[0]; out[i + 1] = target[1]; out[i + 2] = target[2]; }
  }
  return out;
}

/** Chave canônica da aparência, só com o que o recolor usa. */
export function appearanceRecolorKey(appearance) {
  const { skin, hair, coat } = normalizeAppearance(appearance);
  return `s${skin}-h${hair}-c${coat}`;
}
