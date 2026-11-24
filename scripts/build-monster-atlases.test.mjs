import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, crc32 } from 'node:zlib';
import { decodePng, validarAtlas } from './build-monster-atlases.mjs';

function chunk(tipo, dados) {
  const t = Buffer.from(tipo, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, dados])) >>> 0);
  return Buffer.concat([len, t, dados, crc]);
}

// PNG RGBA 8 bits com filtro 0 em todas as linhas.
function encodePng(w, h, rgba) {
  const linhas = [];
  for (let y = 0; y < h; y += 1) {
    linhas.push(Buffer.from([0]), Buffer.from(rgba.subarray(y * w * 4, (y + 1) * w * 4)));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(linhas))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Atlas 2 direcoes x 2 quadros, celula 2 px. Cada quadro tem um pixel opaco da cor dada.
function atlasDeTeste({ cor = [10, 20, 30], alfa = 255, vazioNo = null } = {}) {
  const w = 4;
  const h = 4;
  const rgba = Buffer.alloc(w * h * 4);
  for (let d = 0; d < 2; d += 1) {
    for (let f = 0; f < 2; f += 1) {
      if (vazioNo && vazioNo[0] === d && vazioNo[1] === f) continue;
      const i = ((d * 2) * w + f * 2) * 4;
      rgba.set([...cor, alfa], i);
    }
  }
  return decodePng(encodePng(w, h, rgba));
}

const paleta = [[10, 20, 30]];
const base = { cell: 2, frames: 2, dirs: 2, paleta, nome: 'teste/parado' };

test('decodifica PNG RGBA e devolve o mesmo conteudo', () => {
  const png = atlasDeTeste();
  assert.equal(png.w, 4);
  assert.equal(png.h, 4);
  assert.equal(png.rgba[3], 255);
});

test('aceita atlas valido', () => {
  assert.deepEqual(validarAtlas(atlasDeTeste(), base), []);
});

test('reprova tamanho errado', () => {
  const erros = validarAtlas(atlasDeTeste(), { ...base, frames: 3 });
  assert.match(erros[0], /tamanho/);
});

test('reprova alfa parcial', () => {
  const erros = validarAtlas(atlasDeTeste({ alfa: 128 }), base);
  assert.ok(erros.some((e) => /alfa parcial/.test(e)));
});

test('reprova cor fora da paleta', () => {
  const erros = validarAtlas(atlasDeTeste({ cor: [200, 0, 0] }), base);
  assert.ok(erros.some((e) => /fora da paleta/.test(e)));
});

test('reprova quadro vazio', () => {
  const erros = validarAtlas(atlasDeTeste({ vazioNo: [1, 1] }), base);
  assert.ok(erros.some((e) => /quadro vazio \(direcao 1, quadro 1\)/.test(e)));
});
