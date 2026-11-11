import test from 'node:test';
import assert from 'node:assert/strict';
import { getAvatarPose } from './avatar.mjs';
import { GAME_DAY_DURATION_MS } from './day-night.mjs';
import { SPAWN_CAMPFIRE } from './world.mjs';
import {
  VILLAGE_NPC_LIMIT,VILLAGE_NPC_NIGHT_GATHERING,VILLAGE_NPC_DAY_MIN_SPACING,VILLAGE_NPC_INDOORS,
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

// Game hour h as a timestamp: the day clock is the timestamp modulo one game day.
const atHour=hour=>GAME_DAY_DURATION_MS*hour/24;

test('from dusk to 23h all six villagers sit in a ring around the spawn fire',()=>{
  const evening=villageActorsFor({now:atHour(22)});
  assert.equal(evening.length,VILLAGE_NPC_LIMIT,'nobody leaves the fire before 23h');
  assert.equal(VILLAGE_NPC_NIGHT_GATHERING,VILLAGE_NPC_LIMIT);
  assert.ok(evening.every(npc=>npc.sitting&&npc.emote==='sit'));
  assert.ok(evening.every(npc=>getAvatarPose(npc).sitting));
  assert.equal(new Set(evening.map(npc=>`${npc.x.toFixed(2)},${npc.y.toFixed(2)}`)).size,VILLAGE_NPC_LIMIT,'each villager has his own seat');
  for(const npc of evening){
    assert.ok(Math.abs(Math.hypot(npc.x-SPAWN_CAMPFIRE.x,npc.y-SPAWN_CAMPFIRE.y)-2.4)<1e-9,`${npc.name} sits on the ring`);
  }
});

test('at 23h the villagers go indoors, and come back out at dawn at their day spots',()=>{
  assert.deepEqual(villageActorsFor({now:atHour(23.5)}),[],'after 23h everyone is inside');
  assert.deepEqual(villageActorsFor({now:atHour(1)}),[],'after midnight everyone is still inside');
  const dawn=villageActorsFor({now:atHour(9)});
  assert.equal(dawn.length,VILLAGE_NPC_LIMIT);
  assert.ok(dawn.every(npc=>!npc.sitting));
});

test('most villagers sleep in the largest inn and two in their cabins',()=>{
  const ids=Object.values(VILLAGE_NPC_INDOORS);
  assert.equal(ids.filter(id=>id==='lodging-ember-hotel').length,4);
  assert.equal(ids.filter(id=>id.startsWith('cabin-')).length,2);
  assert.deepEqual(new Set(villageNpcDayRoster().map(npc=>npc.id)),new Set(Object.keys(VILLAGE_NPC_INDOORS)));
});

test('actors are limited to the shared outdoor surface and AOI bounds',()=>{
  assert.deepEqual(villageActorsFor({dimensionId:'arrival-123',now:GAME_DAY_DURATION_MS*.5}),[]);
  assert.deepEqual(villageActorsFor({location:'room',now:GAME_DAY_DURATION_MS*.5}),[]);
  const roster=villageNpcDayRoster();
  const actor=villageActorsFor({now:GAME_DAY_DURATION_MS*.5,bounds:{left:roster[0].x-1,right:roster[0].x+1,top:roster[0].y-1,bottom:roster[0].y+1}});
  assert.deepEqual(actor.map(npc=>npc.id),[roster[0].id]);
});
