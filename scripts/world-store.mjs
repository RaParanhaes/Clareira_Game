import { chmod, mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { emptyWorldDefinition, normalizeWorldDefinition } from '../game/world-edits.mjs';

async function readDefinition(file) {
  try { return normalizeWorldDefinition(JSON.parse(await readFile(file, 'utf8'))); }
  catch (error) {
    if (error.code === 'ENOENT') return emptyWorldDefinition();
    throw error;
  }
}

async function writeDefinition(file, definition) {
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(definition)}\n`, { mode: 0o600, flag: 'wx' });
  await chmod(temporary, 0o600);
  await rename(temporary, file);
  await chmod(file, 0o600);
}

async function writeJsonDocument(file, value) {
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: 'wx' });
  await chmod(temporary, 0o600);
  await rename(temporary, file);
  await chmod(file, 0o600);
}

export function createJsonWorldStore(directory) {
  const worldFile = dimensionId => {
    if (typeof dimensionId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(dimensionId)) throw new TypeError('Dimensão inválida.');
    return path.join(directory, dimensionId === 'surface' ? 'world.json' : `world-${dimensionId}.json`);
  };
  const mutationQueues = new Map();
  return {
    loadWorld: (dimensionId = 'surface') => readDefinition(worldFile(dimensionId)),
    async deleteWorld(dimensionId) {
      if (dimensionId === 'surface') throw new Error('A dimensão inicial não pode ser excluída.');
      await rm(worldFile(dimensionId), { force: true });
    },
    async saveWorld(value, expectedRevision, dimensionId = 'surface') {
      const file = worldFile(dimensionId);
      const previous = mutationQueues.get(dimensionId) || Promise.resolve();
      let release;
      const queued = new Promise(resolve => { release = resolve; });
      mutationQueues.set(dimensionId, queued);
      await previous;
      try {
        const current = await readDefinition(file);
        if (current.revision !== expectedRevision) {
          throw Object.assign(new Error('O mapa foi alterado por outra sessão. Atualize e tente de novo.'), { status: 409 });
        }
        const definition = normalizeWorldDefinition(value);
        if (definition.revision !== expectedRevision + 1) throw new Error('Revisão do mapa inválida.');
        await writeDefinition(file, definition);
        return definition;
      } finally {
        release();
        if (mutationQueues.get(dimensionId) === queued) mutationQueues.delete(dimensionId);
      }
    },
  };
}

export function createJsonCampfireStore(directory) {
  const campfireFile = dimensionId => {
    if (typeof dimensionId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(dimensionId)) throw new TypeError('Dimensão inválida.');
    return path.join(directory, dimensionId === 'surface' ? 'campfires.json' : `campfires-${dimensionId}.json`);
  };
  const mutationQueues = new Map();
  return {
    async loadCampfires(dimensionId = 'surface') {
      try {
        const fires = JSON.parse(await readFile(campfireFile(dimensionId), 'utf8'));
        if (!Array.isArray(fires)) throw new TypeError('Arquivo de fogueiras inválido.');
        return fires.filter(fire => typeof fire?.id === 'string'
          && Number.isFinite(fire.x) && Number.isFinite(fire.y) && Number.isFinite(fire.litAt))
          .map(fire => ({ ...fire }));
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },
    async saveCampfires(dimensionId = 'surface', fires = []) {
      if (!Array.isArray(fires)) throw new TypeError('Lista de fogueiras inválida.');
      const file = campfireFile(dimensionId);
      const previous = mutationQueues.get(dimensionId) || Promise.resolve();
      let release;
      const queued = new Promise(resolve => { release = resolve; });
      mutationQueues.set(dimensionId, queued);
      await previous;
      try {
        const safeFires = fires.filter(fire => typeof fire?.id === 'string'
          && Number.isFinite(fire.x) && Number.isFinite(fire.y) && Number.isFinite(fire.litAt))
          .map(fire => ({ ...fire }));
        await writeJsonDocument(file, safeFires);
      } finally {
        release();
        if (mutationQueues.get(dimensionId) === queued) mutationQueues.delete(dimensionId);
      }
    },
    async deleteCampfires(dimensionId) {
      if (dimensionId === 'surface') throw new Error('A dimensão inicial não pode ser excluída.');
      await rm(campfireFile(dimensionId), { force: true });
    },
  };
}
