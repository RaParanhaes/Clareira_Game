import { normalizeWorldDefinition } from './world-edits.mjs';

export const DIMENSION_COORDINATE_OFFSET = 80;
export const WORLD_COORDINATE_VERSION = 2;

// Authored surface plan for the shared dimension. These edits are seeded once
// into the server's world document, then remain editable like other map work.
const BASE_DIMENSION_LAYOUT_EDITS = [
  // A protected woodland around the existing arrival clearing.
  { id: 'dimension-forest-arrival', type: 'forest', x: 22, y: 24, radius: 38 },
  // Continue the arrival woodland south-east beyond the cabins, leaving the
  // existing doors and their clearings untouched while giving the village a
  // wider natural edge to grow into.
  { id: 'dimension-forest-arrival-east', type: 'forest', x: 65, y: 40, radius: 26 },
  { id: 'dimension-forest-arrival-south', type: 'forest', x: 28, y: 75, radius: 24 },
  { id: 'dimension-clearing-arrival', type: 'clearing', x: 8.2, y: 12.3, radius: 8 },
  // A small, calm village surrounds the arrival trail. These open pockets leave
  // room for porches, signboards and people to gather without squeezing paths.
  { id: 'dimension-clearing-village-square', type: 'clearing', x: 18, y: 17, radius: 13 },
  { id: 'dimension-clearing-pine-inn', type: 'clearing', x: 15, y: 25, radius: 10 },
  { id: 'dimension-clearing-ember-hotel', type: 'clearing', x: 29, y: 6, radius: 13 },
  { id: 'dimension-clearing-rill-guesthouse', type: 'clearing', x: 3.5, y: 28, radius: 9 },
  { id: 'dimension-clearing-cedar-cabin-one', type: 'clearing', x: 25.5, y: 20, radius: 6 },
  { id: 'dimension-clearing-cedar-cabin-two', type: 'clearing', x: 33.5, y: 31, radius: 6 },
  { id: 'dimension-clearing-cedar-cabin-three', type: 'clearing', x: 41.5, y: 10, radius: 6 },

  // Woods are separated by open travel corridors and meadow regions.
  { id: 'dimension-forest-raven', type: 'forest', x: 112, y: 82, radius: 38 },
  { id: 'dimension-forest-goblin-west', type: 'forest', x: 236, y: 108, radius: 44 },
  { id: 'dimension-forest-goblin-east', type: 'forest', x: 272, y: 126, radius: 38 },
  { id: 'dimension-forest-stone-pines', type: 'forest', x: 506, y: 190, radius: 42 },
  { id: 'dimension-forest-mist', type: 'forest', x: 350, y: 279, radius: 42 },
  { id: 'dimension-forest-south', type: 'forest', x: 145, y: 438, radius: 46 },
  { id: 'dimension-forest-lakeside', type: 'forest', x: 552, y: 344, radius: 42 },
  { id: 'dimension-forest-old-growth', type: 'forest', x: 405, y: 488, radius: 46 },
  { id: 'dimension-meadow-slimes', type: 'clearing', x: 137, y: 57, radius: 28 },
  { id: 'dimension-meadow-crossing', type: 'clearing', x: 330, y: 157, radius: 26 },
  { id: 'dimension-meadow-south', type: 'clearing', x: 297, y: 395, radius: 25 },
  { id: 'dimension-meadow-east', type: 'clearing', x: 455, y: 266, radius: 24 },

  // Mountain ranges: the north-eastern range is the highest and holds the nest.
  { id: 'dimension-mountain-nest-west', type: 'mountain', x: 455, y: 76, radius: 44 },
  { id: 'dimension-mountain-nest-peak', type: 'mountain', x: 486, y: 62, radius: 36 },
  { id: 'dimension-mountain-nest-east', type: 'mountain', x: 515, y: 93, radius: 32 },
  { id: 'dimension-hill-nest-foothills', type: 'hill', x: 431, y: 112, radius: 34 },
  { id: 'dimension-mountain-west', type: 'mountain', x: 103, y: 190, radius: 34 },
  { id: 'dimension-hill-west', type: 'hill', x: 126, y: 212, radius: 30 },
  { id: 'dimension-mountain-middle-west', type: 'mountain', x: 285, y: 222, radius: 40 },
  { id: 'dimension-mountain-middle-east', type: 'mountain', x: 328, y: 242, radius: 36 },
  { id: 'dimension-hill-middle', type: 'hill', x: 300, y: 268, radius: 32 },
  { id: 'dimension-mountain-south-west', type: 'mountain', x: 352, y: 548, radius: 46 },
  { id: 'dimension-mountain-south-east', type: 'mountain', x: 402, y: 568, radius: 38 },

  // Broad, shallow basins balance the highlands without forming blocked cliffs.
  { id: 'dimension-depression-west-basin', type: 'depression', x: 190, y: 314, radius: 32 },
  { id: 'dimension-depression-east-basin', type: 'depression', x: 450, y: 388, radius: 36 },

  // The mirror lake opens into the north river through a broad, authored cove.
  // Offsets are relative to the lake center; legacy lakes remain circular.
  { id: 'dimension-lake-mirror', type: 'lake', x: 557, y: 345, radius: 26, waterKind: 'lake',
    outline: [[-14,-10],[-8,-15],[0,-18],[8,-16],[15,-11],[19,-4],[20,3],[17,10],[11,16],[3,19],[-5,18],[-12,14],[-16,9],[-12,5],[-10,2],[-16,0],[-21,-3],[-25,-7],[-22,-10],[-17,-11]] },
  { id: 'dimension-lake-reeds', type: 'lake', x: 181, y: 174, radius: 9, waterKind: 'pond' },
  { id: 'dimension-lake-ravens', type: 'lake', x: 314, y: 74, radius: 8, waterKind: 'pond' },
  { id: 'dimension-lake-ruins', type: 'lake', x: 390, y: 286, radius: 12, waterKind: 'lake' },
  { id: 'dimension-lake-south', type: 'lake', x: 514, y: 451, radius: 10, waterKind: 'pond' },

  // Creature territories are map-planning zones; they do not spawn creatures yet.
  { id: 'dimension-zone-goblins', type: 'creature-zone', x: 254, y: 111, radius: 42, creatureKind: 'goblin', density: 'high' },
  { id: 'dimension-zone-goblins-pines', type: 'creature-zone', x: 505, y: 193, radius: 30, creatureKind: 'goblin', density: 'low' },
  { id: 'dimension-zone-slimes-west', type: 'creature-zone', x: 137, y: 57, radius: 25, creatureKind: 'slime', density: 'medium' },
  { id: 'dimension-zone-slimes-crossing', type: 'creature-zone', x: 330, y: 157, radius: 22, creatureKind: 'slime', density: 'low' },
  { id: 'dimension-zone-slimes-south', type: 'creature-zone', x: 297, y: 395, radius: 22, creatureKind: 'slime', density: 'low' },
  { id: 'dimension-zone-dragon', type: 'creature-zone', x: 486, y: 70, radius: 44, creatureKind: 'dragon', density: 'boss' },

  // Named landmarks appear on the macro map; secret sites are admin-visible.
  { id: 'dimension-place-public-hotel', type: 'place', x: 70, y: 61, placeKind: 'hotel', name: 'Hotel da Clareira' },
  { id: 'dimension-place-ember-hotel', type: 'place', x: 29, y: 6, placeKind: 'hotel', name: 'Hotel das Brasas' },
  { id: 'dimension-place-pine-inn', type: 'place', x: 15, y: 25, placeKind: 'inn', name: 'Pousada dos Pinheiros' },
  { id: 'dimension-place-rill-guesthouse', type: 'place', x: 3.5, y: 28, placeKind: 'inn', name: 'Hospedaria do Riacho' },
  { id: 'dimension-place-cedar-cabin-one', type: 'place', x: 25.5, y: 20, placeKind: 'woodland', name: 'Cabana do Cedro' },
  { id: 'dimension-place-cedar-cabin-two', type: 'place', x: 33.5, y: 31, placeKind: 'woodland', name: 'Cabana da Samambaia' },
  { id: 'dimension-place-cedar-cabin-three', type: 'place', x: 41.5, y: 10, placeKind: 'woodland', name: 'Cabana do Mirante' },
  { id: 'dimension-place-castle', type: 'place', x: 302, y: 190, placeKind: 'castle', name: 'Castelo da Vigília' },
  { id: 'dimension-place-ruins-known', type: 'place', x: 111, y: 132, placeKind: 'ruins', name: 'Ruínas do Musgo' },
  { id: 'dimension-place-stones', type: 'place', x: 355, y: 354, placeKind: 'standing-stones', name: 'Marco das Três Pedras' },
  { id: 'dimension-place-tower', type: 'place', x: 534, y: 328, placeKind: 'broken-tower', name: 'Torre Quebrada' },
  { id: 'dimension-place-lakeside-inn', type: 'place', x: 540, y: 375, placeKind: 'inn', name: 'Estalagem do Lago' },
  { id: 'dimension-place-goblin-hidden', type: 'place', x: 225, y: 95, placeKind: 'goblin-camp', name: 'Acampamento oculto', secret: true },
  { id: 'dimension-place-goblin-watch', type: 'place', x: 251, y: 91, placeKind: 'goblin-camp', name: 'Posto de vigia goblin' },
  { id: 'dimension-place-goblin-camp', type: 'place', x: 273, y: 130, placeKind: 'goblin-camp', name: 'Acampamento goblin' },
  { id: 'dimension-place-dragon-cave', type: 'place', x: 486, y: 57, placeKind: 'dragon-cave', name: 'Caverna do Ninho' },
  { id: 'dimension-place-mine-west', type: 'place', x: 91, y: 187, placeKind: 'mine', name: 'Afloramento da Serra Oeste' },
  { id: 'dimension-place-mine-middle', type: 'place', x: 273, y: 226, placeKind: 'mine', name: 'Veio da Cordilheira Central' },
  { id: 'dimension-place-mine-east', type: 'place', x: 485, y: 159, placeKind: 'mine', name: 'Afloramento do Pinhal' },
  { id: 'dimension-place-mine-south', type: 'place', x: 345, y: 537, placeKind: 'mine', name: 'Veio dos Morros do Sul' },
  { id: 'dimension-place-secret-sanctuary', type: 'place', x: 155, y: 205, placeKind: 'secret-ruins', name: 'Santuário Soterrado', secret: true },
  { id: 'dimension-place-secret-grotto', type: 'place', x: 371, y: 304, placeKind: 'secret-cave', name: 'Gruta das Raízes', secret: true },
  { id: 'dimension-place-secret-ruins', type: 'place', x: 424, y: 264, placeKind: 'secret-ruins', name: 'Ruínas Encobertas', secret: true },
  { id: 'dimension-place-secret-waterfall', type: 'place', x: 510, y: 423, placeKind: 'secret-cave', name: 'Gruta da Queda', secret: true },
  { id: 'dimension-place-slime-west', type: 'place', x: 137, y: 57, placeKind: 'slime-field', name: 'Campos dos Slimes' },
  { id: 'dimension-place-slime-south', type: 'place', x: 297, y: 395, placeKind: 'slime-field', name: 'Pradaria do Sul' },
  { id: 'dimension-place-start-clearing', type: 'place', x: 8.2, y: 12.3, placeKind: 'meadow', name: 'Clareira de Chegada' },
  { id: 'dimension-place-lake-mirror', type: 'place', x: 557, y: 345, placeKind: 'lake', name: 'Lago Espelho' },
  { id: 'dimension-place-lake-reeds', type: 'place', x: 181, y: 174, placeKind: 'lake', name: 'Lagoa do Junco' },
  { id: 'dimension-place-raven-pond', type: 'place', x: 314, y: 74, placeKind: 'lake', name: 'Lagoa dos Corvos' },
  { id: 'dimension-place-forest-arrival', type: 'place', x: 22, y: 24, placeKind: 'woodland', name: 'Bosque da Clareira' },
  { id: 'dimension-place-forest-raven', type: 'place', x: 112, y: 82, placeKind: 'woodland', name: 'Bosque dos Corvos' },
  { id: 'dimension-place-forest-goblins', type: 'place', x: 253, y: 111, placeKind: 'woodland', name: 'Mata Fechada' },
  { id: 'dimension-place-forest-pines', type: 'place', x: 506, y: 190, placeKind: 'woodland', name: 'Pinhal das Pedras' },
  { id: 'dimension-place-forest-mist', type: 'place', x: 350, y: 279, placeKind: 'woodland', name: 'Bosque Nebuloso' },
  { id: 'dimension-place-forest-south', type: 'place', x: 145, y: 438, placeKind: 'woodland', name: 'Bosque do Sul' },
  { id: 'dimension-place-forest-lakeside', type: 'place', x: 552, y: 344, placeKind: 'woodland', name: 'Bosque da Lagoa' },
  { id: 'dimension-place-forest-old-growth', type: 'place', x: 405, y: 488, placeKind: 'woodland', name: 'Mata Antiga' },
  { id: 'dimension-place-range-nest', type: 'place', x: 486, y: 70, placeKind: 'mountain-range', name: 'Serra do Ninho' },
  { id: 'dimension-place-range-west', type: 'place', x: 103, y: 190, placeKind: 'mountain-range', name: 'Serra Oeste' },
  { id: 'dimension-place-range-middle', type: 'place', x: 306, y: 233, placeKind: 'mountain-range', name: 'Cordilheira Central' },
  { id: 'dimension-place-range-south', type: 'place', x: 376, y: 557, placeKind: 'mountain-range', name: 'Morros do Sul' },
  { id: 'dimension-place-meadow-crossing', type: 'place', x: 330, y: 157, placeKind: 'meadow', name: 'Campos da Travessia' },
  { id: 'dimension-place-meadow-east', type: 'place', x: 455, y: 266, placeKind: 'meadow', name: 'Campo do Leste' },

  // Finite deposits make the mountain mines useful before they feed a furnace.
  ...[
    ['copperVein', 102, 185, 5], ['copperVein', 281, 226, 5], ['copperVein', 478, 166, 5],
    ['ironVein', 119, 194, 4], ['ironVein', 319, 247, 4], ['ironVein', 372, 550, 4],
    ['coalSeam', 99, 199, 4], ['coalSeam', 299, 256, 4], ['coalSeam', 489, 176, 4],
  ].map(([resourceKind, x, y, quantity], index) => ({
    id: `dimension-deposit-${index + 1}`, type: 'resource', resourceKind, quantity, x, y,
  })),
];

