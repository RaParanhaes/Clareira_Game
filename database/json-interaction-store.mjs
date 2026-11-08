import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeInteractionEvent } from './interaction-events.mjs';

export function createJsonInteractionStore(directory) {
  const file = path.join(directory, 'interactions.ndjson');
  let queue = Promise.resolve();
  return {
    async recordInteraction(value) {
      const previous = queue;
      let release;
      queue = new Promise(resolve => { release = resolve; });
      await previous;
      try {
        const event = normalizeInteractionEvent(value);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await appendFile(file, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 });
        return event;
      } finally {
        release();
      }
    },
    async listInteractionEvents({ actorProfileId, limit = 100 } = {}) {
      await queue;
      let content;
      try { content = await readFile(file, 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') return []; throw error; }
      const rows = content.split('\n').filter(Boolean).map(line => JSON.parse(line));
      return rows.filter(event => !actorProfileId || event.actorProfileId === actorProfileId)
        .slice(-Math.max(1, Math.min(500, Math.floor(limit)))).reverse();
    },
  };
}
