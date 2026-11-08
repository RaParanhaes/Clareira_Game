import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BUILDING_STANDARD as S, fixtureBounds, roofGeometry, roomWallDecor } from './building-standard.mjs';
import { VILLAGE_BUILDINGS, RECEPTION_BUILDING } from './village-buildings.mjs';
import { getRoomLayout, canOccupyRoom, canPlaceRoomFurniture, findWalkPath, PLAYER_RADIUS } from './world.mjs';
import { surfaceHeight } from './elevation.mjs';
import { paintRoomFixture } from './room-fixture-renderer.mjs';
import { buildingUsesAuthoredExterior, drawBuildingExterior, drawBuildingPost, drawBuildingCanopy, setCottageExteriorSprites } from './building-renderer.mjs';
import { buildingArchitecture, buildingWindows } from './architectural-elements.mjs';
import { interiorFloorShape } from './interior-architecture.mjs';

const layouts=[getRoomLayout('legacy'),getRoomLayout('lobby','arrival'),
  ...VILLAGE_BUILDINGS.flatMap(b=>[getRoomLayout('lobby',b.id),getRoomLayout('lodging',b.id,b.kind==='cabin'?'owned':'rent')]),
  getRoomLayout('lodging','lodging-ember-hotel','owned')];

test('the village cabins share Cedar timber while Fern and Mirante retain distinct roofs',()=>{
  const fern=VILLAGE_BUILDINGS.find(b=>b.id==='cabin-cedar-two');
  const mirante=VILLAGE_BUILDINGS.find(b=>b.id==='cabin-cedar-three');
  assert.equal(fern.architectureStyle,'timber-daub');
  assert.deepEqual(fern.roof,['#53634e','#70805b','#84946a','#404e43']);
  assert.deepEqual(fern.walls,['#98724e','#aa8154','#846343','#6f543c']);
  assert.notDeepEqual(fern.roof,mirante.roof,'the green hipped roof remains unique to the Fern cabin');
  assert.ok(mirante.roof.every(color=>/^#[0-9a-f]{6}$/i.test(color)));
  assert.ok(mirante.walls[0].toLowerCase()==='#d2ba8b','the Mirante keeps a brighter, warmer plaster facade');
});

test('the Cedar cabin pilot maps one bedroom window across its 7×7 shell and interior',()=>{
  const cabin=VILLAGE_BUILDINGS.find(b=>b.id==='cabin-cedar-one');
  const plan=cabin.residentialPlan,layout=getRoomLayout('lodging',cabin.id,'owned');
  const windows=buildingWindows(cabin),inside=roomWallDecor(layout).window;
  assert.equal(cabin.bounds.right-cabin.bounds.left,7);
  assert.equal(cabin.bounds.bottom-cabin.bounds.top,7);
  assert.deepEqual({storeys:plan.storeys,bedrooms:plan.bedrooms,bathrooms:plan.bathrooms},{storeys:1,bedrooms:1,bathrooms:0});
  assert.equal(plan.rooms.length,1);
  assert.equal(plan.rooms[0].windowCount,1);
  assert.equal(windows.length,1,'the one-bedroom exterior has exactly one window');
  assert.equal(windows[0].roomId,plan.rooms[0].id);
  assert.equal(windows[0].width,S.windowWidth);
  assert.equal(windows[0].y,cabin.bounds.bottom,'the opening is cut into the front facade plane');
  assert.equal(inside.roomId,plan.rooms[0].id,'the interior opening belongs to the same room');
  assert.equal(inside.width,S.windowWidth);
});

test('every exterior uses human-scale doors, closed roof planes and a common storey',()=>{
  for(const b of [RECEPTION_BUILDING,...VILLAGE_BUILDINGS]){
    assert.equal(b.height,b.storeys*S.storeyHeight);
    assert.equal(b.doorHeight,S.doorHeight);
    assert.ok(Math.abs(b.doorWidth*(b.bounds.right-b.bounds.left)-S.doorWidth)<1e-9);
    const roof=roofGeometry(b);
    assert.equal(roof.planes.length,b.roofForm==='hipped'?4:2);
    assert.equal(Boolean(roof.gables.length),b.roofForm!=='hipped');
    assert.ok(roof.planes.flat().every(v=>v.every(Number.isFinite)));
    assert.ok(roof.planes.flat().every(v=>v[2]>=b.height));
    assert.ok(['timber-daub','fieldstone','timber'].includes(b.architectureStyle),`${b.id}: supported wall style`);
    assert.ok(['thatch','shingles','timber'].includes(b.roofMaterial),`${b.id}: supported roof style`);
    assert.ok(['gable','hipped'].includes(b.roofForm),`${b.id}: supported roof form`);
    assert.ok(b.roofEave>=.2&&b.roofEave<=.7,`${b.id}: bounded eave overhang`);
    assert.ok(b.roofRise>=2&&b.roofRise<=3.2,`${b.id}: readable roof pitch`);
  }
});

test('building silhouettes use roofed porches, loft dormers, hipped roofing and a jetty upper storey',()=>{
  const inn=VILLAGE_BUILDINGS.find(b=>b.id==='lodging-pine-inn');
  const cottage=VILLAGE_BUILDINGS.find(b=>b.id==='cabin-cedar-one');
  const hotel=VILLAGE_BUILDINGS.find(b=>b.kind==='hotel');
  for(const b of [RECEPTION_BUILDING,...VILLAGE_BUILDINGS]){
    const architecture=buildingArchitecture(b);
    assert.ok(architecture.canopy && architecture.canopy.bottom>architecture.canopy.top,`${b.id}: projecting porch roof`);
    assert.ok(architecture.posts.length>=2,`${b.id}: porch support posts`);
  }
  assert.equal(buildingArchitecture(inn).dormers.length,2);
  assert.equal(buildingArchitecture(cottage).dormers.length,1);
  assert.equal(roofGeometry(hotel).planes.length,4,'the hotel closes both hip ends');
  assert.equal(hotel.jettyDepth,.55,'the upper storey steps outward above the ground floor');
  const upperWindows=buildingWindows(hotel).filter(w=>w.bottom>=S.storeyHeight);
  assert.ok(upperWindows.filter(w=>!w.nx).every(w=>w.y===hotel.bounds.bottom+hotel.jettyDepth));
  assert.ok(upperWindows.filter(w=>w.nx).every(w=>w.x===hotel.bounds.right+hotel.jettyDepth));
});

test('asymmetric front wings make varied silhouettes inside the existing collision envelope',()=>{
  const buildings=[RECEPTION_BUILDING,...VILLAGE_BUILDINGS];
  const winged=buildings.filter(building=>buildingArchitecture(building).frontWing);
  assert.ok(winged.length>=4,'most village houses use an attached cross-gabled bay');
  for(const building of winged){
    const b=building.bounds,wing=buildingArchitecture(building).frontWing;
    assert.ok(wing.left>=b.left&&wing.right<=b.right,`${building.id}: wing stays within blocked X span`);
    assert.ok(wing.top>=b.top&&wing.top< b.bottom,`${building.id}: wing attaches to front half`);
    assert.ok(wing.bottom+wing.roofEave<=b.bottom+PLAYER_RADIUS+.35,
      `${building.id}: wall and roof remain inside the existing avatar clearance`);
    assert.ok(wing.wallHeight<building.height&&wing.roofRise>1.3,`${building.id}: lower cross-gable reads against main roof`);
    const windows=buildingWindows(building).filter(window=>window.ny===1&&window.x>=wing.left+.15&&window.x<=wing.right-.15&&window.bottom<S.storeyHeight);
    assert.ok(windows.every(window=>window.y===wing.bottom),`${building.id}: affected windows follow the moved wing facade`);
    const wingRoof=roofGeometry({bounds:wing,height:wing.wallHeight,roofRise:wing.roofRise,
      roofEave:wing.roofEave,roofAxis:'y',roofForm:'gable'});
    assert.equal(wingRoof.gables.length,1);
    assert.ok(wingRoof.planes.flat().every(vertex=>vertex.every(Number.isFinite)));
  }
});

test('furniture render geometry uses its physical base and each type has readable human scale',()=>{
  const seen=new Set();
  for(const l of layouts)for(const item of l.fixtures){
    const vertices=[];paintRoomFixture(item,(x,y,z)=>{vertices.push({x,y,z});return {x,y};},()=>{});
    const bounds=fixtureBounds(item);
    assert.ok(vertices.length>0,item.kind);
    assert.ok(vertices.every(v=>v.x>=bounds.left-.04&&v.x<=bounds.right+.04&&v.y>=bounds.top-.04&&v.y<=bounds.bottom+.04),`${l.id}: ${item.kind} stays on its own footprint`);
    assert.ok(vertices.every(v=>v.z>=0&&v.z<=l.wallHeight),`${item.kind} fits below the ceiling`);
    seen.add(item.kind);
  }
  assert.ok(seen.size>=10);
});

test('every authored fixture and reception counter is separated and reachable from the entrance',()=>{
  for(const l of layouts){
    const rects=[...l.fixtures.map(item=>({...fixtureBounds(item),kind:item.kind})),...(l.counter?[{...l.counter,kind:'counter'}]:[])];
    for(let i=0;i<rects.length;i++){
      const b=rects[i];
      for(let j=i+1;j<rects.length;j++){
        const c=rects[j];
        assert.equal(b.left<c.right&&b.right>c.left&&b.top<c.bottom&&b.bottom>c.top,false,`${l.id}: ${b.kind} overlaps ${c.kind}`);
      }
      const x=(b.left+b.right)/2,y=(b.top+b.bottom)/2;
      const approaches=[{x,y:b.bottom+.4},{x:b.right+.4,y},{x:b.left-.4,y},{x,y:b.top-.4}];
      assert.ok(approaches.some(p=>canOccupyRoom(p,.25,[],l)&&findWalkPath(l.spawn,p,[],'room',[],[],l).length),`${l.id}: reach ${b.kind}`);
    }
    assert.equal(canPlaceRoomFurniture(l.spawn,[],[],l),false,`${l.id}: reserve arrival square`);
  }
});

test('the visible front floor has no invisible wall and the exterior boundary still blocks movement',()=>{
  for(const l of layouts){
    const shape=interiorFloorShape(l);
    const target={x:l.bounds.left+.6,y:(shape?.voids[0]?.top??l.bounds.bottom)-.4};
    if(shape)assert.equal(canOccupyRoom({x:l.bounds.left+.6,y:l.bounds.bottom-.4},.25,[],l),false,'the removed floor corner is a visible cutout');
    assert.equal(canOccupyRoom(target,.25,[],l),true,`${l.id}: front corner is visible walkable floor`);
    assert.ok(findWalkPath(l.spawn,target,[],'room',[],[],l).length,`${l.id}: route to front corner`);
    assert.equal(canOccupyRoom({x:l.bounds.left-.1,y:l.spawn.y},.25,[],l),false);
    assert.equal(canOccupyRoom({x:l.bounds.left+.6,y:l.bounds.bottom+.1},.25,[],l),false,'outside the entrance lane, the front boundary blocks movement');
    if(l.elevation==='flat'){
      assert.equal(canOccupyRoom(l.spawn,.25,[],l),true,'the external threshold stays walkable');
      assert.equal(canOccupyRoom({x:l.door.x,y:l.bounds.bottom+1.2},.25,[],l),false,'the threshold has a finite outer boundary');
    }
  }
});

test('wall windows remain visible beside projected furniture volumes',()=>{
  for(const layout of layouts){
    const {window}=roomWallDecor(layout);
    if(!window)continue;
    const z=4/3,left=window.x-window.width*.8-layout.bounds.top,right=window.x+window.width*.8-layout.bounds.top;
    const top=window.x-window.width*.8+layout.bounds.top-window.top*z;
    const bottom=window.x+window.width*.8+layout.bounds.top-window.bottom*z;
    for(const item of layout.fixtures){
      const r=fixtureBounds(item),height=item.height+(item.kind==='bed'?.85:0);
      const overlaps=left<r.right-r.top+.08&&right>r.left-r.bottom-.08
        &&top<r.right+r.bottom&&bottom>r.left+r.top-height*z;
      assert.equal(overlaps,false,`${layout.id}: window is hidden by ${item.kind}`);
    }
  }
});

test('saved stool rotations stay upright and inside the circular collider',()=>{
  for(const rotation of [0,1,2,3]){
    const points=[];paintRoomFixture({kind:'stool',x:0,y:0,width:.76,depth:.76,height:1.05,rotation,palette:'cedar'},
      (x,y,z)=>{points.push({x,y,z});return {x,y};},()=>{});
    assert.ok(points.every(p=>Math.hypot(p.x,p.y)<=.380001));
    assert.ok(points.every(p=>p.z>=0&&p.z<=1.065001),'seat and its 0.015-high direction mark remain upright');
    assert.ok(Math.max(...points.map(p=>p.z))>=1.05);
  }
});

test('rugs and fixed furniture rest on one floor level instead of bridging stairs',()=>{
  for(const l of layouts){
    for(const rectangle of [l.rug,...l.fixtures.map(fixtureBounds)].filter(Boolean)){
      const {left,right,top,bottom}=rectangle;
      const heights=[[left,top],[right,top],[right,bottom],[left,bottom],[(left+right)/2,(top+bottom)/2]]
        .map(([x,y])=>surfaceHeight(x,y,'room',l));
      assert.ok(Math.max(...heights)-Math.min(...heights)<.01,`${l.id}: furnishing crosses a level change`);
    }
  }
});

test('a porch post can render when its catalog omits the optional canopy',()=>{
  const post={left:0,right:.3,top:.6,bottom:.9,height:3.5},polygons=[];
  const building={kind:'cabin',foundation:'#51483e',architectureObjects:{canopy:null,posts:[post],balcony:null}};
  assert.doesNotThrow(()=>drawBuildingPost(null,building,post,(x,y)=>({x,y}),points=>polygons.push(points)));
  assert.ok(polygons.length>0);
});

test('ground-floor front windows carry fixed flower boxes without adding floor blockers',()=>{
  const building=RECEPTION_BUILDING,windows=buildingWindows(building).filter(win=>win.ny===1&&win.bottom<S.storeyHeight);
  const before={...building.bounds},polygons=[];
  const ctx={save(){},restore(){},transform(){},fillRect(){},fillText(){}};
  const project=(x,y,z)=>({x:(x-y)*16,y:(x+y)*8-z*10});
  drawBuildingExterior(ctx,building,project,(points,color)=>polygons.push({points,color}),1,{windowsLit:false});
  assert.ok(windows.length>0);
  assert.equal(polygons.filter(p=>p.color==='#49633b').length,windows.length*4,
    'each ground-floor facade window has four flower stems');
  assert.deepEqual(building.bounds,before,'fixed flower detailing does not change the collider bounds');
});

test('the 3D cottage sprite keeps the shared ground pivot and selects its night window state',()=>{
  const calls=[],day={naturalWidth:320},night={naturalWidth:320},canopy={naturalWidth:320},postLeft={naturalWidth:320},postRight={naturalWidth:320},cabin=VILLAGE_BUILDINGS.find(b=>b.id==='cabin-cedar-one');
  const ctx={drawImage(...args){calls.push(args)},save(){},restore(){},transform(){},fillText(){},fillRect(){}};
  const project=(x,y,z)=>({x:(x-y)*16,y:(x+y)*8-z*12});
  setCottageExteriorSprites({day,night,canopy,postLeft,postRight});
  assert.equal(buildingUsesAuthoredExterior(cabin),true);
  assert.equal(buildingUsesAuthoredExterior({...cabin,windowObjects:[...buildingWindows(cabin),{...buildingWindows(cabin)[0],id:'extra-window'}]}),false,
    'the one-window sprite is not used against a catalog with extra openings');
  drawBuildingExterior(ctx,cabin,project,()=>assert.fail('the PNG replaces the procedural exterior'),1,{windowsLit:false});
  drawBuildingExterior(ctx,cabin,project,()=>assert.fail('the PNG replaces the procedural exterior'),1,{windowsLit:true});
  assert.equal(calls.length,2);
  assert.equal(calls[0][0],day); assert.equal(calls[1][0],night);
  const center=project((cabin.bounds.left+cabin.bounds.right)/2,(cabin.bounds.top+cabin.bounds.bottom)/2,0);
  assert.deepEqual(calls[0].slice(1),[Math.round(center.x-160),Math.round(center.y-207),320,320]);
  const posts=buildingArchitecture(cabin).posts;
  for(const post of posts)drawBuildingPost(ctx,cabin,post,project,()=>assert.fail('no procedural post may duplicate the Blender layer'));
  drawBuildingCanopy(ctx,cabin,project,()=>assert.fail('no procedural canopy may duplicate the Blender layer'),1);
  assert.deepEqual(calls.slice(2).map(call=>call[0]),[postLeft,postRight,canopy]);
  assert.ok(calls.every(call=>JSON.stringify(call.slice(1))===JSON.stringify(calls[0].slice(1))),'independent depth layers share their ground anchor');
  setCottageExteriorSprites({day:null,night:null,canopy:null,postLeft:null,postRight:null});
});

test('the Blender cottage export contains four aligned facings and distinct day/night frames',async()=>{
  const base=new URL('./art/buildings/medieval-cottage-3d/',import.meta.url);
  const manifest=JSON.parse(await readFile(new URL('manifest.json',base),'utf8'));
  assert.deepEqual(manifest.footprint,{width:7,depth:7,units:'world'});
  assert.deepEqual(manifest.frame,{width:320,height:320,pivot:[160,207],sampling:'nearest'});
  const names=['iso-rot0.png','iso-rot0-night.png','iso-rot1.png','iso-rot2.png','iso-rot3.png','iso-rot0-shell.png','iso-rot0-shell-night.png','iso-rot0-canopy.png','iso-rot0-post-left.png','iso-rot0-post-right.png'];
  const files=await Promise.all(names.map(name=>readFile(new URL(`frames/${name}`,base))));
  for(const bytes of files){
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16),320); assert.equal(bytes.readUInt32BE(20),320);
  }
  assert.notDeepEqual(files[0],files[1],'the emissive window state changes the night sprite');
});

