import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotStream } from './snapshot-stream.mjs';

const socket = () => ({readyState:1, bufferedAmount:0, packets:[], compression:[],
  send(raw, options) { this.compression.push(options?.compress); this.packets.push(JSON.parse(raw)); }});

test('shared area encoding keeps keys and claims private, including empty state after revocation', () => {
  const owner = socket(), visitor = socket();
  const a = { location: 'clearing', compactWorld: true, keys: ['owner-key'], claim: 'owner-cabin' };
  const b = { location: 'clearing', compactWorld: true, keys: ['guest-key'], claim: null };
  const peers = new Map([[owner, a], [visitor, b]]); let builds = 0, personalizations = 0;
  const stream = createSnapshotStream({ personalRefreshMs: 100, personalize: player => { personalizations++; return { cabinKeys: player.keys, lodgingClaim: player.claim }; }, personalFields: ['cabinKeys', 'lodgingClaim'] });
  const build = player => { builds++; return { type: 'state', players: [], resources: [], fires: [], roomFurniture: [],
    cabinKeys: player.keys, lodgingClaim: player.claim }; };
  stream(peers, build, 0);
  assert.equal(builds, 1, 'the shared area is still built once');
  assert.equal(personalizations, 2, 'private data is built once per viewer, not again for the shared area');
  assert.deepEqual(owner.packets[0].cabinKeys, ['owner-key']);
  assert.deepEqual(visitor.packets[0].cabinKeys, ['guest-key']);
  assert.equal(visitor.packets[0].lodgingClaim, null);
  b.keys = []; stream(peers, build, 100);
  assert.deepEqual(visitor.packets[1].cabinKeys, []);
  assert.equal(Object.hasOwn(owner.packets[1], 'cabinKeys'), false, 'unchanged private state is omitted from movement snapshots');
});

test('dimension destination names stay private to each viewer in a shared world snapshot', () => {
  const staff = socket(), player = socket();
  const peers = new Map([[staff, { id: 'staff', location: 'clearing', compactWorld: true, destinations: ['surface', 'inferno'] }],
    [player, { id: 'player', location: 'clearing', compactWorld: true, destinations: ['surface', 'breu'] }]]);
  let builds = 0;
  const stream = createSnapshotStream({
    personalize: viewer => ({ dimensions: viewer.destinations }),
    personalFields: ['dimensions'],
  });
  stream(peers, viewer => {
    builds += 1;
    return { type: 'state', players: [], dimensions: viewer.destinations };
  }, 0);
  assert.equal(builds, 1, 'the common snapshot remains shared');
  assert.deepEqual(staff.packets[0].dimensions, ['surface', 'inferno']);
  assert.deepEqual(player.packets[0].dimensions, ['surface', 'breu']);
});

test('personal state is cached between ticks but refreshes on a timer or full update', () => {
  const ws=socket(),player={location:'clearing',compactWorld:true,inventorySeq:1};
  let personalizations=0;
  const stream=createSnapshotStream({
    personalRefreshMs:250,
    personalize:p=>{personalizations++;return {inventoryState:{seq:p.inventorySeq}};},
    personalFields:['inventoryState'],
  });
  const peers=new Map([[ws,player]]);
  const build=()=>({type:'state',players:[],resources:[],fires:[],roomFurniture:[]});
  stream(peers,build,0);
  assert.equal(ws.packets[0].inventoryState.seq,1);
  player.inventorySeq=2;
  stream(peers,build,100);
  assert.equal(personalizations,1,'unchanged movement ticks do not rebuild the inventory snapshot');
  assert.equal(Object.hasOwn(ws.packets[1],'inventoryState'),false,'clients retain their previous private state between refreshes');
  stream(peers,build,250);
  assert.equal(personalizations,2);
  assert.equal(ws.packets[2].inventoryState.seq,2);
  player.inventorySeq=3;
  stream(peers,build,300,true);
  assert.equal(personalizations,3,'full updates carry important private changes immediately');
  assert.equal(ws.packets[3].inventoryState.seq,3);
});

