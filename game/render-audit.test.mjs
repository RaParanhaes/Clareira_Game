import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderAudit} from './render-audit.mjs';
import {cleanMovementDiagnosticEvent} from './movement-diagnostics.mjs';
import {createRuntimePerformance} from './runtime-performance.mjs';
test('one slow render retains phases from the same call, all origins are timed, and uploads are bounded',()=>{
 let at=0;const draws=[],spikes=[];
 const audit=createRenderAudit({now:()=>at,onDraw:ms=>draws.push(ms),onSpike:event=>spikes.push(event)});
 const render=()=>{at+=20;audit.mark('setup');at+=35;audit.mark('entities');at+=5;audit.mark('effects');return true;};
 audit.run(render,2);assert.deepEqual(draws,[60]);assert.equal(spikes[0].origin,2);
 assert.equal(spikes[0].setupMs,20);assert.equal(spikes[0].entitiesMs,35);assert.equal(spikes[0].effectsMs,5);
 audit.run(render);assert.equal(draws.length,2);assert.equal(spikes.length,1);
 at+=5000;audit.run(render,1);assert.equal(spikes.length,2);
 const clean=cleanMovementDiagnosticEvent({kind:'render-spike',at,...spikes[1],account:'private',x:123});
 assert.equal(clean.durationMs,60);assert.equal(clean.account,undefined);assert.equal(clean.x,undefined);
 const runtime=createRuntimePerformance();for(let i=0;i<30;i++)runtime.spike({...clean,renderSequence:i});
 const exported=runtime.export();assert.equal(exported.renderSpikes.length,20);assert.equal(exported.renderSpikes[0].renderSequence,10);
 exported.renderSpikes[0].durationMs=0;assert.equal(runtime.export().renderSpikes[0].durationMs,60);
});
test('failed and skipped renders do not poison subsequent measurements',()=>{
 let at=0;const draws=[];const audit=createRenderAudit({now:()=>at,onDraw:ms=>draws.push(ms)});
 audit.run(()=>false);assert.equal(draws.length,0);
 assert.throws(()=>audit.run(()=>{throw Error('draw failed');}));
 audit.run(()=>{at+=4;return true;});assert.deepEqual(draws,[4]);
});
