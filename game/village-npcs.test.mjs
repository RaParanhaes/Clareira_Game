import test from 'node:test';
import assert from 'node:assert/strict';
import { getAvatarFacing,getAvatarPose } from './avatar.mjs';
import { GAME_DAY_DURATION_MS } from './day-night.mjs';
import { SPAWN_CAMPFIRE,WORLD_TILE_X,WORLD_TILE_Y } from './world.mjs';
import {
  VILLAGE_NPC_LIMIT,VILLAGE_NPC_NIGHT_GATHERING,VILLAGE_NPC_DAY_MIN_SPACING,
  villageActorsFor,villageNpcDayRoster,
} from './village-npcs.mjs';

test('the village roster is small, stable, and spaced across open village clearings',()=>{
  const morning=villageActorsFor({now:GAME_DAY_DURATION_MS*.5});
  assert.equal(morning.length,VILLAGE_NPC_LIMIT);
  assert.equal(new Set(morning.map(npc=>npc.id)).size,VILLAGE_NPC_LIMIT);
  assert.ok(Buffer.byteLength(JSON.stringify(morning))<=4096,'the full local roster stays below 4 KiB before WebSocket compression');
  for(let i=0;i<morning.length;i++)for(let j=i+1;j<morning.length;j++){
    assert.ok(Math.hypot(morning[i].x-morning[j].x,morning[i].y-morning[j].y)>=VILLAGE_NPC_DAY_MIN_SPACING,
      `${morning[i].name} and ${morning[j].name} are too close`);
  }
  assert.ok(morning.every(npc=>npc.npc&&npc.location==='clearing'&&npc.moving===false));
});

test('at night four villagers sit around the village hearth while the others remain spread out',()=>{
  const night=villageActorsFor({now:GAME_DAY_DURATION_MS*20/24});
  const seated=night.filter(npc=>npc.sitting);
  assert.equal(seated.length,VILLAGE_NPC_NIGHT_GATHERING);
  assert.ok(seated.every(npc=>npc.emote==='sit'));
  assert.ok(seated.every(npc=>getAvatarPose(npc).sitting));
  assert.equal(new Set(seated.map(npc=>getAvatarFacing(npc,npc,[SPAWN_CAMPFIRE],WORLD_TILE_X,WORLD_TILE_Y))).size,
    VILLAGE_NPC_NIGHT_GATHERING,'each seated villager faces inward toward the fire');
  assert.equal(new Set(night.map(npc=>npc.id)).size,VILLAGE_NPC_LIMIT);
  assert.ok(night.slice(VILLAGE_NPC_NIGHT_GATHERING).every(npc=>!npc.sitting));
});

test('actors are limited to the shared outdoor surface and AOI bounds',()=>{
  assert.deepEqual(villageActorsFor({dimensionId:'arrival-123',now:GAME_DAY_DURATION_MS*.5}),[]);
  assert.deepEqual(villageActorsFor({location:'room',now:GAME_DAY_DURATION_MS*.5}),[]);
  const roster=villageNpcDayRoster();
  const actor=villageActorsFor({now:GAME_DAY_DURATION_MS*.5,bounds:{left:roster[0].x-1,right:roster[0].x+1,top:roster[0].y-1,bottom:roster[0].y+1}});
  assert.deepEqual(actor.map(npc=>npc.id),[roster[0].id]);
});
