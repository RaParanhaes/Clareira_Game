// Móveis predefinidos dos quartos privados (cabanas, quartos alugados e a casa
// inicial). Eles viram móveis comuns do quarto, com id estável, que o dono ou
// quem aluga pode mover e girar, mas não retirar. Os predefinidos moram no
// próprio array do quarto, então entram no mesmo salvamento e no mesmo cálculo
// de colisão dos demais móveis.
//
// Sem dependências: o servidor e o cliente usam as mesmas regras.

// Tipos de peça que viram predefinidos. Lareira e peças arquitetônicas ficam
// fixas no layout, porque não existem como móvel no atlas.
export const ROOM_PRESET_KINDS = Object.freeze([
  'bed', 'nightstand', 'wardrobe', 'bookshelf', 'desk', 'sofa', 'table', 'chair', 'plant', 'chest',
]);

const PRESET_KIND_SET = new Set(ROOM_PRESET_KINDS);

// Teto de segurança para predefinidos de um quarto (o maior layout tem 8).
export const MAX_ROOM_PRESETS = 16;

export function isPresetFurnitureKind(kind) {
  return PRESET_KIND_SET.has(kind);
}

// Movimento e colocação do jogador só aceitam meio tile. O predefinido nasce
// alinhado a essa grade, para ser válido desde o primeiro salvamento.
const snapHalfTile = value => Math.round(value * 2) / 2;

// Converte uma definição de predefinido do layout em item de quarto.
export function presetFurnitureItem(definition, index) {
  return Object.freeze({
    id: `preset-${index}`,
    kind: definition.kind,
    x: snapHalfTile(definition.x),
    y: snapHalfTile(definition.y),
    width: definition.width,
    depth: definition.depth,
    height: definition.height,
    palette: definition.palette,
    rotation: 0,
    preset: true,
  });
}

// Acrescenta, no mesmo array, os predefinidos que ainda não estão no quarto.
// É idempotente: um predefinido já salvo não é duplicado, e nunca volta depois
// de retirado, porque não pode ser retirado. Posição e rotação salvas vencem;
// tamanho e cor vêm sempre do layout, para o quarto continuar com a mesma área.
// Retorna o próprio array para manter referências vivas.
export function withPresetFurniture(furniture, layout) {
  if (!Array.isArray(furniture)) return furniture;
  const presets = layout?.presets || [];
  for (let index = 0; index < presets.length; index += 1) {
    const item = presetFurnitureItem(presets[index], index);
    const existing = furniture.find(candidate => candidate?.id === item.id);
    if (!existing) furniture.push({ ...item });
    else if (existing.preset === true) Object.assign(existing, { width: item.width, depth: item.depth, height: item.height, palette: item.palette });
  }
  return furniture;
}

export function isPresetFurniture(item) {
  return item?.preset === true;
}

// Só os móveis colocados pelo jogador contam para o limite de construção. Os
// predefinidos já estão no quarto e não devem tirar espaço de quem constrói.
export function placedFurnitureCount(furniture) {
  let count = 0;
  for (const item of furniture || []) if (!isPresetFurniture(item)) count += 1;
  return count;
}

export const PRESET_REMOVE_MESSAGE = 'Este móvel faz parte do quarto. Você pode mudar de lugar ou girar, mas não pode retirá-lo.';
