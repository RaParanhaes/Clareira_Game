import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { createPreviewServer } from './dev-preview-page.mjs';
import { createPrototypeServer } from './prototype-server.mjs';

const output = path.resolve(process.argv[2] || 'logs/arrival-cinematic-browser');
await mkdir(output, { recursive: true });
const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-arrival-cinematic-'));
const probe = http.createServer();
await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
const pagePort = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const base = `http://127.0.0.1:${pagePort}`;
  const preview = createPreviewServer({ port: pagePort, stateDirectory, allowedOrigin: base });
  const room = createPrototypeServer({ port: 0, stateDirectory, allowedOrigin: base });
  let browser;
try {
  await preview.listen();
  const roomAddress = await room.listen();
  browser = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome', args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    const serviceWorker = { controller: {}, ready: Promise.resolve({}), register: async () => ({}), addEventListener() {}, removeEventListener() {} };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker });
    document.addEventListener('DOMContentLoaded',()=>{
      const screen=document.querySelector('#scene-loading');
      window.__arrivalHandoff={};
      new MutationObserver(()=>{
        if(!screen.hidden && screen.dataset.phase==='complete') {
          const r=document.querySelector('.loading-layout .loading-wordmark').getBoundingClientRect();
          if(r.width)window.__arrivalHandoff.source={x:r.x,y:r.y,width:r.width};
        } else if(screen.hidden && window.__arrivalHandoff.source && !window.__arrivalHandoff.target) {
          const brand=document.querySelector('.arrival-sky-brand');
          const r=brand?.querySelector('.loading-wordmark')?.getBoundingClientRect();
          if(r?.width && !brand.hidden)window.__arrivalHandoff.target={x:r.x,y:r.y,width:r.width};
        }
      }).observe(screen,{attributes:true,attributeFilter:['hidden','data-phase']});
    },{once:true});
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  const guest = await context.request.post(`${base}/auth/guest`, { headers: { origin: base } });
  assert.equal(guest.status(), 201, await guest.text());
  const token = guest.headers()['set-cookie']?.match(/clareira_session=([^;]+)/)?.[1];
  assert.ok(token, 'the isolated guest account receives a session');
  await page.route('**/dev/**', async route => {
    const requestUrl = new URL(route.request().url());
    const targetPath = requestUrl.pathname.replace(/^\/dev(?=\/)/u, '') || '/';
    try {
      const response = await route.fetch({ url: `${base}${targetPath}${requestUrl.search}` });
      await route.fulfill({ response });
    } catch (error) {
      errors.push(error.message);
      await route.abort();
    }
  });
  const emptyManifest = JSON.stringify({ version: createHash('sha256').update('[]').digest('hex'), files: [] });
  await page.route('**/dev/update-version', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:JSON.parse(emptyManifest).version})}));
  await page.route('**/dev/game-assets', route => route.fulfill({ status: 200,
    contentType: 'application/json', body: emptyManifest }));
  await page.routeWebSocket('**/dev/room', socket => {
    const queued = [];
    const upstream = new WebSocket(`ws://127.0.0.1:${roomAddress.port}/room`, { headers: { origin: base, cookie: `clareira_session=${token}` } });
    socket.onMessage(message => { if (upstream.readyState === WebSocket.OPEN) upstream.send(message); else queued.push(message); });
    upstream.on('open', () => queued.forEach(message => upstream.send(message)));
    upstream.on('message', message => { try { socket.send(message.toString()); } catch {} });
    upstream.on('error', error => errors.push(error.message));
    socket.onClose(() => upstream.close());
  });

  await page.goto(`${base}/dev/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.shell.is-authenticated', { timeout: 20_000 }).catch(async error => {
    console.error('ARRIVAL_BROWSER_STARTUP', JSON.stringify({ errors, cookies: await context.cookies(),
      sessionStatus: (await context.request.get(`${base}/dev/auth/me`)).status(),
      body: (await page.locator('body').innerText()).slice(0, 1200) }));
    throw error;
  });
  const inspect = () => page.evaluate(async () => {
    const state = (await import('/dev/main.js')).inspectMovement();
    return { dimensionId: state.dimensionId, age: state.arrivalCinematicAgeMs, camera: state.camera, avatar: state.rendered,
      skyAge:state.arrivalSkyAgeMs,shake:state.arrivalImpactOffset,audio:state.arrivalAudio,visible: state.arrivalAvatarVisible, ignition: state.arrivalFlameIntensity, fire: state.firePositions[0], raysLoaded: state.campfireSkyRaysLoaded,
      loading: state.loading, readiness: state.readiness };
  });
  let readyState = null;
  for (let attempt = 0; attempt < 600; attempt += 1) {
    readyState = await inspect();
    if (readyState.dimensionId?.startsWith('arrival-') && readyState.readiness.sceneReady && !readyState.readiness.loading) break;
    await page.waitForTimeout(100);
  }
  assert.ok(readyState?.readiness.sceneReady && !readyState.readiness.loading,
    `the arrival scene becomes ready before camera sampling: ${JSON.stringify(readyState)}`);
  const samples = [];
  const captureAt = async (age, filename) => {
    let sample = null;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      sample = await inspect();
      if (Number.isFinite(sample.age) && sample.age >= age) break;
      await page.waitForTimeout(40);
    }
    assert.ok(Number.isFinite(sample?.age) && sample.age >= age,
      `arrival cinematic reaches ${age} ms before capture: ${JSON.stringify(sample)}`);
    samples.push(sample);
    await page.screenshot({ path: path.join(output, filename) });
  };

  // Unlock playback with a real pointer gesture, as required by browser audio policy.
  await page.evaluate(()=>document.addEventListener('pointerdown',()=>{
    const button=document.querySelector('#sound-toggle');if(button.getAttribute('aria-pressed')!=='true')button.click();
  },{once:true}));
  await page.mouse.click(5,450);
  await captureAt(-6500,'sky-01-logo.png');
  const skyLogo=samples.pop();assert.equal(skyLogo.visible,false);assert.equal(skyLogo.ignition,0);
  const handoff=await page.evaluate(()=>window.__arrivalHandoff);
  assert.ok(handoff.source && handoff.target, `loading and sky logos are both visible at handoff: ${JSON.stringify(handoff)}`);
  for(const key of ['x','y','width'])assert.ok(Math.abs(handoff.source[key]-handoff.target[key])<1.5, `logo ${key} must not jump: ${JSON.stringify(handoff)}`);
  assert.equal(await page.locator('#scene-loading').isVisible(),false);
  assert.equal(await page.locator('.arrival-sky-brand').isVisible(),true);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
  await page.screenshot({path:path.join(output,'sky-01-mobile.png')});
  await page.setViewportSize({width:1440,height:900});
  await captureAt(-2900,'sky-02-stars.png');samples.pop();
  await captureAt(-900,'sky-03-descent.png');samples.pop();
  await captureAt(450, '00-unlit-hearth.png');
  const unlit=samples.pop();
  assert.equal(unlit.ignition,0,'the hearth has no flame before the bolt arrives');
  assert.equal(unlit.visible,false);
  await captureAt(900, '01-ray-focus.png');
  await captureAt(1220, '02-lightning-impact.png');
  await captureAt(1750, '03-fire-focus.png');
  await captureAt(2200, '04-avatar-reveal-pan.png');
  await captureAt(3500, '05-avatar-centered.png');
  const [ray, projection, fire, reveal, centered] = samples;
  console.log('ARRIVAL_CINEMATIC_SAMPLES', JSON.stringify(samples));
  if (!ray.raysLoaded) console.log('ARRIVAL_CINEMATIC_NETWORK_ERRORS', JSON.stringify(errors));
  assert.ok(ray.raysLoaded, 'the chosen lightning atlas loads in the arrival scene');
  assert.ok(Math.hypot(ray.camera.x - ray.fire.x, ray.camera.y - ray.fire.y) < 1.1,
    `the camera is centered on the ray impact at 900 ms: ${JSON.stringify(ray)}`);
  assert.ok(Math.hypot(projection.camera.x - projection.fire.x, projection.camera.y - projection.fire.y) < 1.1,
    'the expanding lightning projection stays centered on the impact');
  assert.equal(ray.ignition,0,'lightning precedes ignition');
  assert.equal(fire.ignition,1,'the fire is established before avatar reveal');
  assert.equal(ray.visible, false, 'the avatar is not shown during the ray and fire focus');
  assert.ok(Math.hypot(fire.camera.x - fire.fire.x, fire.camera.y - fire.fire.y) < 1.1,
    'the camera remains on the fire while it ignites');
  assert.ok(projection.shake&&Math.hypot(projection.shake.x,projection.shake.y)>0,'ground shakes after impact');
  assert.equal(reveal.audio.running,true,'audio context runs after the user gesture');
  assert.equal(reveal.audio.chargePlayed,true,'the bolt has an electrical onset');
  assert.equal(reveal.audio.impactPlayed,true,'the ground contact plays its thunder');
  assert.equal(reveal.visible, true, 'the avatar appears after the fire focus');
  assert.ok(Math.hypot(reveal.camera.x - reveal.avatar.x, reveal.camera.y - reveal.avatar.y)
    < Math.hypot(fire.camera.x - reveal.avatar.x, fire.camera.y - reveal.avatar.y),
  'the camera starts moving toward the revealed avatar');
  assert.ok(Math.hypot(centered.camera.x - centered.avatar.x, centered.camera.y - centered.avatar.y) < .7,
    `the camera recenters on the avatar: ${JSON.stringify(centered)}`);
  await captureAt(5000, '06-tutorial-desktop.png');
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(500);
  await page.screenshot({path:path.join(output,'07-tutorial-mobile.png')});
  await page.setViewportSize({width:1440,height:900});
  await page.waitForTimeout(300);
  const avatarLight = () => page.evaluate(async () => {
    const s=(await import('/dev/main.js')).inspectMovement(),p=s.projection;
    const canvas=document.querySelector('#world'),rect=canvas.getBoundingClientRect();
    const x=p.centerX+((s.rendered.x-s.camera.x)-(s.rendered.y-s.camera.y))*p.tileX;
    const y=p.centerY+((s.rendered.x-s.camera.x)+(s.rendered.y-s.camera.y))*p.tileY;
    const ratio=canvas.width/rect.width;
    const pixels=canvas.getContext('2d').getImageData(Math.round((x-8*p.spriteScale)*ratio),Math.round((y-35*p.spriteScale)*ratio),Math.round(16*p.spriteScale*ratio),Math.round(28*p.spriteScale*ratio)).data;
    let light=0;for(let i=0;i<pixels.length;i+=4)light+=pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;
    return {light:light/(pixels.length/4),distance:Math.hypot(s.rendered.x-s.firePositions[0].x,s.rendered.y-s.firePositions[0].y)};
  });
  const far=await avatarLight();
  await page.screenshot({path:path.join(output,'08-avatar-far.png')});
  const approach=async()=>{
  const destination=await page.evaluate(async()=>{
    const s=(await import('/dev/main.js')).inspectMovement(),p=s.projection,f=s.firePositions[0];
    const rect=document.querySelector('#world').getBoundingClientRect();
    const x=f.x+2,y=f.y+1;
    return {x:rect.x+p.centerX+((x-s.camera.x)-(y-s.camera.y))*p.tileX,
      y:rect.y+p.centerY+((x-s.camera.x)+(y-s.camera.y))*p.tileY};
  });
  await page.mouse.click(destination.x,destination.y);
  };
  await approach();
  let near=far;
  for(let step=0;step<100;step++){
    await page.waitForTimeout(100);near=await avatarLight();if(near.distance<3)break;
    if(step>0&&step%20===0)await approach();
  }
  await page.waitForTimeout(400);near=await avatarLight();
  await page.screenshot({path:path.join(output,'09-avatar-near.png')});
  assert.ok(near.distance<3,`player approaches the hearth: ${JSON.stringify({far,near})}`);
  assert.ok(near.light>far.light*1.3,`fire progressively lights the approaching avatar: ${JSON.stringify({far,near})}`);
  console.log('ARRIVAL_LIGHT_DISTANCE',JSON.stringify({unlit,far,near}));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ samples, screenshots: output, errors }));
  await context.close();
} finally {
  await browser?.close();
  await room.close();
  await preview.close();
  await rm(stateDirectory, { recursive: true, force: true });
}
