import test from 'node:test';
import assert from 'node:assert/strict';
import { COATS, DEFAULT_APPEARANCE, HAIR_COLORS, SKINS } from '../appearance.mjs';
import {
  appearanceRecolorKey, buildMapping, isIdentityMapping, mappingKey, parseHexColor, recolorRGBA, toHexColor,
} from './recolor.mjs';
import { readManifestSync } from './test-helpers.mjs';

const manifest = readManifestSync();
const layers = manifest.recolor.layers;
const luminance = hex => { const [r, g, b] = parseHexColor(hex); return .2126 * r + .7152 * g + .0722 * b; };

test('recolorRGBA troca só as cores do mapeamento e preserva o alfa e o original', () => {
  const source = new Uint8ClampedArray([
    176, 122, 98, 255, // pele (muda)
    30, 19, 17, 255, // contorno (fica)
    176, 122, 98, 0, // pele transparente: não toca
    10, 20, 30, 255, // fora do mapeamento
  ]);
  const copy = new Uint8ClampedArray(source);
  const out = recolorRGBA(source, { '#b07a62': '#112233' });
  assert.ok(out instanceof Uint8ClampedArray);
  assert.deepEqual([...out], [17, 34, 51, 255, 30, 19, 17, 255, 176, 122, 98, 0, 10, 20, 30, 255]);
  assert.deepEqual([...source], [...copy], 'não altera a entrada');
  assert.notEqual(out.buffer, source.buffer);
});

test('recolorRGBA com mapeamento vazio ou de identidade devolve cópia idêntica', () => {
  const source = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 128, 0, 0, 0, 0]);
  assert.deepEqual([...recolorRGBA(source, {})], [...source]);
  assert.deepEqual([...recolorRGBA(source, { '#010203': '#010203' })], [...source]);
  assert.deepEqual([...recolorRGBA(source, new Map([['#010203', '#ffffff']]))].slice(0, 4), [255, 255, 255, 255]);
});

test('a aparência padrão reproduz a arte aprovada: mapeamento vazio em todas as camadas', () => {
  for (const [name, layer] of Object.entries(layers)) {
    assert.deepEqual(buildMapping(layer.ramps, DEFAULT_APPEARANCE), {}, name);
    assert.deepEqual(buildMapping(layer.ramps, {}), {}, `${name} com aparência vazia`);
    assert.equal(isIdentityMapping(buildMapping(layer.ramps, undefined)), true);
  }
  assert.equal(mappingKey({}), '');
  assert.equal(appearanceRecolorKey({}), appearanceRecolorKey(DEFAULT_APPEARANCE));
});

test('pele, cabelo e túnica recolorem só a sua camada e só as suas rampas', () => {
  const skin = { ...DEFAULT_APPEARANCE, skin: 3 };
  const hair = { ...DEFAULT_APPEARANCE, hair: 3 };
  const coat = { ...DEFAULT_APPEARANCE, coat: 0 };
  const changed = appearance => Object.entries(layers)
    .filter(([, layer]) => !isIdentityMapping(buildMapping(layer.ramps, appearance))).map(([name]) => name);
  assert.deepEqual(changed(skin), ['corpo']);
  assert.deepEqual(changed(hair), ['corpo']);
  assert.deepEqual(changed(coat), ['tunica']);

  const corpo = buildMapping(layers.corpo.ramps, skin);
  assert.deepEqual(Object.keys(corpo).sort(), [...layers.corpo.ramps.pele.colors].sort());
  const cabelo = buildMapping(layers.corpo.ramps, hair);
  assert.deepEqual(Object.keys(cabelo).sort(), [...layers.corpo.ramps.cabelo.colors].sort());
  const tunica = buildMapping(layers.tunica.ramps, coat);
  assert.deepEqual(Object.keys(tunica).sort(), [...layers.tunica.ramps.tunica.colors].sort());
  // linho, couro e fivela (e todos os contornos) ficam como estão.
  for (const fixed of [...layers.tunica.ramps.linho.colors, ...layers.tunica.ramps.couro.colors, ...Object.values(manifest.recolor.fixedColors)]) {
    assert.equal(fixed in tunica, false, fixed);
  }
});

