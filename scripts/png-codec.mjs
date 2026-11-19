// Decodificador e codificador PNG mínimos, sem dependências (zlib do Node).
// Suporta apenas o que a arte do paper doll usa: 8 bits, sem entrelaçamento,
// cor RGBA (tipo 6) na saída; na entrada também aceita RGB (2) e paleta (3).
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

let crcTable = null;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuffer.copy(out, 4);
  Buffer.from(data.buffer ?? data, data.byteOffset ?? 0, data.length).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Lê o cabeçalho IHDR sem decodificar os pixels. */
export function readPngHeader(buffer) {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('Arquivo não é PNG.');
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') throw new Error('PNG sem IHDR.');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25],
    interlace: buffer[28],
  };
}

/** Decodifica um PNG para { width, height, data: Uint8ClampedArray RGBA }. */
export function decodePng(buffer) {
  const header = readPngHeader(buffer);
  if (header.bitDepth !== 8) throw new Error('Só PNG de 8 bits por canal é suportado.');
  if (header.interlace !== 0) throw new Error('PNG entrelaçado não é suportado.');
  const channels = { 6: 4, 2: 3, 3: 1 }[header.colorType];
  if (!channels) throw new Error(`Tipo de cor PNG ${header.colorType} não suportado.`);
  const idat = [];
  let palette = null;
  let trns = null;
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IDAT') idat.push(body);
    else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') trns = body;
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  const { width, height } = header;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== (stride + 1) * height) throw new Error('Dados PNG com tamanho inesperado.');
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[dst + x - channels] : 0;
      const b = y > 0 ? pixels[dst - stride + x] : 0;
      const c = x >= channels && y > 0 ? pixels[dst - stride + x - channels] : 0;
      const v = raw[src + x];
      pixels[dst + x] = (filter === 0 ? v
        : filter === 1 ? v + a
          : filter === 2 ? v + b
            : filter === 3 ? v + ((a + b) >> 1)
              : filter === 4 ? v + paeth(a, b, c)
                : (() => { throw new Error(`Filtro PNG ${filter} inválido.`); })()) & 255;
    }
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    if (header.colorType === 6) {
      data.set(pixels.subarray(i * 4, i * 4 + 4), i * 4);
    } else if (header.colorType === 2) {
      data.set(pixels.subarray(i * 3, i * 3 + 3), i * 4);
      data[i * 4 + 3] = 255;
    } else {
      const index = pixels[i];
      if (!palette) throw new Error('PNG de paleta sem PLTE.');
      data[i * 4] = palette[index * 3];
      data[i * 4 + 1] = palette[index * 3 + 1];
      data[i * 4 + 2] = palette[index * 3 + 2];
      data[i * 4 + 3] = trns && index < trns.length ? trns[index] : 255;
    }
  }
  return { width, height, data };
}

/** Codifica RGBA 8 bits sem entrelaçamento, com filtro adaptativo por linha. */
export function encodePng({ width, height, data }) {
  if (data.length !== width * height * 4) throw new Error('Tamanho de pixels incompatível com a imagem.');
  const stride = width * 4;
  const rows = Buffer.alloc((stride + 1) * height);
  const candidates = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
  for (let y = 0; y < height; y++) {
    let best = 0;
    let bestScore = Infinity;
    for (let filter = 0; filter < 5; filter++) {
      const out = candidates[filter];
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const v = data[y * stride + x];
        const a = x >= 4 ? data[y * stride + x - 4] : 0;
        const b = y > 0 ? data[(y - 1) * stride + x] : 0;
        const c = x >= 4 && y > 0 ? data[(y - 1) * stride + x - 4] : 0;
        const predicted = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b
          : filter === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const r = (v - predicted) & 255;
        out[x] = r;
        score += r < 128 ? r : 256 - r;
      }
      if (score < bestScore) { bestScore = score; best = filter; }
    }
    rows[y * (stride + 1)] = best;
    rows.set(candidates[best], y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
