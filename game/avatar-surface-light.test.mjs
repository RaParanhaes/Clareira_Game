import test from 'node:test';
import assert from 'node:assert/strict';
import {avatarLightTintOpacity,applyAvatarSurfaceLight} from './avatar-surface-light.mjs';
test('actor illumination retains at least 84 percent of material color even at extreme intensity',()=>{
 for(const amount of [0,.1,.5,1,10,100]){const alpha=avatarLightTintOpacity(amount);assert.ok(alpha>=0&&alpha<=.16);}
 assert.equal(avatarLightTintOpacity(NaN),0);assert.equal(avatarLightTintOpacity(-2),0);
 assert.ok(avatarLightTintOpacity(.2)<avatarLightTintOpacity(.5));
});
test('sprite tint uses alpha preserving composition and bounded gradient stops',()=>{
 const stops=[];let operation;const c={save(){},restore(){},createLinearGradient(){return {addColorStop(p,color){stops.push({p,color});}};},set globalCompositeOperation(value){operation=value;},fillRect(){}};
 applyAvatarSurfaceLight(c,96,96,[{height:.2,fraction:.1,amount:20,color:'#efbc79'},{height:1,fraction:.5,amount:.3,color:'#efbc79'}]);
 assert.equal(operation,'source-atop');assert.equal(stops.length,2);assert.ok(stops.every(s=>s.p>=0&&s.p<=1));assert.ok(stops[0].color.endsWith(',0.066)'));assert.ok(stops[1].color.endsWith(',0.16)'));
});