export const DIMENSION_LAYOUT_EDITS = Object.freeze(BASE_DIMENSION_LAYOUT_EDITS.map(edit => Object.freeze({
  ...edit,
  x: edit.x + DIMENSION_COORDINATE_OFFSET,
  y: edit.y + DIMENSION_COORDINATE_OFFSET,
})));

// The routes use the same world coordinates as physics, terrain generation and
// the macro editor. Secret paths are still trails in-game, but are understated.
const BASE_DIMENSION_ROUTES = [
  [[8, 12], [26, 27], [46, 45], [70, 61], [105, 64], [137, 57], [178, 72], [215, 91], [239, 108], [267, 121]],
  [[70, 61], [89, 87], [105, 112], [111, 132], [131, 157], [160, 176], [204, 198], [247, 216], [295, 230], [350, 246], [400, 272], [454, 302], [510, 324], [557, 345]],
  [[111, 132], [101, 157], [92, 184], [103, 202], [126, 212]],
  [[204, 198], [236, 170], [269, 150], [300, 158], [330, 157], [355, 184], [382, 204]],
  [[350, 246], [374, 209], [399, 171], [430, 133], [454, 106], [473, 79], [486, 62]],
  [[350, 246], [335, 291], [318, 342], [297, 395], [310, 431], [352, 474], [376, 520], [390, 554]],
  [[400, 272], [450, 270], [494, 295], [526, 315], [540, 326], [537, 342], [537, 359], [540, 375], [536, 402], [520, 420], [510, 423]],
  [[267, 121], [301, 103], [345, 105], [385, 119], [431, 133]],
];

