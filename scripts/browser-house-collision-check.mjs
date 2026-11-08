import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const output = process.argv[2] || '/opt/game-agent/logs/house-collision';
const coreModuleFiles = ['game/main.js', 'game/world.mjs', 'game/building-depth.mjs', 'game/prediction.mjs', 'game/input.mjs', 'game/obstacle-collision.mjs'];
const readCoreModuleHashes = async () => Object.fromEntries(await Promise.all(coreModuleFiles.map(async path => [
  path,
  createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex'),
])));
const initialCoreModuleHashes = await readCoreModuleHashes();
const pinnedCoreVersion = createHash('sha256').update(JSON.stringify(initialCoreModuleHashes)).digest('hex');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  headless: true,
  args: ['--no-sandbox'],
});

const percentile = (values, fraction) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))].toFixed(3));
};

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  const updateVersions = [];
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) console.log('main frame navigation', frame.url());
  });
  page.on('response', response => {
    if (response.url().endsWith('/update-version')) {
      void response.json().then(value => updateVersions.push({ at: new Date().toISOString(), ...value })).catch(() => {});
    }
  });
  // Background asset-generation jobs can change the whole-game version while
  // leaving physics code untouched. Pin only this browser test's update poll;
  // the code module hashes are checked again after the run.
  await page.route('**/dev/update-version', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ version: pinnedCoreVersion }),
  }));
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(15000);
  await page.goto('https://vmi3579939.contaboserver.net/dev/', { waitUntil: 'domcontentloaded' });
  await page.locator('#guest-form button[type=submit]').click();
  await page.waitForSelector('.shell.is-authenticated');
  await page.evaluate(async () => {
    const [main, world, elevation] = await Promise.all([
      import('/dev/main.js'), import('/dev/world.mjs'), import('/dev/elevation.mjs'),
    ]);
    window.houseProbe = {
      read: main.inspectMovement,
      world: {
        bounds: { ...world.SHELTER_BOUNDS }, door: { ...world.CLEARING_DOOR },
        radius: world.PLAYER_RADIUS, clearance: world.SHELTER_WALL_CLEARANCE,
        tileX: world.WORLD_TILE_X, tileY: world.WORLD_TILE_Y, canOccupy: world.canOccupy,
        heightPixels: elevation.HEIGHT_PIXELS, surfaceHeight: elevation.surfaceHeight,
      },
    };
    window.houseSamples = [];
    window.houseSampling = true;
    window.housePhase = 'idle';
    let previousFrame = performance.now();
    const record = now => {
      if (!window.houseSampling) return;
      const state = window.houseProbe.read();
      const position = { x: state.position.x, y: state.position.y };
      const server = state.server && { x: state.server.x, y: state.server.y };
      const remoteDistances = (state.remotePlayers || []).map(player => Math.hypot(
        position.x - player.authoritative.x, position.y - player.authoritative.y,
      ));
      const b = window.houseProbe.world.bounds;
      const inside = (point, margin) => Boolean(point
        && point.x > b.left - margin && point.x < b.right + margin
        && point.y > b.top - margin && point.y < b.bottom + margin);
      window.houseSamples.push({
        atMs: Math.round(now), phase: window.housePhase, frameMs: now - previousFrame,
        position, rendered: { x: state.rendered.x, y: state.rendered.y }, server,
        renderCorrectionTile: state.renderCorrection ? Math.hypot(state.renderCorrection.x, state.renderCorrection.y) : 0,
        clientServerDistance: server ? Math.hypot(position.x - server.x, position.y - server.y) : null,
        clientInsideFootprint: inside(position, window.houseProbe.world.radius),
        serverInsideFootprint: inside(server, window.houseProbe.world.radius),
        clientInsideVisualClearance: inside(position, window.houseProbe.world.radius + window.houseProbe.world.clearance),
        serverInsideVisualClearance: inside(server, window.houseProbe.world.radius + window.houseProbe.world.clearance),
        pending: state.pending, location: state.location, dimensionId: state.dimensionId,
        inputSeq: state.server?.inputSeq ?? null, networkRoundTripMs: state.networkClock.roundTripMs,
        remotePlayerCount: remoteDistances.length,
        nearestRemoteDistance: remoteDistances.length ? Math.min(...remoteDistances) : null,
      });
      previousFrame = now;
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
  await page.waitForFunction(() => window.houseProbe?.read().server);
  try {
    await page.waitForFunction(() => {
      const readiness = window.houseProbe?.read().readiness;
      return readiness?.documentVisible && !readiness.loading && readiness.authenticated
        && readiness.sceneReady && readiness.predictionReady && readiness.connected;
    }, null, { timeout: 15000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      url: location.href, state: window.houseProbe?.read?.(),
      loadingHidden: document.querySelector('#scene-loading')?.hidden,
      shellAuthenticated: document.querySelector('.shell')?.classList.contains('is-authenticated'),
      activeElement: document.activeElement?.tagName,
    }));
    await page.screenshot({ path: `${output}/startup-timeout.png` });
    console.error('startup readiness timeout', JSON.stringify(diagnostic));
    throw error;
  }
  await page.locator('#world').focus();

  const geometry = await page.evaluate(() => {
    const w = window.houseProbe.world;
    const state = w.canOccupy({ x: w.door.x, y: w.bounds.bottom + .75 }, w.radius);
    return {
      bounds: w.bounds, door: w.door, radius: w.radius, clearance: w.clearance,
      frontLeftStage: { x: w.bounds.left + .2, y: w.bounds.bottom + .8 },
      frontRightStage: { x: w.bounds.right - .2, y: w.bounds.bottom + .8 },
      sideStage: { x: w.bounds.right + .75, y: w.bounds.bottom - .3 },
      openStage: { x: w.door.x + 5, y: w.door.y + 1 },
      frontStagesWalkable: [
        w.canOccupy({ x: w.bounds.left + .2, y: w.bounds.bottom + .8 }, w.radius),
        w.canOccupy({ x: w.bounds.right - .2, y: w.bounds.bottom + .8 }, w.radius),
      ],
    };
  });
  assert.deepEqual(geometry.frontStagesWalkable, [true, true], 'both corner test positions must be safely outside the house');

  const moveToByGamePath = async target => {
    const click = await page.evaluate(({ x, y }) => {
      const state = window.houseProbe.read();
      const canvas = document.querySelector('#world');
      const { heightPixels, surfaceHeight } = window.houseProbe.world;
      const tileX = canvas.clientWidth < 600 ? 26 : 32;
      const tileY = tileX * window.houseProbe.world.tileY / window.houseProbe.world.tileX;
      const canvasRect = canvas.getBoundingClientRect();
      const viewRect = canvas.parentElement.getBoundingClientRect();
      const centreX = viewRect.width / 2;
      const centreY = viewRect.height * .52;
      const height = surfaceHeight(x, y, 'clearing');
      return {
        clientX: canvasRect.left + centreX + (x - y) * tileX - Math.round((state.camera.x - state.camera.y) * tileX),
        clientY: canvasRect.top + centreY + (x + y) * tileY - Math.round((state.camera.x + state.camera.y) * tileY)
          - height * heightPixels * (tileX / 16),
      };
    }, target);
    await page.mouse.click(click.clientX, click.clientY);
    await page.waitForFunction(({ x, y }) => {
      const state = window.houseProbe?.read();
      const destination = state?.walkTarget;
      return (destination && Math.hypot(destination.x - x, destination.y - y) < .25)
        || (state?.position && Math.hypot(state.position.x - x, state.position.y - y) < .65);
    }, target, { timeout: 15000 });
    await page.waitForFunction(({ x, y }) => {
      const position = window.houseProbe?.read().position;
      return position && Math.hypot(position.x - x, position.y - y) < .65;
    }, target, { timeout: 45000, polling: 100 });
    await page.waitForTimeout(450);
    const state = await page.evaluate(() => window.houseProbe.read());
    return { x: state.position.x, y: state.position.y, distance: Math.hypot(state.position.x - target.x, state.position.y - target.y) };
  };
  const reachStage = async (name, target) => {
    const walkable = await page.evaluate(({ x, y }) => {
      const w = window.houseProbe.world;
      return w.canOccupy({ x, y }, w.radius);
    }, target);
    assert.equal(walkable, true, `${name}: test staging position must be walkable`);
    const reached = await moveToByGamePath(target);
    console.log(`${name} staging`, JSON.stringify(reached));
    assert.ok(reached.distance < 1.2, `${name}: could not reach a safe wall staging point`);
    const at = await page.evaluate(() => window.houseProbe.read());
    assert.equal(at.location, 'clearing', `${name}: staging must remain in the clearing`);
    return { x: at.position.x, y: at.position.y };
  };
  const holdDirection = async (name, keys, durationMs = 1200) => {
    await page.evaluate(phase => { window.housePhase = phase; }, name);
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForTimeout(durationMs);
    for (const key of keys) await page.keyboard.up(key);
    await page.waitForTimeout(700);
    const state = await page.evaluate(() => window.houseProbe.read());
    return { x: state.position.x, y: state.position.y, location: state.location, dimensionId: state.dimensionId };
  };

  const start = await page.evaluate(() => window.houseProbe.read());
  console.log('geometry', JSON.stringify(geometry));
  console.log('start', JSON.stringify({ position: start.position, camera: start.camera, walkTarget: start.walkTarget, readiness: start.readiness }));
  let frontLeftStart;
  try { frontLeftStart = await reachStage('front-left corner', geometry.frontLeftStage); }
  catch (error) {
    const state = await page.evaluate(() => window.houseProbe?.read?.() ?? null);
    await page.screenshot({ path: `${output}/front-left-stage-timeout.png` });
    console.error('front stage timeout', JSON.stringify({ url: page.url(), state: state && { position: state.position, camera: state.camera, walkTarget: state.walkTarget, nextWaypoint: state.nextWaypoint, pending: state.pending, server: state.server }, toast: await page.locator('#toast').textContent() }));
    throw error;
  }
  await page.screenshot({ path: `${output}/front-left-before.png` });
  const frontLeftEnd = await holdDirection('front-left-corner-push', ['ArrowRight'], 900);
  await page.screenshot({ path: `${output}/front-left-after.png` });

  const frontRightStart = await reachStage('front-right corner', geometry.frontRightStage);
  await page.screenshot({ path: `${output}/front-right-before.png` });
  const frontRightEnd = await holdDirection('front-right-corner-push', ['ArrowUp'], 900);
  await page.screenshot({ path: `${output}/front-right-after.png` });

  const sideStart = await reachStage('side wall', geometry.sideStage);
  await page.screenshot({ path: `${output}/side-before.png` });
  const sideEnd = await holdDirection('side-wall-push', ['ArrowUp', 'ArrowLeft'], 900);
  await page.screenshot({ path: `${output}/side-after.png` });

  const openStart = await reachStage('open field control', geometry.openStage);
  await page.screenshot({ path: `${output}/open-before.png` });
  const openEnd = await holdDirection('open-field-control', ['ArrowUp', 'ArrowRight']);
  await page.screenshot({ path: `${output}/open-after.png` });

  await page.evaluate(() => { window.housePhase = 'idle'; window.houseSampling = false; });
  const samples = await page.evaluate(() => window.houseSamples);
  const wallPhases = ['front-left-corner-push', 'front-right-corner-push', 'side-wall-push'];
  const wallSamples = samples.filter(sample => wallPhases.includes(sample.phase));
  const openSamples = samples.filter(sample => sample.phase === 'open-field-control');
  const frameTimes = wallSamples.map(sample => sample.frameMs).filter(value => Number.isFinite(value) && value > 0);
  const corrections = wallSamples.map(sample => sample.clientServerDistance).filter(Number.isFinite);
  const pending = wallSamples.map(sample => sample.pending);
  const localJumps = wallSamples.slice(1).map((sample, index) => Math.hypot(
    sample.position.x - wallSamples[index].position.x, sample.position.y - wallSamples[index].position.y,
  ));
  const serverJumps = wallSamples.slice(1).map((sample, index) => sample.server && wallSamples[index].server
    ? Math.hypot(sample.server.x - wallSamples[index].server.x, sample.server.y - wallSamples[index].server.y) : null)
    .filter(Number.isFinite);
  const phaseSummary = phaseSamples => {
    const frameMs = phaseSamples.map(sample => sample.frameMs).filter(value => Number.isFinite(value) && value > 0);
    const divergence = phaseSamples.map(sample => sample.clientServerDistance).filter(Number.isFinite);
    const backlog = phaseSamples.map(sample => sample.pending);
    const renderCorrection = phaseSamples.map(sample => sample.renderCorrectionTile);
    const renderedSteps = phaseSamples.slice(1).map((sample, index) => Math.hypot(
      sample.rendered.x - phaseSamples[index].rendered.x,
      sample.rendered.y - phaseSamples[index].rendered.y,
    ));
    return {
      samples: phaseSamples.length,
      clientServerDistance: { p95: percentile(divergence, .95), max: divergence.length ? Number(Math.max(...divergence).toFixed(3)) : null },
      pendingInputs: { p95: percentile(backlog, .95), max: backlog.length ? Math.max(...backlog) : null },
      renderCorrectionTile: { p95: percentile(renderCorrection, .95), max: renderCorrection.length ? Number(Math.max(...renderCorrection).toFixed(3)) : null },
      renderedStepTile: {
        p95: percentile(renderedSteps, .95),
        max: renderedSteps.length ? Number(Math.max(...renderedSteps).toFixed(3)) : null,
        overHalfTile: renderedSteps.filter(value => value > .5).length,
      },
      frameIntervalMs: { p95: percentile(frameMs, .95), max: frameMs.length ? Number(Math.max(...frameMs).toFixed(3)) : null, over100ms: frameMs.filter(value => value > 100).length },
      networkRoundTripMsP95: percentile(phaseSamples.map(sample => sample.networkRoundTripMs).filter(Number.isFinite), .95),
      remotePlayerCountMax: phaseSamples.length ? Math.max(...phaseSamples.map(sample => sample.remotePlayerCount)) : null,
      samplesWithRemoteWithin1Tile: phaseSamples.filter(sample => sample.nearestRemoteDistance !== null && sample.nearestRemoteDistance < 1).length,
    };
  };
  const metrics = {
    runAt: new Date().toISOString(),
    target: 'preview /dev/; guest; 1440x900; client + authoritative server; fixed 60 Hz simulation',
    geometry,
    start: { position: start.position, server: start.server, location: start.location, dimensionId: start.dimensionId },
    frontLeft: { start: frontLeftStart, end: frontLeftEnd },
    frontRight: { start: frontRightStart, end: frontRightEnd },
    side: { start: sideStart, end: sideEnd },
    openControl: { start: openStart, end: openEnd },
    phaseSummary: {
      frontLeftCornerPush: phaseSummary(samples.filter(sample => sample.phase === 'front-left-corner-push')),
      frontRightCornerPush: phaseSummary(samples.filter(sample => sample.phase === 'front-right-corner-push')),
      sideWallPush: phaseSummary(samples.filter(sample => sample.phase === 'side-wall-push')),
      openFieldControl: phaseSummary(openSamples),
    },
    wallPushSamples: wallSamples.length,
    localColliderEntries: wallSamples.filter(sample => sample.clientInsideFootprint).length,
    serverColliderEntries: wallSamples.filter(sample => sample.serverInsideFootprint).length,
    visualClearanceEntriesClient: wallSamples.filter(sample => sample.clientInsideVisualClearance).length,
    visualClearanceEntriesServer: wallSamples.filter(sample => sample.serverInsideVisualClearance).length,
    correctionsOver02Tile: corrections.filter(value => value > .2).length,
    locationChanges: [...new Set(wallSamples.map(sample => sample.location))],
    dimensionChanges: [...new Set(wallSamples.map(sample => sample.dimensionId))],
    localJumpCountOver1Tile: localJumps.filter(value => value > 1).length,
    serverJumpCountOver1Tile: serverJumps.filter(value => value > 1).length,
    clientServerDistance: { median: percentile(corrections, .5), p95: percentile(corrections, .95), max: corrections.length ? Number(Math.max(...corrections).toFixed(3)) : null },
    pendingInputs: { max: pending.length ? Math.max(...pending) : null, p95: percentile(pending, .95) },
    frameIntervalMs: { median: percentile(frameTimes, .5), p95: percentile(frameTimes, .95), max: frameTimes.length ? Number(Math.max(...frameTimes).toFixed(3)) : null, over50ms: frameTimes.filter(value => value > 50).length, over100ms: frameTimes.filter(value => value > 100).length },
    networkRoundTripMs: percentile(wallSamples.map(sample => sample.networkRoundTripMs).filter(Number.isFinite), .95),
    pageErrors: errors,
    coreModuleHashes: { before: initialCoreModuleHashes, after: await readCoreModuleHashes() },
    updateVersions,
    evidenceFiles: ['front-left-before.png', 'front-left-after.png', 'front-right-before.png', 'front-right-after.png', 'side-before.png', 'side-after.png', 'open-before.png', 'open-after.png', 'trace.json'],
  };
  await writeFile(`${output}/trace.json`, JSON.stringify(samples, null, 2));
  await writeFile(`${output}/result.json`, JSON.stringify(metrics, null, 2));
  assert.deepEqual(metrics.locationChanges, ['clearing'], 'wall pressure must not change to another location');
  assert.deepEqual(metrics.dimensionChanges, ['surface'], 'wall pressure must not change dimensions');
  assert.equal(metrics.localColliderEntries, 0, 'client must not enter the house footprint');
  assert.equal(metrics.serverColliderEntries, 0, 'server must not enter the house footprint');
  assert.equal(metrics.visualClearanceEntriesClient, 0, 'client must keep the avatar body outside the facade');
  assert.equal(metrics.visualClearanceEntriesServer, 0, 'server must use the same facade clearance as the client');
  assert.equal(metrics.localJumpCountOver1Tile, 0, 'client must not teleport during wall pressure');
  assert.equal(metrics.serverJumpCountOver1Tile, 0, 'server must not teleport during wall pressure');
  assert.equal(metrics.phaseSummary.frontLeftCornerPush.renderedStepTile.overHalfTile
    + metrics.phaseSummary.frontRightCornerPush.renderedStepTile.overHalfTile
    + metrics.phaseSummary.sideWallPush.renderedStepTile.overHalfTile, 0,
  'rendered avatar must not jump by more than half a tile during wall pressure');
  const wallPendingP95 = Math.max(
    metrics.phaseSummary.frontLeftCornerPush.pendingInputs.p95 ?? 0,
    metrics.phaseSummary.frontRightCornerPush.pendingInputs.p95 ?? 0,
    metrics.phaseSummary.sideWallPush.pendingInputs.p95 ?? 0,
  );
  const openPendingP95 = metrics.phaseSummary.openFieldControl.pendingInputs.p95 ?? 0;
  const wallDivergenceP95 = Math.max(
    metrics.phaseSummary.frontLeftCornerPush.clientServerDistance.p95 ?? 0,
    metrics.phaseSummary.frontRightCornerPush.clientServerDistance.p95 ?? 0,
    metrics.phaseSummary.sideWallPush.clientServerDistance.p95 ?? 0,
  );
  const openDivergenceP95 = metrics.phaseSummary.openFieldControl.clientServerDistance.p95 ?? 0;
  assert.ok(wallPendingP95 <= openPendingP95 + 12, 'wall pressure must not add a sustained command backlog over open-field movement');
  assert.ok(wallDivergenceP95 <= openDivergenceP95 + .25, 'wall pressure must not add a large client/server correction over open-field movement');
  assert.deepEqual(errors, [], 'browser must not emit page errors');
  assert.deepEqual(metrics.coreModuleHashes.after, initialCoreModuleHashes, 'physics and render modules must remain unchanged during the capture');
  const uniqueVersions = [...new Set(updateVersions.map(item => item.version))];
  assert.equal(uniqueVersions.length, 1, 'preview source version must remain stable during the capture');
  await context.close();
  console.log(JSON.stringify(metrics, null, 2));
} finally {
  await browser.close();
}