test('object catalogs are sent once per client revision and stay private to unprepared clients', () => {
  const fresh=socket(),ready=socket();
  const peers=new Map([[fresh,{location:'room',roomKey:'same',catalogReady:false}],
    [ready,{location:'room',roomKey:'same',catalogReady:true}]]);
  const stream=createSnapshotStream({
    personalize:player=>({objectCatalog:player.catalogReady?null:{revision:7,rooms:[]}}),
    personalFields:['objectCatalog'],
  });
  const build=()=>({type:'state',players:[],resources:[],fires:[],roomFurniture:[]});
  stream(peers,build,0);
  assert.deepEqual(fresh.packets[0].objectCatalog,{revision:7,rooms:[]});
  assert.equal(ready.packets[0].objectCatalog,null,'a prepared viewer does not receive another copy');
  peers.get(fresh).catalogReady=true;
  stream(peers,build,250);
  assert.equal(fresh.packets[1].objectCatalog,null,'the acknowledgement clears the cached private payload');
  const freshPlayer=peers.get(fresh);freshPlayer.roomKey='next-room';
  stream(peers,build,300);
  assert.equal(fresh.packets[2].objectCatalog,null,'changing rooms does not resend an acknowledged catalog');
});

test('compact sync keeps motion fresh, sends edits immediately and refreshes static state', () => {
  const ws=socket(),player={location:'clearing',compactWorld:true};
  const peers=new Map([[ws,player]]),stream=createSnapshotStream();
  const state={type:'state',dimensionId:'breu',players:[{x:8,inputSeq:1}],resources:[{id:'wood'}],fires:[],roomFurniture:[],roomOwnerName:'Casa',roomCanEdit:true};
  const build=(_player,includeWorld)=>includeWorld?state:{type:state.type,players:state.players,roomOwnerName:state.roomOwnerName,roomCanEdit:state.roomCanEdit};
  stream(peers,build,0);
  assert.equal(ws.compression[0], true, 'large initial world snapshot remains compressible');
  state.players=[{x:9,inputSeq:2}];stream(peers,build,100);
  assert.equal(ws.compression[1], false, 'frequent movement snapshots skip compression');
  assert.equal(ws.packets[1].players[0].inputSeq,2);
  assert.ok(!('dimensionId' in ws.packets[1]));
  assert.ok(!('resources' in ws.packets[1]));
  assert.equal(ws.packets[1].roomCanEdit,true,'movimento compacto conserva permissões do quarto');
  state.resources=[];state.fires=[{x:9,y:12}];stream(peers,build,200,true);
  assert.deepEqual(ws.packets[2].resources,[]);
  assert.deepEqual(ws.packets[2].fires,[{x:9,y:12}]);
  stream(peers,build,300);assert.ok(!('fires' in ws.packets[3]));
  stream(peers,build,5200);assert.deepEqual(ws.packets[4].fires,state.fires);
});

test('movement compression can be enabled separately for controlled network benchmarks', () => {
  const ws=socket(),player={location:'clearing',compactWorld:true};
  const stream=createSnapshotStream({compressMovement:true}),peers=new Map([[ws,player]]);
  const build=()=>({type:'state',players:[{x:1}],resources:[],fires:[],roomFurniture:[]});
  stream(peers,build,0);
  stream(peers,build,50);
  assert.deepEqual(ws.compression,[true,true]);
});

test('compact motion stays fresh while wildlife updates at a bounded cadence', () => {
  const ws=socket(),player={location:'clearing',compactWorld:true};
  const stream=createSnapshotStream({wildlifeRefreshMs:100}),peers=new Map([[ws,player]]);
  let x=0;
  const build=(_player,includeWorld,includeWildlife)=>({
    type:'state',players:[{x:++x}],
    ...(includeWildlife?{animals:[{id:'deer',x}]}:{}),
    ...(includeWorld?{resources:[],fires:[],roomFurniture:[]}:{}),
  });
  stream(peers,build,0);
  assert.equal(ws.packets[0].animals[0].x,1);
  stream(peers,build,33);
  assert.equal(ws.packets[1].players[0].x,2,'player motion is still sent on the next tick');
  assert.equal('animals' in ws.packets[1],false,'unchanged wildlife is omitted between refreshes');
  stream(peers,build,99);
  assert.equal('animals' in ws.packets[2],false);
  stream(peers,build,100);
  assert.equal(ws.packets[3].animals[0].x,4,'wildlife refresh resumes at the configured interval');
  stream(peers,build,110,true);
  assert.ok(Array.isArray(ws.packets[4].animals),'world changes force a complete wildlife refresh');
});

