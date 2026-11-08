import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AVATAR_SPRITE_SPEC,
  advanceAvatarSpritePhase,
  getAvatarComposition,
  getAvatarSpriteURLs,
  getAvatarSpriteVariant,
  selectAvatarFrame,
} from './avatar-sprites.mjs';
import { getFacingFromVector } from './avatar.mjs';
import { getWorldInput } from './input.mjs';
import { WORLD_TILE_X, WORLD_TILE_Y } from './world.mjs';

test('male and female base appearances select the detailed commoner PNG atlases', () => {
  const male = { body: 'male' };
  const female = { body: 'female' };
  assert.match(getAvatarSpriteVariant(male), /body\.male/);
  assert.match(getAvatarSpriteVariant(female), /body\.female/);
  assert.deepEqual(getAvatarSpriteURLs(male).map(url => url.split('/').slice(-3).join('/')), [
    'commoner/male/idle.png',
  ]);
  assert.deepEqual(getAvatarSpriteURLs(female).map(url => url.split('/').slice(-3).join('/')), [
    'commoner/female/idle.png',
  ]);
  assert.ok(getAvatarSpriteURLs(male).every(url => url.includes('/character-layers-v1/')));
  assert.ok(getAvatarSpriteURLs(male).every(url => !url.includes('/neutral-body-v2/')));
});

test('costume, weapon and aura PNGs resolve in the same directional composition', () => {
  const appearance = { archetypeId: 'character.dark-knight' };
  const composition = getAvatarComposition(appearance);
  assert.equal(composition.complete, true);
  assert.deepEqual(composition.layers.map(layer => layer.slot), ['aura', 'full-avatar', 'equipment']);
  const paths = getAvatarSpriteURLs(appearance).map(url => new URL(url).pathname);
  assert.ok(paths.some(url => url.endsWith('/atlases/effects/aura-void.png')));
  assert.ok(paths.some(url => url.endsWith('/atlases/outfits/dark-armor/male/idle.png')));
  assert.ok(paths.some(url => url.endsWith('/atlases/equipment/dark-sword.png')));
  const femalePaths = getAvatarSpriteURLs({ archetypeId: 'character.dark-knight', body: 'female' }).map(url => new URL(url).pathname);
  assert.ok(femalePaths.some(url => url.endsWith('/atlases/outfits/dark-armor/female/idle.png')));
});