const BASE_DIMENSION_SECRET_ROUTES = [
  [[219, 104], [225, 95], [240, 87]],
  [[131, 157], [145, 179], [155, 205]],
  [[355, 274], [366, 292], [371, 304]],
  [[400, 272], [416, 268], [424, 264]],
  [[532, 424], [518, 426], [510, 423]],
];

const BASE_VILLAGE_ROUTES = [
  [[8, 12], [14, 10], [20, 7], [20, 12], [29, 13]],
  [[8, 12], [8, 19], [9.5, 21], [9.5, 29], [15, 29]],
  [[8, 19], [8, 24], [8, 32], [3.5, 32]],
  [[26, 27], [25.5, 25.7]],
  [[26, 27], [29, 31], [29, 36], [33.5, 36]],
  [[29, 13], [36.5, 15], [41.5, 15]],
];

const shiftRoutes = routes => Object.freeze(routes.map(route => Object.freeze(route.map(([x,y]) => Object.freeze([
  x + DIMENSION_COORDINATE_OFFSET, y + DIMENSION_COORDINATE_OFFSET,
])))));
export const DIMENSION_ROUTES = shiftRoutes(BASE_DIMENSION_ROUTES);
export const DIMENSION_SECRET_ROUTES = shiftRoutes(BASE_DIMENSION_SECRET_ROUTES);
export const DIMENSION_VILLAGE_ROUTES = shiftRoutes(BASE_VILLAGE_ROUTES);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const compileRouteSegments = routes => {
  const segments=[];
  for(const route of routes)for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i];
    segments.push({ax:a[0],ay:a[1],bx:b[0],by:b[1],left:Math.min(a[0],b[0]),right:Math.max(a[0],b[0]),top:Math.min(a[1],b[1]),bottom:Math.max(a[1],b[1])});
  }
  return Object.freeze(segments);
};
const dimensionRouteSegments=compileRouteSegments(DIMENSION_ROUTES);
const secretRouteSegments=compileRouteSegments(DIMENSION_SECRET_ROUTES);
const villageRouteSegments=compileRouteSegments(DIMENSION_VILLAGE_ROUTES);
function followsRoute(x, y, segments, radius) {
  for(let i=0;i<segments.length;i++){
    const segment=segments[i];
    if(x<segment.left-radius||x>segment.right+radius||y<segment.top-radius||y>segment.bottom+radius)continue;
    const dx=segment.bx-segment.ax,dy=segment.by-segment.ay;
    const t=clamp(((x-segment.ax)*dx+(y-segment.ay)*dy)/(dx*dx+dy*dy||1),0,1);
    if(Math.hypot(x-segment.ax-dx*t,y-segment.ay-dy*t)<=radius)return true;
  }
  return false;
}