test('the Blender cottage construction matches the canonical wall, opening and independent porch colliders',async()=>{
  const cabin=VILLAGE_BUILDINGS.find(b=>b.id==='cabin-cedar-one'),b=cabin.bounds;
  const geometry=JSON.parse(await readFile(new URL('./art/buildings/medieval-cottage-3d/construction-checks.json',import.meta.url),'utf8'));
  const cx=(b.left+b.right)/2,cy=(b.top+b.bottom)/2;
  assert.deepEqual(geometry.physicalShell,[b.right-b.left,b.bottom-b.top]);
  assert.deepEqual(geometry.doorCenter,[cabin.door.x-cx,b.bottom-cy]);
  const window=buildingWindows(cabin)[0];
  assert.ok(geometry.window.center.every((value,i)=>Math.abs(value-[window.x-cx,window.y-cy,window.z][i])<1e-9));
  assert.equal(geometry.window.clearWidth,window.width);
  assert.ok(Math.abs(geometry.window.clearHeight-(window.top-window.bottom))<1e-9);
  const posts=buildingArchitecture(cabin).posts.map(post=>[(post.left+post.right)/2-cx,(post.top+post.bottom)/2-cy]);
  assert.ok(geometry.porchPosts.every((point,i)=>point.every((value,j)=>Math.abs(value-posts[i][j])<1e-9)));
});
