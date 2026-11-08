export const WORLD_CHUNK_SIZE = 16;
export const WORLD_CHUNK_CACHE_LIMIT = 96;

export function chunkRandom(seed) {
  let value = seed | 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 0x100000000;
}

export function createChunkCache(generate, limit = WORLD_CHUNK_CACHE_LIMIT) {
  const cache = new Map();
  const chunkAt = (cx, cy) => {
    const key = `${cx},${cy}`;
    if (cache.has(key)) {
      const chunk = cache.get(key);
      cache.delete(key);
      cache.set(key, chunk);
      return chunk;
    }
    const chunk = generate(cx, cy);
    cache.set(key, chunk);
    if (cache.size > limit) cache.delete(cache.keys().next().value);
    return chunk;
  };
  // Physics can reuse prepared geometry without triggering cold generation.
  chunkAt.peek = (cx, cy) => cache.get(`${cx},${cy}`);
  return chunkAt;
}

export function worldChunkKey(x, y) {
  return `${Math.floor(x / WORLD_CHUNK_SIZE)},${Math.floor(y / WORLD_CHUNK_SIZE)}`;
}

export function indexWorldChunks(items, chunkSize = WORLD_CHUNK_SIZE) {
  const chunks = new Map();
  for (const item of items) {
    const x = Math.floor(item.x / chunkSize);
    const y = Math.floor(item.y / chunkSize);
    const key = `${x},${y}`;
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(item);
  }
  return chunks;
}

export function queryWorldChunks(chunks, bounds, chunkSize = WORLD_CHUNK_SIZE) {
  const result = [];
  const left = Math.floor(bounds.left / chunkSize);
  const right = Math.floor(bounds.right / chunkSize);
  const top = Math.floor(bounds.top / chunkSize);
  const bottom = Math.floor(bounds.bottom / chunkSize);
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      for (const item of chunks.get(`${x},${y}`) || []) {
        if (item.x >= bounds.left && item.x <= bounds.right && item.y >= bounds.top && item.y <= bounds.bottom) result.push(item);
      }
    }
  }
  return result;
}
