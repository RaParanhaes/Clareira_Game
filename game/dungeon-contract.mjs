// Contrato do nível da masmorra: o formato que o gerador do servidor entrega e o renderer (dungeon-render.mjs) consome.
//
// Formato (objeto plano, sem DOM):
//   w        inteiro >= 3. Largura da grade, em células.
//   h        inteiro >= 3. Altura da grade, em células.
//   cells    Uint8Array de tamanho w*h. Índice da célula (x,y) = y*w + x.
//            Valor 1 = piso aberto; valor 0 = rocha. Nenhum outro valor.
//            A borda da grade (x = 0, x = w-1, y = 0, y = h-1) é só rocha: fora da grade conta como rocha.
//   seed     inteiro (32 bits). Define piso, paredes, estalagmites e variantes; mesma seed, mesmo nível visual.
//   torches  lista de {x,y}, sem repetição. Cada tocha fica numa célula de rocha com piso aberto logo abaixo (y+1),
//            porque a chama aparece na face de rocha voltada para o piso.
//   stairs   opcional. Lista de {x,y}; cada célula é piso aberto.
//   entrance {x,y}. Célula de piso aberto onde o jogador chega.
//
// validateDungeonLevel(level) devolve o próprio nível se estiver de acordo; senão lança Error com a causa em português.

const fail = msg => { throw new Error(`nível da masmorra inválido: ${msg}`); };
const isCellIn = (level, p) => Number.isInteger(p?.x) && Number.isInteger(p?.y) && p.x >= 0 && p.y >= 0 && p.x < level.w && p.y < level.h;
const isOpen = (level, x, y) => level.cells[y * level.w + x] === 1;

export function validateDungeonLevel(level) {
  if (!level || typeof level !== 'object') fail('esperado um objeto');
  const { w, h } = level;
  if (!Number.isInteger(w) || w < 3) fail(`w deve ser inteiro >= 3 (recebeu ${w})`);
  if (!Number.isInteger(h) || h < 3) fail(`h deve ser inteiro >= 3 (recebeu ${h})`);
  if (!(level.cells instanceof Uint8Array)) fail('cells deve ser Uint8Array');
  if (level.cells.length !== w * h) fail(`cells tem ${level.cells.length} valores, esperado ${w * h} (w*h)`);
  for (let i = 0; i < level.cells.length; i++) {
    const v = level.cells[i];
    if (v !== 0 && v !== 1) fail(`cells[${i}] = ${v}; só 0 (rocha) ou 1 (piso aberto)`);
  }
  for (let x = 0; x < w; x++) {
    if (isOpen(level, x, 0)) fail(`borda aberta em (${x},0); a borda precisa ser rocha`);
    if (isOpen(level, x, h - 1)) fail(`borda aberta em (${x},${h - 1}); a borda precisa ser rocha`);
  }
  for (let y = 0; y < h; y++) {
    if (isOpen(level, 0, y)) fail(`borda aberta em (0,${y}); a borda precisa ser rocha`);
    if (isOpen(level, w - 1, y)) fail(`borda aberta em (${w - 1},${y}); a borda precisa ser rocha`);
  }
  if (!Number.isInteger(level.seed)) fail(`seed deve ser inteiro (recebeu ${level.seed})`);
  if (!Array.isArray(level.torches)) fail('torches deve ser uma lista de {x,y}');
  const torchKeys = new Set();
  level.torches.forEach((t, i) => {
    if (!isCellIn(level, t)) fail(`torches[${i}] fora da grade: ${JSON.stringify(t)}`);
    if (isOpen(level, t.x, t.y)) fail(`torches[${i}] (${t.x},${t.y}) está em piso aberto; a tocha precisa estar na rocha`);
    if (t.y + 1 >= h || !isOpen(level, t.x, t.y + 1)) fail(`torches[${i}] (${t.x},${t.y}) sem piso aberto logo abaixo`);
    const key = `${t.x},${t.y}`;
    if (torchKeys.has(key)) fail(`torches[${i}] repetida em (${t.x},${t.y})`);
    torchKeys.add(key);
  });
  if (level.stairs !== undefined) {
    if (!Array.isArray(level.stairs)) fail('stairs, se existir, deve ser uma lista de {x,y}');
    level.stairs.forEach((s, i) => {
      if (!isCellIn(level, s)) fail(`stairs[${i}] fora da grade: ${JSON.stringify(s)}`);
      if (!isOpen(level, s.x, s.y)) fail(`stairs[${i}] (${s.x},${s.y}) precisa estar em piso aberto`);
    });
  }
  if (!isCellIn(level, level.entrance)) fail(`entrance ausente ou fora da grade: ${JSON.stringify(level.entrance)}`);
  if (!isOpen(level, level.entrance.x, level.entrance.y)) fail(`entrance (${level.entrance.x},${level.entrance.y}) precisa estar em piso aberto`);
  return level;
}

// Fixture pequeno (10x6). '#' = rocha, '.' = piso. Duas tochas na face da parede de cima da sala,
// escada no canto direito, entrada no canto de cima à esquerda. O gerador do servidor precisa produzir um nível
// que passe em validateDungeonLevel; este é o exemplo mínimo do formato.
export const DUNGEON_FIXTURE_ROWS = Object.freeze([
  '##########',
  '#........#',
  '#...##...#',
  '#...##...#',
  '#........#',
  '##########',
]);

export function dungeonFixtureLevel() {
  const h = DUNGEON_FIXTURE_ROWS.length, w = DUNGEON_FIXTURE_ROWS[0].length;
  const cells = new Uint8Array(w * h);
  DUNGEON_FIXTURE_ROWS.forEach((row, y) => {
    for (let x = 0; x < w; x++) cells[y * w + x] = row[x] === '.' ? 1 : 0;
  });
  return validateDungeonLevel({
    w, h, cells, seed: 20261117,
    torches: [{ x: 4, y: 3 }, { x: 5, y: 3 }],
    stairs: [{ x: 8, y: 4 }],
    entrance: { x: 1, y: 1 },
  });
}
