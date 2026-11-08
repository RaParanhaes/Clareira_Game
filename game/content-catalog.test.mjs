import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTENT,validateContent,furnitureByKind} from './content-catalog.mjs';
import {MEDIEVAL_FURNITURE} from './medieval-furniture.mjs';
import {ASSETS,assetScenesFor,createAssetLoader} from './content-assets.mjs';
import {ROOM_FIXTURE_ATLAS} from './room-fixture-renderer.mjs';
test('catalog rejects duplicate IDs, dangling references and invalid authority',()=>{
 assert.deepEqual(validateContent(CONTENT),[]);
 assert.ok(validateContent(null).length);
 assert.ok(validateContent([{id:42,category:'item',label:42,refs:{}}]).length);
 const duplicate={...CONTENT[0],refs:['material.missing'],physics:{shape:'circle',authority:'client'}};
 const errors=validateContent([...CONTENT,duplicate]);
 assert.ok(errors.some(e=>e.includes('duplicado')));assert.ok(errors.some(e=>e.includes('ausente')));assert.ok(errors.some(e=>e.includes('Física')));
 assert.ok(validateContent([{...CONTENT[0],physics:{shape:'capsule',radius:.24,halfLength:0,authority:'server'}}]).some(e=>e.includes('Física')));
 assert.equal(furnitureByKind('unknown'),undefined);assert.equal(furnitureByKind('stool').physics.radiusRatio,.5);
});
test('arrival sky rays load as a compact optional atlas in clearing scenes',()=>{
 const rays=ASSETS.find(asset=>asset.id==='image.campfire-sky-rays');
 assert.equal(rays?.scene,'clearing');
 assert.equal(rays?.critical,false);
 assert.equal(rays?.url,'art/fire/campfire-sky-rays-frames.png');
 assert.ok(CONTENT.some(item=>item.id==='animation.campfire-sky-rays'));
});
test('forest grass uses the approved detailed platform-grass surface atlas',()=>{
 const grass=ASSETS.find(asset=>asset.id==='image.grass-surface');
 assert.equal(grass?.scene,'clearing');
 assert.equal(grass?.url,'art/terrain/forest-grass-detailed-2026-v8.png');
 assert.equal(grass?.critical,true);
 assert.equal(grass?.version,8);
 assert.ok(grass?.maxBytes>=3232);
});
test('forest paths use pure soil and fade only at their grass boundary',()=>{
 const soil=ASSETS.find(asset=>asset.id==='image.soil-texture');
 const fade=ASSETS.find(asset=>asset.id==='image.soil-fade');
 assert.equal(soil?.scene,'clearing');
 assert.equal(soil?.url,'art/terrain/forest-soil-2026-v1.png');
 assert.equal(soil?.critical,true);
 assert.equal(soil?.version,1);
 assert.ok(soil?.maxBytes>=30752);
 assert.equal(fade?.scene,'clearing');
 assert.equal(fade?.url,'art/terrain/forest-soil-fade-2026-v1.png');
 assert.equal(fade?.critical,true);
 assert.equal(fade?.version,1);
 assert.ok(fade?.maxBytes>=42059);
});
test('every implemented furniture definition stores its server collider and contact-depth rule',()=>{
 const furniture=CONTENT.filter(value=>value.category==='furniture'&&value.status==='implemented');
 assert.equal(furniture.length,213);
 for(const item of furniture.filter(value=>!value.id.startsWith('furniture.medieval-'))){
  assert.equal(item.physics.authority,'server',item.id);
  assert.equal(item.renderer,'png-frame-atlas',item.id);
  assert.equal(item.manifest,'art/room-furniture/manifest.json',item.id);
  assert.equal(item.rotations,4,item.id);
  assert.ok(ROOM_FIXTURE_ATLAS.rows.includes(item.kind),item.id);
  assert.ok(['circle','box'].includes(item.physics.shape),item.id);
  assert.equal(item.depthOrder.anchor,'footprint-front',item.id);
  assert.equal(item.depthOrder.vertical,'support-base',item.id);
  if(item.physics.shape==='circle')assert.ok(item.physics.radius>0||item.physics.radiusRatio>0,item.id);
  else assert.ok(item.physics.colliderWidthRatio>0&&item.physics.colliderDepthRatio>0,item.id);
 }
 assert.equal(furnitureByKind('bed').use,'lie');assert.equal(furnitureByKind('shower').use,'shower');
 assert.equal(furnitureByKind('shower').physics.authority,'server');
 assert.deepEqual(ROOM_FIXTURE_ATLAS.rotations,[0,1,2,3]);
 assert.ok(ROOM_FIXTURE_ATLAS.rows.includes('shower'));
});
test('scene loader requests only its assets, deduplicates and bounds cache',async()=>{
 let calls=0;
 const loader=createAssetLoader({load:async a=>{calls++;return a.id;},maxEntries:2});
 const assets=[{id:'a',scene:'room',url:'a.webp',version:1,critical:true},{id:'b',scene:'clearing',url:'b.webp',version:1,critical:true}];
 await Promise.all([loader.loadScene('room',assets),loader.loadScene('room',assets)]);
 assert.equal(calls,1);
 await loader.loadScene('room',[{...assets[0],version:2}]);assert.equal(calls,2);
 await loader.loadScene('clearing',assets);assert.equal(calls,3);assert.equal(loader.size(),2);
});
test('asset preparation bounds concurrency and shares pending work even with a small completed cache',async()=>{
 let active=0,peak=0,calls=0;const releases=[];
 const loader=createAssetLoader({maxEntries:1,maxConcurrent:2,load:async asset=>{
  calls++;peak=Math.max(peak,++active);
  await new Promise(resolve=>releases.push(resolve));active--;return asset.id;
 }});
 const assets=Array.from({length:6},(_,i)=>({id:String(i),url:`atlas-${i}.png`,version:1,scene:'room',critical:true}));
 const first=loader.loadScene('room',assets),second=loader.loadScene('room',assets);
 while(loader.stats().pending){
  await new Promise(resolve=>setImmediate(resolve));
  for(const release of releases.splice(0))release();
 }
 assert.deepEqual(await first,await second);assert.equal(calls,6);assert.equal(peak,2);assert.equal(loader.size(),1);
});
test('travel reuses the shared prepared scene catalog instead of decoding it again',async()=>{
 let calls=0;const loader=createAssetLoader({load:async asset=>{calls++;return asset.id;}});
 const scenes=[...new Set(ASSETS.map(asset=>asset.scene))];
 await Promise.all(scenes.map(scene=>loader.loadScene(scene)));
 const initial=calls;
 await Promise.all(scenes.map(scene=>loader.loadScene(scene)));
 assert.equal(calls,initial);assert.ok(loader.size()<=32);
});
test('scene preparation loads common clearing assets plus only the selected dimension package',async()=>{
 assert.deepEqual(assetScenesFor('clearing','surface'),['clearing']);
 assert.deepEqual(assetScenesFor('clearing','moonlit-forest'),['clearing','dimension:moonlit-forest']);
 assert.deepEqual(assetScenesFor('clearing','arrival-123'),['clearing','arrival','dimension:arrival-123']);
 assert.deepEqual(assetScenesFor('room','moonlit-forest'),['room']);
});
test('failed critical files block readiness but can retry; optional files fall back',async()=>{
 let fails=true;
 const loader=createAssetLoader({load:async()=>{if(fails)throw Error('offline');return 'decoded';}});
 const asset={id:'test',scene:'room',url:'x.webp',version:1,critical:true};
 await assert.rejects(loader.loadScene('room',[asset]),/offline/);assert.equal(loader.size(),0);
 fails=false;assert.deepEqual(await loader.loadScene('room',[asset]),['decoded']);
 fails=true;assert.deepEqual(await loader.loadScene('login',[{...asset,url:'optional.webp',scene:'login',critical:false}]),[null]);
});
test('scene asset progress reports actual completions and optional fallbacks',async()=>{
 const events=[];
 const loader=createAssetLoader({load:async asset=>{
  if(asset.id==='optional')throw Error('missing optional art');
  return 'decoded';
 }});
 const assets=[
  {id:'critical',scene:'room',url:'critical.webp',version:1,critical:true},
  {id:'optional',scene:'room',url:'optional.webp',version:1,critical:false},
 ];
 const result=await loader.loadScene('room',assets,{onProgress:event=>events.push(event)});
 assert.deepEqual(result,['decoded',null]);
 assert.equal(events.length,2);
 assert.ok(events.every(event=>event.total===2));
 assert.deepEqual(events.map(event=>[event.completed,event.loaded,event.fallback]).sort(),[
  [1,true,false],[2,false,true],
 ]);
});


test('a hung asset releases its concurrency slot, falls back only if optional, and can be retried',async()=>{
 let attempts=0,aborted=false;
 const loader=createAssetLoader({maxConcurrent:1,timeoutMs:15,load:(asset,{signal})=>{
  if(asset.id==='hung'&&++attempts===1){signal.addEventListener('abort',()=>{aborted=true;});return new Promise(()=>{});}
  return Promise.resolve(asset.id);
 }});
 const assets=[{id:'hung',scene:'test',url:'hung',version:1,critical:true},{id:'next',scene:'test',url:'next',version:1,critical:true}];
 await assert.rejects(loader.loadScene('test',assets),/Tempo esgotado/);
 assert.equal(aborted,true);
 assert.deepEqual(await loader.loadScene('test',assets),['hung','next']);
 assert.equal(loader.stats().pending,0);assert.equal(loader.stats().active,0);
 const optional=createAssetLoader({timeoutMs:10,load:()=>new Promise(()=>{})});
 assert.deepEqual(await optional.loadScene('test',[{...assets[0],critical:false}]),[null]);
 assert.equal(optional.stats().pending,0);
});