test('scene changes and reconnects always deliver full collections, including empty ones', () => {
  const ws=socket(),player={location:'clearing',compactWorld:true};
  const peers=new Map([[ws,player]]),stream=createSnapshotStream();
  const build=(p,includeWorld)=>includeWorld?({type:'state',players:[],resources:p.location==='clearing'?[{id:'wood'}]:[],
    fires:[],roomFurniture:p.location==='room'?[{id:p.roomKey}]:[]}):({type:'state',players:[]});
  stream(peers,build,0);player.location='room';player.roomKey='a';stream(peers,build,1);
  assert.deepEqual(ws.packets[1].resources,[]);assert.equal(ws.packets[1].roomFurniture[0].id,'a');
  player.roomKey='b';stream(peers,build,2);assert.equal(ws.packets[2].roomFurniture[0].id,'b');
  player.location='clearing';stream(peers,build,3);assert.deepEqual(ws.packets[3].roomFurniture,[]);
  const reconnect=socket();stream(new Map([[reconnect,player]]),build,4);
  assert.deepEqual(reconnect.packets[0].resources,[{id:'wood'}]);
});

test('one scene build serves multiple viewers while legacy clients still get full snapshots', () => {
  const a=socket(),b=socket(),c=socket(),d=socket();let builds=0;
  const peers=new Map([[a,{location:'room',roomKey:'a',compactWorld:true}],
    [b,{location:'room',roomKey:'a',compactWorld:true}],
    [c,{location:'room',roomKey:'b',compactWorld:true}],[d,{location:'room',roomKey:'a'}]]);
  const stream=createSnapshotStream(),build=p=>{builds++;return {type:'state',players:[],resources:[],fires:[],roomFurniture:[{id:p.roomKey}]}};
  stream(peers,build,0);assert.equal(builds,2);stream(peers,build,100);assert.equal(builds,4);
  assert.ok(!('roomFurniture' in a.packets[1]));assert.deepEqual(d.packets[1].roomFurniture,[{id:'a'}]);
  assert.equal(c.packets[0].roomFurniture[0].id,'b');
});

test('steady compact updates do not serialize the full snapshot on every tick', () => {
  const ws=socket(),player={location:'clearing',compactWorld:true},peers=new Map([[ws,player]]);
  const stream=createSnapshotStream();let fullSerializations=0;
  const build=(_player,includeWorld)=>{
    const state={type:'state',players:[{x:1}],...(includeWorld?{resources:[{id:'wood'}],fires:[],roomFurniture:[]}:{})};
    Object.defineProperty(state,'toJSON',{value(){fullSerializations++;return {...state};}});
    return state;
  };
  stream(peers,build,0);
  stream(peers,build,50);
  assert.equal(fullSerializations,1);
  stream(peers,build,5000);
  assert.equal(fullSerializations,2);
});

test('compact player motion omits profile fields, with full and legacy snapshots preserved', () => {
  const compact=socket(),legacy=socket();
  const peers=new Map([
    [compact,{location:'clearing',compactWorld:true,compactPlayers:true}],
    [legacy,{location:'clearing'}],
  ]);
  let player={id:'a',name:'Lia',color:2,appearance:{outfitId:'outfit.commoner'},inventory:{wood:2},location:'clearing',dimensionId:'surface',hasLodging:false,privateLodging:false,x:10,y:8,moving:false};
  const stream=createSnapshotStream(),build=()=>({type:'state',players:[player],resources:[],fires:[],roomFurniture:[]});
  stream(peers,build,0);
  assert.equal(compact.packets[0].players[0].appearance.outfitId,'outfit.commoner');
  player={...player,x:11,moving:true};
  stream(peers,build,50);
  assert.equal(compact.packets[1].players[0].x,11);
  for(const field of ['name','color','appearance','inventory','location','dimensionId','hasLodging','privateLodging'])assert.equal(field in compact.packets[1].players[0],false,field);
  assert.equal(legacy.packets[1].players[0].appearance.outfitId,'outfit.commoner');
  player={...player,location:'room'};
  stream(peers,build,75);
  assert.equal(compact.packets[2].players[0].location,'room','changed metadata is delivered immediately');
  player={...player,appearance:{outfitId:'outfit.mage'}};
  stream(peers,build,100,true);
  assert.equal(compact.packets[3].players[0].appearance.outfitId,'outfit.mage','full refresh carries static profile changes');
});

test('compact sync refreshes static world immediately when a world-changing event is broadcast', () => {
  const ws=socket(),player={location:'clearing',compactWorld:true};
  const peers=new Map([[ws,player]]),stream=createSnapshotStream();
  let resources=[{id:'wood'}];
  const build=(_player,includeWorld)=>({type:'state',players:[{x:1}],...(includeWorld?{resources,fires:[],roomFurniture:[]}:{})});
  stream(peers,build,0);
  resources=[];
  stream(peers,build,100,true);
  assert.deepEqual(ws.packets[1].resources,[]);
});

