import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD_SIZE, PREVIOUS_WORLD_SIZE, WORLD_NATURE_ORIGIN, WORLD_CENTER } from './world-scale.mjs';
import { BOUNDARY_FRINGE, BOUNDARY_TILE_SIZE, BOUNDARY_WALL_INSET, BOUNDARY_WALKABLE_FRINGE, BOUNDARY_TOTAL_FRINGE, boundarySegments, boundaryCorners, boundaryCornerTiles, boundaryGlowPulse, boundaryStarFrame, boundaryTileMode, insideBoundaryWall, clampInsideBoundaryWall } from './world-boundary.mjs';
import { DEFAULT_DIMENSIONS } from './dimensions.mjs';
import { canOccupy, getResourcesInBounds, getWorldDefinition, applyWorldDefinition, PLAYER_RADIUS, stepPlayer } from './world.mjs';
import { initialWorldForDimension } from './dimensions.mjs';

test('all dimensions have fifty times the area and preserve arrival locations',()=>{
  assert.ok(WORLD_SIZE**2/PREVIOUS_WORLD_SIZE**2>=50);
  assert.ok(WORLD_SIZE**2/PREVIOUS_WORLD_SIZE**2<50.02);
  assert.deepEqual(WORLD_NATURE_ORIGIN,{x:419.5,y:419.5});
  const previous=getWorldDefinition();
  try{
    for(const dimension of DEFAULT_DIMENSIONS){
      applyWorldDefinition(initialWorldForDimension(dimension));
      assert.equal(canOccupy({x:WORLD_SIZE+.1,y:50}),false);
      const nodes=getResourcesInBounds({left:5500,right:5540,top:5500,bottom:5540});
      const newLand=dimension.theme==='dark'?{x:WORLD_CENTER.x+10,y:WORLD_CENTER.y}:{x:5501,y:5501};
      assert.ok(canOccupy(newLand)||canOccupy({x:newLand.x+1,y:newLand.y+1}),dimension.id+' has walkable new land');
      if(dimension.theme!=='dark')assert.ok(nodes.length,dimension.id+' generates distant exploration resources');
    }
  }finally{applyWorldDefinition(previous);}
});
test('celestial curtain is culled inland and follows all four world edges',()=>{
  assert.equal(boundarySegments({left:100,right:120,top:100,bottom:120}).length,0);
  const edges=[{left:-10,right:10,top:40,bottom:60},{left:WORLD_SIZE-10,right:WORLD_SIZE+10,top:40,bottom:60},
    {left:40,right:60,top:-10,bottom:10},{left:40,right:60,top:WORLD_SIZE-10,bottom:WORLD_SIZE+10}];
  edges.forEach((bounds,id)=>assert.deepEqual(boundarySegments(bounds).map(edge=>edge.id),[id]));
  assert.equal(boundarySegments({left:-10,right:10,top:-10,bottom:10}).length,2);
  assert.equal(boundarySegments(edges[0])[0].at(50,0).x,BOUNDARY_WALL_INSET);
  assert.equal(boundarySegments(edges[0])[0].at(50,BOUNDARY_WALKABLE_FRINGE).x,-BOUNDARY_WALKABLE_FRINGE,
    'the four-unit white floor extends outward from the existing map edge');
  assert.equal(BOUNDARY_FRINGE,18);
});

