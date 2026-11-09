import test from 'node:test';
import assert from 'node:assert/strict';
import {actorRimSource} from './scene-lights.mjs';
test('rim source is null when no light reaches the actor', () => {
 assert.equal(actorRimSource({x:0,y:0},[]), null);
});
test('rim source picks the strongest window or fire and ignores other kinds', () => {
 const near={kind:'fire',x:1,y:0,height:1,reach:6,strength:.9,falloffExponent:1.4,color:'#ffb35c'};
 const far={kind:'fire',x:5,y:0,height:1,reach:6,strength:.9,falloffExponent:1.4,color:'#ffb35c'};
 const lamp={kind:'lamp',x:0.5,y:0,height:1,reach:6,strength:5,falloffExponent:1.4,color:'#ffffff'};
 const src=actorRimSource({x:0,y:0},[far,near,lamp]);
 assert.ok(src);
 assert.equal(src.x,1);
 assert.equal(src.color,'#ffb35c');
 assert.ok(src.amount>0);
});
