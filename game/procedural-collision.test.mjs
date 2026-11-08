import test from 'node:test';
import assert from 'node:assert/strict';
import {applyWorldDefinition,getWorldDefinition,getSolidTreesInBounds,hasTreeCollision} from './world.mjs';
import {emptyWorldDefinition} from './world-edits.mjs';
import {createChunkCache} from './world-chunks.mjs';

test('looking for prepared collision geometry never generates or pins a cold chunk',()=>{
 let builds=0;const cache=createChunkCache((x,y)=>({x,y,index:++builds}),2);
 assert.equal(cache.peek(10,10),undefined);assert.equal(builds,0);
 const first=cache(1,1);assert.equal(cache.peek(1,1),first);
 cache(2,2);cache(3,3);assert.equal(cache.peek(1,1),undefined);assert.equal(builds,3);
});

test('cold collision sampling agrees with rendered procedural trunks, jitter, water and dense forests',()=>{
 const original=getWorldDefinition();
 try{for(const seed of [1,32452843])for(const dimensionId of ['surface','collision-forest']){
  const definition={...emptyWorldDefinition(dimensionId),seed,edits:[
   {id:'forest',type:'forest',x:88,y:88,radius:40},
   {id:'water',type:'lake',waterKind:'lake',x:84,y:80,radius:4},
   {id:'clearing',type:'clearing',x:99,y:97,radius:5},
  ]};applyWorldDefinition(definition);
  const cold=[];for(let x=66;x<110;x+=2.3)for(let y=66;y<110;y+=2.7)for(const radius of [.1,.25,.8,1.5])cold.push({x,y,radius,actual:hasTreeCollision({x,y},radius)});
  const trees=getSolidTreesInBounds({left:60,right:116,top:60,bottom:116});assert.ok(trees.length>20);
  const expected=(p,radius)=>trees.some(t=>Math.hypot(p.x-t.x,p.y-t.y)<t.r+radius);
  for(const p of cold)assert.equal(p.actual,expected(p,p.radius),`seed ${seed}, ${dimensionId}, ${p.x}/${p.y}/${p.radius}`);
  for(const tree of trees)for(const offset of [0,tree.r+.25-1e-6,tree.r+.25+1e-6]){
   const p={x:tree.x+offset,y:tree.y};assert.equal(hasTreeCollision(p,.25),expected(p,.25));
  }
  const tree=trees[0];applyWorldDefinition({...definition,revision:1,edits:[...definition.edits,{id:'cut-tree',type:'tree-remove',targetId:tree.id,x:tree.x,y:tree.y}]});
  assert.equal(hasTreeCollision(tree,.01),false,'removed trunks do not survive in a collision cache');
 }}finally{applyWorldDefinition(original);}
});
