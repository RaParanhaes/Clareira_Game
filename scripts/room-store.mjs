import {validateObjectProperties} from '../game/object-catalog.mjs';
import {VILLAGE_BUILDINGS} from '../game/village-buildings.mjs';
import { furnitureByKind } from '../game/content-catalog.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { canPlaceRoomFurniture, roomFurnitureSupport, getRoomLayout, ROOM_FURNITURE_LIMIT } from '../game/world.mjs';

const ROOM_SCHEMA_VERSION = 1;
const ACCOUNT_ID = /^[a-z0-9_-]{1,128}$/i;

function roomFile(directory, accountId) {
  if (typeof accountId !== 'string' || !ACCOUNT_ID.test(accountId)) throw new Error('Invalid account id');
  const key = createHash('sha256').update(accountId).digest('hex');
  return path.join(directory, 'rooms', `${key}.json`);
}

export function validateFurniture(value) {
  if (!Array.isArray(value) || value.length > ROOM_FURNITURE_LIMIT) throw new Error('Invalid room furniture');
  const result = [];
  for (const item of value) {
    const furniture = {
      id: typeof item?.id === 'string' && /^[a-f0-9-]{8,36}$/i.test(item.id) ? item.id : '',
      kind: item?.kind,
      x: item?.x,
      y: item?.y,
      rotation: Number.isInteger(item?.rotation) ? item.rotation : 0,
    };
    if(item.supportId!==undefined){
      if(typeof item.supportId!=='string'||!result.some(other=>other.id===item.supportId)
        &&!value.some(other=>other?.id===item.supportId))throw new Error('Apoio do móvel inválido.');
      furniture.supportId=item.supportId;
      if(item.supportSurface!=='top'||![item.supportOffsetX,item.supportOffsetY,item.baseZ].every(Number.isFinite)
        ||Math.abs(item.supportOffsetX)>10||Math.abs(item.supportOffsetY)>10||item.baseZ<=0||item.baseZ>10)throw new Error('Apoio do móvel inválido.');
      furniture.supportSurface=item.supportSurface;furniture.supportOffsetX=item.supportOffsetX;
      furniture.supportOffsetY=item.supportOffsetY;furniture.baseZ=item.baseZ;
    }else if(['supportSurface','supportOffsetX','supportOffsetY','baseZ'].some(key=>item[key]!==undefined))throw new Error('Apoio do móvel incompleto.');
    if(item.properties!==undefined){furniture.properties=validateObjectProperties(item.properties);
      if(['id','kind','x','y','rotation','enabled','roomSupport'].some(key=>Object.hasOwn(furniture.properties,key)))throw new Error('Propriedade reservada do móvel.');
      for(const key of ['width','depth','height'])if(furniture.properties[key]!==undefined&&(!Number.isFinite(furniture.properties[key])||furniture.properties[key]<=0||furniture.properties[key]>10))throw new Error('Tamanho de móvel inválido.');
    }
    if(furniture.kind==='lamp')furniture.enabled=item.enabled!==false;
    if (!furniture.id || result.some(other=>other.id===furniture.id) || !furnitureByKind(furniture.kind) || furniture.rotation < 0 || furniture.rotation > 3
        ) throw new Error('Invalid room furniture');
    result.push(furniture);
  }
  const layouts=[getRoomLayout(), ...VILLAGE_BUILDINGS.map(b=>b.id).flatMap(id=>['owned','rent'].map(mode=>getRoomLayout('lodging',id,mode)))];
  if(!layouts.some(layout=>result.every(item=>{
    const others=result.filter(other=>other.id!==item.id),support=roomFurnitureSupport(item,others,layout);
    if(item.supportId){if(!support||support.supportId!==item.supportId||item.supportSurface!==support.supportSurface
      ||Math.abs(item.baseZ-support.baseZ)>.001||Math.abs(item.supportOffsetX-support.supportOffsetX)>.001
      ||Math.abs(item.supportOffsetY-support.supportOffsetY)>.001)return false;}
    else if(support)return false;
    return canPlaceRoomFurniture(item,others,[],layout);
  })))throw new Error('Invalid room furniture');
  return result;
}

export async function loadAccountRoom(directory, accountId) {
  const file = roomFile(directory, accountId);
  let saved;
  try { saved = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  if (saved?.version !== ROOM_SCHEMA_VERSION) throw new Error('Unsupported room save version');
  return validateFurniture(saved.furniture);
}

export async function saveAccountRoom(directory, accountId, furniture) {
  const file = roomFile(directory, accountId);
  const normalized = validateFurniture(furniture);
  const directoryPath = path.dirname(file);
  await mkdir(directoryPath, { recursive: true, mode: 0o700 });
  await chmod(directoryPath, 0o700);
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ version: ROOM_SCHEMA_VERSION, furniture: normalized })}\n`, { mode: 0o600, flag: 'wx' });
  await chmod(temporary, 0o600);
  await rename(temporary, file);
  await chmod(file, 0o600);
}
