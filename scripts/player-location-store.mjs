import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PROFILE_ID = /^[a-z0-9_-]{1,128}$/i;

export function normalizePlayerDimensionPosition(value) {
  if (!value || typeof value.dimensionId !== 'string'
      || !/^[a-z0-9][a-z0-9-]{0,47}$/i.test(value.dimensionId)
      || !Number.isFinite(value.x) || !Number.isFinite(value.y)
      || Math.abs(value.x) > 100_000 || Math.abs(value.y) > 100_000) return null;
  return { dimensionId:value.dimensionId.toLowerCase(), x:value.x, y:value.y,
    worldVersion:Number.isSafeInteger(value.worldVersion)&&value.worldVersion>=1?Math.min(100,value.worldVersion):1 };
}

export function normalizePlayerLocation(value) {
  if (!value || !['clearing', 'room'].includes(value.location)
      || !Number.isFinite(value.x) || !Number.isFinite(value.y)
      || Math.abs(value.x) > 100_000 || Math.abs(value.y) > 100_000) return null;
  const roomKey = typeof value.roomKey === 'string' ? value.roomKey.slice(0, 128) : '';
  const roomOwnerName = typeof value.roomOwnerName === 'string' ? value.roomOwnerName.slice(0, 64) : '';
  const dimensionId = typeof value.dimensionId === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/i.test(value.dimensionId)
    ? value.dimensionId.toLowerCase() : 'surface';
  return {
    location: value.location,
    dimensionId,
    x: value.x,
    y: value.y,
    roomKey,
    roomOwnerName,
    color: Number.isInteger(value.color) ? Math.max(0, Math.min(3, value.color)) : 0,
    worldVersion: Number.isSafeInteger(value.worldVersion) && value.worldVersion >= 1
      ? Math.min(100, value.worldVersion) : 1,
  };
}

function playerFile(directory, profileId, folder) {
  if (typeof profileId !== 'string' || !PROFILE_ID.test(profileId)) throw new Error('Invalid profile id');
  const key = createHash('sha256').update(profileId).digest('hex');
  return path.join(directory, folder, `${key}.json`);
}
function locationFile(directory, profileId) { return playerFile(directory,profileId,'player-locations'); }
function dimensionPositionsFile(directory, profileId) { return playerFile(directory,profileId,'player-dimension-positions'); }
async function atomicWrite(file,value){
  const folder=path.dirname(file);await mkdir(folder,{recursive:true,mode:0o700});await chmod(folder,0o700);
  const temporary=`${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary,`${JSON.stringify(value)}\n`,{mode:0o600,flag:'wx'});await chmod(temporary,0o600);
  await rename(temporary,file);await chmod(file,0o600);
}

export function createJsonPlayerLocationStore(directory) {
  const dimensionWrites=new Map();
  return {
    async loadPlayerLocation(profileId) {
      const file = locationFile(directory, profileId);
      try {
        const saved = JSON.parse(await readFile(file, 'utf8'));
        return saved?.version === 1 ? normalizePlayerLocation(saved.location) : null;
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },

    async savePlayerLocation(profileId, value) {
      const location = normalizePlayerLocation(value);
      if (!location) return;
      await atomicWrite(locationFile(directory, profileId),{version:1,location});
    },

    async loadPlayerDimensionPositions(profileId) {
      const file=dimensionPositionsFile(directory,profileId);
      try{
        const saved=JSON.parse(await readFile(file,'utf8'));
        if(saved?.version!==1||!saved.positions||typeof saved.positions!=='object')return [];
        return Object.entries(saved.positions).map(([dimensionId,value])=>normalizePlayerDimensionPosition({dimensionId,...value})).filter(Boolean);
      }catch(error){if(error.code==='ENOENT')return [];throw error;}
    },

    async savePlayerDimensionPosition(profileId,value) {
      const position=normalizePlayerDimensionPosition(value);if(!position)return;
      const previous=dimensionWrites.get(profileId)||Promise.resolve();
      const next=previous.catch(()=>{}).then(async()=>{
        const file=dimensionPositionsFile(directory,profileId);let positions={};
        try{const saved=JSON.parse(await readFile(file,'utf8'));if(saved?.version===1&&saved.positions&&typeof saved.positions==='object')positions=saved.positions;}catch(error){if(error.code!=='ENOENT')throw error;}
        positions[position.dimensionId]={x:position.x,y:position.y,worldVersion:position.worldVersion};
        await atomicWrite(file,{version:1,positions});
      });
      dimensionWrites.set(profileId,next);
      try{await next;}finally{if(dimensionWrites.get(profileId)===next)dimensionWrites.delete(profileId);}
    },
  };
}