export function isDimensionPathTile(x, y) {
  const villageRoad = followsRoute(x, y, villageRouteSegments, 1.3);
  return villageRoad || followsRoute(x, y, dimensionRouteSegments, .72) || isDimensionSecretPathTile(x, y);
}

export function isVillagePlazaTile(x, y) {
  const dx = (x - (DIMENSION_COORDINATE_OFFSET + 18)) / 3.8;
  const dy = (y - (DIMENSION_COORDINATE_OFFSET + 17)) / 3.2;
  return dx * dx + dy * dy <= 1;
}

export function isDimensionSecretPathTile(x, y) {
  return followsRoute(x, y, secretRouteSegments, .32);
}

export function seedDimensionLayout(definition) {
  const moveExistingLayout = definition.generationVersion < 3;
  const edits = moveExistingLayout
    ? definition.edits.map(edit => ({ ...edit, x: edit.x + DIMENSION_COORDINATE_OFFSET, y: edit.y + DIMENSION_COORDINATE_OFFSET }))
    : definition.edits;
  const existingIds = new Set(edits.map(edit => edit.id));
  const additions = DIMENSION_LAYOUT_EDITS.filter(edit => !existingIds.has(edit.id));
  const lakeTemplate = DIMENSION_LAYOUT_EDITS.find(edit => edit.id === 'dimension-lake-mirror');
  let migratedLake = false;
  const upgradedEdits = edits.map(edit => {
    if (edit.id !== lakeTemplate?.id || edit.outline || !lakeTemplate?.outline) return edit;
    migratedLake = true;
    return { ...edit, radius: Math.max(edit.radius, lakeTemplate.radius), outline: lakeTemplate.outline };
  });
  const generationVersion = Math.max(definition.generationVersion, 3);
  if (!moveExistingLayout && !additions.length && !migratedLake && generationVersion === definition.generationVersion) return definition;
  return normalizeWorldDefinition({ ...definition, revision: definition.revision + 1, generationVersion, edits: [...upgradedEdits, ...additions] });
}
