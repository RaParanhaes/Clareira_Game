import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPreviewServer } from '../scripts/dev-preview-page.mjs';
import { applyCollectionSnapshot, clearWorldSnapshot, mergePlayerSnapshots, reconnectSchedule, sendWhenOpen } from './network.mjs';

test('partial snapshots retain static data, while explicit empty collections clear it', () => {
  const map=new Map([['old',{id:'old'}]]);
  assert.equal(applyCollectionSnapshot(map,undefined,item=>item.id),false);
  assert.equal(map.size,1);
  applyCollectionSnapshot(map,[{id:'new'}],item=>item.id);
  assert.deepEqual([...map.keys()],['new']);
  applyCollectionSnapshot(map,[],item=>item.id);assert.equal(map.size,0);
});

test('atualizações compactas de movimento preservam aparência e bolsa do jogador', () => {
  const previous=new Map([['a',{id:'a',name:'Lia',appearance:{outfitId:'outfit.commoner'},inventory:{wood:2},x:10,y:8}]]);
  const merged=mergePlayerSnapshots(previous,[{id:'a',x:11,y:8,moving:true}]);
  assert.deepEqual(merged,[{id:'a',name:'Lia',appearance:{outfitId:'outfit.commoner'},inventory:{wood:2},x:11,y:8,moving:true}]);
  assert.deepEqual(mergePlayerSnapshots(previous,[{id:'a',name:'Lua',appearance:{outfitId:'outfit.mage'},inventory:{wood:3}}])[0],
    {id:'a',name:'Lua',appearance:{outfitId:'outfit.mage'},inventory:{wood:3},x:10,y:8});
  assert.deepEqual(mergePlayerSnapshots(previous,[]),[],'jogadores que saem da área de interesse são removidos');
});

test('reconexão aumenta o intervalo quando o socket abre e cai antes do snapshot', () => {
  const centered = { random: () => 0.5 };
  assert.deepEqual(reconnectSchedule(700, 0, centered), { delayMs: 700, nextDelayMs: 1260 });
  assert.deepEqual(reconnectSchedule(1260, 0, centered), { delayMs: 1260, nextDelayMs: 2268 });
  assert.deepEqual(reconnectSchedule(15000, 0, centered), { delayMs: 15000, nextDelayMs: 15000 });
});

test('reconexão só volta ao intervalo inicial depois de estado estável', () => {
  const centered = { random: () => 0.5 };
  assert.deepEqual(reconnectSchedule(5832, 14999, centered), { delayMs: 5832, nextDelayMs: 10497.6 });
  assert.deepEqual(reconnectSchedule(5832, 15000, centered), { delayMs: 700, nextDelayMs: 1260 });
});

test('reconexões simultâneas recebem jitter limitado sem ultrapassar o teto', () => {
  assert.deepEqual(reconnectSchedule(700, 0, { random: () => 0 }), { delayMs: 560, nextDelayMs: 1260 });
  assert.deepEqual(reconnectSchedule(700, 0, { random: () => 1 }), { delayMs: 840, nextDelayMs: 1260 });
  assert.deepEqual(reconnectSchedule(15000, 0, { random: () => 1 }), { delayMs: 15000, nextDelayMs: 15000 });
});

test('envia o comando uma vez quando o WebSocket está aberto', () => {
  const sent = [];
  const socket = { readyState: 1, send: payload => sent.push(JSON.parse(payload)) };

  assert.equal(sendWhenOpen(socket, 1, { type: 'action', name: 'collect' }), true);
  assert.deepEqual(sent, [{ type: 'action', name: 'collect' }]);
});

test('não envia comandos por uma conexão fechada ou ainda conectando', () => {
  for (const readyState of [0, 3]) {
    const sent = [];
    const socket = { readyState, send: payload => sent.push(payload) };

    assert.equal(sendWhenOpen(socket, 1, { type: 'emote', name: 'wave' }), false);
    assert.deepEqual(sent, []);
  }
});

test('limpa recursos e fogueiras do snapshot ao perder a conexão', () => {
  const resources = new Map([['galho', { id: 'galho' }]]);
  const fires = new Map([['8,12', { x: 8, y: 12 }]]);

  clearWorldSnapshot(resources, fires);

  assert.equal(resources.size, 0);
  assert.equal(fires.size, 0);
});

test('ações e gestos anunciam quando a reconexão ainda não terminou', async () => {
  const main = await readFile(new URL('./main.js', import.meta.url), 'utf8');
  const commandSender = main.match(/function sendPlayerCommand\(message\) \{([\s\S]*?)\n\}/)?.[1];

  assert.ok(commandSender, 'há um caminho comum para ações e gestos');
  assert.match(commandSender, /const sent = send\(outgoing\)/);
  assert.match(commandSender, /if \(!sent\) announce\(/);
  assert.match(commandSender, /return sent/);
  assert.match(commandSender, /Tente de novo daqui a pouco/);
  assert.match(main, /function action\(name\) \{[\s\S]*?sendPlayerCommand\(/);
  assert.match(main, /function emote\(name\) \{[\s\S]*?clearMovement\(\);[\s\S]*?sendPlayerCommand\(/);
});

test('preview entrega os módulos novos com tipo JavaScript e nosniff', async t => {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), 'clareira-preview-modules-'));
  t.after(() => rm(stateDirectory, { recursive: true, force: true }));
  const preview = createPreviewServer({ port: 0, stateDirectory });
  const address = await preview.listen();
  t.after(() => preview.close());
  const base = `http://127.0.0.1:${address.port}`;

  for (const [module, symbols] of [
    ['network.mjs', ['sendWhenOpen', 'clearWorldSnapshot', 'mergePlayerSnapshots']],
    ['visual-motion.mjs', ['advanceWorldAnimationTime']],
  ]) {
    const response = await fetch(`${base}/${module}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /javascript/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const source = await response.text();
    for (const symbol of symbols) assert.match(source, new RegExp(symbol));
  }
});
