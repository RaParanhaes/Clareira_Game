import test from 'node:test';
import assert from 'node:assert/strict';
import {FIRE_LIGHT_REACH,dominantLight,nightBrightness,exteriorNightOpacity,nightEmitterProfile} from './lighting.mjs';
test('moonless forest preserves ambient visibility while eternal darkness keeps its own policy',()=>{
 const night={night:1,hasMoon:false,moonlightStrength:0};
 assert.equal(exteriorNightOpacity(night),.91);
 assert.ok(exteriorNightOpacity({...night,hasMoon:true,moonlightStrength:.1})<exteriorNightOpacity(night)-.14,'moonlight should lift the scene compared with moonless night');
 assert.equal(exteriorNightOpacity({...night,night:0}),0);
 assert.equal(exteriorNightOpacity(night,{theme:'dark',dimensionId:'breu'}),.995);
 assert.equal(exteriorNightOpacity(night,{dimensionId:'arrival-test'}),.9);
});
test('local light reaches farther with a softer falloff on moonless nights',()=>{
 const moonlit=nightEmitterProfile(7,1.35,{night:1,hasMoon:true});
 const moonless=nightEmitterProfile(7,1.35,{night:1,hasMoon:false});
 const daylight=nightEmitterProfile(7,1.35,{night:0,hasMoon:false});
 assert.ok(Math.abs(moonlit.reach-7.7)<1e-12);
 assert.ok(Math.abs(moonless.reach-8.4)<1e-12);
 assert.equal(daylight.reach,7);
 assert.ok(moonless.falloffExponent<moonlit.falloffExponent);
});
test('a new nearby campfire changes the tree shadow source and direction',()=>{
 const tree={x:10,y:10},arrival={x:7,y:10},other={x:11,y:10};
 assert.equal(dominantLight(tree,[arrival]).x,7);
 assert.equal(dominantLight(tree,[arrival,other]).x,11);
 assert.equal(dominantLight(tree,[]).kind,'moon');
 assert.equal(dominantLight({x:30,y:30},[arrival,other]).kind,'moon');
});
test('fire light falls off with distance and another fire illuminates a dark place',()=>{
 assert.equal(FIRE_LIGHT_REACH,7,'firelight stays close to its source');
 const fire={x:0,y:0};assert.ok(nightBrightness(fire,[fire])>nightBrightness({x:3,y:0},[fire]));
 assert.ok(nightBrightness({x:6.5,y:0},[fire])>.12,'warmth fades gradually at the edge');
 assert.equal(nightBrightness({x:7,y:0},[fire]),.12);
 assert.ok(nightBrightness({x:7,y:0},[fire,{x:7,y:0}])>.9);
});

test('flame variation stays gentle and freezes for reduced motion',async()=>{const {flameEnvelope}=await import('./lighting.mjs');const samples=Array.from({length:120},(_,i)=>flameEnvelope(i/10,{x:8,y:11}));assert.ok(Math.max(...samples)-Math.min(...samples)>.05);assert.ok(samples.every(n=>n>.93&&n<1.07));assert.equal(flameEnvelope(50,{x:1,y:2},true),1);});

import {celestialLightState,createShadowDirectionResolver,buildingLocalFill,nightVeilColor} from './lighting.mjs';
test('central lighting: veil colour per theme with a warm-slate fallback', () => {
 assert.equal(nightVeilColor('dark'), '#000000');
 assert.equal(nightVeilColor('unknown-theme'), '#0c1a2a');
});
test('central lighting: no celestial light means no global light', () => {
 assert.equal(celestialLightState({sunlightStrength:0,moonlightStrength:0,daylight:0}), null);
});
test('central lighting: with no lights the shadow resolver falls back to ambient', () => {
 const resolve = createShadowDirectionResolver({globalLight:null,localLights:[],obstacles:[],point:(x,y)=>({x,y}),surfaceHeight:()=>0,getCamera:()=>({x:0,y:0})});
 const d = resolve(1,1);
 assert.equal(d.source.kind, 'ambient');
 assert.equal(d.strength, 0);
});
test('central lighting: a building with no neighbouring light has no local fill', () => {
 const building = {id:'cabin', bounds:{left:0,right:2,top:0,bottom:2}};
 assert.equal(buildingLocalFill(building, {source:{}}, [], [], () => 0), 0);
});
