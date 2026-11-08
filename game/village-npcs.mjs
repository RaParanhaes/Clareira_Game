import { DIMENSION_COORDINATE_OFFSET } from './dimension-layout.mjs';
import { getGameDayState } from './day-night.mjs';
import { SPAWN_CAMPFIRE } from './world.mjs';
import { normalizeAppearance } from './appearance.mjs';

export const VILLAGE_NPC_LIMIT = 6;
export const VILLAGE_NPC_NIGHT_GATHERING = 4;
export const VILLAGE_NPC_DAY_MIN_SPACING = 6;

const offset = DIMENSION_COORDINATE_OFFSET;
const DAY_ROSTER = Object.freeze([
  { id:'mara',name:'Mara',roleId:'villager',x:12,y:18,bodyId:'body.female',skin:2,hair:2,coat:1 },
  { id:'tomas',name:'Tomás',roleId:'villager',x:18,y:13,bodyId:'body.male',skin:1,hair:0,coat:0 },
  { id:'lia',name:'Lia',roleId:'villager',x:27,y:15,bodyId:'body.female',skin:0,hair:3,coat:3 },
  { id:'bento',name:'Bento',roleId:'villager',x:37,y:18,bodyId:'body.male',skin:3,hair:1,coat:4 },
  { id:'noa',name:'Noa',roleId:'villager',x:8,y:28,bodyId:'body.female',skin:1,hair:4,coat:2 },
  { id:'ivo',name:'Ivo',roleId:'villager',x:25,y:31,bodyId:'body.male',skin:2,hair:2,coat:1 },
].map((npc,index)=>Object.freeze({
  ...npc,
  id:`village:${npc.id}`,
  x:npc.x+offset,
  y:npc.y+offset,
  appearance:normalizeAppearance({bodyId:npc.bodyId,outfitId:'outfit.commoner',skin:npc.skin,hair:npc.hair,coat:npc.coat}),
  rosterIndex:index,
})));

const NIGHT_OFFSETS = Object.freeze([
  [-1.7,-1.7],[1.7,-1.7],[1.7,1.7],[-1.7,1.7],
]);

export function villageActorsFor({ dimensionId='surface', location='clearing', now=Date.now(), theme='forest', bounds=null }={}) {
  if (location!=='clearing'||dimensionId!=='surface') return [];
  const night=getGameDayState(now,{theme,dimensionId}).isNight;
  const actors=DAY_ROSTER.map((npc,index)=>{
    const seated=night&&index<VILLAGE_NPC_NIGHT_GATHERING;
    const position=seated?{
      x:SPAWN_CAMPFIRE.x+NIGHT_OFFSETS[index][0],
      y:SPAWN_CAMPFIRE.y+NIGHT_OFFSETS[index][1],
    }:{x:npc.x,y:npc.y};
    return {
      id:npc.id,name:npc.name,roleId:npc.roleId,
      x:position.x,y:position.y,z:0,vx:0,vy:0,moving:false,running:0,crouching:0,
      sitting:seated,emote:seated?'sit':null,location:'clearing',dimensionId,
      facing:'south',npc:true,
    };
  });
  if(!bounds)return actors;
  return actors.filter(actor=>actor.x>=bounds.left&&actor.x<=bounds.right&&actor.y>=bounds.top&&actor.y<=bounds.bottom);
}

export function villageNpcDayRoster(){
  return DAY_ROSTER.map(({id,name,roleId,x,y,appearance})=>({id,name,roleId,x,y,appearance}));
}

export function villageNpcAppearance(id){
  return DAY_ROSTER.find(npc=>npc.id===id)?.appearance||null;
}
