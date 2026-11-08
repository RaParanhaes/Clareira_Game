import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeleportEffects, shouldHideTransitActor, shouldLockTransitMovement, transitVisualState } from './teleport-effect.mjs';

const transit = overrides => ({
  id: 'transit-1', actorId: 'traveler', sourceDimensionId: 'surface', destinationDimensionId: 'breu',
  startAt: 1_000, transferAt: 3_700, apexMs: 1_080, durationMs: 2_700, sourceFadeMs: 420,
  sourceX: 4, sourceY: 5, destinationX: 8, destinationY: 9, destinationStartAt: null,
  ...overrides,
});

test('a partida hides the traveler at the apex while the source portal finishes before transfer', () => {
  const event = transit();
  assert.equal(shouldHideTransitActor(event, 'traveler', 'surface', 2_079), false);
  assert.equal(shouldHideTransitActor(event, 'traveler', 'surface', 2_080), true);
  assert.deepEqual(transitVisualState(event, 'source', 2_080), { elapsed: 1_080, alpha: 1 });
  assert.equal(transitVisualState(event, 'source', 2_500).alpha, 1, 'the source effect remains visible after the avatar disappears');
  assert.deepEqual(transitVisualState(event, 'source', 3_450), { elapsed: 2_450, alpha: 0.5952380952380952 });
  assert.equal(transitVisualState(event, 'source', 3_700), null, 'the source effect reaches its final frame before transfer');
  assert.equal(shouldHideTransitActor(event, 'traveler', 'surface', 3_699), true);
  assert.equal(shouldHideTransitActor(event, 'traveler', 'surface', 3_700), true, 'the traveler stays hidden in the source dimension after transfer');
  assert.equal(shouldHideTransitActor(event, 'traveler', 'surface', 5_000), true, 'the source copy never reappears during the destination animation');
});

test('returning to the previous dimension also hides the traveler at the source apex', () => {
  const event = transit({ sourceDimensionId: 'breu', destinationDimensionId: 'surface',
    transferAt: 13_700, startAt: 11_000 });
  assert.equal(shouldHideTransitActor(event, 'traveler', 'breu', 12_079), false);
  assert.equal(shouldHideTransitActor(event, 'traveler', 'breu', 12_080), true);
  assert.equal(shouldHideTransitActor(event, 'traveler', 'breu', 13_699), true);
  assert.equal(shouldHideTransitActor(event, 'traveler', 'breu', 14_500), true, 'leaving the source cannot make the avatar visible there again');
  assert.equal(shouldHideTransitActor(event, 'traveler', 'surface', 13_700), true,
    'the traveler stays hidden after transfer until the destination apex');
});
test('the destination has no portal or traveler until the loaded client schedules arrival', () => {
  const event = transit();
  assert.equal(transitVisualState(event, 'destination', 90_000), null);
  assert.equal(shouldHideTransitActor(event, 'traveler', 'breu', 90_000), true);
});

test('the destination replays from frame zero and reveals the traveler at the new apex', () => {
  const event = transit({ destinationStartAt: 50_000 });
  assert.equal(transitVisualState(event, 'destination', 49_999), null);
  assert.deepEqual(transitVisualState(event, 'destination', 50_000), { elapsed: 0, alpha: 1 });
  assert.equal(shouldHideTransitActor(event, 'traveler', 'breu', 51_079), true);
  assert.equal(shouldHideTransitActor(event, 'traveler', 'breu', 51_080), false);
  assert.deepEqual(transitVisualState(event, 'destination', 51_080), { elapsed: 1_080, alpha: 1 });
  assert.deepEqual(transitVisualState(event, 'destination', 52_000), { elapsed: 2_000, alpha: 1 });
  assert.equal(transitVisualState(event, 'destination', 52_700), null);
});

test('movement stays locked from departure through the arrival apex, then releases', () => {
  const event = transit({ destinationStartAt: 50_000 });
  assert.equal(shouldLockTransitMovement(event, 'traveler', 'surface', 999), false);
  assert.equal(shouldLockTransitMovement(event, 'traveler', 'surface', 1_000), true);
  assert.equal(shouldLockTransitMovement(event, 'traveler', 'breu', 49_999), true);
  assert.equal(shouldLockTransitMovement(event, 'traveler', 'breu', 51_079), true);
  assert.equal(shouldLockTransitMovement(event, 'traveler', 'breu', 51_080), false);
  assert.equal(shouldLockTransitMovement(event, 'other', 'breu', 50_500), false);
});

test('a transit cannot hide a different actor or another dimension', () => {
  const event = transit({ destinationStartAt: 50_000 });
  assert.equal(shouldHideTransitActor(event, 'other', 'breu', 50_100), false);
  assert.equal(shouldHideTransitActor(event, 'traveler', 'surface', 1_500), false);
});

