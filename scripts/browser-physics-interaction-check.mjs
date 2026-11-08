import WebSocket from 'ws';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createPreviewServer } from './dev-preview-page.mjs';
import { createPrototypeServer } from './prototype-server.mjs';
import { createAccountStore } from './account-store.mjs';

const output = process.argv[2] || 'logs/physics-interaction-validation-20261018-04a14fd8';
const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-physics-'));
await mkdir(output, { recursive: true });
const base = 'http://127.0.0.1:19562';
const preview = createPreviewServer({ port: 19562, stateDirectory: directory, allowedOrigin: base });
const room = createPrototypeServer({ port: 19563, stateDirectory: directory, allowedOrigin: base });
const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  headless: true,
  args: ['--no-sandbox'],
});
let context;
let page;
let video;
let videoSaved = false;

try {
  await preview.listen();
  await room.listen();
  const accounts = createAccountStore({ directory });
  const account = await accounts.register({ username: 'physics_visual', password: 'SafeFixture7!pass' });
  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: output, size: { width: 1440, height: 900 } },
  });
  page = await context.newPage();
  video = page.video();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('websocket', socket => {
    socket.on('framesent', event => {
      try {
        const payload = JSON.parse(event.payload);
        if (payload.type === 'input') console.log(JSON.stringify({ phase: 'sent-input', commands: payload.commands }));
      } catch {}
    });
  });
  await context.addCookies([{
    name: 'clareira_session', value: account.token, url: `${base}/dev/`, httpOnly: true, sameSite: 'Strict',
  }]);
  await page.route('**/dev/**', async route => {
    try {
      const response = await route.fetch({
        url: route.request().url().replace('/dev/', '/'),
        headers: { ...route.request().headers(), cookie: `clareira_session=${account.token}` },
      });
      await route.fulfill({ response });
    } catch (error) {
      if (!page.isClosed() && !/Target page, context or browser has been closed/.test(error.message)) {
        errors.push(`preview route: ${error.message}`);
      }
      await route.abort().catch(() => {});
    }
  });
  await page.routeWebSocket('**/dev/room', socket => {
    const upstream = new WebSocket('ws://127.0.0.1:19563/room', {
      headers: { origin: base, cookie: `clareira_session=${account.token}` },
    });
    const queued = [];
    socket.onMessage(message => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(message);
      else queued.push(message);
    });
    upstream.on('open', () => queued.forEach(message => upstream.send(message)));
    upstream.on('message', message => { try { socket.send(message.toString()); } catch {} });
    upstream.on('error', error => errors.push(error.message));
    socket.onClose(() => upstream.close());
  });

  await page.goto(`${base}/dev/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.shell')?.classList.contains('is-authenticated')
    && document.querySelector('#scene-loading')?.hidden);
  await page.evaluate(async () => {
    const [main, world, elevation, buildingDepth, villageBuildings] = await Promise.all([
      import('/dev/main.js'), import('/dev/world.mjs'), import('/dev/elevation.mjs'),
      import('/dev/building-depth.mjs'), import('/dev/village-buildings.mjs'),
    ]);
    window.physicsCheck = { inspect: main.inspectMovement, world, elevation, buildingDepth, villageBuildings };
  });
  await page.waitForFunction(() => window.physicsCheck.inspect().readiness.connected
    && window.physicsCheck.inspect().server);
  const inspect = () => page.evaluate(() => window.physicsCheck.inspect());
  const world = await page.evaluate(() => ({
    spawn: { ...window.physicsCheck.world.SPAWN },
    bounds: { ...window.physicsCheck.world.SHELTER_BOUNDS },
    door: { ...window.physicsCheck.world.CLEARING_DOOR },
    radius: window.physicsCheck.world.PLAYER_RADIUS,
  }));

  await page.screenshot({ path: `${output}/01-spawn-and-campfire.png` });
  const beforeCollect = await inspect();
  const targetDiagnostics = await page.evaluate(state => {
    const branch = state.resourceNodes.find(resource => resource.id === 'sturdy-branch-start') || null;
    return {
      position: { ...state.position }, branch,
      branchDistance: branch ? Math.hypot(state.position.x - branch.x, state.position.y - branch.y) : null,
      branchPathClear: branch && window.physicsCheck.world.hasClearInteractionPath(
        state.position, branch, { fires: state.firePositions },
      ),
      selectedResource: window.physicsCheck.world.nearestCollectible(
        state.position, state.resourceNodes, state.inventory, 1.2, state.firePositions,
      ),
      nearbyResources: state.resourceNodes.filter(resource =>
        Math.hypot(state.position.x - resource.x, state.position.y - resource.y) <= 1.2),
    };
  }, beforeCollect);
  console.log(JSON.stringify({ phase: 'before-collect', targetDiagnostics, inventory: beforeCollect.inventory }));
  const selectedResource = targetDiagnostics.selectedResource;
  assert.ok(selectedResource, 'the player has a nearby collectible');
  assert.ok(Math.hypot(beforeCollect.position.x - selectedResource.x, beforeCollect.position.y - selectedResource.y) <= 1.2,
    'the selected collectible is within action reach');
  await page.evaluate(() => {
    window.collectDispatchDurations = [];
    window.addEventListener('keydown', event => {
      if (event.key.toLowerCase() !== 'e') return;
      const startedAt = performance.now();
      queueMicrotask(() => window.collectDispatchDurations.push(performance.now() - startedAt));
    }, true);
  });
  await page.locator('#world').focus();
  await page.keyboard.press('e');
  await page.waitForTimeout(900);
  const collectDispatchMs = await page.evaluate(() => window.collectDispatchDurations.at(-1) ?? null);
  assert.ok(Number.isFinite(collectDispatchMs) && collectDispatchMs < 100,
    `collect input must not block the browser main thread (${collectDispatchMs} ms)`);
  const branchAfter = await inspect();
  console.log(JSON.stringify({ phase: 'after-collect', collectDispatchMs, location: branchAfter.location,
    inventory: branchAfter.inventory,
    nearbyResources: branchAfter.resourceNodes.filter(resource =>
      Math.hypot(branchAfter.position.x - resource.x, branchAfter.position.y - resource.y) <= 1.2),
    toast: await page.locator('#toast').textContent().catch(() => '') }));
  await page.screenshot({ path: `${output}/02-nearby-resource-collected.png` });
  const inventoryChange = Object.keys(beforeCollect.inventory).filter(key =>
    Number.isFinite(beforeCollect.inventory[key]) && Number.isFinite(branchAfter.inventory[key])
      && branchAfter.inventory[key] > beforeCollect.inventory[key]);
  assert.ok(inventoryChange.length, 'collect updates inventory for the nearby target');

  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1350);
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(350);
  const wallState = await inspect();
  const canOccupy = await page.evaluate(position =>
    window.physicsCheck.world.canOccupy(position, window.physicsCheck.world.PLAYER_RADIUS), wallState.position);
  assert.equal(canOccupy, true, 'client remains outside the cabin collision');
  assert.ok(wallState.position.x < world.spawn.x - 0.35 && wallState.position.x > world.bounds.right + world.radius - 0.12,
    'movement reaches the cabin wall and stops at its outside edge');
  assert.ok(wallState.server.x > world.bounds.right + world.radius - 0.12,
    'authoritative movement also stays outside the cabin wall');
  await page.screenshot({ path: `${output}/03-cabin-wall-collision.png` });

  const current = await inspect();
  const routeDiagnostics = await page.evaluate(start => {
    const physics = window.physicsCheck.world;
    const trees = physics.getSolidTreesInBounds({
      left: start.position.x - 9, right: start.position.x + 9,
      top: start.position.y - 9, bottom: start.position.y + 9,
    });
    const tested = trees.map(tree => {
      const occludedByNearbyBuilding = [
        { bounds: physics.SHELTER_BOUNDS },
        ...window.physicsCheck.villageBuildings.VILLAGE_BUILDINGS,
      ].some(building => {
        if (!window.physicsCheck.buildingDepth.buildingTreeDepthAnchor(tree, building.bounds)) return false;
        const bounds = building.bounds;
        const dx = Math.max(bounds.left - tree.x, 0, tree.x - bounds.right);
        const dy = Math.max(bounds.top - tree.y, 0, tree.y - bounds.bottom);
        return Math.hypot(dx, dy) < 2;
      });
      const diagonalOffset = (tree.r + physics.PLAYER_RADIUS + 0.65) / Math.SQRT2;
      const approach = { x: tree.x + diagonalOffset, y: tree.y + diagonalOffset };
      const path = !occludedByNearbyBuilding && physics.canOccupy(approach, physics.PLAYER_RADIUS)
        ? physics.findWalkPath(start.position, approach, [], 'clearing', [], start.firePositions) : [];
      const clearTreePath = physics.hasClearInteractionPath(
        { x: tree.x + diagonalOffset, y: tree.y + diagonalOffset },
        { x: tree.x - diagonalOffset, y: tree.y - diagonalOffset },
        { targetRadius: physics.PLAYER_RADIUS },
      );
      return { tree: { ...tree }, approach, occluded: occludedByNearbyBuilding, pathLength: path.length,
        firstWaypoint: path[0] || null, clearTreePath,
        distance: Math.hypot(start.position.x - approach.x, start.position.y - approach.y) };
    }).filter(candidate => !candidate.occluded && candidate.pathLength > 0 && !candidate.clearTreePath)
      .sort((left, right) => left.distance - right.distance);
    return tested[0] || null;
  }, current);
  assert.ok(routeDiagnostics, 'a visible, reachable tree offers a clear approach');
  const tree = routeDiagnostics.tree;
  const approach = routeDiagnostics.approach;
  const box = await page.locator('#world').boundingBox();
  const height = await page.evaluate(({ x, y }) =>
    window.physicsCheck.elevation.surfaceHeight(x, y, 'clearing'), approach);
  const heightPixels = await page.evaluate(() => window.physicsCheck.elevation.HEIGHT_PIXELS);
  const point = {
    x: box.x + current.projection.centerX + (approach.x - approach.y) * current.projection.tileX
      - Math.round((current.camera.x - current.camera.y) * current.projection.tileX),
    y: box.y + current.projection.centerY + (approach.x + approach.y) * current.projection.tileY
      - Math.round((current.camera.x + current.camera.y) * current.projection.tileY)
      - height * heightPixels * current.projection.spriteScale,
  };
  const screenDiagnostics = await page.evaluate(({ start, target, point, height, heightPixels }) => {
    const physics = window.physicsCheck.world;
    const path = physics.findWalkPath(start.position, target, [], 'clearing', [], start.firePositions);
    const rect = document.querySelector('#world').getBoundingClientRect();
    const screenX = point.x - rect.x - start.projection.centerX;
    const screenY = point.y - rect.y - start.projection.centerY;
    const projectedX = (screenX + Math.round((start.camera.x - start.camera.y) * start.projection.tileX))
      / start.projection.tileX;
    const projectedY = (screenY + Math.round((start.camera.x + start.camera.y) * start.projection.tileY)
      + height * heightPixels * start.projection.spriteScale) / start.projection.tileY;
    const clickTarget = { x: (projectedX + projectedY) / 2, y: (projectedY - projectedX) / 2 };
    const clickPath = physics.findWalkPath(start.position, clickTarget, [], 'clearing', [], start.firePositions);
    return {
      start: { ...start.position }, target: { ...target }, canOccupyTarget: physics.canOccupy(target, physics.PLAYER_RADIUS),
      pathLength: path.length, firstWaypoint: path[0] || null,
      clickTarget, clickPathLength: clickPath.length, clickFirstWaypoint: clickPath[0] || null,
      canvas: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  }, { start: current, target: approach, point, height, heightPixels });
  console.log(JSON.stringify({ phase: 'tree-route', point, routeDiagnostics, screenDiagnostics }));
  await page.mouse.click(point.x, point.y);
  for (let sample = 0; sample < 8; sample += 1) {
    await page.waitForTimeout(250);
    const movement = await inspect();
    console.log(JSON.stringify({ phase: 'tree-route-progress', sample,
      position: movement.position, server: movement.server, walkTarget: movement.walkTarget,
      nextWaypoint: movement.nextWaypoint, walkPath: movement.walkPath,
      movementKeys: movement.movementKeys, ready: movement.readiness, pending: movement.pending }));
  }
  await page.waitForFunction(target => {
    const state = window.physicsCheck.inspect();
    return !state.walkTarget && Math.hypot(state.position.x - target.x, state.position.y - target.y) < 0.45;
  }, approach, { timeout: 10000 });
  const routeState = await inspect();
  const postRouteDiagnostics = await page.evaluate(state => {
    const physics = window.physicsCheck.world;
    return {
      canOccupy: physics.canOccupy(state.position, physics.PLAYER_RADIUS),
      fireDistances: state.firePositions.map(fire => Math.hypot(state.position.x - fire.x, state.position.y - fire.y)),
      fires: state.firePositions.map(fire => ({ ...fire })),
    };
  }, routeState);
  console.log(JSON.stringify({ phase: 'after-tree-click', position: routeState.position,
    server: routeState.server, walkTarget: routeState.walkTarget, nextWaypoint: routeState.nextWaypoint,
    walkPath: routeState.walkPath, movementKeys: routeState.movementKeys,
    pending: routeState.pending, postRouteDiagnostics,
    toast: await page.locator('#toast').textContent().catch(() => '') }));
  await page.screenshot({ path: `${output}/04-tree-route-debug.png` });
  assert.ok(Math.hypot(routeState.position.x - approach.x, routeState.position.y - approach.y) < 0.45,
    'click path reaches a clear approach beside the tree');
  await page.waitForFunction(() => !window.physicsCheck.inspect().walkTarget
    && window.physicsCheck.inspect().pending === 0, null, { timeout: 5000 });
  await page.locator('#world').focus();
  const treeDistances = [];
  await page.keyboard.down('ArrowUp');
  for (let index = 0; index < 16; index += 1) {
    await page.waitForTimeout(90);
    const state = await inspect();
    treeDistances.push({
      client: Math.hypot(state.position.x - tree.x, state.position.y - tree.y),
      server: Math.hypot(state.server.x - tree.x, state.server.y - tree.y),
    });
  }
  await page.keyboard.up('ArrowUp');
  assert.equal(routeDiagnostics.clearTreePath, false, 'tree blocks interaction with a target behind it');
  assert.ok(treeDistances.every(distance => distance.client >= tree.r + world.radius - 0.04),
    'predicted movement never crosses the tree collider');
  assert.ok(treeDistances.every(distance => distance.server >= tree.r + world.radius - 0.04),
    'authoritative movement never crosses the tree collider');
  assert.ok(Math.min(...treeDistances.map(distance => distance.client)) < tree.r + world.radius + 0.2,
    'the avatar reaches the visible tree collider');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${output}/04-tree-collision.png` });

  const results = {
    nearbyResourceCollected: { id: selectedResource.id, kind: selectedResource.kind, inventoryChange, collectDispatchMs },
    cabinWallBlockedClientAndServer: true,
    treeBlockedClientAndServer: true,
    interactionBehindTreeBlocked: routeDiagnostics.clearTreePath === false,
    testedTree: tree.id || { x: tree.x, y: tree.y },
    treeDistanceMinimum: {
      client: Number(Math.min(...treeDistances.map(item => item.client)).toFixed(3)),
      server: Number(Math.min(...treeDistances.map(item => item.server)).toFixed(3)),
    },
    browserErrors: errors,
  };
  await writeFile(`${output}/result.json`, JSON.stringify(results, null, 2));
  await context.close();
  context = null;
  await video.saveAs(`${output}/physics-collision-validation.webm`);
  videoSaved = true;
  console.log(JSON.stringify(results));
} finally {
  if (page) await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
  if (context) await context.close().catch(() => {});
  if (video && !videoSaved) await video.saveAs(`${output}/physics-collision-validation.webm`).catch(() => {});
  await browser.close().catch(() => {});
  await room.close().catch(() => {});
  await preview.close().catch(() => {});
  await rm(directory, { recursive: true, force: true });
}
