import test from 'node:test';
import assert from 'node:assert/strict';
import {createEventLoopLag} from './event-loop-lag.mjs';
test('loop lag measures timer lateness, expires old spikes, and releases the timer',()=>{
 let at=0,callback,cancelled=false;
 const monitor=createEventLoopLag({now:()=>at,schedule:fn=>{callback=fn;return 12;},cancel:token=>{assert.equal(token,12);cancelled=true;}});
 at=100;callback();assert.equal(monitor.read(),0);
 at=450;callback();assert.equal(monitor.read(),250);
 at=2600;assert.equal(monitor.read(),0);monitor.close();assert.equal(cancelled,true);
});