test('a local portal survives the frame before its server event arrives', () => {
  const originals = { document: globalThis.document, window: globalThis.window,
    requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame, performance: globalThis.performance };
  const frames = new Map();let nextFrame = 0, now = 1_000, monotonic = 1_000;
  const context = { setTransform(){}, clearRect(){}, fillRect(){}, save(){}, restore(){}, fillText(){} };
  const overlay = { style: {}, dataset: {}, hidden: true, width: 0, height: 0, getContext: () => context };
  globalThis.performance = { now: () => monotonic };
  globalThis.document = { createElement: () => overlay, body: { append(){} } };
  globalThis.window = { devicePixelRatio: 1, innerWidth: 800, innerHeight: 600 };
  globalThis.requestAnimationFrame = callback => { const id = ++nextFrame; frames.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  let effects;
  try {
    effects = createTeleportEffects({ getServerNow: () => now, getDimensionId: () => 'surface' });
    effects.beginLocal('traveler', 'O Breu');
    const first = frames.entries().next().value;
    frames.delete(first[0]);first[1]();
    assert.equal(effects.localTransit, true, 'waiting for the WebSocket event cannot discard the local cover');
    assert.equal(overlay.hidden, true, 'the portal canvas waits until its synchronized event exists');

    const event = transit({ startAt: 1_000, transferAt: 3_700 });
    effects.accept(event, 1_000);
    assert.equal(effects.localTransit, true, 'the accepted server event binds to the pending local trip');
    const departure = [...frames.entries()].at(-1);
    frames.delete(departure[0]);departure[1]();
    now = event.transferAt;monotonic = event.transferAt;effects.updateLocalDimension('breu');
    const blackout = [...frames.entries()].at(-1);
    frames.delete(blackout[0]);blackout[1]();
    assert.equal(overlay.dataset.phase, 'loading');
    assert.equal(effects.localTransit, true);
  } finally {
    effects?.clear();
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});


test('blackout shows a smooth unlabeled white loading bar that fills only when the scene is ready', () => {
  const originals = { document: globalThis.document, window: globalThis.window,
    requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame, performance: globalThis.performance };
  const frames = new Map(), rectangles = [], labels = [];
  let nextFrame = 0, now = 1_000, monotonic = 1_000;
  const context = { fillStyle: '', shadowColor: '', shadowBlur: 0, setTransform(){}, clearRect(){},
    fillRect(x,y,width,height){rectangles.push({x,y,width,height,fillStyle:this.fillStyle});},
    save(){}, restore(){}, fillText(text,x,y){labels.push({text,x,y});} };
  const overlay = { style: {}, dataset: {}, hidden: true, width: 0, height: 0, getContext: () => context };
  globalThis.performance = { now: () => monotonic };
  globalThis.document = { createElement: () => overlay, body: { append(){} } };
  globalThis.window = { devicePixelRatio: 1, innerWidth: 800, innerHeight: 600 };
  globalThis.requestAnimationFrame = callback => { const id = ++nextFrame; frames.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  let effects;
  const render = () => { const [id,callback] = [...frames.entries()].at(-1); frames.delete(id); callback(); };
  try {
    effects = createTeleportEffects({ getServerNow: () => now, getDimensionId: () => 'surface' });
    effects.beginLocal('traveler', 'O Breu');
    effects.accept(transit({ startAt: 1_000, transferAt: 3_700 }), 1_000);
    now = 3_700;monotonic = 3_700;effects.updateLocalDimension('breu');
    render();
    effects.updateLocalProgress(50);now += 180;monotonic += 180;render();
    const partialBar = rectangles.filter(rect => rect.y === 350);
    assert.equal(partialBar.length, 2, 'the bar has a muted track and softly glowing partial fill');
    assert.ok(partialBar[1].width > 150 && partialBar[1].width < 190, JSON.stringify(partialBar));
    assert.ok(labels.some(label => label.text === 'O Breu'));
    assert.ok(labels.every(label => !/%|\d/u.test(label.text)), 'the overlay displays no percentage or progress text');

    assert.equal(effects.finishLocalScene('breu'), 'transit-1');
    effects.updateLocalProgress(100);monotonic += 2_000;render();
    const finishedBar = rectangles.filter(rect => rect.y === 350).at(-1);
    assert.ok(finishedBar.width > 339.5, 'the bar is fully white after destination readiness');
  } finally {
    effects?.clear();
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});


test('failed portal asset preparation can retry instead of permanently disabling the magic circle', async () => {
  const originalDocument = globalThis.document;
  const context = { setTransform(){}, clearRect(){}, fillRect(){}, save(){}, restore(){}, fillText(){} };
  globalThis.document = { createElement: () => ({ style: {}, hidden: true, dataset: {}, getContext: () => context }), body: { append(){} } };
  let attempts = 0, effects;
  try {
    effects = createTeleportEffects({ loadAssets: async () => {
      attempts += 1;
      if (attempts === 1) return { images: {} };
      return { images: { lower: { naturalWidth: 1 }, beam: { naturalWidth: 1 }, upper: { naturalWidth: 1 } } };
    } });
    assert.equal(await effects.prepare(), false);
    assert.equal(await effects.prepare(), true);
    assert.equal(await effects.prepare(), true);
    assert.equal(attempts, 2, 'successful portal frames stay cached after retry');
  } finally {
    effects?.clear();
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  }
});
