#!/usr/bin/env node
// Monta os atlas do personagem em camadas (paper doll) a partir dos quadros 96x96
// renderizados pelo Blender (art-source/character-paperdoll/build-blender.py).
//
// Uso:
//   node scripts/build-paperdoll-atlases.mjs --frames <pasta com os PNG> \
//        --out game/art/avatar-frames/character-paperdoll-v1 [--anchors <mao_anchors.json>]
//
// Entrada: <anim>_<direcao>_<quadro>_<passagem>.png (anim parado/andar/golpear,
// direcao S,SE,L,NE,N,NO,O,SO, passagens corpo, calca_botas, tunica, gorro,
// ferramenta, ferramenta_frente, ferramenta_tras, composta).
// Saída: um atlas por (animação x camada) no layout 'direction-rows-frames-horizontal'
// (linhas = 8 direções do jogo, colunas = quadros), atlas de referência 'composta'
// e manifest.json. Sem dependências: PNG por zlib em scripts/png-codec.mjs.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './png-codec.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CELL = 96;
const PIVOT = { x: 48, y: 84, anchor: 'sole-center' };
// Ordem do jogo (AVATAR_SPRITE_SPEC.facings) e os códigos do Blender (S,SE,L,NE,N,NO,O,SO).
const FACINGS = ['south', 'southeast', 'east', 'northeast', 'north', 'northwest', 'west', 'southwest'];
const SOURCE_CODES = ['S', 'SE', 'L', 'NE', 'N', 'NO', 'O', 'SO'];
const ANIMATIONS = {
  parado: { frameCount: 4, frameDurationMs: 250 },
  andar: { frameCount: 8, frameDurationMs: 100, runFrameDurationMs: 70 },
  golpear: { frameCount: 8, frameDurationMs: 90 },
};
// Ordem de desenho do Blender (mao_anchors.json): ferramenta atrás, corpo, calça e botas,
// túnica, gorro, ferramenta na frente. A soma nesta ordem reproduz a 'composta' com 0 px de diferença.
const DRAW_ORDER = ['ferramenta_tras', 'corpo', 'calca_botas', 'tunica', 'gorro', 'ferramenta_frente'];
const LAYER_NAMES = ['corpo', 'calca_botas', 'tunica', 'gorro', 'ferramenta', 'ferramenta_frente', 'ferramenta_tras'];
const LAYER_INFO = {
  corpo: { role: 'body', description: 'Pele, rosto, cabelo, barba e mãos.' },
  calca_botas: { role: 'legs-boots', description: 'Calça e botas.' },
  tunica: { role: 'outfit', description: 'Túnica, gola e mangas de linho, cinto e bolsa.' },
  gorro: { role: 'headwear', description: 'Gorro.' },
  ferramenta: { role: 'tool', description: 'Ferramenta inteira na mão (união de frente e atrás).', drawn: false },
  ferramenta_frente: { role: 'tool-front', description: 'Partes da ferramenta à frente do corpo.' },
  ferramenta_tras: { role: 'tool-back', description: 'Partes da ferramenta atrás do corpo.' },
};

