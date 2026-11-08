import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneReadiness } from './scene-loading.mjs';
const self = { id:'me', x:8, y:15, location:'clearing', appearance:{skin:3} };
const full = {type:'state', players:[self], resources:[], fires:[{x:8,y:14}], roomFurniture:[]};
test('welcome and a self-less snapshot cannot reveal placeholder avatar', () => {
 const gate=createSceneReadiness();assert.equal(gate.accept({type:'welcome',id:'me'},'me'),false);
 assert.equal(gate.accept({...full,players:[]},'me'),false);
 assert.equal(gate.accept(full,'me'),true);
});
test('waits for appearance and every collection, accepting empty scenes',()=>{
 const gate=createSceneReadiness();assert.equal(gate.accept({type:'state',players:[self],fires:[]},'me'),false);
 assert.equal(gate.accept({type:'state',players:[self],resources:[],roomFurniture:[]},'me'),true);
 gate.reset();assert.equal(gate.accept({...full,players:[{...self,appearance:null}]},'me'),false);
 assert.equal(gate.accept({...full,players:[{...self,x:NaN}]},'me'),false);
});
test('reconnection discards completeness of previous scene',()=>{
 const gate=createSceneReadiness();assert.equal(gate.accept(full,'me'),true);gate.reset();
 assert.equal(gate.accept({type:'state',players:[self]},'me'),false);
 assert.equal(gate.accept({...full,fires:[]},'me'),true);
});

test('compact motion preserves already received metadata; reconnect and actor changes require it again',()=>{
 const gate=createSceneReadiness();assert.equal(gate.accept(full,'me'),true);
 assert.equal(gate.accept({type:'state',players:[{id:'me',x:9,y:15,inputSeq:10}]},'me'),true);
 assert.equal(gate.accept({type:'state',players:[{id:'new',x:9,y:15}]},'new'),false);
 gate.reset();assert.equal(gate.accept({type:'state',players:[{id:'me',x:9,y:15}]},'me'),false);
 assert.equal(gate.accept(full,'me'),true);
 assert.equal(gate.accept({type:'state',players:[{id:'me',x:9,y:15,appearance:null}]},'me'),false);
});
