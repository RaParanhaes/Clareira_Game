// Small, bounded raster cache for immutable geometry; animated layers remain separate.
export function createGeometryCache(limit = 8) {
  const entries = new Map();
  return {
    get(key, width, height, paint) {
      if (entries.has(key)) return entries.get(key);
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(width); canvas.height = Math.ceil(height);
      const context = canvas.getContext('2d'); context.imageSmoothingEnabled = false;
      paint(context);
      entries.set(key, canvas);
      if (entries.size > limit) entries.delete(entries.keys().next().value);
      return canvas;
    },
    clear() { entries.clear(); },
    stats() { return { entries: entries.size,
      bytes: [...entries.values()].reduce((sum,image) => sum + image.width*image.height*4,0) }; },
  };
}
