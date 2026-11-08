import http from 'node:http';

export function createDevPreviewBridge(previewAddress, { port, host = '127.0.0.1', beforeProxy = null } = {}) {
  if (!previewAddress?.port || !Number.isInteger(port)) throw new TypeError('Endereço do preview ou porta inválida');
  const server = http.createServer(async (incoming, outgoing) => {
    let target;
    try { target = new URL(incoming.url || '/', `http://${incoming.headers.host || host}`); }
    catch { outgoing.writeHead(400); outgoing.end(); return; }
    const pathname = target.pathname.replace(/^\/dev(?=\/|$)/u, '') || '/';
    if (beforeProxy && await beforeProxy({ pathname, search: target.search, incoming, outgoing })) return;
    const upstream = http.request({
      host: '127.0.0.1', port: previewAddress.port, path: pathname + target.search,
      method: incoming.method, headers: incoming.headers,
    }, response => {
      outgoing.writeHead(response.statusCode || 502, response.headers);
      response.pipe(outgoing);
    });
    upstream.on('error', () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.pipe(upstream);
  });
  return {
    origin: `http://${host}:${port}`,
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.removeListener('error', reject); resolve(server.address()); });
    }),
    close: () => new Promise(resolve => server.close(resolve)),
  };
}
