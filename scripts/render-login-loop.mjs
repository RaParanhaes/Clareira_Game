import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'game/art/clareira-login-loop-v3.mp4');
const evidence = path.join(root, 'logs/login-animation-fix/render');
await mkdir(evidence, { recursive: true });
let html = await readFile(path.join(root, 'art-source/login-scene/loop-v3.html'), 'utf8');
for (const name of ['clareira-login-vila-v1.webp', 'clareira-login-vila-v2.webp']) {
  const data = await readFile(path.join(root, 'game/art', name));
  html = html.replaceAll(`/dev/art/${name}`, `data:image/webp;base64,${data.toString('base64')}`);
}
const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  args: ['--no-sandbox'],
});
let encoder;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await Promise.all([...document.images].map(image => image.decode()));
    await Promise.all([...document.querySelectorAll('svg image')].map(image => new Promise((resolve, reject) => {
      const loader = new Image(); loader.onload = resolve; loader.onerror = reject;
      loader.src = image.getAttribute('href');
    })));
    window.loopAnimations = document.getAnimations();
    for (const animation of window.loopAnimations) { animation.pause(); animation.currentTime = 0; }
  });
  const seek = async time => {
    await page.evaluate(time => {
      for (const animation of window.loopAnimations) animation.currentTime = time;
    }, time);
  };
  for (const time of [0, 1000, 2500, 7500, 15000, 30000]) {
    await seek(time);
    await page.screenshot({ path: path.join(evidence, `frame-${time}.png`) });
  }
  if (process.argv.includes('--preview')) process.exitCode = 0;
  else {
    encoder = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'image2pipe', '-framerate', '30', '-vcodec', 'mjpeg', '-i', 'pipe:0',
      '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '21', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', '-r', '30', output], { stdio: ['pipe', 'ignore', 'pipe'] });
    let encoderError = '';
    encoder.stderr.on('data', chunk => { encoderError += chunk; });
    encoder.stdin.on('error', () => {});
    const completed = once(encoder, 'close');
    for (let frame = 0; frame < 900; frame++) {
      await seek(frame * 1000 / 30);
      const pixels = await page.screenshot({ type: 'jpeg', quality: 95 });
      if (!encoder.stdin.write(pixels)) await once(encoder.stdin, 'drain');
      if (frame % 90 === 0) console.log(JSON.stringify({ frame, frames: 900 }));
    }
    encoder.stdin.end();
    const [code] = await completed;
    if (code !== 0) throw new Error(`Video encoder failed (${code}): ${encoderError}`);
    await writeFile(path.join(evidence, 'render.json'), JSON.stringify({ output, frames: 900, fps: 30, durationSeconds: 30, width: 1280, height: 720 }, null, 2));
    console.log(JSON.stringify({ output, frames: 900, fps: 30, seconds: 30 }));
  }
} finally {
  await browser.close();
  if (encoder && encoder.exitCode === null) encoder.kill('SIGTERM');
}
