// Scene-owned files; character PNG atlases are loaded on demand by the renderer.
export const ASSETS = Object.freeze([
  {id:'image.grass-surface',scene:'clearing',url:'art/terrain/forest-grass-detailed-2026-v8.png',version:8,critical:true,maxBytes:12000},
  {id:'image.soil-texture',scene:'clearing',url:'art/terrain/forest-soil-2026-v1.png',version:1,critical:true,maxBytes:40000},
  {id:'image.soil-fade',scene:'clearing',url:'art/terrain/forest-soil-fade-2026-v1.png',version:1,critical:true,maxBytes:50000},
  {id:'image.campfire-flame',scene:'clearing',url:'art/fire/campfire-flame-frames.png',version:6,critical:false,maxBytes:10000},
  {id:'image.campfire-sequence',scene:'clearing',url:'art/fire/campfire-sequence-frames.png',version:1,critical:false,maxBytes:80000},
  {id:'image.campfire-loop',scene:'clearing',url:'art/fire/campfire-loop-frames.png',version:1,critical:false,maxBytes:30000},
  {id:'image.campfire-hearth-base',scene:'clearing',url:'art/fire/campfire-hearth-base.png',version:1,critical:false,maxBytes:5000},
  {id:'image.campfire-hearth-flames',scene:'clearing',url:'art/fire/campfire-hearth-flame-frames.png',version:1,critical:false,maxBytes:10000},
  {id:'image.campfire-aura',scene:'clearing',url:'art/fire/campfire-aura-frames.png',version:1,critical:false,maxBytes:16000},
  {id:'image.campfire-sky-rays',scene:'clearing',url:'art/fire/campfire-sky-rays-frames.png',version:5,critical:false,maxBytes:1200000},
  {id:'audio.arrival-thunder',scene:'arrival',type:'audio',url:'art/audio/arrival-thunder.ogg',version:1,critical:false,maxBytes:120000},
  {id:'image.room-furniture',scene:'room',url:'art/room-furniture/room-furniture-v3.png',version:3,critical:true,maxBytes:4000000},
  {id:'image.medieval-furniture-3d',scene:'room',url:'art/room-furniture/medieval-furniture-v1.png',version:1,critical:false,maxBytes:4000000},
  {id:'image.building-material-uv',scene:'clearing',url:'art/building-materials/architecture-uv-v1.png',version:3,critical:false,maxBytes:20000},
  {id:'image.building-cottage-day',scene:'clearing',url:'art/buildings/medieval-cottage-3d/frames/iso-rot0-shell.png',version:2,critical:false,maxBytes:100000},
  {id:'image.building-cottage-night',scene:'clearing',url:'art/buildings/medieval-cottage-3d/frames/iso-rot0-shell-night.png',version:2,critical:false,maxBytes:100000},
  {id:'image.building-cottage-canopy',scene:'clearing',url:'art/buildings/medieval-cottage-3d/frames/iso-rot0-canopy.png',version:2,critical:false,maxBytes:30000},
  {id:'image.building-cottage-post-left',scene:'clearing',url:'art/buildings/medieval-cottage-3d/frames/iso-rot0-post-left.png',version:2,critical:false,maxBytes:10000},
  {id:'image.building-cottage-post-right',scene:'clearing',url:'art/buildings/medieval-cottage-3d/frames/iso-rot0-post-right.png',version:2,critical:false,maxBytes:10000},
  {id:'image.building-fern-day',scene:'clearing',url:'art/buildings/fern-cabin-3d/frames/iso-rot0-shell.png',version:2,critical:true,maxBytes:100000},
  {id:'image.building-fern-night',scene:'clearing',url:'art/buildings/fern-cabin-3d/frames/iso-rot0-shell-night.png',version:2,critical:true,maxBytes:100000},
  {id:'image.building-fern-canopy',scene:'clearing',url:'art/buildings/fern-cabin-3d/frames/iso-rot0-canopy.png',version:2,critical:true,maxBytes:30000},
  {id:'image.building-fern-post-left',scene:'clearing',url:'art/buildings/fern-cabin-3d/frames/iso-rot0-post-left.png',version:2,critical:true,maxBytes:10000},
  {id:'image.building-fern-post-right',scene:'clearing',url:'art/buildings/fern-cabin-3d/frames/iso-rot0-post-right.png',version:2,critical:true,maxBytes:10000},
  {id:'image.teleport-lower',scene:'teleport',url:'art/dimension-transit/official/lower-60.webp',version:2,critical:true,maxBytes:3500000},
  {id:'image.teleport-beam',scene:'teleport',url:'art/dimension-transit/official/beam-60.webp',version:2,critical:true,maxBytes:3500000},
  {id:'image.teleport-upper',scene:'teleport',url:'art/dimension-transit/official/upper-60.webp',version:2,critical:true,maxBytes:1100000},
  {id:'audio.teleport-lower',scene:'teleport',type:'audio',url:'art/dimension-transit/official/lower.ogg',version:1,critical:false,maxBytes:50000},
  {id:'audio.teleport-beam',scene:'teleport',type:'audio',url:'art/dimension-transit/official/beam.ogg',version:1,critical:false,maxBytes:50000},
  {id:'audio.teleport-upper',scene:'teleport',type:'audio',url:'art/dimension-transit/official/upper.ogg',version:1,critical:false,maxBytes:50000},
  {id:'audio.teleport-vortex',scene:'teleport',type:'audio',url:'art/dimension-transit/official/vortex.ogg',version:1,critical:false,maxBytes:50000},
]);
export function assetScenesFor(location, dimensionId = 'surface') {
  if (location !== 'clearing') return [location];
  if (dimensionId === 'surface') return ['clearing'];
  return [...(dimensionId.startsWith('arrival-') ? ['clearing','arrival'] : ['clearing']), `dimension:${dimensionId}`];
}

