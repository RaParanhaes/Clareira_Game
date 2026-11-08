import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advanceWorldAnimationTime, followCamera } from './visual-motion.mjs';
import { SPAWN, stepPlayer } from './world.mjs';

test('movimento reduzido congela os ciclos visuais sem parar o relógio do jogo', () => {
  let visualTime = 4.25;
  for (let frame = 0; frame < 120; frame += 1) {
    visualTime = advanceWorldAnimationTime(visualTime, 1 / 60, true);
  }

  assert.equal(visualTime, 4.25);
  assert.notDeepEqual(stepPlayer(SPAWN, { x: 1, y: 0 }, 1 / 60), SPAWN);
});

test('câmera segue sem interpolação quando a pessoa reduz movimento', () => {
  const camera = { x: 2, y: 3 };
  const target = { x: 8, y: 11 };

  assert.deepEqual(followCamera(camera, target, true), target);
  const eased = followCamera(camera, target, false);
  assert.ok(Math.abs(eased.x - 2.72) < 1e-9);
  assert.ok(Math.abs(eased.y - 3.96) < 1e-9);
});

test('animações ambientais avançam no modo normal e não retrocedem com delta negativo', () => {
  assert.equal(advanceWorldAnimationTime(2, 1 / 60, false), 2 + 1 / 60);
  assert.equal(advanceWorldAnimationTime(2, -1, false), 2);
});

test('o quadro do jogo usa movimento reduzido no relógio visual e na câmera', async () => {
  const main = await readFile(new URL('./main.js', import.meta.url), 'utf8');

  assert.match(main, /worldClock = advanceWorldAnimationTime\(worldClock, STEP, reducedMotion\)/);
  assert.match(main, /camera=followCamera\(camera,cameraTarget,reducedMotion,cameraDelta\)/);
  assert.doesNotMatch(main, /worldClock \+= STEP/);
});

test('camera follows at the same rate at 30 and 120 frames per second',()=>{
 const run=fps=>{let p={x:0,y:0};for(let i=0;i<fps;i++)p=followCamera(p,{x:8,y:11},false,1/fps);return p};
 assert.ok(Math.abs(run(30).x-run(120).x)<1e-9);assert.ok(Math.abs(run(30).y-run(120).y)<1e-9);
});
