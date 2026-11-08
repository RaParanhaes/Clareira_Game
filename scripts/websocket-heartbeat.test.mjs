import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import WebSocket from 'ws';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPrototypeServer } from './prototype-server.mjs';

const origin = 'https://heartbeat-test.clareira.invalid';


test('room negotiates WebSocket compression and delivers the full snapshot', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-compression-'));
  const room = createPrototypeServer({
    port: 0,
    stateDirectory,
    allowedOrigin: origin,
    ambientCampfire: false,
    webSocketCompression: true,
    resolveSession: token => ({ profile: {
      id: token,
      guest: true,
      displayName: 'Compression test',
      inventory: { wood: 0, stone: 0, berries: 0 },
    } }),
  });
  const address = await room.listen();
  const socket = new WebSocket('ws://127.0.0.1:' + address.port + '/room', [], {
    perMessageDeflate: true,
    headers: { Origin: origin, Cookie: 'clareira_session=compression-test' },
  });
  t.after(async () => {
    socket.terminate();
    await room.close();
    await rm(stateDirectory, { recursive: true, force: true });
  });

  const fullState = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('full snapshot was not received')), 5_000);
    socket.on('message', raw => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message.type !== 'state' || !message.worldDefinition) return;
      clearTimeout(timeout);
      resolve(message);
    });
    socket.once('error', error => { clearTimeout(timeout); reject(error); });
  });
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  assert.match(socket.extensions, /permessage-deflate/);
  const snapshot = await fullState;
  assert.ok(Array.isArray(snapshot.resources));
  assert.ok(Array.isArray(snapshot.fires));
});

test('room closes a websocket that stops answering ping frames', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-heartbeat-'));
  const room = createPrototypeServer({
    port: 0,
    stateDirectory,
    allowedOrigin: origin,
    ambientCampfire: false,
    webSocketHeartbeatMs: 100,
    resolveSession: token => ({ profile: {
      id: token,
      guest: true,
      displayName: 'Heartbeat test',
      inventory: { wood: 0, stone: 0, berries: 0 },
    } }),
  });
  const address = await room.listen();
  const socket = net.createConnection(address.port, '127.0.0.1');
  t.after(async () => {
    socket.destroy();
    await room.close();
    await rm(stateDirectory, { recursive: true, force: true });
  });

  let response = '';
  let handshakeResolved = false;
  const handshake = new Promise((resolve, reject) => {
    socket.on('data', chunk => {
      response += chunk.toString('latin1');
      if (handshakeResolved || !response.includes('\r\n\r\n')) return;
      handshakeResolved = true;
      if (!response.startsWith('HTTP/1.1 101')) reject(new Error('WebSocket upgrade failed: ' + response.split('\r\n')[0]));
      else resolve();
    });
    socket.once('error', reject);
    socket.once('connect', () => {
      const key = randomBytes(16).toString('base64');
      socket.write([
        'GET /room HTTP/1.1',
        'Host: 127.0.0.1:' + address.port,
        'Origin: ' + origin,
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Key: ' + key,
        'Sec-WebSocket-Version: 13',
        'Cookie: clareira_session=heartbeat-test',
        '',
        '',
      ].join('\r\n'));
    });
  });
  const closed = new Promise(resolve => socket.once('close', resolve));

  await handshake;
  const outcome = await Promise.race([
    closed.then(() => 'closed'),
    new Promise(resolve => setTimeout(() => resolve('still-open'), 1_500)),
  ]);
  assert.equal(outcome, 'closed', 'a peer that never answers ping is terminated promptly');
});

test('movement recovery releases the socket without waiting for a close handshake and preserves its resumable actor',async t=>{
 const stateDirectory=await mkdtemp(path.join(os.tmpdir(),'clareira-recover-'));
 const profile={id:'recovery-actor',guest:true,displayName:'Recovery'};
 const room=createPrototypeServer({port:0,stateDirectory,allowedOrigin:origin,arrivalTutorialEnabled:false,
  resolveSession:()=>({profile})});
 const address=await room.listen();const sockets=[];
 t.after(async()=>{for(const socket of sockets)socket.terminate();await room.close();await rm(stateDirectory,{recursive:true,force:true});});
 const connect=()=>new Promise((resolve,reject)=>{
  const socket=new WebSocket(`ws://127.0.0.1:${address.port}/room`,{headers:{Origin:origin,Cookie:'clareira_session=recovery'}});sockets.push(socket);
  socket.on('error',reject);socket.on('message',raw=>{const packet=JSON.parse(raw);if(packet.type==='welcome')resolve({socket,id:packet.id});});
 });
 const first=await connect();
 const closed=new Promise(resolve=>first.socket.once('close',resolve));
 first.socket.send(JSON.stringify({type:'recoverMovement'}));
 await closed;const second=await connect();assert.equal(second.id,first.id,'recovery resumes the same actor');
});