test('the pale floor closes all four outside corner quadrants',()=>{
  assert.deepEqual(boundaryCorners({left:-10,right:10,top:-10,bottom:10}).map(corner=>corner.name),['northwest']);
  assert.deepEqual(boundaryCorners({left:WORLD_SIZE-10,right:WORLD_SIZE+10,top:-10,bottom:10}).map(corner=>corner.name),['northeast']);
  assert.deepEqual(boundaryCorners({left:-10,right:10,top:WORLD_SIZE-10,bottom:WORLD_SIZE+10}).map(corner=>corner.name),['southwest']);
  assert.deepEqual(boundaryCorners({left:WORLD_SIZE-10,right:WORLD_SIZE+10,top:WORLD_SIZE-10,bottom:WORLD_SIZE+10}).map(corner=>corner.name),['southeast']);
  assert.deepEqual(boundaryCorners({left:-30,right:WORLD_SIZE+30,top:-30,bottom:WORLD_SIZE+30})
    .map(corner=>corner.name),['northwest','northeast','southwest','southeast']);
  assert.deepEqual(boundaryCorners({left:-10,right:10,top:100,bottom:120}),[],
    'a straight edge does not incorrectly add a distant corner patch');
  const allCorners=boundaryCorners({left:-30,right:WORLD_SIZE+30,top:-30,bottom:WORLD_SIZE+30});
  for(const corner of allCorners){
    const patch=Array.from(boundaryCornerTiles(corner));
    assert.equal(patch.length,15*15,`${corner.name} uses the same full-width fringe as the edges`);
    assert.equal(patch.filter(tile=>tile.ring<3).length,9,`${corner.name} has a complete 3-by-3 anchor`);
    assert.ok(patch.every(tile=>(corner.sx<0?tile.x0<corner.x:tile.x0>=corner.x)
      &&(corner.sy<0?tile.y0<corner.y:tile.y0>=corner.y)),`${corner.name} faces stay outside both world axes`);
  }
});

test('boundary flashes use independent irregular bursts and freeze for reduced motion',()=>{
  const first=Array.from({length:2401},(_,index)=>boundaryGlowPulse(index*.01,1897));
  const second=Array.from({length:2401},(_,index)=>boundaryGlowPulse(index*.01,8191));
  assert.ok(first.some(value=>value>.75),'bursts reach a visible peak');
  assert.ok(first.some(value=>value===0),'bursts fully subside between flashes');
  assert.notDeepEqual(first,second,'neighboring light cells do not pulse in sync');
  assert.equal(boundaryGlowPulse(2,1897,true),boundaryGlowPulse(200,1897,true),
    'reduced motion holds a quiet, static glow');
});

test('abyss stars twinkle and drift independently while reduced motion freezes them',()=>{
  const first=Array.from({length:1201},(_,index)=>boundaryStarFrame(index*.025,7193));
  const second=Array.from({length:1201},(_,index)=>boundaryStarFrame(index*.025,2819));
  assert.ok(first.some(frame=>frame.alpha>.2),'stars brighten in short bursts');
  assert.ok(first.some(frame=>frame.alpha<.02),'stars can fade out completely');
  assert.notDeepEqual(first,second,'nearby stars have independent timing and drift');
  assert.ok(first.every(frame=>frame.radius>=.75&&frame.radius<1.75&&Math.abs(frame.dx)<2.01&&Math.abs(frame.dy)<1.61),
    'points stay small and drift by only a couple pixels');
  assert.deepEqual(boundaryStarFrame(1,7193,true),boundaryStarFrame(90,7193,true),
    'reduced motion holds the stars steady');
  assert.equal(boundaryStarFrame(1,7193,true).dx,0);
  assert.ok(BOUNDARY_TOTAL_FRINGE<80,'the field has room behind every loose floor tile');
});

test('the light wall follows the old map edge without cutting off authored ground',()=>{
  const radius=PLAYER_RADIUS,wall=BOUNDARY_WALL_INSET;
  assert.equal(insideBoundaryWall({x:wall+radius,y:120},radius),true,'the player can touch the inner face');
  assert.equal(insideBoundaryWall({x:wall+radius-.01,y:120},radius),false,'the body cannot pass through the wall');
  assert.equal(canOccupy({x:wall+radius-.01,y:120},radius,0,{ignoreFires:true}),false);
  assert.deepEqual(clampInsideBoundaryWall({x:-.2,y:-.2},radius),{x:wall+radius,y:wall+radius});
  assert.equal(insideBoundaryWall({x:2.3,y:7},0),true,'the old west resource remains inside the playable world');
});