// Cores-fonte da arte, copiadas das rampas do Blender (MATS em build-blender.py), da sombra
// para a luz. O build mantém só as que aparecem nos quadros e falha se houver qualquer cor
// fora destas tabelas (sem desvios). `channel` indica qual escolha de aparência recolore a rampa.
const OUTLINE = '#1e1311';
const INNER_LINE = '#382821';
const RAMPS = {
  corpo: {
    pele: { channel: 'skin', mid: '#b07a62', colors: ['#704c44', '#926252', '#b07a62', '#c99272', '#e0ac84'] },
    cabelo: { channel: 'hair', mid: '#48352a', colors: ['#241b1a', '#342622', '#48352a', '#624a38'] },
    olho_branco: { channel: null, mid: '#cbbba0', colors: ['#cbbba0'] },
    iris: { channel: null, mid: '#2e2830', colors: ['#2e2830'] },
  },
  calca_botas: {
    calca: { channel: null, mid: '#4c4338', colors: ['#2c2724', '#3b342d', '#4c4338', '#605547'] },
    botas: { channel: null, mid: '#52382b', colors: ['#281d1e', '#3a2823', '#52382b', '#6b4a35', '#8a6445'] },
  },
  tunica: {
    tunica: { channel: 'coat', mid: '#424530', colors: ['#272920', '#343628', '#424530', '#52553b', '#646748'] },
    linho: { channel: null, mid: '#a69884', colors: ['#7a7066', '#a69884', '#cbbba0', '#decfb8'] },
    couro: { channel: null, mid: '#52382b', colors: ['#3a2823', '#52382b', '#6b4a35', '#8a6445'] },
    fivela: { channel: null, mid: '#626c7c', colors: ['#424b5c', '#626c7c', '#88929e', '#b0b8c0'] },
  },
  gorro: {
    gorro: { channel: null, mid: '#54483a', colors: ['#2c2522', '#3e352d', '#54483a', '#685a48'] },
  },
  ferramenta: {
    cabo: { channel: null, mid: '#684632', colors: ['#483028', '#684632', '#8a6240', '#a87a50'] },
    ferro: { channel: null, mid: '#626c7c', colors: ['#424b5c', '#626c7c', '#88929e', '#b0b8c0'] },
  },
};
RAMPS.ferramenta_frente = RAMPS.ferramenta;
RAMPS.ferramenta_tras = RAMPS.ferramenta;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Argumento inesperado: ${arg}`);
    const key = arg.slice(2);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`--${key} precisa de um valor.`);
    args[key] = value;
  }
  return args;
}

const hex = (r, g, b) => `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
const frameName = (anim, code, frame, pass) => `${anim}_${code}_${String(frame).padStart(2, '0')}_${pass}.png`;

async function readFrame(dir, anim, code, frame, pass) {
  const file = path.join(dir, frameName(anim, code, frame, pass));
  const image = decodePng(await readFile(file));
  if (image.width !== CELL || image.height !== CELL) {
    throw new Error(`${file}: esperado ${CELL}x${CELL}, veio ${image.width}x${image.height}.`);
  }
  return image.data;
}

function blit(atlas, atlasWidth, cell, column, row) {
  for (let y = 0; y < CELL; y++) {
    const src = y * CELL * 4;
    const dst = ((row * CELL + y) * atlasWidth + column * CELL) * 4;
    atlas.set(cell.subarray(src, src + CELL * 4), dst);
  }
}

