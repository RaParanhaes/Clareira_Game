import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_DIMENSIONS, normalizeDimensions } from '../game/dimensions.mjs';

export function createJsonDimensionStore(directory) {
  const file = path.join(directory, 'dimensions.json');
  let queue = Promise.resolve();
  async function read() {
    try {
      const stored = JSON.parse(await readFile(file, 'utf8'));
      const revision = Number(stored?.revision ?? 0);
      if (!Number.isSafeInteger(revision) || revision < 0) throw new TypeError('Revisão das dimensões inválida.');
      return { revision, dimensions: normalizeDimensions(stored?.dimensions) };
    } catch (error) {
      if (error.code === 'ENOENT') return { revision: 0, dimensions: normalizeDimensions(DEFAULT_DIMENSIONS) };
      throw error;
    }
  }
  return {
    loadDimensions: read,
    async saveDimensions(value, expectedRevision) {
      const previous = queue;
      let release;
      queue = new Promise(resolve => { release = resolve; });
      await previous;
      try {
        const current = await read();
        if (current.revision !== expectedRevision) {
          throw Object.assign(new Error('As dimensões foram alteradas em outra sessão. Atualize e tente novamente.'), { status: 409 });
        }
        const dimensions = normalizeDimensions(value);
        const next = { revision: expectedRevision + 1, dimensions };
        const folder = path.dirname(file);
        await mkdir(folder, { recursive: true, mode: 0o700 });
        await chmod(folder, 0o700);
        const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
        await writeFile(temporary, `${JSON.stringify(next)}\n`, { mode: 0o600, flag: 'wx' });
        await chmod(temporary, 0o600);
        await rename(temporary, file);
        await chmod(file, 0o600);
        return next;
      } finally { release(); }
    },
  };
}