test('floating floor keeps three intact rows, then progressively loses tiles',()=>{
  assert.equal(BOUNDARY_WALKABLE_FRINGE,BOUNDARY_TILE_SIZE*3);
  const sample=row=>Array.from({length:500},(_,column)=>boundaryTileMode(row,91771+column*719+row*313));
  for(let row=0;row<3;row++)assert.ok(sample(row).every(mode=>mode==='fixed'),`row ${row+1} remains whole and in place`);
  const fourth=sample(3),fifth=sample(4),seventh=sample(6);
  for(const [row,modes] of [[4,fourth],[5,fifth]]){
    assert.ok(modes.includes('fixed'),`row ${row} keeps tiles in their original places`);
    assert.ok(modes.includes('floating'),`row ${row} has floating faces`);
    assert.ok(modes.includes('falling'),`row ${row} has falling faces`);
    assert.ok(modes.includes('missing'),`row ${row} has gaps`);
  }
  const missing=modes=>modes.filter(mode=>mode==='missing').length/modes.length;
  assert.ok(missing(fifth)>missing(fourth)+.1,'the next row has a visibly higher loss rate');
  assert.ok(missing(seventh)>missing(fifth)+.2,'distant rows thin out toward the abyss');
});

test('authoritative movement reaches but cannot cross any of the four wall faces',()=>{
  const radius=PLAYER_RADIUS,wall=BOUNDARY_WALL_INSET, specs=[
    {name:'west',axis:'x',limit:wall+radius,input:{x:-1,y:0},start:(t)=>({x:wall+radius+1.4,y:t})},
    {name:'east',axis:'x',limit:WORLD_SIZE-wall-radius,input:{x:1,y:0},start:(t)=>({x:WORLD_SIZE-wall-radius-1.4,y:t})},
    {name:'north',axis:'y',limit:wall+radius,input:{x:0,y:-1},start:(t)=>({x:t,y:wall+radius+1.4})},
    {name:'south',axis:'y',limit:WORLD_SIZE-wall-radius,input:{x:0,y:1},start:(t)=>({x:t,y:WORLD_SIZE-wall-radius-1.4})},
  ];
  for(const edge of specs){
    let start=null;
    for(let t=512;t<WORLD_SIZE-512&&!start;t+=31){
      const candidate=edge.start(t);
      let clear=canOccupy(candidate,radius,0,{ignoreFires:true});
      for(let distance=.12;clear&&distance<1.4;distance+=.12){
        const point={...candidate,[edge.axis]:candidate[edge.axis]+Math.sign(edge.limit-candidate[edge.axis])*distance};
        clear=canOccupy(point,radius,0,{ignoreFires:true});
      }
      if(clear)start=candidate;
    }
    assert.ok(start,`${edge.name}: found a clear approach corridor`);
    let position=start;
    for(let frame=0;frame<12;frame++){
      position=stepPlayer(position,edge.input,.05,[],[],Date.now());
      assert.ok(insideBoundaryWall(position,radius),`${edge.name}: movement stays on the inner side`);
    }
    assert.ok(canOccupy(position,radius,0,{ignoreFires:true}),`${edge.name}: contact position remains valid`);
    assert.ok(Math.abs(position[edge.axis]-edge.limit)<.25,
      `${edge.name}: the player stops against the wall (${position[edge.axis]} vs ${edge.limit})`);
  }
});
test('distant tree IDs never alias the preserved old 512-column grid',async()=>{
  const {getSolidTreesInBounds}=await import('./world.mjs');
  const regions=[{left:0,right:90,top:200,bottom:260},{left:2048,right:2138,top:196,bottom:256},
    {left:1433,right:1523,top:196,bottom:256},{left:5400,right:5490,top:5400,bottom:5460}];
  const previous=getWorldDefinition();
  try{
    applyWorldDefinition({...previous,revision:previous.revision+1,edits:[...previous.edits,...regions.map((b,i)=>({id:`id-test-forest-${i}`,type:'forest',x:(b.left+b.right)/2,y:(b.top+b.bottom)/2,radius:40}))]});
    const trees=regions.flatMap(bounds=>getSolidTreesInBounds(bounds));
    assert.ok(trees.length>20);
    assert.equal(new Set(trees.map(tree=>tree.id)).size,trees.length);
  }finally{applyWorldDefinition(previous);}
});
