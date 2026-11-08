import test from 'node:test';
import assert from 'node:assert/strict';
import {getLoginFilmFraming} from './login-film-framing.mjs';

test('portrait wildlife is framed in the sky, foreground, and bridge during its visible event',()=>{
  assert.ok(getLoginFilmFraming(5.5).position < 40, 'sky flight is visible toward the left of the landscape');
  assert.ok(getLoginFilmFraming(11.5).position > 65, 'rabbit stays in the foreground on the right');
  assert.ok(getLoginFilmFraming(20.5).position < 20, 'the distant stone bridge is inside the portrait crop');
  assert.ok(getLoginFilmFraming(20.5).translateY < -10, 'bridge moves above the central login copy');
});

test('portrait crop is periodic, continuous, bounded, and covers the viewport',()=>{
  assert.deepEqual(getLoginFilmFraming(0),getLoginFilmFraming(30));
  for(let time=0;time<=60;time+=1/60){
    const now=getLoginFilmFraming(time),next=getLoginFilmFraming(time+1/60);
    assert.ok(now.position>=0&&now.position<=100);
    assert.ok(now.scale>=1&&now.scale<=1.3);
    assert.ok(Math.abs(now.position-next.position)<1.5);
    assert.ok(Math.abs(now.scale-next.scale)<.01);
    // translate up by half the growth: the bottom stays aligned to the screen.
    assert.ok(Math.abs(now.translateY+(now.scale-1)*50)<1e-9);
  }
});
