// Apoio aos testes do paper doll em Node: canvas 2D falso por software e carga de PNG do disco.
// Não é importado pelo jogo.
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../../scripts/png-codec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PAPERDOLL_DIR = path.join(here, '..', 'art', 'avatar-frames', 'character-paperdoll-v1');
export const PAPERDOLL_BASE_URL = `file://${PAPERDOLL_DIR}/`;

export function readManifestSync() {
  return JSON.parse(readFileSync(path.join(PAPERDOLL_DIR, 'manifest.json'), 'utf8'));
}

export function fileForUrl(url) {
  return url.startsWith('file://') ? url.slice('file://'.length) : url;
}

/** loadImage falso: decodifica o PNG real e devolve { url, width, height, data }. */
export function createDiskImageLoader({ calls = [], failing = new Set() } = {}) {
  return async function loadImage(url) {
    calls.push(url);
    if (failing.has(url)) throw new Error(`falha simulada em ${url}`);
    const { width, height, data } = decodePng(await readFile(fileForUrl(url)));
    return { url, width, height, data, kind: 'image' };
  };
}

// Canvas por software: alfa binário (a arte é 0/255), cópia 1:1 ou por escala inteira (vizinho mais próximo).
export function createFakeCanvasFactory() {
  const canvases = [];
  function createCanvas(width, height) {
    const canvas = { kind: 'canvas', width, height, data: new Uint8ClampedArray(width * height * 4), log: [] };
    canvas.getContext = (type, options) => {
      canvas.contextOptions = options;
      return context;
    };
    let tx = 0, ty = 0, scale = 1;
    const stack = [];
    const context = {
      canvas,
      imageSmoothingEnabled: true,
      save() { stack.push([tx, ty, scale]); canvas.log.push('save'); },
      restore() { [tx, ty, scale] = stack.pop(); canvas.log.push('restore'); },
      translate(x, y) { tx += x * scale; ty += y * scale; canvas.log.push(`translate ${x} ${y}`); },
      scale(s) { scale *= s; canvas.log.push(`scale ${s}`); },
      clearRect() { canvas.data.fill(0); },
      getImageData(x, y, w, h) {
        const out = new Uint8ClampedArray(w * h * 4);
        for (let row = 0; row < h; row++) {
          out.set(canvas.data.subarray(((y + row) * width + x) * 4, ((y + row) * width + x + w) * 4), row * w * 4);
        }
        return { width: w, height: h, data: out };
      },
      putImageData(image, x, y) {
        for (let row = 0; row < image.height; row++) {
          canvas.data.set(image.data.subarray(row * image.width * 4, (row + 1) * image.width * 4), ((y + row) * width + x) * 4);
        }
      },
      drawImage(source, ...args) {
        const [sx, sy, sw, sh, dx, dy, dw, dh] = args.length === 8
          ? args
          : [0, 0, source.width, source.height, ...args];
        canvas.log.push(`drawImage ${source.url ?? source.kind} ${args.join(' ')}`);
        const factorX = dw / sw, factorY = dh / sh;
        const x0 = Math.round(tx + dx * scale), y0 = Math.round(ty + dy * scale);
        const outW = Math.round(dw * scale), outH = Math.round(dh * scale);
        for (let y = 0; y < outH; y++) {
          for (let x = 0; x < outW; x++) {
            const px = x0 + x, py = y0 + y;
            if (px < 0 || py < 0 || px >= width || py >= height) continue;
            const srcX = sx + Math.floor(x / (factorX * scale)), srcY = sy + Math.floor(y / (factorY * scale));
            const s = (srcY * source.width + srcX) * 4;
            if (source.data[s + 3] === 0) continue;
            canvas.data.set(source.data.subarray(s, s + 4), (py * width + px) * 4);
          }
        }
      },
    };
    canvases.push(canvas);
    return canvas;
  }
  return { createCanvas, canvases };
}

/** Recorta uma célula 96x96 de um atlas decodificado { width, data }. */
export function cellOf(atlas, direction, frame, cell = 96) {
  const out = new Uint8ClampedArray(cell * cell * 4);
  for (let y = 0; y < cell; y++) {
    const start = ((direction * cell + y) * atlas.width + frame * cell) * 4;
    out.set(atlas.data.subarray(start, start + cell * 4), y * cell * 4);
  }
  return out;
}
