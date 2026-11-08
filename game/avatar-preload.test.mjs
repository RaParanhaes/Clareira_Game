import test from 'node:test';
import assert from 'node:assert/strict';
import {getAvatarSpriteURLs,preloadAvatarIdle,preloadAvatarSprites} from './avatar-sprites.mjs';
import {villageNpcDayRoster} from './village-npcs.mjs';

test('the village warmup decodes only idle sheets for its bounded NPC roster',async()=>{
  const previousImage=globalThis.Image,requested=[];
  globalThis.Image=class{
    listeners={};complete=true;naturalWidth=768;
    addEventListener(name,callback){this.listeners[name]=callback;}
    set src(url){requested.push(url);queueMicrotask(()=>this.listeners.load());}
    decode(){return Promise.resolve();}
  };
  try{
    const roster=villageNpcDayRoster();
    const idleUrls=new Set(roster.flatMap(npc=>getAvatarSpriteURLs(npc.appearance,'idle')));
    await Promise.all(roster.map(npc=>preloadAvatarIdle(npc.appearance)));
    assert.ok(requested.length>0,'NPC idle atlases are actually decoded');
    assert.ok(requested.every(url=>idleUrls.has(url)),'only assets needed for the static NPC idle pose are loaded');
    assert.ok(!requested.some(url=>/\/(?:walk|run)\.png(?:$|\?)/.test(url)),'static NPCs do not load unused movement sheets');
  }finally{globalThis.Image=previousImage;}
});

test('first playable avatar waits for walking and running sheets to decode', async () => {
  const previousImage=globalThis.Image,decodes=[],requested=[];
  globalThis.Image=class {
    listeners={};complete=true;naturalWidth=768;
    addEventListener(name,callback){this.listeners[name]=callback;}
    set src(url){requested.push(url);queueMicrotask(()=>this.listeners.load());}
    decode(){return new Promise(resolve=>decodes.push(resolve));}
  };
  try {
    let ready=false;const progress=[];
    const loading=preloadAvatarSprites({archetypeId:'character.peasant',body:'male'},{onProgress:p=>progress.push(p.action)}).then(()=>ready=true);
    await new Promise(resolve=>setImmediate(resolve));
    assert.ok(requested.some(url=>url.endsWith('/walk.png')));
    assert.ok(requested.some(url=>url.endsWith('/run.png')));
    assert.equal(ready,false,'image load alone cannot release movement');
    for(const decode of decodes)decode();
    await loading;
    assert.equal(ready,true);
    assert.deepEqual(progress.sort(),['idle','run','walk']);
    const decodedFiles = requested.length;
    // A crowded spawn must not create/decode duplicate PNGs for each color.
    await Promise.all(Array.from({length: 10}, (_, index) => preloadAvatarSprites({
      archetypeId:'character.peasant', body:'male', skin:index % 4,
      hair:index % 5, coat:index % 5,
    })));
    assert.equal(requested.length, decodedFiles, 'ten appearances reuse the same decoded atlas groups');
  } finally {globalThis.Image=previousImage;}
});