function isEmpty(data) {
  for (let i = 3; i < data.length; i += 4) if (data[i]) return false;
  return true;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.frames || !args.out) {
    throw new Error('Uso: build-paperdoll-atlases.mjs --frames <pasta> --out <pasta> [--anchors <json>]');
  }
  const framesDir = path.resolve(args.frames);
  const outDir = path.resolve(args.out);
  const anchorsFile = path.resolve(args.anchors || path.join(root, 'art-source/character-paperdoll/mao_anchors.json'));
  const anchors = JSON.parse(await readFile(anchorsFile, 'utf8'));

  const atlases = {}; // anim -> layer|composta -> Uint8ClampedArray
  const presentColors = {}; // camada -> Set de #rrggbb
  const compositeDiff = {}; // anim -> pixels diferentes
  let framesChecked = 0;

  for (const [anim, { frameCount }] of Object.entries(ANIMATIONS)) {
    const width = frameCount * CELL;
    const height = FACINGS.length * CELL;
    const set = Object.fromEntries([...LAYER_NAMES, 'composta'].map(name => [name, new Uint8ClampedArray(width * height * 4)]));
    atlases[anim] = set;
    compositeDiff[anim] = 0;
    for (let row = 0; row < FACINGS.length; row++) {
      for (let frame = 0; frame < frameCount; frame++) {
        const cells = {};
        for (const name of [...LAYER_NAMES, 'composta']) {
          cells[name] = await readFrame(framesDir, anim, SOURCE_CODES[row], frame, name);
          blit(set[name], width, cells[name], frame, row);
        }
        // Cada cor de cada camada precisa existir exatamente numa rampa (ou ser contorno).
        for (const name of LAYER_NAMES) {
          const seen = presentColors[name] ??= new Set();
          const data = cells[name];
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] === 0) continue;
            if (data[i + 3] !== 255) throw new Error(`${anim} ${SOURCE_CODES[row]} ${frame} ${name}: alfa parcial.`);
            seen.add(hex(data[i], data[i + 1], data[i + 2]));
          }
        }
        // Conferência: soma na ordem de desenho == composta, pixel a pixel.
        const sum = new Uint8ClampedArray(CELL * CELL * 4);
        for (const name of DRAW_ORDER) {
          const data = cells[name];
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3]) { sum[i] = data[i]; sum[i + 1] = data[i + 1]; sum[i + 2] = data[i + 2]; sum[i + 3] = 255; }
          }
        }
        const comp = cells.composta;
        for (let i = 0; i < comp.length; i += 4) {
          const same = comp[i + 3] === sum[i + 3]
            && (comp[i + 3] === 0 || (comp[i] === sum[i] && comp[i + 1] === sum[i + 1] && comp[i + 2] === sum[i + 2]));
          if (!same) compositeDiff[anim]++;
        }
        framesChecked++;
      }
    }
  }
  const totalDiff = Object.values(compositeDiff).reduce((a, b) => a + b, 0);
  if (totalDiff !== 0) {
    throw new Error(`A soma das camadas na ordem fixa difere da composta em ${totalDiff} px (${JSON.stringify(compositeDiff)}). Particione por visibilidade.`);
  }

  // Rampas: só as cores presentes na arte; cores fora das tabelas são erro.
  const recolorLayers = {};
  for (const name of LAYER_NAMES) {
    const known = new Map([[OUTLINE, 'contorno'], [INNER_LINE, 'linha-interna']]);
    const ramps = {};
    for (const [rampName, def] of Object.entries(RAMPS[name])) {
      const colors = def.colors.filter(color => presentColors[name].has(color));
      for (const color of colors) {
        if (known.has(color)) throw new Error(`${name}: cor ${color} pertence a duas rampas (${known.get(color)} e ${rampName}).`);
        known.set(color, rampName);
      }
      if (!colors.length) continue;
      if (!colors.includes(def.mid)) throw new Error(`${name}/${rampName}: tom médio ${def.mid} ausente da arte.`);
      ramps[rampName] = { channel: def.channel, mid: colors.indexOf(def.mid), colors };
    }
    const stray = [...presentColors[name]].filter(color => !known.has(color));
    if (stray.length) throw new Error(`${name}: cores fora das rampas: ${stray.join(', ')}.`);
    recolorLayers[name] = { ramps };
  }

  // Atlas por animação x camada. Camadas vazias não geram arquivo.
  const animations = {};
  const written = [];
  for (const [anim, spec] of Object.entries(ANIMATIONS)) {
    const width = spec.frameCount * CELL;
    const height = FACINGS.length * CELL;
    const atlasPaths = {};
    const emptyLayers = [];
    await mkdir(path.join(outDir, 'atlases', anim), { recursive: true });
    for (const name of LAYER_NAMES) {
      if (isEmpty(atlases[anim][name])) { emptyLayers.push(name); continue; }
      const rel = `atlases/${anim}/${name}.png`;
      const png = encodePng({ width, height, data: atlases[anim][name] });
      await writeFile(path.join(outDir, rel), png);
      atlasPaths[name] = rel;
      written.push([rel, png.length]);
    }
    await mkdir(path.join(outDir, 'reference'), { recursive: true });
    const compositeRel = `reference/${anim}-composta.png`;
    const compositePng = encodePng({ width, height, data: atlases[anim].composta });
    await writeFile(path.join(outDir, compositeRel), compositePng);
    written.push([compositeRel, compositePng.length]);
    animations[anim] = {
      frameCount: spec.frameCount,
      frameDurationMs: spec.frameDurationMs,
      ...(spec.runFrameDurationMs ? { runFrameDurationMs: spec.runFrameDurationMs } : {}),
      loop: anim !== 'golpear',
      atlasSize: { width, height },
      atlases: atlasPaths,
      emptyLayers,
      composite: compositeRel,
    };
  }

  // Sockets da mão: [x, y, profundidade] por animação > direção (nome do jogo) > quadro.
  const handAnchors = {};
  for (const [anim, spec] of Object.entries(ANIMATIONS)) {
    handAnchors[anim] = {};
    FACINGS.forEach((facing, row) => {
      const list = anchors.anims?.[anim]?.[SOURCE_CODES[row]];
      if (!Array.isArray(list) || list.length !== spec.frameCount) {
        throw new Error(`mao_anchors.json: ${anim}/${SOURCE_CODES[row]} deveria ter ${spec.frameCount} quadros.`);
      }
      handAnchors[anim][facing] = list.map((entry, index) => {
        if (entry.quadro !== index) throw new Error(`mao_anchors.json: ${anim}/${SOURCE_CODES[row]} fora de ordem.`);
        return [entry.mao_x, entry.mao_y, entry.profundidade];
      });
    });
  }

  const layers = Object.fromEntries(LAYER_NAMES.map(name => [name, {
    ...LAYER_INFO[name],
    drawn: LAYER_INFO[name].drawn !== false,
    animations: Object.keys(ANIMATIONS).filter(anim => animations[anim].atlases[name]),
  }]));
  const layerOrder = Object.fromEntries(FACINGS.map(facing => [facing, [...DRAW_ORDER]]));

  const manifest = {
    schemaVersion: 1,
    assetVersion: 1,
    name: 'character-paperdoll-v1',
    status: 'owner-review-pending',
    source: {
      renderer: 'art-source/character-paperdoll/build-blender.py',
      handAnchors: 'art-source/character-paperdoll/mao_anchors.json',
      build: 'npm run art:paperdoll:build',
      facingSourceCodes: Object.fromEntries(FACINGS.map((facing, index) => [facing, SOURCE_CODES[index]])),
    },
    canvas: { width: CELL, height: CELL },
    artHeight: 80,
    pivot: { ...PIVOT },
    facings: [...FACINGS],
    appearanceMode: 'paperdoll-layers-recolor',
    layout: 'direction-rows-frames-horizontal',
    sampling: 'nearest-neighbor',
    layers,
    layerOrder,
    animations,
    recolor: {
      mode: 'exact-source-color-lookup',
      fixedColors: { outline: OUTLINE, innerLine: INNER_LINE },
      layers: recolorLayers,
    },
    sockets: {
      hand: {
        coordinateSpace: 'cell-pixels-y-down',
        fields: ['x', 'y', 'depth'],
        note: 'Centro do punho direito; profundidade = distância ao eixo do corpo em direção à câmera (+ = mais perto).',
        anchors: handAnchors,
      },
    },
    verification: {
      compositeEqualsLayerSum: true,
      compositePixelDifference: totalDiff,
      framesChecked,
      drawOrder: [...DRAW_ORDER],
    },
  };
  await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  let total = 0;
  for (const [rel, size] of written) { total += size; console.log(`${String(Math.round(size / 102.4) / 10).padStart(7)} KB  ${rel}`); }
  console.log(`Total: ${(total / 1024).toFixed(1)} KB em ${written.length} atlas.`);
  console.log(`Conferência: soma das camadas na ordem do manifesto == composta em ${framesChecked} quadros (diferença de ${totalDiff} px).`);
}

main().catch(error => { console.error(error.message || error); process.exitCode = 1; });