export function assetsForScene(scene, assets = ASSETS) {
  return assets.filter(asset => asset.scene === scene);
}

// The shared scene catalog fits in 32 entries; traveling must not evict its
// prepared atlases merely because several scene packages warmed together.
export function createAssetLoader({load, maxEntries=32, maxConcurrent=3, maxPending=64, timeoutMs=15000}={}) {
  if(typeof load!=='function' || !Number.isInteger(maxEntries) || maxEntries<1
    ||!Number.isFinite(timeoutMs)||timeoutMs<=0
    ||!Number.isInteger(maxConcurrent)||maxConcurrent<1||!Number.isInteger(maxPending)||maxPending<maxConcurrent)throw new TypeError('Loader/cache inválido');
  const cache=new Map(),pending=new Map(),queue=[];let active=0,loads=0,cacheHits=0,pendingHits=0;
  function pump(){
    while(active<maxConcurrent&&queue.length){
      const job=queue.shift();active++;loads++;
      const controller=new AbortController();
      let timer;
      const deadline=new Promise((resolve,reject)=>{
        timer=setTimeout(()=>{
          reject(new Error(`Tempo esgotado ao preparar ${job.asset.id}`));
          controller.abort();
        },timeoutMs);
      });
      Promise.race([Promise.resolve().then(()=>load(job.asset,{signal:controller.signal})),deadline]).then(value=>{
        clearTimeout(timer);
        cache.set(job.key,value);
        while(cache.size>maxEntries)cache.delete(cache.keys().next().value);
        finish(job,null,value);
      },error=>{clearTimeout(timer);finish(job,error);});
    }
  }
  function finish(job,error,value){
    pending.delete(job.key);active--;
    if(error)job.reject(error);else job.resolve(value);
    pump();
  }
  function acquire(asset){
    const key=`${asset.url}@${asset.version}`;
    if(pending.has(key)){pendingHits++;return pending.get(key);}
    if(cache.has(key)){cacheHits++;const value=cache.get(key);cache.delete(key);cache.set(key,value);return Promise.resolve(value);}
    if(pending.size>=maxPending)return Promise.reject(new Error('A fila de preparação de assets atingiu o limite.'));
    let resolve,reject;const task=new Promise((yes,no)=>{resolve=yes;reject=no;});
    pending.set(key,task);queue.push({key,asset,resolve,reject});pump();
    return task;
  }
  return {
    loadScene(scene, assets = ASSETS, { onProgress } = {}) {
      const selected = assetsForScene(scene, assets);
      let completed = 0;
      return Promise.all(selected.map(async asset => {
        let loaded = false, fallback = false;
        try {
          const result = await acquire(asset);
          loaded = true;
          return result;
        } catch (error) {
          if (asset.critical) throw error;
          fallback = true;
          return null;
        } finally {
          completed += 1;
          onProgress?.({ asset, completed, total: selected.length, loaded, fallback });
        }
      }));
    },
    assetsForScene(scene, assets = ASSETS) { return assetsForScene(scene, assets); },
    size() { return cache.size; },
    stats() { return {entries:cache.size,active,pending:pending.size,queued:queue.length,maxConcurrent,maxPending,loads,cacheHits,pendingHits}; },
  };
}
