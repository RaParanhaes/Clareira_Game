import test from 'node:test';import assert from 'node:assert/strict';
import {mergeQueuedState} from './state-inbox.mjs';
test('motion supersedes earlier motion while first-frame collections and actor metadata remain complete',()=>{
 const initial={type:'state',dimensionId:'surface',location:'room',roomKey:'lobby',resources:[],fires:[],roomFurniture:[{id:'chair'}],
  players:[{id:'self',x:1,y:2,location:'room',appearance:{body:'male'}},{id:'left',x:2,y:3}],inventoryState:{seq:2}};
 const latest=mergeQueuedState(initial,{type:'state',players:[{id:'self',x:3,y:4,inputSeq:12}]});
 assert.deepEqual(latest.players,[{id:'self',x:3,y:4,inputSeq:12,location:'room',appearance:{body:'male'}}]);
 assert.deepEqual(latest.roomFurniture,[{id:'chair'}]);assert.deepEqual(latest.fires,[]);assert.equal(latest.inventoryState.seq,2);
 const cleared=mergeQueuedState(latest,{type:'state',roomFurniture:[],inventoryState:{seq:3}});
 assert.deepEqual(cleared.roomFurniture,[]);assert.equal(cleared.inventoryState.seq,3);
});
test('a destination change cannot inherit the former room or its objects',()=>{
 for(const delta of [{roomKey:'other'},{dimensionId:'inferno'},{location:'clearing'}]){
  const next={type:'state',...delta,players:[{id:'self',x:8,y:9}]};
  assert.equal(mergeQueuedState({type:'state',roomKey:'lobby',dimensionId:'surface',location:'room',roomFurniture:[{id:'old'}]},next),next);
 }
});
