import test from 'node:test';
import assert from 'node:assert/strict';
import { createOverlayReleaseGuard, createRevealOnce, createSceneReadiness, sceneInputReady } from './scene-loading.mjs';
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

test('world controls wait for the loading overlay to leave, not only for sceneReady', () => {
 // Scene is ready while the overlay still covers the screen: keys must not reach the world yet.
 assert.equal(sceneInputReady({ sceneReady: true, overlayHidden: false }), false);
 assert.equal(sceneInputReady({ sceneReady: false, overlayHidden: true }), false);
 assert.equal(sceneInputReady({ sceneReady: false, overlayHidden: false }), false);
 // Released together: the overlay hides in the same step that controls are enabled.
 assert.equal(sceneInputReady({ sceneReady: true, overlayHidden: true }), true);
});

test('a ready scene whose overlay never leaves is released after the limit', () => {
 const timers = []; const cancelled = []; const state = { sceneReady: true, overlayHidden: false }; let releasedAt = null;
 const guard = createOverlayReleaseGuard({
  limitMs: 4000,
  schedule: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  cancel: id => cancelled.push(id),
  onRelease: ({ limitMs }) => { releasedAt = limitMs; state.overlayHidden = true; },
 });
 guard.arm();
 assert.equal(timers[0].ms, 4000);
 assert.equal(sceneInputReady(state), false);
 // The transition never resolves: the timer fires and releases overlay and controls together.
 timers[0].fn();
 assert.equal(releasedAt, 4000);
 assert.equal(sceneInputReady(state), true);
 assert.equal(guard.armed, false);
});

test('a guard cancelled before its limit does not release the overlay', () => {
 const timers = []; const cancelled = []; let released = false;
 const guard = createOverlayReleaseGuard({
  limitMs: 4000,
  schedule: (fn) => { timers.push(fn); return timers.length; },
  cancel: id => cancelled.push(id),
  onRelease: () => { released = true; },
 });
 guard.arm(); assert.equal(guard.armed, true);
 guard.cancel();
 assert.deepEqual(cancelled, [1]);
 assert.equal(guard.armed, false);
 assert.equal(released, false);
});

test('a reveal that never settles is finalized once by the deadline', () => {
 const calls = [];
 const reveal = createRevealOnce(initialCompletion => calls.push(initialCompletion));
 // Deadline fires while the normal reveal is still waiting: the same finalization runs once.
 assert.equal(reveal.run(true), true);
 // The stuck transition never resolves, so no other path calls it again.
 assert.deepEqual(calls, [true]);
 assert.equal(reveal.finished, true);
});

test('a late reveal after the deadline does not finalize again or skip the initial arrival', () => {
 const calls = [];
 const reveal = createRevealOnce(initialCompletion => calls.push(initialCompletion));
 reveal.run(true); // forced at the deadline, with the initial arrival
 // The delayed reveal arrives later with initialCompletion=false (already marked by the forced path).
 assert.equal(reveal.run(false), false);
 assert.deepEqual(calls, [true], 'finalization ran once, keeping the arrival');
});
