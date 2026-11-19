import test from 'node:test';
import assert from 'node:assert/strict';
import { open, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { decodePng, encodePng, readPngHeader } from '../../scripts/png-codec.mjs';
import { PAPERDOLL_FACINGS, parsePaperdollManifest, paperdollHandSocket, paperdollLayersFor, validatePaperdollManifest } from './paperdoll-manifest.mjs';
import { PAPERDOLL_DIR, cellOf, readManifestSync } from './test-helpers.mjs';

const manifest = readManifestSync();
const DRAW_ORDER = ['ferramenta_tras', 'corpo', 'calca_botas', 'tunica', 'gorro', 'ferramenta_frente'];

async function ihdr(file) {
  const handle = await open(file, 'r');
  try {
    const header = Buffer.alloc(33);
    await handle.read(header, 0, header.length, 0);
    return readPngHeader(header);
  } finally { await handle.close(); }
}

test('o manifest do paper doll segue o contrato visual do jogo', () => {
  assert.deepEqual(validatePaperdollManifest(manifest), []);
  const parsed = parsePaperdollManifest(manifest);
  assert.equal(parsed.status, 'owner-review-pending');
  assert.deepEqual(parsed.canvas, { width: 96, height: 96 });
  assert.deepEqual(parsed.pivot, { x: 48, y: 84, anchor: 'sole-center' });
  assert.deepEqual(parsed.facings, PAPERDOLL_FACINGS);
  assert.deepEqual(parsed.facings, ['south', 'southeast', 'east', 'northeast', 'north', 'northwest', 'west', 'southwest']);
  assert.equal(parsed.layout, 'direction-rows-frames-horizontal');
  assert.deepEqual(Object.fromEntries(Object.entries(parsed.animations).map(([k, v]) => [k, [v.frameCount, v.frameDurationMs]])),
    { parado: [4, 250], andar: [8, 100], golpear: [8, 90] });
  assert.equal(Object.isFrozen(parsed), true);
  assert.deepEqual(parsed.source.facingSourceCodes, {
    south: 'S', southeast: 'SE', east: 'L', northeast: 'NE', north: 'N', northwest: 'NO', west: 'O', southwest: 'SO',
  });
  for (const facing of PAPERDOLL_FACINGS) assert.deepEqual(parsed.layerOrder[facing], DRAW_ORDER);
  assert.equal(parsed.verification.compositePixelDifference, 0);
  assert.equal(parsed.verification.framesChecked, 160);
});

test('o validador recusa manifests fora do contrato', () => {
  const clone = () => structuredClone(manifest);
  const cases = [
    ['pivot', m => { m.pivot.y = 90; }],
    ['facings', m => { m.facings.reverse(); }],
    ['atlasSize', m => { m.animations.andar.atlasSize.width = 700; }],
    ['camada desconhecida', m => { m.layerOrder.south.push('capa'); }],
    ['caminho', m => { m.animations.parado.atlases.corpo = '../fora.png'; }],
    ['cor duas rampas', m => { m.recolor.layers.corpo.ramps.cabelo.colors.push('#b07a62'); }],
    ['socket', m => { m.sockets.hand.anchors.golpear.north.pop(); }],
    ['animação', m => { delete m.animations.golpear; }],
  ];
  for (const [name, mutate] of cases) {
    const bad = clone();
    mutate(bad);
    assert.ok(validatePaperdollManifest(bad).length > 0, `deveria recusar: ${name}`);
    assert.throws(() => parsePaperdollManifest(bad), /inválido/);
  }
  assert.ok(validatePaperdollManifest(null).length > 0);
});

test('todo atlas é PNG RGBA de 8 bits com as dimensões do manifest', async () => {
  let count = 0;
  for (const [anim, spec] of Object.entries(manifest.animations)) {
    const expected = [spec.frameCount * 96, 8 * 96];
    assert.deepEqual([spec.atlasSize.width, spec.atlasSize.height], expected);
    for (const rel of [...Object.values(spec.atlases), spec.composite]) {
      const file = path.join(PAPERDOLL_DIR, rel);
      const header = await ihdr(file);
      assert.equal(header.bitDepth, 8, `${rel}: 8 bits por canal`);
      assert.equal(header.colorType, 6, `${rel}: RGBA`);
      assert.equal(header.interlace, 0, `${rel}: sem entrelaçamento`);
      assert.deepEqual([header.width, header.height], expected, `${anim} ${rel}`);
      const { size } = await stat(file);
      assert.ok(size > 500 && size < 200_000, `${rel} com tamanho inesperado (${size})`);
      count++;
    }
    assert.deepEqual(Object.keys(spec.atlases).sort(), Object.keys(manifest.layers).filter(name => !spec.emptyLayers.includes(name)).sort());
  }
  assert.equal(count, 18);
  assert.deepEqual(manifest.animations.parado.emptyLayers.sort(), ['ferramenta', 'ferramenta_frente', 'ferramenta_tras']);
  assert.deepEqual(manifest.animations.golpear.emptyLayers, []);
});

test('o codec PNG faz ida e volta sem perder pixels', () => {
  const data = new Uint8ClampedArray(7 * 5 * 4);
  for (let i = 0; i < data.length; i++) data[i] = (i * 37 + (i >> 3)) & 255;
  const back = decodePng(encodePng({ width: 7, height: 5, data }));
  assert.deepEqual([back.width, back.height], [7, 5]);
  assert.deepEqual([...back.data], [...data]);
  assert.throws(() => decodePng(Buffer.from('não é png')), /PNG/);
});

test('a soma das camadas na ordem do manifest reproduz a composta em todos os quadros (diferença 0)', async () => {
  let frames = 0, difference = 0;
  for (const [anim, spec] of Object.entries(manifest.animations)) {
    const atlases = {};
    for (const [layer, rel] of Object.entries(spec.atlases)) atlases[layer] = decodePng(await readFile(path.join(PAPERDOLL_DIR, rel)));
    const composite = decodePng(await readFile(path.join(PAPERDOLL_DIR, spec.composite)));
    for (let direction = 0; direction < 8; direction++) {
      const order = paperdollLayersFor(manifest, anim, direction);
      assert.deepEqual(order, DRAW_ORDER.filter(name => spec.atlases[name]));
      for (let frame = 0; frame < spec.frameCount; frame++) {
        const sum = new Uint8ClampedArray(96 * 96 * 4);
        for (const layer of order) {
          const cell = cellOf(atlases[layer], direction, frame);
          for (let i = 0; i < cell.length; i += 4) if (cell[i + 3]) sum.set(cell.subarray(i, i + 4), i);
        }
        const expected = cellOf(composite, direction, frame);
        for (let i = 0; i < sum.length; i++) if (sum[i] !== expected[i]) difference++;
        frames++;
      }
    }
  }
  assert.equal(frames, 160);
  assert.equal(difference, 0);
});

test('as cores de cada camada estão todas nas rampas do manifest ou são contorno', async () => {
  const fixed = new Set(Object.values(manifest.recolor.fixedColors));
  for (const [anim, spec] of Object.entries(manifest.animations)) {
    for (const [layer, rel] of Object.entries(spec.atlases)) {
      const known = new Set([...fixed, ...Object.values(manifest.recolor.layers[layer].ramps).flatMap(r => r.colors)]);
      const { data } = decodePng(await readFile(path.join(PAPERDOLL_DIR, rel)));
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        assert.equal(data[i + 3], 255, 'alfa binário');
        const color = `#${[data[i], data[i + 1], data[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('')}`;
        assert.ok(known.has(color), `${anim}/${layer}: cor fora das rampas ${color}`);
      }
    }
  }
});

test('os sockets da mão cobrem todos os quadros de todas as direções', () => {
  for (const [anim, spec] of Object.entries(manifest.animations)) {
    for (let direction = 0; direction < 8; direction++) {
      for (let frame = 0; frame < spec.frameCount; frame++) {
        const socket = paperdollHandSocket(manifest, anim, direction, frame);
        assert.ok(socket, `${anim} ${direction} ${frame}`);
        assert.ok(socket.x > 0 && socket.x < 96 && socket.y > 0 && socket.y < 96, `âncora dentro da célula: ${JSON.stringify(socket)}`);
      }
    }
  }
  assert.equal(paperdollHandSocket(manifest, 'parado', 0, 4), null);
});