test('the base maps all eight facings and exposes the reviewed commoner action atlases', () => {
  const directions = AVATAR_SPRITE_SPEC.facings.map(facing => selectAvatarFrame({ facing }));
  assert.deepEqual(directions.map(frame => frame.direction), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(directions.map(frame => frame.action), Array(8).fill('idle'));
  assert.deepEqual(directions.map(frame => frame.frame), Array(8).fill(0));
  assert.deepEqual(AVATAR_SPRITE_SPEC.actions, {
    idle: 1, walk: 8, run: 8, wave: 8, dance: 8, jump: 8,
    'sit-ground': 8, 'sit-chair': 8, crouch: 8, 'crouch-walk': 8, 'walk-wave': 8,
  });
});

test('the eight isometric movement directions address the matching atlas columns', () => {
  const inputs = [
    [['ArrowDown'], 'south'],
    [['ArrowDown', 'ArrowRight'], 'southeast'],
    [['ArrowRight'], 'east'],
    [['ArrowUp', 'ArrowRight'], 'northeast'],
    [['ArrowUp'], 'north'],
    [['ArrowUp', 'ArrowLeft'], 'northwest'],
    [['ArrowLeft'], 'west'],
    [['ArrowDown', 'ArrowLeft'], 'southwest'],
  ];
  for (const [index, [keys, expectedFacing]] of inputs.entries()) {
    const input = getWorldInput(new Set(keys), new Map(), WORLD_TILE_X, WORLD_TILE_Y);
    const facing = getFacingFromVector(input.x, input.y, WORLD_TILE_X, WORLD_TILE_Y);
    assert.equal(facing, expectedFacing, `${keys.join('+')} maps to ${expectedFacing}`);
    assert.equal(AVATAR_SPRITE_SPEC.facings[index], facing, `${facing} selects atlas column ${index}`);
  }
});

test('missing movement and emote frames stay on the base until authored and reviewed', () => {
  const female = { archetypeId: 'character.peasant', body: 'female' };
  const states = [
    { appearance: female, travelDistance: .2 },
    { appearance: female, travelDistance: .2, running: true },
    { appearance: female, crouching: true },
    { appearance: female, position: { z: .5 } },
    { appearance: female, pose: { sitting: true, sit: 1 } },
    { appearance: female, player: { emote: 'wave' } },
  ];
  for (const state of states) {
    const frame = selectAvatarFrame({ facing: 'northwest', ...state });
    assert.deepEqual(frame, { action: 'idle', group: 'idle', direction: 5, frame: 0, nowMs: 0, reducedMotion: false, mirror: false });
  }
});

test('the male commoner selects its eight-frame walk and run cycles while grounded', () => {
  const male = { archetypeId: 'character.peasant', body: 'male' };
  const female = { archetypeId: 'character.peasant', body: 'female' };
  const frames = Array.from({ length: 8 }, (_, index) => selectAvatarFrame({
    appearance: male, facing: 'south', travelDistance: .2, phase: index * Math.PI / 4,
  }));
  assert.deepEqual(frames.map(frame => frame.action), Array(8).fill('walk'));
  assert.deepEqual(frames.map(frame => frame.frame), [0, 1, 2, 3, 4, 5, 6, 7]);
  const runFrames = Array.from({ length: 8 }, (_, index) => selectAvatarFrame({
    appearance: male, facing: 'east', running: true, moving: true, phase: index * Math.PI / 4,
  }));
  assert.deepEqual(runFrames.map(frame => frame.action), Array(8).fill('run'));
  assert.deepEqual(runFrames.map(frame => frame.frame), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(selectAvatarFrame({ appearance: male, moving: true, phase: Math.PI / 4 }).action, 'walk',
    'interpolation pauses must not flash the character back to idle');
  assert.equal(selectAvatarFrame({ appearance: female, travelDistance: .2 }).action, 'idle');
  assert.equal(selectAvatarFrame({ appearance: female, running: true }).action, 'idle');
  assert.equal(selectAvatarFrame({ appearance: male, travelDistance: .2, reducedMotion: true }).action, 'idle');
  assert.equal(selectAvatarFrame({ appearance: male, travelDistance: .2, position: { z: .4 } }).action, 'jump');
});

test('the run cycle stops for reduced-motion, airborne, and crouched poses', () => {
  const male = { archetypeId: 'character.peasant', body: 'male' };
  assert.equal(selectAvatarFrame({ appearance: male, running: true, reducedMotion: true }).action, 'idle');
  assert.equal(selectAvatarFrame({ appearance: male, running: true, position: { z: .4 } }).action, 'jump');
  assert.equal(selectAvatarFrame({ appearance: male, running: true, crouching: true }).action, 'crouch');
});

test('the reviewed male commoner wave uses a closed eight-frame cycle and combines with walking', () => {
  const male = { archetypeId: 'character.peasant', body: 'male' };
  const female = { archetypeId: 'character.peasant', body: 'female' };
  const player = { emote: 'wave', emoteUntil: 2000 };
  const frames = [100, 210, 320, 430, 540, 650, 760, 870].map(now => selectAvatarFrame({
    appearance: male, facing: 'south', pose: { gesture: 'wave' }, player, now,
  }));
  assert.deepEqual(frames.map(frame => frame.action), Array(8).fill('wave'));
  assert.deepEqual(frames.map(frame => frame.frame), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(selectAvatarFrame({ appearance: male, facing: 'east', pose: { gesture: 'wave' }, player, now: 1860 }).frame, 7,
    'the gesture rests before its 1.9 second emote expires');
  assert.equal(selectAvatarFrame({ appearance: male, pose: { gesture: 'wave', sitting: true }, player, now: 100 }).action, 'sit-ground',
    'the seated pose keeps priority until a seated wave sheet is authored');
  assert.equal(selectAvatarFrame({ appearance: male, moving: true, phase: Math.PI / 2, pose: { gesture: 'wave' }, player, now: 100 }).action, 'walk-wave',
    'the separate walk-and-wave sheet is selected while moving');
  assert.equal(selectAvatarFrame({ appearance: male, moving: true, running: true, phase: Math.PI / 2, pose: { gesture: 'wave' }, player, now: 100 }).action, 'run',
    'a standing wave is not drawn over a running stride');
  assert.equal(selectAvatarFrame({ appearance: female, pose: { gesture: 'wave' }, player, now: 100 }).action, 'idle',
    'a male-only wave sheet is not used for the female base');
});

test('the male commoner selects dedicated jump, dance, crouch and separate floor/chair sitting PNGs', () => {
  const male = { archetypeId: 'character.peasant', body: 'male' };
  assert.equal(selectAvatarFrame({ appearance: male, position: { z: .4, vz: 1 } }).action, 'jump');
  assert.equal(selectAvatarFrame({ appearance: male, pose: { gesture: 'dance' }, player: { emote: 'dance', emoteUntil: 2000 }, now: 100 }).action, 'dance');
  assert.equal(selectAvatarFrame({ appearance: male, crouching: true }).action, 'crouch');
  assert.equal(selectAvatarFrame({ appearance: male, crouching: true, moving: true }).action, 'crouch-walk');
  assert.equal(selectAvatarFrame({ appearance: male, pose: { sitting: true } }).action, 'sit-ground');
  assert.equal(selectAvatarFrame({ appearance: male, pose: { sitting: true }, player: { seatType: 'chair' } }).action, 'sit-chair');
});

test('travel phase calculation remains distance-driven for later authored cycles', () => {
  assert.equal(advanceAvatarSpritePhase(2, .35), 2 + .35 * Math.PI * 2 / 1.4);
  assert.equal(advanceAvatarSpritePhase(2, .35, true), 2);
});