test('cada opção de pele, cabelo e túnica mantém as cores da rampa distintas e na mesma ordem de luz', () => {
  const cases = [
    ['skin', SKINS.length, 'corpo', 'pele'],
    ['hair', HAIR_COLORS.length, 'corpo', 'cabelo'],
    ['coat', COATS.length, 'tunica', 'tunica'],
  ];
  for (const [field, count, layer, rampName] of cases) {
    const ramp = layers[layer].ramps[rampName];
    for (let option = 0; option < count; option++) {
      const mapping = buildMapping(layers[layer].ramps, { ...DEFAULT_APPEARANCE, [field]: option });
      const targets = ramp.colors.map(color => mapping[color] ?? color);
      assert.equal(new Set(targets).size, targets.length, `${field}=${option}: cores iguais depois do recolor`);
      for (let i = 1; i < targets.length; i++) {
        assert.ok(luminance(targets[i]) > luminance(targets[i - 1]), `${field}=${option}: ordem sombra->luz mantida`);
      }
      for (const target of targets) assert.match(target, /^#[0-9a-f]{6}$/);
    }
  }
});

test('regra fixa: cor-alvo = cor-fonte x (opção escolhida / opção padrão) por canal RGB', () => {
  // coat 0 (#55757a) contra o padrão coat 2 (#596e48): razão por canal sobre a cor média #424530.
  const mapping = buildMapping(layers.tunica.ramps, { ...DEFAULT_APPEARANCE, coat: 0 });
  const [br, bg, bb] = [0x55, 0x75, 0x7a], [dr, dg, db] = [0x59, 0x6e, 0x48];
  const [mr, mg, mb] = parseHexColor('#424530');
  const expected = [mr * br / dr, mg * bg / dg, mb * bb / db].map(Math.round);
  assert.equal(mapping['#424530'], toHexColor(expected));
  // pele: tons mais escuros que o médio usam a sombra do SKINS, o mais claro usa a luz.
  const dark = buildMapping(layers.corpo.ramps, { ...DEFAULT_APPEARANCE, skin: 3 });
  const [, , , shadeSkin] = SKINS[3], [, , , shadeDefault] = SKINS[DEFAULT_APPEARANCE.skin];
  const ratio = parseHexColor(shadeSkin).map((v, i) => v / parseHexColor(shadeDefault)[i]);
  assert.equal(dark['#926252'], toHexColor(parseHexColor('#926252').map((v, i) => Math.round(v * ratio[i]))));
});

test('o recolor aplicado a pixels reais troca a túnica e deixa o resto igual', () => {
  const { ramps } = layers.tunica;
  const colors = [...ramps.tunica.colors, ...ramps.linho.colors, '#1e1311'];
  const data = new Uint8ClampedArray(colors.length * 4);
  colors.forEach((color, i) => data.set([...parseHexColor(color), 255], i * 4));
  const mapping = buildMapping(ramps, { ...DEFAULT_APPEARANCE, coat: 4 });
  const out = recolorRGBA(data, mapping);
  colors.forEach((color, i) => {
    const got = toHexColor([...out.subarray(i * 4, i * 4 + 3)]);
    if (ramps.tunica.colors.includes(color)) assert.notEqual(got, color);
    else assert.equal(got, color);
  });
});

test('mappingKey é estável, independe da ordem e ignora entradas de identidade', () => {
  assert.equal(mappingKey({ '#aa0000': '#bb0000', '#cc0000': '#dd0000' }), mappingKey({ '#CC0000': '#DD0000', '#AA0000': '#BB0000' }));
  assert.equal(mappingKey({ '#aa0000': '#aa0000' }), '');
  assert.notEqual(mappingKey({ '#aa0000': '#bb0000' }), mappingKey({ '#aa0000': '#bb0001' }));
  assert.throws(() => parseHexColor('azul'), /inválida/);
});
