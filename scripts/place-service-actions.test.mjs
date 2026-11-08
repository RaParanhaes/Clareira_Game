import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createAccountStore, saveAccountProgress } from './account-store.mjs';
import { createJsonPlayerLocationStore } from './player-location-store.mjs';
import { createPrototypeServer } from './prototype-server.mjs';
import { getRoomLayout, WORLD_COORDINATE_VERSION } from '../game/world.mjs';
import { placeServicePoints } from '../game/place-services.mjs';

function waitFor(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('message', listener); reject(new Error('Service response timed out')); }, 2500);
    function listener(raw) {
      const message = JSON.parse(raw);
      if (!predicate(message)) return;
      clearTimeout(timer); socket.off('message', listener); resolve(message);
    }
    socket.on('message', listener);
  });
}

test('server rejects remote/wrong-counter transactions and permits a sale at the village exchange', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-service-policy-'));
  const accounts = createAccountStore({ directory });
  const locations = createJsonPlayerLocationStore(directory);
  const origin = 'https://service-test.clareira.invalid';
  const cases = [
    { username: 'FarCabin', place: 'cabin-cedar-one', point: null,
      action: { name: 'lodgeClaim', buildingId: 'cabin-cedar-one', mode: 'owned' }, rejection: 'Aproxime-se' },
    { username: 'HotelTrade', place: 'lodging-ember-hotel', point: 'reception', action: { name: 'lodgeSell', item: 'wood', quantity: 1 }, rejection: 'não é oferecido' },
    { username: 'HotelTool', place: 'lodging-ember-hotel', point: 'reception', action: { name: 'lodgeBuyTool', tool: 'stoneAxe' }, rejection: 'não é oferecido' },
    { username: 'HotelOrders', place: 'lodging-ember-hotel', point: 'reception', action: { name: 'lodgeCompleteContract', contractId: 'anything' }, rejection: 'não é oferecido' },
    { username: 'WrongCounter', place: 'arrival', point: 'reception', action: { name: 'lodgeSell', item: 'wood', quantity: 1 }, rejection: 'não é oferecido' },
    ...[0, -1, 51, 1.5].map((quantity,index) => ({username:`InvalidSale${index}`,place:'arrival',point:'exchange',action:{name:'lodgeSell',item:'wood',quantity},rejection:'quantidade inteira entre 1 e 50'})),
    {username:'UnknownSale',place:'arrival',point:'exchange',action:{name:'lodgeSell',item:'gold',quantity:1},rejection:'não está na tabela'},
    {username:'InsufficientSale',place:'arrival',point:'exchange',action:{name:'lodgeSell',item:'wood',quantity:4},rejection:'não tem essa quantidade'},
    { username: 'WrongBuyCounter', place: 'arrival', point: 'reception', action: { name: 'lodgeBuyMaterial', item: 'wood', quantity: 1, expectedPriceBronze: 1 }, rejection:'não é oferecido' },
    { username: 'JsonBuyUnavailable', place: 'arrival', point: 'exchange', action: { name: 'lodgeBuyMaterial', item: 'wood', quantity: 1, expectedPriceBronze: 1 }, rejection:'requer PostgreSQL' },
    { username: 'VillageTrade', place: 'arrival', point: 'exchange', action: { name: 'lodgeSell', item: 'wood', quantity: 1 } },
  ];
  let room, socket;
  try {
    for (const entry of cases) {
      entry.account = await accounts.register({ username: entry.username, password: 'service-test-password' });
      await accounts.creditWallet(entry.account.profile.id, 4000);
      await saveAccountProgress(directory, entry.account.profile.id, { wood: 3 });
      const layout = getRoomLayout('lobby', entry.place);
      const point = placeServicePoints({ location: 'room', roomKind: 'lobby', roomBuildingId: entry.place }, layout)
        .find(point => point.id === entry.point) || layout.spawn;
      await locations.savePlayerLocation(entry.account.profile.id, { location: 'room', dimensionId: 'surface',
        x: point.x, y: point.y, roomKey: `lobby:${entry.place}`, worldVersion: WORLD_COORDINATE_VERSION });
    }
    room = createPrototypeServer({ port: 0, stateDirectory: directory, ambientCampfire: false, allowedOrigin: origin });
    const address = await room.listen();
    for (const entry of cases) {
      socket = new WebSocket(`ws://127.0.0.1:${address.port}/room`, {
        headers: { origin, cookie: `clareira_session=${entry.account.token}` },
      });
      const initial = await waitFor(socket, message => message.type === 'state');
      const self = initial.players.find(player => player.id === initial.selfId) || initial.players[0];
      const notice = waitFor(socket, message => message.type === 'notice');
      const changed = entry.rejection ? null : waitFor(socket, message => message.type === 'state'
        && message.players.some(player => player.inventory.wood === 2 && player.inventory.bronze === 1));
      socket.send(JSON.stringify({ type: 'action', ...entry.action }));
      const result = await notice;
      if (entry.rejection) {
        assert.ok(result.text.includes(entry.rejection), `${entry.username}: ${result.text}`);
        assert.equal(self.inventory.wood, 3);
        const progress = await accounts.getSession(entry.account.token);
        assert.equal(progress.profile.inventory.wood, 3, 'rejected transaction preserves materials');
        assert.equal(progress.profile.inventory.silver, 40, 'rejected transaction preserves wallet');
      } else {
        assert.ok(result.text.startsWith('Venda concluída'));
        const state = await changed;
        assert.ok(state.players.some(player => player.inventory.wood === 2 && player.inventory.bronze === 1));
      }
      const closed = new Promise(resolve => socket.once('close', resolve)); socket.close(); await closed; socket = null;
    }
  } finally {
    socket?.terminate(); if (room) await room.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('both tools and daily orders preserve balances on repeats and survive reconnection', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-commerce-functions-'));
  const accounts = createAccountStore({ directory });
  const locations = createJsonPlayerLocationStore(directory);
  const origin = 'https://commerce-functions.clareira.invalid';
  let room, socket;
  try {
    const account = await accounts.register({ username:'CommerceMatrix', password:'commerce-functions-test-password' });
    await accounts.creditWallet(account.profile.id, 2000);
    await saveAccountProgress(directory, account.profile.id, { wood:40 });
    const layout = getRoomLayout('lobby', 'arrival');
    const point = placeServicePoints({ location:'room', roomKind:'lobby', roomBuildingId:'arrival' }, layout).find(p=>p.id==='exchange');
    await locations.savePlayerLocation(account.profile.id,{location:'room',dimensionId:'surface',x:point.x,y:point.y,roomKey:'lobby:arrival',worldVersion:WORLD_COORDINATE_VERSION});
    let clock = Date.now();
    room = createPrototypeServer({port:0,stateDirectory:directory,ambientCampfire:false,allowedOrigin:origin,now:()=>clock});
    const address = await room.listen();
    const connect = async () => {
      socket = new WebSocket(`ws://127.0.0.1:${address.port}/room`,{headers:{origin,cookie:`clareira_session=${account.token}`}});
      return waitFor(socket,m=>m.type==='state');
    };
    await connect();
    const action = async (name,fields,text) => {
      clock += 1000; // Advance the injected server clock past the action cooldown, without sleeps.
      const response=waitFor(socket,m=>m.type==='notice');socket.send(JSON.stringify({type:'action',name,...fields}));
      const notice=await response;assert.ok(notice.text.includes(text),notice.text);return (await accounts.getSession(account.token)).profile.inventory;
    };
    let saved=await action('lodgeBuyTool',{tool:'stoneAxe'},'Compra concluída');
    assert.equal(saved.stoneAxe,1);assert.equal(saved.silver,15);
    saved=await action('lodgeBuyTool',{tool:'stonePickaxe'},'Compra concluída');
    assert.equal(saved.stonePickaxe,1);assert.equal(saved.silver,8);
    saved=await action('lodgeBuyTool',{tool:'stoneAxe'},'já tem');assert.equal(saved.silver,8);assert.equal(saved.stoneAxe,1);
    saved=await action('lodgeCompleteContract',{contractId:'dry-sticks'},'Encomenda entregue');
    assert.equal(saved.wood,20);assert.equal(saved.silver,8);assert.equal(saved.bronze,30);
    saved=await action('lodgeCompleteContract',{contractId:'dry-sticks'},'já entregou');assert.equal(saved.wood,20);assert.equal(saved.bronze,30);
    saved=await action('lodgeCompleteContract',{contractId:'planks'},'Junte');assert.equal(saved.wood,20);assert.equal(saved.bronze,30);
    const closed=new Promise(resolve=>socket.once('close',resolve));socket.close();await closed;
    const restored=await connect();
    assert.ok(restored.players.some(p=>p.inventory.stoneAxe===1&&p.inventory.stonePickaxe===1&&p.inventory.wood===20&&p.inventory.bronze===30));
  } finally { socket?.terminate(); if(room)await room.close();await rm(directory,{recursive:true,force:true}); }
});
