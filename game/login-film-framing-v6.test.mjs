import test from 'node:test';
import assert from 'node:assert/strict';
import {getLoginFilmFraming} from './login-film-framing-v6.mjs';

test('portrait framing is continuous through the six-minute loop',()=>{
  assert.deepEqual(getLoginFilmFraming(0),getLoginFilmFraming(360));
  assert.ok(Math.abs(getLoginFilmFraming(359.99).position-getLoginFilmFraming(.01).position)<.01);
  assert.deepEqual(getLoginFilmFraming(NaN),getLoginFilmFraming(0));
});

test('portrait moves gradually and holds the castle and foreground views',()=>{
  for(let t=0;t<360;t+=.25){
    const a=getLoginFilmFraming(t),b=getLoginFilmFraming(t+.25);
    assert.ok(a.position>=0&&a.position<=100);
    assert.ok(Math.abs(a.position-b.position)<1.25,'no abrupt quarter-second camera movement');
    assert.equal(a.scale,1);
  }
  assert.equal(getLoginFilmFraming(120).position,18);
  assert.equal(getLoginFilmFraming(280).position,90);
});
