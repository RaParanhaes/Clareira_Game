import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import WebSocket from 'ws';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createPrototypeServer } from './prototype-server.mjs';

// Real renderer + isolated authoritative room: no load bots on the public preview.
const output = process.argv[2] || 'logs/spawn-performance-browser';
await mkdir(output, { recursive: true });
const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-spawn-'));
const origin = 'https://spawn-test.invalid';
const room = createPrototypeServer({ port: 0, stateDirectory, databaseUrl: null, redisUrl: null,
  arrivalTutorialEnabled: false, allowedOrigin: origin,
  resolveSession: async id => ({ profile: { id, displayName: id, guest: true } }),
});
const address = await room.listen();
const sockets = [];
const connect = id => {
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/room`, {
    headers: { origin, cookie: `clareira_session=${id}` },
  });
  sockets.push(socket);
  return socket;
};
let browser;
const results = [];
try {
  for (let i = 0; i < 9; i++) {
    const socket = connect(`spawn-bot-${i}`);
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    socket.on('message', raw => {
      const state = JSON.parse(raw);
      if (state.objectCatalog) socket.send(JSON.stringify({ type: 'objectCatalogReady', revision: state.objectCatalog.revision }));
    });
    socket.send(JSON.stringify({ type: 'join', compactWorld: 1, compactPlayers: 1 }));
  }
  browser = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome', args: ['--no-sandbox'] });
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    console.log(`${name}: loading`);
    const context = await browser.newContext({ viewport, isMobile: name === 'mobile', hasTouch: name === 'mobile' });
    const page = await context.newPage();
    const errors = [];
    let viewerSocket;
    page.on('pageerror', error => errors.push(error.message));
    await page.routeWebSocket('**/dev/room', route => {
      const upstream = connect(`spawn-view-${name}`), pending = [];
      viewerSocket = upstream;
      upstream.on('open', () => { for (const message of pending) upstream.send(message); pending.length = 0; });
      upstream.on('message', raw => route.send(raw.toString()));
      upstream.on('error', error => errors.push(error.message));
      route.onMessage(message => upstream.readyState === WebSocket.OPEN ? upstream.send(message) : pending.push(message));
      route.onClose(() => upstream.close());
    });
    await page.goto('https://vmi3579939.contaboserver.net/dev/?profile=1', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#scene-loading', { state: 'hidden', timeout: 180000 });
    await page.locator('#guest-form button[type=submit]').click();
    await page.waitForSelector('.shell.is-authenticated');
    await page.evaluate(async () => { window.spawnGame = await import('/dev/main.js'); });
    await page.waitForFunction(() => window.spawnGame.inspectMovement().readiness.sceneReady, null, { timeout: 90000 });
    console.log(`${name}: scene ready`);
    await page.waitForTimeout(2000);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.start');
    await page.evaluate(() => window.spawnGame.inspectPerformance(true));
    await page.waitForTimeout(6000);
    const before = await page.evaluate(() => window.spawnGame.inspectMovement().position);
    await page.locator('#world').focus();
    await page.keyboard.down('KeyS'); await page.waitForTimeout(1000); await page.keyboard.up('KeyS');
    const after = await page.evaluate(() => window.spawnGame.inspectMovement().position);
    const metrics = await page.evaluate(() => window.spawnGame.inspectPerformance());
    const { profile } = await cdp.send('Profiler.stop');
    await writeFile(`${output}/${name}.cpuprofile`, JSON.stringify(profile));
    const nodes = new Map(profile.nodes.map(node => [node.id, node])), cpu = {};
    profile.samples.forEach((id, index) => {
      const frame = nodes.get(id).callFrame;
      const key = `${frame.functionName} ${frame.url}:${frame.lineNumber + 1}`;
      cpu[key] = (cpu[key] || 0) + profile.timeDeltas[index] / 1000;
    });
    const result = { name, metrics, cpuTop: Object.entries(cpu).sort((a,b) => b[1]-a[1]).slice(0,20), errors, movement: Math.hypot(after.x - before.x, after.y - before.y) };
    results.push(result);
    await page.screenshot({ path: `${output}/${name}.png` });
    await writeFile(`${output}/result.json`, JSON.stringify(results, null, 2));
    assert.deepEqual(errors, []);
    assert.ok(metrics.livePlayers >= 10, `Expected 10 visible players, got ${metrics.livePlayers}`);
    assert.ok(result.movement > .1, 'WASD moves the player');
    await context.close();
    viewerSocket?.terminate();
  }
} finally {
  await browser?.close();
  for (const socket of sockets) socket.terminate();
  await room.close();
  await rm(stateDirectory, { recursive: true, force: true });
}
console.log(JSON.stringify(results));