test('village NPC actors travel with static snapshots, not every compact movement packet',()=>{
  const ws=socket(),player={location:'clearing',compactWorld:true};
  const stream=createSnapshotStream(),peers=new Map([[ws,player]]);
  const actors=[{id:'village:mara',x:92,y:93,sitting:true}];
  const build=(_player,includeWorld)=>({type:'state',players:[{x:1}],
    ...(includeWorld?{villageActors:actors,resources:[],fires:[],roomFurniture:[]}:{})});
  stream(peers,build,0);
  assert.deepEqual(ws.packets[0].villageActors,actors);
  stream(peers,build,100);
  assert.equal(Object.hasOwn(ws.packets[1],'villageActors'),false);
  stream(peers,build,5200);
  assert.deepEqual(ws.packets[2].villageActors,actors);
});

test('viewers in the same area share a snapshot and separate areas get independent snapshots', () => {
  const nearA = socket(), nearB = socket(), far = socket();
  const peers = new Map([
    [nearA, { location: 'clearing', area: 'surface:0:0' }],
    [nearB, { location: 'clearing', area: 'surface:0:0' }],
    [far, { location: 'clearing', area: 'surface:3:0' }],
  ]);
  let builds = 0;
  const stream = createSnapshotStream({ groupKey: player => player.area });
  stream(peers, (player, includeWorld) => {
    builds += 1;
    return { type: 'state', players: [{ area: player.area }], ...(includeWorld ? { resources: [], fires: [], roomFurniture: [] } : {}) };
  }, 0);
  assert.equal(builds, 2);
  assert.equal(nearA.packets[0].players[0].area, 'surface:0:0');
  assert.equal(nearB.packets[0].players[0].area, 'surface:0:0');
  assert.equal(far.packets[0].players[0].area, 'surface:3:0');
});

test('a congested socket does not accumulate stale snapshots and catches up when writable', () => {
  const ws=socket(),player={location:'clearing',compactWorld:true},peers=new Map([[ws,player]]);
  const stream=createSnapshotStream();let builds=0;
  const build=(_player,includeWorld)=>{builds++;return {type:'state',players:[{x:10}],...(includeWorld?{resources:[],fires:[],roomFurniture:[]}:{})}};
  ws.bufferedAmount=70000;stream(peers,build,0);assert.equal(builds,0);assert.equal(ws.packets.length,0);
  ws.bufferedAmount=0;stream(peers,build,100);assert.deepEqual(ws.packets[0].resources,[]);
});


test('movement-only snapshots are shed once a socket holds a small backlog', () => {
  const ws=socket(),player={location:'clearing',compactWorld:true},peers=new Map([[ws,player]]);
  const stream=createSnapshotStream();
  const build=(_player,includeWorld)=>({type:'state',players:[{x:10}],...(includeWorld?{resources:[],fires:[],roomFurniture:[]}:{})});
  stream(peers,build,0);assert.equal(ws.packets.length,1);
  ws.bufferedAmount=20000;stream(peers,build,100);assert.equal(ws.packets.length,1);
  ws.bufferedAmount=0;stream(peers,build,150);assert.equal(ws.packets.length,2);
});

test('immutable catalog encoding is reused without sharing private player state', () => {
  let serializations = 0;
  const catalog = { revision:1, toJSON() { serializations++; return {revision:this.revision, models:['lamp']}; } };
  const a=socket(),b=socket(),owner={location:'clearing',compactWorld:true,gold:2},visitor={location:'clearing',compactWorld:true,gold:7};
  const peers=new Map([[a,owner],[b,visitor]]);
  const stream=createSnapshotStream({personalRefreshMs:100,personalFields:['objectCatalog','inventoryState'],
    personalize:p=>({objectCatalog:p.acknowledged?null:catalog,inventoryState:{gold:p.gold}})});
  const build=()=>({type:'state',players:[]});
  stream(peers,build,0);assert.equal(serializations,1);
  stream(peers,build,100);assert.equal(serializations,1,'unchanged catalogs are not re-encoded per viewer');
  assert.equal(Object.hasOwn(a.packets[1],'inventoryState'),false);
  owner.gold=3;stream(peers,build,200);assert.equal(a.packets[2].inventoryState.gold,3);
  assert.equal(Object.hasOwn(b.packets[2],'inventoryState'),false);assert.equal(serializations,1);
  catalog.revision=2;stream(peers,build,300);assert.equal(serializations,2);
  assert.equal(b.packets[3].objectCatalog.revision,2);assert.equal(b.packets[3].inventoryState.gold,7);
  owner.acknowledged=true;stream(peers,build,400);assert.equal(a.packets[4].objectCatalog,null);
});
