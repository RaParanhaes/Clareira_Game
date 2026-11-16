import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAIR_MOUTH, LAIR_CHEST_OPEN, LAIR_INTERACT_RADIUS, findNearestLairChest, lairChestIsOpen, lairChestOpenRects,
  lairChestHitRect, findLairChestAtPoint, lairMouthOrigin, lairMouthRects, lairPromptText, lairSceneThings, lairStatusText, rectColorAt,
} from './lair-art.mjs';
import { compareSceneDepth } from './depth-order.mjs';
import { CLAREIRA } from './theme.mjs';

// Dados falsos no formato do contrato do servidor (personalSnapshot.lairs).
const lairFixture = (overrides = {}) => ({
  id: 'lair:ninho:0', x: 566, y: 137, mouth: { x: 566, y: 137 }, chest: { x: 566, y: 133.5 },
  state: 'guarded', readyAt: null, ...overrides,
});

const colorAt = (rects, x, y) => rectColorAt(rects, x, y);

test('a boca tem âncora de contato com o chão dentro da grade e nenhuma camada abaixo dela', () => {
  const { width, height, anchorX, anchorY } = LAIR_MOUTH;
  assert.ok(anchorX > 0 && anchorX < width);
  assert.ok(anchorY > 0 && anchorY < height);
  for (const layer of ['back', 'front']) {
    for (const rect of lairMouthRects(layer)) {
      assert.ok(rect.x >= 0 && rect.y >= 0, `${layer}: ${JSON.stringify(rect)} sai da grade`);
      assert.ok(rect.x + rect.w <= width && rect.y + rect.h <= height, `${layer}: ${JSON.stringify(rect)} sai da grade`);
      assert.ok(rect.y + rect.h - 1 <= anchorY, `${layer}: ${JSON.stringify(rect)} passa do contato com o chão`);
    }
  }
});

test('a soleira da frente cobre o contato com o chão, e o fundo também chega até ele', () => {
  assert.ok(colorAt(lairMouthRects('front'), LAIR_MOUTH.anchorX, LAIR_MOUTH.anchorY), 'os lábios cobrem o ponto de contato');
  assert.ok(colorAt(lairMouthRects('back'), LAIR_MOUTH.anchorX, LAIR_MOUTH.anchorY), 'o fundo chega até o chão');
});

test('o personagem aparece entre as camadas: o fundo cobre o vão e os lábios não', () => {
  const back = lairMouthRects('back');
  const front = lairMouthRects('front');
  assert.ok(colorAt(back, 48, 60), 'o fundo da caverna cobre o vão');
  assert.equal(colorAt(front, 48, 60), null, 'os lábios não cobrem o centro do vão');
  assert.ok(colorAt(front, 12, 60), 'o pilar esquerdo fica à frente');
  assert.ok(colorAt(front, 84, 60), 'o pilar direito fica à frente');
  assert.ok(colorAt(front, 48, 16), 'a verga fica à frente');
});

test('a origem da boca coloca a âncora no ponto de contato projetado', () => {
  const point = { x: 320.4, y: 180.6 };
  for (const scale of [1, 1.5, 2]) {
    const origin = lairMouthOrigin(point, scale);
    assert.equal(origin.x + Math.round(LAIR_MOUTH.anchorX * scale), Math.round(point.x));
    assert.equal(origin.y + Math.round(LAIR_MOUTH.anchorY * scale), Math.round(point.y));
  }
});

test('o baú aberto tem contato na base e moedas visíveis dentro da tampa', () => {
  const rects = lairChestOpenRects();
  for (const rect of rects) {
    assert.ok(rect.y + rect.h - 1 <= LAIR_CHEST_OPEN.anchorY, `${JSON.stringify(rect)} passa do contato`);
    assert.ok(rect.x >= 0 && rect.x + rect.w <= LAIR_CHEST_OPEN.width, `${JSON.stringify(rect)} sai da grade`);
  }
  assert.equal(colorAt(rects, 12, 7), CLAREIRA.lair.gold, 'moedas dentro do baú aberto');
  assert.equal(colorAt(rects, 12, 20), CLAREIRA.lair.wood, 'corpo do baú cobre a parte de baixo');
});

test('o estado escolhe baú fechado ou aberto', () => {
  assert.equal(lairChestIsOpen('guarded'), false);
  assert.equal(lairChestIsOpen('ready'), false);
  assert.equal(lairChestIsOpen('cooldown'), true);
  assert.equal(lairChestIsOpen('empty'), true);
});

