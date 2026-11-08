import {applyObjectCatalog,objectCatalogRevision} from './object-state.mjs';
import { applyWorldDefinition, findWalkPath } from './world.mjs';

let activeWorldKey = '';

self.addEventListener('message', ({ data }) => {
  const started = performance.now();
  try {
    if(data.objectCatalog&&data.objectCatalog.revision!==objectCatalogRevision())applyObjectCatalog(data.objectCatalog);
    const { requestId, worldDefinition, start, target, occupied, location, furniture, fires, roomLayout, animals } = data;
    const worldKey = `${worldDefinition.dimensionId}:${worldDefinition.seed}:${worldDefinition.theme}:${worldDefinition.revision}`;
    if (worldKey !== activeWorldKey) {
      applyWorldDefinition(worldDefinition);
      activeWorldKey = worldKey;
    }
    const path = findWalkPath(start, target, occupied, location, furniture, fires, roomLayout, animals);
    self.postMessage({ requestId, path, durationMs: performance.now() - started });
  } catch (error) {
    self.postMessage({ requestId: data.requestId, path: [], error: String(error), durationMs: performance.now() - started });
  }
});
