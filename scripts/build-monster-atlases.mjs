#!/usr/bin/env node
// Valida e monta os atlas de monstros (art-source/monsters/<id>/spec.json + quadros crus do Blender).
// Uso: node scripts/build-monster-atlases.mjs [--especie mossSlime] [--raw <pasta>] [--out game/art/monsters]
// Falha (codigo 1) se: celula diferente da especificada, alfa parcial, cor fora da paleta, quadro vazio,
// atlas com tamanho errado ou animacao faltando. Sem dependencias: PNG decodificado com zlib do Node.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('nao e PNG');
  let pos = 8;
  let w = 0;
  let h = 0;
  const idat = [];
  while (pos < buf.length) {
    const n = buf.readUInt32BE(pos);
    const tipo = buf.subarray(pos + 4, pos + 8).toString('ascii');
    const corpo = buf.subarray(pos + 8, pos + 8 + n);
    if (tipo === 'IHDR') {
      w = corpo.readUInt32BE(0);
      h = corpo.readUInt32BE(4);
      if (corpo[8] !== 8 || corpo[9] !== 6 || corpo[12] !== 0) throw new Error('PNG precisa ser RGBA 8 bits sem entrelacamento');
    } else if (tipo === 'IDAT') idat.push(corpo);
    pos += 12 + n;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y += 1) {
    const f = raw[p];
    const linha = raw.subarray(p + 1, p + 1 + stride);
    p += 1 + stride;
    const base = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= 4 ? out[base + x - 4] : 0;
      const b = y > 0 ? out[base - stride + x] : 0;
      const c = x >= 4 && y > 0 ? out[base - stride + x - 4] : 0;
      let pr = 0;
      if (f === 1) pr = a;
      else if (f === 2) pr = b;
      else if (f === 3) pr = Math.floor((a + b) / 2);
      else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (f !== 0) throw new Error('filtro PNG invalido ' + f);
      out[base + x] = (linha[x] + pr) & 255;
    }
  }
  return { w, h, rgba: out };
}

// Valida um atlas: linhas = direcoes, colunas = quadros. Devolve lista de erros (vazia = aprovado).
export function validarAtlas(png, { cell, frames, dirs, paleta, nome }) {
  const erros = [];
  const esperado = { w: cell * frames, h: cell * dirs };
  if (png.w !== esperado.w || png.h !== esperado.h) {
    erros.push(`${nome}: tamanho ${png.w}x${png.h}, esperado ${esperado.w}x${esperado.h}`);
    return erros;
  }
  const cores = new Set(paleta.map(([r, g, b]) => `${r},${g},${b}`));
  let parcial = 0;
  let foraPaleta = 0;
  const cores_fora = new Set();
  for (let d = 0; d < dirs; d += 1) {
    for (let f = 0; f < frames; f += 1) {
      let opacos = 0;
      for (let y = 0; y < cell; y += 1) {
        for (let x = 0; x < cell; x += 1) {
          const i = (((d * cell) + y) * png.w + f * cell + x) * 4;
          const al = png.rgba[i + 3];
          if (al !== 0 && al !== 255) { parcial += 1; continue; }
          if (al === 0) continue;
          opacos += 1;
          const chave = `${png.rgba[i]},${png.rgba[i + 1]},${png.rgba[i + 2]}`;
          if (!cores.has(chave)) { foraPaleta += 1; cores_fora.add(chave); }
        }
      }
      if (opacos === 0) erros.push(`${nome}: quadro vazio (direcao ${d}, quadro ${f})`);
    }
  }
  if (parcial) erros.push(`${nome}: ${parcial} pixels com alfa parcial`);
  if (foraPaleta) erros.push(`${nome}: ${foraPaleta} pixels fora da paleta (${[...cores_fora].slice(0, 5).join(' ')})`);
  return erros;
}

function lerSpec(id) {
  return JSON.parse(readFileSync(join(RAIZ, 'art-source', 'monsters', id, 'spec.json'), 'utf8'));
}

export function construir({ especies, raw, out }) {
  const relatorio = { ok: true, especies: {} };
  const manifestGeral = { versao: 1, especies: {} };
  const manifestPath = join(out, 'manifest.json');
  if (existsSync(manifestPath)) {
    const antigo = JSON.parse(readFileSync(manifestPath, 'utf8'));
    Object.assign(manifestGeral.especies, antigo.especies || {});
  }
  for (const id of especies) {
    const spec = lerSpec(id);
    const erros = [];
    const anims = {};
    const pastaRaw = join(raw, id);
    const pastaSaida = join(out, id);
    mkdirSync(pastaSaida, { recursive: true });
    for (const [anim, meta] of Object.entries(spec.anims)) {
      const arq = join(pastaRaw, `${anim}.png`);
      if (!existsSync(arq)) { erros.push(`${id}: falta ${anim}.png em ${pastaRaw}`); continue; }
      const png = decodePng(readFileSync(arq));
      const e = validarAtlas(png, {
        cell: spec.cell, frames: meta.frames, dirs: spec.direcoes.length, paleta: spec.paleta, nome: `${id}/${anim}`,
      });
      if (e.length) { erros.push(...e); continue; }
      copyFileSync(arq, join(pastaSaida, `${anim}.png`));
      anims[anim] = { frames: meta.frames, fps: meta.fps, loop: meta.loop, ...(meta.golpe_quadro != null ? { golpe_quadro: meta.golpe_quadro } : {}) };
    }
    if (erros.length) { relatorio.ok = false; relatorio.especies[id] = { erros }; continue; }
    const entrada = {
      cell: spec.cell,
      pivo: spec.pivo,
      dirs: spec.dirs,
      direcoes: spec.direcoes,
      escala: spec.escala,
      anims,
    };
    writeFileSync(join(pastaSaida, 'manifest.json'), JSON.stringify({ versao: 1, especie: id, ...entrada }, null, 1) + '\n');
    manifestGeral.especies[id] = entrada;
    relatorio.especies[id] = { ok: true, anims: Object.keys(anims) };
  }
  if (relatorio.ok) writeFileSync(manifestPath, JSON.stringify(manifestGeral, null, 1) + '\n');
  return relatorio;
}

function argumento(nome, padrao) {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : padrao;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = join(RAIZ, 'art-source', 'monsters');
  const especies = argumento('--especie', null)
    ? [argumento('--especie', null)]
    : readdirSync(raiz).filter((n) => !n.startsWith('_') && existsSync(join(raiz, n, 'spec.json')));
  const raw = argumento('--raw', null);
  if (!raw) {
    console.error('uso: --raw <pasta com <especie>/<anim>.png> [--especie id] [--out game/art/monsters]');
    process.exit(2);
  }
  const out = resolve(RAIZ, argumento('--out', 'game/art/monsters'));
  const rel = construir({ especies, raw: resolve(raw), out });
  console.log(JSON.stringify(rel, null, 1));
  process.exit(rel.ok ? 0 : 1);
}