test('nearestLairChest escolhe o baú alcançável mais próximo com dados do contrato', () => {
  const lairs = [
    lairFixture({ id: 'lair:ninho:0', chest: { x: 566, y: 133.5 } }),
    lairFixture({ id: 'lair:ninho:1', chest: { x: 300, y: 300 } }),
  ];
  const near = findNearestLairChest(lairs, { x: 566, y: 134.6 }, { hasPath: () => true });
  assert.equal(near?.id, 'lair:ninho:0');
  assert.ok(near.distance <= LAIR_INTERACT_RADIUS);
});

test('nearestLairChest recusa baú fora do raio ou sem caminho livre', () => {
  const lairs = [lairFixture({ chest: { x: 566, y: 133.5 } })];
  assert.equal(findNearestLairChest(lairs, { x: 566, y: 133.5 + LAIR_INTERACT_RADIUS + 0.2 }, { hasPath: () => true }), null);
  assert.equal(findNearestLairChest(lairs, { x: 566, y: 134 }, { hasPath: () => false }), null);
});

test('nearestLairChest ignora entradas incompletas e posição inválida', () => {
  const lairs = [{ id: 'quebrado', mouth: { x: 1, y: 1 } }, lairFixture({ chest: { x: 566, y: 134 } })];
  assert.equal(findNearestLairChest(lairs, { x: 566, y: 134 }, { hasPath: () => true })?.id, 'lair:ninho:0');
  assert.equal(findNearestLairChest(lairs, { x: NaN, y: 134 }), null);
  assert.equal(findNearestLairChest(undefined, { x: 0, y: 0 }), null);
});

test('o personagem atrás, dentro e na frente da boca: fundo, vão e lábios na ordem certa', () => {
  const [back, front] = lairSceneThings([lairFixture()]);
  // Contato da boca em (566, 137): soma 703. Fundo em 701,8; lábios em 703,02.
  const behind = { name: 'atras-da-parede', type: 'player', x: 565, y: 135 };
  const inside = { name: 'dentro-do-vao', type: 'player', x: 565.8, y: 136.8 };
  const inFront = { name: 'na-frente-da-boca', type: 'player', x: 566.3, y: 137.3 };
  const label = item => item.name ?? `${item.type}:${item.layer}`;
  const ordered = [inFront, front, inside, back, behind].sort(compareSceneDepth).map(label);
  assert.deepEqual(ordered, ['atras-da-parede', 'lair-mouth:back', 'dentro-do-vao', 'lair-mouth:front', 'na-frente-da-boca']);
});

test('o toque no baú acerta só as partes opacas do baú, não a boca nem as bordas transparentes', () => {
  const lair = lairFixture({ state: 'ready' });
  const scale = 2;
  const contact = { x: 300, y: 200 };
  const toScreen = () => contact;
  const rect = lairChestHitRect('ready', contact, scale);
  assert.equal(findLairChestAtPoint([lair], { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, toScreen, scale)?.id, lair.id);
  assert.equal(findLairChestAtPoint([lair], { x: contact.x, y: contact.y - 60 * scale }, toScreen, scale), null, 'a boca acima do baú não recebe toque');
  assert.equal(findLairChestAtPoint([lair], { x: contact.x - 20 * scale, y: contact.y - 10 * scale }, toScreen, scale), null, 'borda transparente do PNG');
  assert.equal(findLairChestAtPoint([lair], { x: NaN, y: 0 }, toScreen, scale), null);
});

test('lairSceneThings gera fundo, lábios e baú, e ignora covil sem posição', () => {
  const things = lairSceneThings([lairFixture({ state: 'cooldown' }), { id: 'x', mouth: null }]);
  assert.deepEqual(things.map(item => item.type), ['lair-mouth', 'lair-mouth', 'lair-chest']);
  assert.equal(things[2].state, 'cooldown');
});

test('textos de estado e formatação de tempo', () => {
  const now = 1_000_000;
  assert.equal(lairStatusText(lairFixture({ state: 'guarded' }), now), 'Os guardiões ainda vigiam o baú.');
  assert.equal(lairStatusText(lairFixture({ state: 'cooldown', readyAt: now + 125_000 }), now), 'O baú volta a encher em 02:05.');
  assert.equal(lairStatusText(lairFixture({ state: 'cooldown', readyAt: null }), now), 'O baú volta a encher em breve.');
  assert.equal(lairPromptText(lairFixture({ state: 'cooldown', readyAt: now + 59_100 }), now), 'Baú vazio · volta em 01:00');
  assert.equal(lairPromptText(lairFixture({ state: 'ready' }), now), 'Abrir o baú do covil');
  assert.equal(lairStatusText({}, now), '');
});
