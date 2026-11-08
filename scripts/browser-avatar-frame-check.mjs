import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPreviewServer } from './dev-preview-page.mjs';
import { createPrototypeServer } from './prototype-server.mjs';
import { CLEARING_DOOR, ROOM_SPAWN } from '../game/world.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] || 'logs/avatar-frame-gameplay');
const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-avatar-frames-'));
await mkdir(output, { recursive: true });
const portProbe = http.createServer();
await new Promise((resolve, reject) => {
  portProbe.once('error', reject);
  portProbe.listen(0, '127.0.0.1', resolve);
});
const pagePort = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const allowedOrigin = `http://127.0.0.1:${pagePort}`;
const preview = createPreviewServer({ gameDirectory: path.join(root, 'game'), stateDirectory, port: pagePort, allowedOrigin });
await preview.listen();
const room = createPrototypeServer({ stateDirectory, allowedOrigin, port: 0 });
const roomAddress = await room.listen();
const pageURL = `${allowedOrigin}/dev/`;
const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  args: ['--no-sandbox'],
});

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.setDefaultTimeout(15000);
  await page.route(url => new URL(url).pathname.startsWith('/dev/'), async route => {
    try {
      const current = new URL(route.request().url());
      const upstream = new URL(current.href);
      upstream.pathname = current.pathname.replace(/^\/dev(?=\/)/, '') || '/';
      const response = await route.fetch({ url: upstream.href });
      const headers = { ...response.headers() };
      if (current.pathname === '/dev/') {
        headers['content-security-policy'] = headers['content-security-policy'].replace(
          "connect-src 'self' wss:", `connect-src 'self' ws://127.0.0.1:${roomAddress.port} wss:`,
        );
      }
      await route.fulfill({ response, headers });
    } catch (error) {
      if (!page.isClosed()) {
        pageErrors.push(`preview route failed: ${error.message}`);
        await route.abort().catch(() => {});
      }
    }
  });
  await page.addInitScript(roomPort => {
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class LocalRoomSocket extends NativeWebSocket {
      constructor(url, protocols) {
        const target = new URL(url, location.href);
        if (target.pathname === '/dev/room') { target.port = String(roomPort); target.pathname = '/room'; }
        super(target.href, protocols);
        window.localRoomSocket = this;
      }
    };
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    window.avatarFrameDraws = 0;
    window.avatarFrameFiles = new Set();
    window.avatarFrameCrops = new Set();
    window.avatarKeyEvents = [];
    for (const type of ['keydown', 'keyup']) window.addEventListener(type, event => {
      if (event.key.startsWith('Arrow')) window.avatarKeyEvents.push({ type, key: event.key,
        target: `${event.target?.tagName || 'window'}#${event.target?.id || ''}`,
        active: `${document.activeElement?.tagName || 'none'}#${document.activeElement?.id || ''}` });
    }, true);
    CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
      if (source instanceof HTMLImageElement && source.src.includes('/art/avatar-frames/')) {
        window.avatarFrameDraws += 1;
        window.avatarFrameFiles.add(new URL(source.src).pathname);
        window.avatarFrameCrops.add(args.slice(0, 4).join(','));
      }
      return drawImage.call(this, source, ...args);
    };
  }, roomAddress.port);

  await page.goto(pageURL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#scene-loading').hidden);

  await page.locator('#guest-form button[type="submit"]').click();
  await page.waitForSelector('.shell.is-authenticated');
  const sessionCookie = (await context.cookies()).find(cookie => cookie.name === 'clareira_session');
  assert.ok(sessionCookie, 'guest login should create a development session');
  await context.addCookies([{ name: sessionCookie.name, value: sessionCookie.value, url: allowedOrigin }]);
  await page.evaluate(async () => { window.checkMovement = (await import('/dev/main.js')).inspectMovement; });
  await page.waitForFunction(() => Boolean(window.checkMovement().server));
  await page.waitForFunction(() => document.querySelector('#scene-loading').hidden);
  await page.waitForFunction(() => window.avatarFrameDraws > 0);
  await page.waitForFunction(() => window.localRoomSocket?.readyState === WebSocket.OPEN);
  await page.evaluate(() => window.localRoomSocket.send(JSON.stringify({
    type: 'appearance',
    appearance: { archetypeId: 'character.peasant', body: 'male' },
  })));
  await page.waitForFunction(() => window.checkMovement().appearance?.outfitId === 'outfit.commoner'
    && window.checkMovement().appearance?.bodyId === 'body.male');

  const clickWorld = async (x, y) => {
    await page.waitForFunction(() => {
      const state = window.checkMovement();
      return Math.hypot(state.camera.x - state.rendered.x, state.camera.y - state.rendered.y) < .03;
    });
    const state = await page.evaluate(() => window.checkMovement());
    const bounds = await page.locator('#world').boundingBox();
    await page.mouse.click(
      bounds.x + bounds.width / 2 + (x - y) * 32 - Math.round((state.camera.x - state.camera.y) * 32),
      bounds.y + bounds.height * .52 + (x + y) * 18 - Math.round((state.camera.x + state.camera.y) * 18),
    );
  };

  const inspect = () => page.evaluate(() => window.checkMovement());
  const openPlayerMenu = () => page.locator('.player-menu').evaluate(menu => { menu.open = true; });
  const assertAction = async (action, message) => {
    await page.waitForFunction(expected => window.checkMovement().avatarFrame?.action === expected, action);
    const current = await inspect();
    assert.equal(current.avatarFrame.action, action, message);
    return current;
  };
  const outdoorStart = await inspect();
  assert.notEqual(outdoorStart.location, 'room', 'movement starts outdoors before entering the test area');
  await clickWorld(CLEARING_DOOR.x, CLEARING_DOOR.y);
  await page.waitForFunction(({ x, y }) => {
    const position = window.checkMovement().position;
    return Math.hypot(position.x - x, position.y - y) < .8;
  }, CLEARING_DOOR);
  await page.keyboard.press('e');
  await page.waitForFunction(({ x, y }) => {
    const state = window.checkMovement();
    return state.location === 'room' && !state.walkTarget && !state.nextWaypoint
      && Math.hypot(state.position.x - x, state.position.y - y) < .05;
  }, ROOM_SPAWN);
  await page.waitForFunction(() => window.checkMovement().roomFurniture.length === 0);
  const roomStart = await inspect();
  await page.locator('#world').focus();
  await page.keyboard.down('ArrowUp');
  try {
    await page.waitForFunction(origin => {
      const position = window.checkMovement().position;
      return Math.hypot(position.x - origin.x, position.y - origin.y) > 1.45;
    }, roomStart.position);
  } finally {
    await page.keyboard.up('ArrowUp');
  }
  await page.waitForFunction(() => {
    const state = window.checkMovement();
    return state.location === 'room' && !state.walkTarget && !state.nextWaypoint
      && state.position.x > 6.2 && state.position.x < 9.8
      && state.position.y > 6.2 && state.position.y < 9.8;
  });
  const openTestAreaState = await inspect();
  assert.equal(openTestAreaState.location, 'room', 'movement is reviewed in an open room test area');
  assert.equal(openTestAreaState.roomFurniture.length, 0, 'the movement area has no furniture obstruction');
  const directions = [
    { keys: ['ArrowDown'], direction: 0, facing: 'south' },
    { keys: ['ArrowDown', 'ArrowRight'], direction: 1, facing: 'southeast' },
    { keys: ['ArrowRight'], direction: 2, facing: 'east' },
    { keys: ['ArrowUp', 'ArrowRight'], direction: 3, facing: 'northeast' },
    { keys: ['ArrowUp'], direction: 4, facing: 'north' },
    { keys: ['ArrowUp', 'ArrowLeft'], direction: 5, facing: 'northwest' },
    { keys: ['ArrowLeft'], direction: 6, facing: 'west' },
    { keys: ['ArrowDown', 'ArrowLeft'], direction: 7, facing: 'southwest' },
  ];
  const directionChecks = [];
  const actionPreview = {};
  for (const check of directions) {
    const before = await inspect();
    await page.evaluate(() => { delete window.directionSample; });
    for (const key of check.keys) await page.keyboard.down(key);
    try {
      await page.waitForFunction(({ expected, beforePosition }) => {
        const state = window.checkMovement();
        if (state.avatarFrame?.action !== 'walk' || state.avatarFrame?.direction !== expected
            || Math.hypot(state.position.x - beforePosition.x, state.position.y - beforePosition.y) <= .01) return false;
        window.directionSample = {
          action: state.avatarFrame.action, direction: state.avatarFrame.direction, frame: state.avatarFrame.frame,
          phase: state.avatarFrame.phase, position: state.position,
          canvas: document.querySelector('#world').toDataURL('image/png'),
        };
        return true;
      }, { expected: check.direction, beforePosition: before.position });
    } catch (error) {
      const state = await inspect();
      const input = await page.evaluate(() => ({
        active: `${document.activeElement?.tagName || 'none'}#${document.activeElement?.id || ''}`,
        events: window.avatarKeyEvents.slice(-8),
      }));
      throw new Error(`${error.message}; direction=${check.facing}; before=${JSON.stringify({frame:before.avatarFrame,position:before.position})}; after=${JSON.stringify({frame:state.avatarFrame,position:state.position,pending:state.pending,server:state.server})}; input=${JSON.stringify(input)}`);
    }
    const current = await page.evaluate(() => window.directionSample);
    assert.ok(current, `the browser captured a live walking frame for ${check.facing}`);
    assert.equal(current.action, 'walk', 'walking selects the authored peasant cycle');
    assert.equal(current.direction, check.direction, `movement selects facing ${check.direction}`);
    assert.ok(current.frame >= 0 && current.frame < 8, 'walking selects one of eight frames');
    await page.waitForFunction(() => [...window.avatarFrameFiles].some(file =>
      file.endsWith('/outfits/commoner/male/walk.png')));
    const crop = `${current.frame * 96},${check.direction * 96},96,96`;
    await page.waitForFunction(expected => window.avatarFrameCrops.has(expected), crop);
    assert.ok(Math.hypot(current.position.x - before.position.x, current.position.y - before.position.y) > .001,
      `movement advances in direction ${check.direction}`);
    const advanced = await inspect();
    assert.equal(current.direction, check.direction, `the captured frame is oriented ${check.facing}`);
    const walkFrame = current.canvas;
    await writeFile(path.join(output, `walk-${check.facing}.png`), Buffer.from(walkFrame.split(',')[1], 'base64'));
    directionChecks.push({ direction: current.direction, facing: check.facing,
      frame: current.frame, position: current.position, actionAfterCapture: advanced.avatarFrame.action });
    for (const key of [...check.keys].reverse()) await page.keyboard.up(key);
    await page.waitForTimeout(90);
    await assertAction('idle', 'stopping returns to the peasant idle frame');
  }
  const firstDirection = directionChecks[0].direction;

  await page.evaluate(() => {
    window.peasantWalkFrameSamples = [];
    window.peasantWalkSampling = true;
    const sample = () => {
      if (!window.peasantWalkSampling) return;
      const state = window.checkMovement();
      if (state.avatarFrame?.action === 'walk') window.peasantWalkFrameSamples.push(state.avatarFrame.frame);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const cycleStart = await inspect();
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(origin => {
    const state = window.checkMovement();
    return state.avatarFrame?.action === 'walk'
      && Math.hypot(state.position.x - origin.x, state.position.y - origin.y) > 2.56;
  }, cycleStart.position);
  await page.keyboard.up('ArrowRight');
  await page.evaluate(() => { window.peasantWalkSampling = false; });
  await assertAction('idle', 'a complete gait cycle returns to idle');
  const sampledFrames = await page.evaluate(() => [...new Set(window.peasantWalkFrameSamples)].sort((a, b) => a - b));
  assert.deepEqual(sampledFrames, [0, 1, 2, 3, 4, 5, 6, 7], 'travel advances through all eight walk frames');

  const runApproach = await inspect();
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(origin => {
    const position = window.checkMovement().position;
    return Math.hypot(position.x - origin.x, position.y - origin.y) > 2.35;
  }, runApproach.position);
  await page.keyboard.up('ArrowLeft');
  await assertAction('idle', 'the run sample starts after returning to neutral');
  const runStart = await inspect();
  await page.evaluate(() => {
    window.peasantRunFrameSamples = [];
    window.peasantRunSampling = true;
    const sample = () => {
      if (!window.peasantRunSampling) return;
      const state = window.checkMovement();
      if (state.avatarFrame?.action === 'run') window.peasantRunFrameSamples.push(state.avatarFrame.frame);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowRight');
  let runState;
  try {
    await page.waitForFunction(origin => {
      const state = window.checkMovement();
      return state.avatarFrame?.action === 'run' && state.avatarFrame?.direction === 2
        && Math.hypot(state.position.x - origin.x, state.position.y - origin.y) > 1.8;
    }, runStart.position);
    runState = await inspect();
    await page.waitForFunction(() => [...window.avatarFrameFiles].some(file =>
      file.endsWith('/atlases/outfits/commoner/male/run.png')));
    await page.waitForFunction(expected => window.avatarFrameCrops.has(expected),
      `${runState.avatarFrame.frame * 96},${2 * 96},96,96`);
    await writeFile(path.join(output, 'run-east.png'),
      Buffer.from((await page.locator('#world').evaluate(canvas => canvas.toDataURL('image/png'))).split(',')[1], 'base64'));
  } finally {
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('Shift');
    await page.evaluate(() => { window.peasantRunSampling = false; });
  }
  await assertAction('idle', 'stopping a run returns to the peasant idle PNG');
  const runFrames = await page.evaluate(() => [...new Set(window.peasantRunFrameSamples)].sort((a, b) => a - b));
  assert.deepEqual(runFrames, [0, 1, 2, 3, 4, 5, 6, 7], 'distance advances through all eight run frames');
  assert.equal(runState.avatarFrame.action, 'run');
  assert.equal(runState.avatarFrame.direction, 2, 'rightward running selects the east view');
  actionPreview.run = { direction: 'east', frameDurationMs: 100, distancePerCycle: 1.8, sampledFrames: runFrames };
  await page.waitForTimeout(90);

  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('c');
  const crouchWalkState = await assertAction('crouch-walk', 'crouched travel selects the dedicated eight-frame PNG cycle');
  await page.waitForFunction(() => [...window.avatarFrameFiles].some(file =>
    file.endsWith('/atlases/outfits/commoner/male/crouch-walk.png')));
  await writeFile(path.join(output, 'crouch-walk.png'),
    Buffer.from((await page.locator('#world').evaluate(canvas => canvas.toDataURL('image/png'))).split(',')[1], 'base64'));
  await page.keyboard.up('ArrowLeft');
  await assertAction('crouch', 'stopping while crouched holds the crouch PNG');
  await page.keyboard.up('c');
  await page.keyboard.press('Space');
  const jumpState = await assertAction('jump', 'jump selects the dedicated eight-frame PNG cycle');
  await page.waitForFunction(() => [...window.avatarFrameFiles].some(file =>
    file.endsWith('/atlases/outfits/commoner/male/jump.png')));
  await writeFile(path.join(output, 'jump.png'),
    Buffer.from((await page.locator('#world').evaluate(canvas => canvas.toDataURL('image/png'))).split(',')[1], 'base64'));
  assert.ok(jumpState.avatarFrame.direction >= 0 && jumpState.avatarFrame.direction < 8,
    'jump uses one of the eight direction rows');
  await page.waitForFunction(() => window.checkMovement().position.z <= .02);
  await assertAction('idle', 'landing returns to the PNG idle frame');

  await page.evaluate(() => {
    window.peasantWaveFrameSamples = [];
    window.peasantWaveSampling = true;
    const sample = () => {
      if (!window.peasantWaveSampling) return;
      const state = window.checkMovement();
      if (state.avatarFrame?.action === 'wave') window.peasantWaveFrameSamples.push(state.avatarFrame.frame);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.keyboard.press('1');
  const waveState = await assertAction('wave', 'the reviewed PNG wave sheet is selected');
  await page.waitForFunction(() => [...window.avatarFrameFiles].some(file =>
    file.endsWith('/atlases/outfits/commoner/male/wave.png')));
  await page.waitForFunction(expected => window.avatarFrameCrops.has(expected),
    `${waveState.avatarFrame.frame * 96},${waveState.avatarFrame.direction * 96},96,96`);
  await page.waitForFunction(() => new Set(window.peasantWaveFrameSamples).size === 8);
  const waveFrames = await page.evaluate(() => [...new Set(window.peasantWaveFrameSamples)].sort((a, b) => a - b));
  assert.deepEqual(waveFrames, [0, 1, 2, 3, 4, 5, 6, 7], 'the wave advances through all eight reviewed frames');
  await writeFile(path.join(output, 'wave-south.png'),
    Buffer.from((await page.locator('#world').evaluate(canvas => canvas.toDataURL('image/png'))).split(',')[1], 'base64'));
  actionPreview.wave = { direction: waveState.avatarFrame.direction, frameDurationMs: 110, sampledFrames: waveFrames };
  await page.evaluate(() => { window.peasantWaveSampling = false; });
  await page.waitForFunction(() => window.checkMovement().avatarFrame?.action === 'idle'
    && window.checkMovement().pose?.gesture === null);
  assert.equal((await inspect()).avatarFrame.action, 'idle', 'the wave settles back to the detailed idle PNG');
  await page.keyboard.press('2');
  const danceState = await assertAction('dance', 'dance selects its dedicated eight-frame PNG cycle');
  await page.waitForFunction(() => [...window.avatarFrameFiles].some(file =>
    file.endsWith('/atlases/outfits/commoner/male/dance.png')));
  await writeFile(path.join(output, 'dance.png'),
    Buffer.from((await page.locator('#world').evaluate(canvas => canvas.toDataURL('image/png'))).split(',')[1], 'base64'));
  assert.ok(danceState.avatarFrame.direction >= 0 && danceState.avatarFrame.direction < 8,
    'dance uses one of the eight direction rows');
  await page.waitForFunction(() => window.checkMovement().pose?.gesture === null);
  await page.keyboard.press('3');
  const sitState = await assertAction('sit-ground', 'sitting without a nearby stool selects the cross-legged floor PNG');
  await page.waitForFunction(() => [...window.avatarFrameFiles].some(file =>
    file.endsWith('/atlases/outfits/commoner/male/sit-ground.png')));
  await writeFile(path.join(output, 'sit-ground.png'),
    Buffer.from((await page.locator('#world').evaluate(canvas => canvas.toDataURL('image/png'))).split(',')[1], 'base64'));
  assert.ok(sitState.avatarFrame.direction >= 0 && sitState.avatarFrame.direction < 8,
    'floor sitting uses one of the eight direction rows');
  await page.keyboard.press('3');

  await page.screenshot({ path: path.join(output, 'world-desktop.png') });
  const worldState = await inspect();
  assert.ok(worldState.server, 'local authoritative server is connected');
  assert.ok(await page.evaluate(() => window.avatarFrameDraws > 0), 'game draws decoded peasant PNG frames');
  assert.equal(worldState.avatarFrame.frame, 0, 'peasant returns to the single authored idle frame');
  assert.ok(worldState.avatarFrame.direction >= 0 && worldState.avatarFrame.direction < 8, 'game selects one of eight peasant facings');

  await page.waitForFunction(() => window.localRoomSocket?.readyState === WebSocket.OPEN);
  await page.evaluate(() => window.localRoomSocket.send(JSON.stringify({
    type: 'appearance',
    appearance: { archetypeId: 'character.peasant', body: 'male' },
  })));
  await page.waitForFunction(() => window.checkMovement().appearance?.outfitId === 'outfit.commoner');

  await openPlayerMenu();
  await page.locator('#appearance-open').click();
  await page.waitForTimeout(250);
  const outfitControl = await page.locator('#appearance-form [name="outfit"]').evaluate(control => ({
    disabled: control.disabled,
    options: [...control.options].map(option => option.value),
  }));
  assert.deepEqual(outfitControl, {
    disabled: false,
    options: ['white-base', 'commoner', 'mage-robe', 'dimension-coat', 'dark-armor', 'light-armor'],
  }, 'all reviewed full-body appearances are selectable in the game');
  await page.locator('#appearance-form [name="body"]').selectOption('female');
  await assertAction('idle', 'appearance changes do not alter the current world action');
  await page.locator('#appearance-form button[type="submit"]').click();
  await page.waitForFunction(() => {
    const appearance = window.checkMovement().appearance;
    return appearance?.bodyId === 'body.female' && appearance?.outfitId === 'outfit.commoner';
  });
  const changedAppearance = await inspect();
  const composition = await page.evaluate(async appearance => {
    const module = await import('/dev/avatar-sprites.mjs');
    return module.getAvatarComposition(appearance);
  }, changedAppearance.appearance);
  assert.equal(composition.complete, true, 'the selected appearance has all its drawable layers');
  assert.deepEqual(composition.layers.map(layer => layer.slot), ['full-avatar'],
    'the renderer uses the complete costume PNG to avoid white-body leaks');
  await openPlayerMenu();
  await page.locator('#appearance-open').click();
  await page.waitForTimeout(250);
  await page.waitForFunction(() => document.querySelector('#appearance-dialog').scrollTop === 0);
  await page.waitForFunction(() => [...window.avatarFrameFiles].some(file => file.endsWith('/atlases/outfits/commoner/female/idle.png')));
  for (let index = 0; index < 8; index += 1) await page.locator('#appearance-turn-left').click();
  await page.waitForFunction(() => {
    const crops = [...window.avatarFrameCrops].map(value => Number(value.split(',')[0]));
    return [0, 96, 192, 288, 384, 480, 576, 672].every(x => crops.includes(x));
  });
  await page.screenshot({ path: path.join(output, 'appearance-preview-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'appearance-preview-mobile.png') });
  const previewSize = await page.evaluate(() => {
    const canvas = document.querySelector('#appearance-preview');
    const rect = canvas.getBoundingClientRect();
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const bright = [];
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        const difference = Math.abs(pixels[offset] - 16) + Math.abs(pixels[offset + 1] - 35) + Math.abs(pixels[offset + 2] - 41);
        if (difference > 36) bright.push([x, y]);
      }
    }
    return {
      width: canvas.width, height: canvas.height, dialog: document.querySelector('#appearance-dialog').open,
      dialogScrollTop: document.querySelector('#appearance-dialog').scrollTop,
      cssWidth: rect.width, cssHeight: rect.height,
      brightBounds: bright.length ? {
        left: Math.min(...bright.map(point => point[0])), top: Math.min(...bright.map(point => point[1])),
        right: Math.max(...bright.map(point => point[0])), bottom: Math.max(...bright.map(point => point[1])),
      } : null,
    };
  });
  assert.equal(previewSize.dialog, true);
  assert.equal(previewSize.dialogScrollTop, 0, 'reopening the appearance dialog shows the entire character preview');
  assert.ok(previewSize.brightBounds && previewSize.brightBounds.top > 0 && previewSize.brightBounds.bottom < previewSize.height,
    'the full-body costume fits with headroom and footroom inside the preview canvas');

  const renderedCatalog = await page.evaluate(async () => {
    const renderer = await import('/dev/avatar-sprites.mjs');
    const appearances = [
      ['character.base', 'white-base'], ['character.peasant', 'commoner'], ['character.mage', 'mage-robe'],
      ['character.dimensional-traveler', 'dimension-coat'], ['character.dark-knight', 'dark-armor'],
      ['character.light-knight', 'light-armor'],
    ];
    const facings = renderer.AVATAR_SPRITE_SPEC.facings;
    const canvas = document.createElement('canvas');
    canvas.width = 96 * 8;
    canvas.height = 96 * appearances.length * 2;
    const context = canvas.getContext('2d');
    context.fillStyle = '#1d2429';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const outfitRows = [];
    for (let appearanceIndex = 0; appearanceIndex < appearances.length; appearanceIndex += 1) {
      for (let bodyIndex = 0; bodyIndex < 2; bodyIndex += 1) {
        const [archetypeId, outfitId] = appearances[appearanceIndex];
        const appearance = { archetypeId, body: bodyIndex === 0 ? 'male' : 'female' };
        await renderer.preloadAvatarSprites(appearance);
        const composition = renderer.getAvatarComposition(appearance);
        const hasCorrectBaseLayer = outfitId === 'white-base'
          ? composition.layers.some(layer => layer.slot === 'body')
          : composition.layers.some(layer => layer.slot === 'full-avatar');
        if (!composition.complete || !hasCorrectBaseLayer) {
          throw new Error(`Incomplete appearance ${outfitId}/${appearance.body}`);
        }
        const row = appearanceIndex * 2 + bodyIndex;
        for (let direction = 0; direction < facings.length; direction += 1) {
          const selected = renderer.selectAvatarFrame({ facing: facings[direction], now: 0 });
          if (!renderer.drawAvatarSprite(context, direction * 96 + 48, row * 96 + 84, selected, appearance)) {
            throw new Error(`Could not draw ${outfitId}/${appearance.body}/${facings[direction]}`);
          }
        }
        outfitRows.push({ outfitId, body: appearance.body, layerSlots: composition.layers.map(layer => layer.slot) });
      }
    }

    const hashCanvas = target => {
      const pixels = target.getContext('2d').getImageData(0, 0, target.width, target.height).data;
      let hash = 2166136261;
      for (let index = 0; index < pixels.length; index += 1) hash = Math.imul(hash ^ pixels[index], 16777619);
      return (hash >>> 0).toString(16);
    };
    const equipmentIds = ['axe', 'sword', 'knife', 'lantern', 'branch', 'staff', 'dimensional-device', 'dark-sword', 'light-sword'];
    const equipmentCanvas = document.createElement('canvas');
    equipmentCanvas.width = 96 * 8;
    equipmentCanvas.height = 96 * 3;
    const equipmentContext = equipmentCanvas.getContext('2d');
    equipmentContext.fillStyle = '#1d2429';
    equipmentContext.fillRect(0, 0, equipmentCanvas.width, equipmentCanvas.height);
    const itemRows = [];
    for (let index = 0; index < equipmentIds.length; index += 1) {
      const itemId = `equipment.${equipmentIds[index]}`;
      const appearance = { archetypeId: 'character.peasant', body: 'male', mainHandId: itemId };
      await renderer.preloadAvatarSprites(appearance);
      const composition = renderer.getAvatarComposition(appearance);
      if (!composition.layers.some(layer => layer.id === itemId)) throw new Error(`Missing item layer ${itemId}`);
      for (let direction = 0; direction < facings.length; direction += 1) {
        const selected = renderer.selectAvatarFrame({ facing: facings[direction], now: 0 });
        if (!renderer.drawAvatarSprite(equipmentContext, direction * 96 + 48, Math.floor(index / 3) * 96 + 84, selected, appearance)) {
          throw new Error(`Could not draw item ${itemId}/${facings[direction]}`);
        }
      }
      itemRows.push({ itemId, grip: composition.motion.mainHandGrip });
    }

    const auraLoops = {};
    for (const [archetypeId, auraId] of [
      ['character.dark-knight', 'aura.void'], ['character.light-knight', 'aura.radiance'],
    ]) {
      const appearance = { archetypeId, body: 'male' };
      await renderer.preloadAvatarSprites(appearance);
      const loopCanvas = document.createElement('canvas');
      loopCanvas.width = 96;
      loopCanvas.height = 96;
      const loopContext = loopCanvas.getContext('2d');
      loopContext.fillStyle = '#1d2429';
      const hashes = [];
      for (let frame = 0; frame < 8; frame += 1) {
        loopContext.fillRect(0, 0, 96, 96);
        const selected = renderer.selectAvatarFrame({ facing: 'south', now: frame * 90 });
        if (!renderer.drawAvatarSprite(loopContext, 48, 84, selected, appearance)) throw new Error(`Could not draw ${auraId}`);
        hashes.push(hashCanvas(loopCanvas));
      }
      auraLoops[auraId] = new Set(hashes).size;
      if (auraLoops[auraId] < 4) throw new Error(`${auraId} does not visibly advance through its frames`);
    }

    const actionEffectIds = ['spellcast-blue', 'rift-activate'];
    const effectCanvas = document.createElement('canvas');
    effectCanvas.width = 96 * 8;
    effectCanvas.height = 96 * actionEffectIds.length;
    const effectContext = effectCanvas.getContext('2d');
    effectContext.fillStyle = '#1d2429';
    effectContext.fillRect(0, 0, effectCanvas.width, effectCanvas.height);
    const actionEffects = {};
    for (let effectIndex = 0; effectIndex < actionEffectIds.length; effectIndex += 1) {
      const effectId = actionEffectIds[effectIndex];
      const image = new Image();
      image.src = `/dev/art/avatar-frames/character-layers-v1/atlases/effects/${effectId}.png`;
      await image.decode();
      if (image.naturalWidth !== 96 * 8 || image.naturalHeight !== 96) throw new Error(`Bad atlas dimensions for ${effectId}`);
      const hashes = [];
      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = 96;
      frameCanvas.height = 96;
      const frameContext = frameCanvas.getContext('2d');
      for (let frame = 0; frame < 8; frame += 1) {
        frameContext.fillStyle = '#1d2429';
        frameContext.fillRect(0, 0, 96, 96);
        frameContext.drawImage(image, frame * 96, 0, 96, 96, 0, 0, 96, 96);
        effectContext.drawImage(image, frame * 96, 0, 96, 96, frame * 96, effectIndex * 96, 96, 96);
        hashes.push(hashCanvas(frameCanvas));
      }
      actionEffects[effectId] = new Set(hashes).size;
      if (actionEffects[effectId] < 4) throw new Error(`${effectId} has too few distinct chronological frames`);
    }

    return {
      outfitRows,
      itemRows,
      auraLoops,
      actionEffects,
      outfitPreview: canvas.toDataURL('image/png'),
      equipmentPreview: equipmentCanvas.toDataURL('image/png'),
      effectsPreview: effectCanvas.toDataURL('image/png'),
    };
  });
  assert.equal(renderedCatalog.outfitRows.length, 12, 'both neutral bases and both body variants of all five characters render');
  assert.equal(renderedCatalog.itemRows.length, 9, 'all nine item PNGs load and render');
  assert.ok(Object.values(renderedCatalog.auraLoops).every(uniqueFrames => uniqueFrames >= 4),
    'both aura loops visibly advance in the game renderer');
  assert.ok(Object.values(renderedCatalog.actionEffects).every(uniqueFrames => uniqueFrames >= 4),
    'one-shot spell and rift effect atlases decode into distinct frames');
  await writeFile(path.join(output, 'all-appearances.png'), Buffer.from(renderedCatalog.outfitPreview.split(',')[1], 'base64'));
  await writeFile(path.join(output, 'all-equipment.png'), Buffer.from(renderedCatalog.equipmentPreview.split(',')[1], 'base64'));
  await writeFile(path.join(output, 'all-effects.png'), Buffer.from(renderedCatalog.effectsPreview.split(',')[1], 'base64'));

  const rosterMotionChecks = [];
  await page.locator('#appearance-close').click();
  await page.locator('.player-menu').evaluate(menu => { menu.open = false; });
  await page.locator('#world').focus();
  const roster = [
    ...['male', 'female'].map(body => ({ archetypeId: 'character.base', body, outfitId: 'outfit.white-base' })),
    ...[
      ['character.peasant', 'outfit.commoner'], ['character.mage', 'outfit.mage-robe'],
      ['character.dimensional-traveler', 'outfit.dimension-coat'], ['character.dark-knight', 'outfit.dark-armor'],
      ['character.light-knight', 'outfit.light-armor'],
    ].flatMap(([archetypeId, outfitId]) => ['male', 'female'].map(body => ({ archetypeId, outfitId, body }))),
  ];
  const rosterStart = await inspect();
  await page.keyboard.down('ArrowLeft');
  try {
    await page.waitForFunction(origin => {
      const position = window.checkMovement().position;
      return Math.hypot(position.x - origin.x, position.y - origin.y) > 2.45;
    }, rosterStart.position);
  } finally {
    await page.keyboard.up('ArrowLeft');
  }
  await page.waitForFunction(() => {
    const state = window.checkMovement();
    return state.location === 'room' && !state.walkTarget && !state.nextWaypoint
      && state.position.x > 6.2 && state.position.x < 9.8
      && state.position.y > 6.2 && state.position.y < 9.8;
  });
  for (const appearance of roster) {
    await page.evaluate(value => window.localRoomSocket.send(JSON.stringify({ type: 'appearance', appearance: {
      archetypeId: value.archetypeId, body: value.body,
    } })), appearance);
    await page.waitForFunction(({ outfitId, body }) => {
      const current = window.checkMovement().appearance;
      return current?.outfitId === outfitId && current?.bodyId === `body.${body}`;
    }, appearance);
    const start = await inspect();
    const shouldWalk = appearance.archetypeId === 'character.peasant' && appearance.body === 'male';
    const moveKey = rosterMotionChecks.length % 2 === 0 ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(moveKey);
    try {
      await page.waitForFunction(({ origin, shouldWalk }) => {
        const state = window.checkMovement();
        const moved = Math.hypot(state.position.x - origin.x, state.position.y - origin.y) > .025;
        return moved && state.avatarFrame?.action === (shouldWalk ? 'walk' : 'idle');
      }, { origin: start.position, shouldWalk });
    } catch (error) {
      const state = await inspect();
      const input = await page.evaluate(() => ({
        active: `${document.activeElement?.tagName || 'none'}#${document.activeElement?.id || ''}`,
        events: window.avatarKeyEvents.slice(-8),
      }));
      throw new Error(`${error.message}; appearance=${appearance.archetypeId}/${appearance.body}; start=${JSON.stringify({action:start.avatarFrame,position:start.position,pose:start.pose,motion:start.motion})}; after=${JSON.stringify({action:state.avatarFrame,position:state.position,pending:state.pending,server:state.server,pose:state.pose,motion:state.motion})}; input=${JSON.stringify(input)}`);
    }
    const moving = await inspect();
    const framePath = moving.avatarFrame?.action === 'walk'
      ? `/atlases/outfits/commoner/male/walk.png`
      : appearance.outfitId === 'outfit.white-base'
        ? `/neutral-body-v2/atlases/${appearance.body}/idle.png`
        : `/atlases/outfits/${appearance.outfitId.slice('outfit.'.length)}/${appearance.body}/idle.png`;
    await page.waitForFunction(path => [...window.avatarFrameFiles].some(file => file.endsWith(path)), framePath);
    await writeFile(path.join(output, `moving-${appearance.outfitId.slice('outfit.'.length)}-${appearance.body}.png`),
      Buffer.from((await page.locator('#world').evaluate(canvas => canvas.toDataURL('image/png'))).split(',')[1], 'base64'));
    rosterMotionChecks.push({
      archetypeId: appearance.archetypeId,
      outfitId: moving.appearance.outfitId,
      bodyId: moving.appearance.bodyId,
      moving: true,
      selectedAction: moving.avatarFrame.action,
      facing: moving.avatarFrame.facing,
      input: moveKey,
      frame: moving.avatarFrame.frame,
      traveled: Math.hypot(moving.position.x - start.position.x, moving.position.y - start.position.y),
      expectedWalkFrames: shouldWalk ? 8 : 1,
    });
    await page.keyboard.up(moveKey);
    await page.waitForFunction(() => window.checkMovement().avatarFrame?.action === 'idle');
  }
  assert.deepEqual(pageErrors, []);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({
    passed: true,
    worldAction: worldState.avatarFrame,
    firstDirection,
    openTestArea: { location: openTestAreaState.location, furniture: openTestAreaState.roomFurniture.length,
      position: openTestAreaState.position },
    directionChecks,
    walkCycle: { frameDurationMs: 100, distancePerCycle: 2.56, sampledFrames },
    changedAppearance: {
      archetypeId: changedAppearance.appearance.archetypeId,
      bodyId: changedAppearance.appearance.bodyId,
      outfitId: changedAppearance.appearance.outfitId,
      missingLayers: composition.missing.map(layer => layer.id),
      renderedLayers: composition.layers.map(layer => layer.slot),
    },
    outfitControl,
    renderedCatalog: {
      outfitRows: renderedCatalog.outfitRows,
      itemRows: renderedCatalog.itemRows,
      auraLoops: renderedCatalog.auraLoops,
      actionEffects: renderedCatalog.actionEffects,
    },
    rosterMotionChecks,
    frameDraws: await page.evaluate(() => window.avatarFrameDraws),
    frameFiles: await page.evaluate(() => [...window.avatarFrameFiles].sort()),
    frameCrops: await page.evaluate(() => [...window.avatarFrameCrops].sort()),
    previewSize,
    pageErrors,
  }, null, 2));
  await context.close();
  process.stdout.write(`Gameplay and preview checks passed; captures are in ${output}\n`);
} finally {
  await browser.close();
  await room.close();
  await preview.close();
  await rm(stateDirectory, { recursive: true, force: true });
}
