import { chromium } from '/opt/clareira-browser/node_modules/playwright-core/index.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve('game');
const output = path.resolve(process.argv[2] || 'game/art/tree-sprites');
const reviewOutput = path.resolve(process.argv[3] || 'logs/tree-sprite-prototype');
await mkdir(output, { recursive: true });
await mkdir(reviewOutput, { recursive: true });

const mimeTypes = new Map([
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
]);
const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><html><body></body></html>');
      return;
    }
    if (!pathname.startsWith('/game/')) {
      response.writeHead(404).end();
      return;
    }
    const file = path.resolve(root, pathname.slice('/game/'.length));
    if (!file.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    response.writeHead(200, {
      'access-control-allow-origin': '*',
      'content-type': mimeTypes.get(path.extname(file)) || 'application/octet-stream',
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
  headless: true,
  args: ['--no-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const generated = await page.evaluate(async () => {
    const { createSceneArt } = await import('/game/scene-art.mjs');
    const scene = createSceneArt();
    const cell = { width: 80, height: 104 };
    const framePhases = [null, 0, .04, .08, .12, .16, .20, .24, .28];
    const broadleafAtlas = document.createElement('canvas');
    broadleafAtlas.width = cell.width * framePhases.length;
    broadleafAtlas.height = cell.height * 14;
    const pineAtlas = document.createElement('canvas');
    pineAtlas.width = cell.width * framePhases.length;
    pineAtlas.height = cell.height;
    const broadleafContext = broadleafAtlas.getContext('2d');
    const pineContext = pineAtlas.getContext('2d');
    const framesForReview = [];
    const random = (x, y) => {
      const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return value - Math.floor(value);
    };
    const worldX = 20, worldY = 20;
    const drawFrame = (context, index, warm, phase, destinationX, destinationY) => {
      const canvas = document.createElement('canvas');
      canvas.width = cell.width;
      canvas.height = cell.height;
      const frameContext = canvas.getContext('2d');
      frameContext.imageSmoothingEnabled = false;
      const time = phase === null
        ? ((.5 - random(index + worldX * .31, worldY * .27 + 7) + 1) % 1) * 14
        : ((phase - random(index + worldX * .31, worldY * .27 + 7) + 1) % 1) * 14;
      const draw = scene.treeProcedural || scene.tree;
      draw(frameContext, { x: 40, y: 104 }, index, 1, false, time, warm,
        worldX, worldY, false, { x: 0, y: 0 }, 2, false, true);
      context.drawImage(canvas, destinationX, destinationY);
      framesForReview.push({ species: context === pineContext ? 'pine' : 'broadleaf', index, warm, phase, canvas });
    };

    // Keep every broadleaf canopy variant and both existing warm-light palettes.
    for (let variant = 0; variant < 7; variant++) {
      const treeIndex = [7, 1, 2, 10, 4, 5, 13][variant];
      for (let warm = 0; warm < 2; warm++) {
        const row = variant * 2 + warm;
        framePhases.forEach((phase, frame) => drawFrame(
          broadleafContext, treeIndex, Boolean(warm), phase, frame * cell.width, row * cell.height,
        ));
      }
    }
    // Pine variants share one canopy design in the current renderer.
    framePhases.forEach((phase, frame) => drawFrame(pineContext, 0, false, phase, frame * cell.width, 0));

    const review = document.createElement('canvas');
    review.width = 9 * 120;
    review.height = 15 * 156;
    const reviewContext = review.getContext('2d');
    reviewContext.imageSmoothingEnabled = false;
    let cellIndex = 0;
    for (const frame of framesForReview) {
      const x = (cellIndex % 9) * 120;
      const y = Math.floor(cellIndex / 9) * 156;
      reviewContext.fillStyle = frame.species === 'pine' ? '#b7c7bd' : '#d7d0a2';
      reviewContext.fillRect(x, y, 120, 156);
      reviewContext.drawImage(frame.canvas, x + 20, y + 20, 80, 104);
      cellIndex++;
    }
    return {
      broadleaf: broadleafAtlas.toDataURL('image/png'),
      pine: pineAtlas.toDataURL('image/png'),
      review: review.toDataURL('image/png'),
      cells: cell,
      framePhases,
      broadleafRows: 14,
      frameCount: framePhases.length,
    };
  });

  const savePng = async (filename, dataUrl) => writeFile(
    path.join(output, filename), Buffer.from(dataUrl.split(',')[1], 'base64'),
  );
  await Promise.all([
    savePng('broadleaf-frames.png', generated.broadleaf),
    savePng('pine-frames.png', generated.pine),
    writeFile(path.join(reviewOutput, 'contact-sheet.png'), Buffer.from(generated.review.split(',')[1], 'base64')),
  ]);
  const manifest = {
    format: 'png-atlas',
    cell: generated.cells,
    framesPerRow: generated.frameCount,
    frameCount: generated.frameCount,
    playback: {
      mode: 'wind-cycle',
      cycleSeconds: 14,
      activeWindow: .28,
      framePhases: generated.framePhases,
      anchor: { x: 40, y: 100 },
      smoothing: 'nearest-neighbor',
    },
    atlases: {
      broadleaf: { file: 'broadleaf-frames.png', variants: 7, warmRows: 2, rows: generated.broadleafRows },
      pine: { file: 'pine-frames.png', variants: 1, rows: 1 },
    },
    source: 'Rendered from game/scene-art.mjs using the existing procedural tree renderer.',
  };
  await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(JSON.stringify({
    output,
    reviewOutput,
    broadleaf: { width: 720, height: 1456 },
    pine: { width: 720, height: 104 },
    contactSheet: { width: 1080, height: 2340 },
  }, null, 2) + '\n');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
