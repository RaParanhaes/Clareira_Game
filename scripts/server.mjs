import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function createStaticServer(root, { host = '127.0.0.1', port = 8080 } = {}) {
  const base = path.resolve(root);
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { allow: 'GET, HEAD', 'cache-control': 'no-store' }); response.end(); return;
      }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname === '/health') {
        response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); response.end('ok'); return;
      }
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      if (!relative || relative.split('/').includes('..') || relative.includes('\\')) {
        response.writeHead(403); response.end(); return;
      }
      const file = path.resolve(base, relative);
      if (!file.startsWith(`${base}${path.sep}`)) { response.writeHead(403); response.end(); return; }
      const contents = await readFile(file);
      const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream';
      response.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : contents);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 400, { 'cache-control': 'no-store' }); response.end(error.code === 'ENOENT' ? 'Not found' : 'Invalid request');
    }
  });
  return { server, listen: () => new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(port, host, () => { server.removeListener('error', reject); resolve(server.address()); });
  }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = process.argv[2] || '/opt/game-agent/production/game';
  const app = createStaticServer(root, { host: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 8080) });
  const address = await app.listen();
  process.stdout.write(`Clareira production placeholder listening on ${address.address}:${address.port}\n`);
}
