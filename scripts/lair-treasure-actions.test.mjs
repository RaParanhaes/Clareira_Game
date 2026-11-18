import test from 'node:test';
import assert from 'node:assert/strict';
import { openLairTreasure } from './lair-treasure-actions.mjs';
import { LAIRS, dungeonChestLair } from '../game/lairs.mjs';
import { createInventory, addInventoryItem, inventorySnapshot } from '../game/inventory.mjs';
import { currencyValue, walletFromValue } from '../game/lodging-catalog.mjs';

function setup({ guardsAlive=false, contributor=true, full=false, sword=false, failCredit=false }={}) {
  const lair=LAIRS.ninho;
  const inventory=createInventory();
  if(full) for(let i=0;i<27;i++) inventory.slots[i]={itemId:'knife',quantity:1};
  if(sword) addInventoryItem(inventory,'ironShortSword',1);
  const player={id:'player-1',accountId:'profile-1',location:'clearing',dimensionId:'surface',position:{...lair.chest},vitals:{health:42},inventory,lairClaims:[]};
  const state={guards:guardsAlive?[{lairId:lair.id,health:6}]:[],contributors:new Set(contributor?['player-1']:[])};
  const claims=new Map();
  const store={reserve:async(profileId,lairId,{actionId,now,cooldownMs})=>{
    const current=claims.get(`${profileId}:${lairId}`);if(current&&current.availableAt>now)return {ok:false,reason:'recarregando',availableAt:current.availableAt};
    claims.set(`${profileId}:${lairId}`,{availableAt:now+cooldownMs,lastActionId:actionId});return {ok:true,availableAt:now+cooldownMs};
  },release:async(profileId,lairId,actionId)=>{const key=`${profileId}:${lairId}`;const claim=claims.get(key);if(claim?.lastActionId!==actionId)return false;claims.delete(key);return true;}};
  let paid=0,saved=null;
  const storage={creditWalletAndSaveProgress:async(_id,amount,after)=>{if(failCredit)throw Error('simulated');paid+=amount;saved=after;return walletFromValue(currencyValue(inventorySnapshot(inventory))+amount);}};
  return {player,lair,state,store,storage,claims,get paid(){return paid},get saved(){return saved}};
}
const run=(s,overrides={})=>openLairTreasure({...s,now:1000,actionId:'claim-action-1',...overrides});
const hasSword=inv=>inv.slots.some(slot=>slot?.itemId==='ironShortSword');

test('baú concede 200 bronzes e espada e persiste o inventário',async()=>{
  const s=setup();const result=await run(s);
  assert.equal(result.ok,true);assert.equal(s.paid,200);assert.equal(hasSword(s.player.inventory),true);
  assert.equal(s.saved.slots.some(slot=>slot?.itemId==='ironShortSword'),true);
});
test('recusa guardas vivos, falta de contribuição, recarga e distância',async()=>{
  assert.equal((await run(setup({guardsAlive:true}))).reason,'guardas');
  assert.equal((await run(setup({contributor:false}))).reason,'contribuicao');
  const cooldown=setup();cooldown.player.lairClaims=[{lairId:'ninho',availableAt:2000}];assert.equal((await run(cooldown)).reason,'recarregando');
  const far=setup();far.player.position.x+=3;assert.equal((await run(far)).reason,'longe');
});
test('mochila cheia não consome recarga e espada duplicada dá apenas moeda',async()=>{
  const full=setup({full:true});assert.equal((await run(full)).reason,'inventario');assert.equal(full.claims.size,0);
  const owned=setup({sword:true});const result=await run(owned);assert.equal(result.ok,true);assert.equal(result.sword,false);assert.equal(owned.paid,200);
});
test('falha no crédito restaura inventário e libera claim',async()=>{
  const s=setup({failCredit:true});const before=inventorySnapshot(s.player.inventory);
  assert.equal((await run(s)).reason,'falha-salvamento');assert.deepEqual(inventorySnapshot(s.player.inventory),before);assert.equal(s.claims.size,0);
});
test('dois envios concorrentes pagam uma vez',async()=>{
  const s=setup();const results=await Promise.all([run(s),run(s,{actionId:'claim-action-2'})]);
  assert.equal(results.filter(result=>result.ok).length,1);assert.equal(s.paid,200);
});

test('A e B podem sacar sem apagar as contribuições um do outro',async()=>{
  const s=setup();s.state.contributors.add('player-2');
  const second={...s.player,id:'player-2',accountId:'profile-2',inventory:createInventory(),lairClaims:[]};
  const firstResult=await run(s,{actionId:'claim-a'});
  const secondResult=await openLairTreasure({player:second,lair:s.lair,state:s.state,store:s.store,storage:s.storage,
    now:1000,actionId:'claim-b'});
  assert.equal(firstResult.ok,true);assert.equal(secondResult.ok,true);
  assert.deepEqual([...s.state.contributors].sort(),['player-1','player-2']);
});

test('inclusão recusada restaura mochila e libera o claim sem anunciar espada',async()=>{
  const s=setup();
  const initial=inventorySnapshot(s.player.inventory);
  const reserve=s.store.reserve;
  s.store.reserve=async(...args)=>{
    const result=await reserve(...args);
    s.player.inventory.slots=Array.from({length:27},()=>({itemId:'knife',quantity:1}));
    return result;
  };
  const result=await run(s);
  assert.equal(result.ok,false);assert.equal(result.reason,'inventario');
  assert.equal(result.sword,undefined);
  assert.deepEqual(inventorySnapshot(s.player.inventory),initial);
  assert.equal(s.claims.size,0);
  assert.equal(s.paid,0);
});

test('erro ao liberar após falha de gravação é registrado e retornado',async()=>{
  const s=setup({failCredit:true}),before=inventorySnapshot(s.player.inventory);
  s.store.release=async()=>{throw Error('release failed');};
  const originalError=console.error,logged=[];
  console.error=(...args)=>logged.push(args);
  try {
    const result=await run(s);
    assert.equal(result.reason,'falha-salvamento');
    assert.equal(result.releaseError.message,'release failed');
    assert.equal(logged.length,1);
    assert.deepEqual(inventorySnapshot(s.player.inventory),before);
  } finally { console.error=originalError; }
});

// Baú do chefe da masmorra: fica na instância, abre só depois da queda e só para quem lutou.
function dungeonSetup({ bossAlive = false, contributor = true } = {}) {
  const s = setup({ contributor });
  const dimensionId = 'dg-ninho-n1-0123456789';
  s.lair = dungeonChestLair(1, { x: 9, y: 3 });
  s.player.dimensionId = dimensionId;
  s.player.position = { ...s.lair.chest };
  s.state.guards = bossAlive ? [{ lairId: s.lair.id, health: 1 }] : [];
  s.dimensionId = dimensionId; // sem espalhar o objeto: o getter de 'paid' precisa continuar vivo
  return s;
}
const runDungeon = s => openLairTreasure({ player: s.player, lair: s.lair, state: s.state, store: s.store, storage: s.storage, now: 1000, actionId: 'dungeon-claim-1', dimensionId: s.dimensionId });

test('baú da masmorra recusa com o chefe vivo e abre depois da queda para quem lutou', async () => {
  assert.equal((await runDungeon(dungeonSetup({ bossAlive: true }))).reason, 'guardas');
  const open = dungeonSetup();
  const result = await runDungeon(open);
  assert.equal(result.ok, true);
  assert.equal(open.paid, 200);
  assert.equal(open.claims.has('profile-1:ninho-n1'), true, 'recarga por conta no id do nível');
});

test('baú da masmorra recusa quem não lutou contra o chefe', async () => {
  assert.equal((await runDungeon(dungeonSetup({ contributor: false }))).reason, 'contribuicao');
});

test('baú da masmorra não abre fora da instância (dimensão diferente)', async () => {
  const s = dungeonSetup();
  s.player.dimensionId = 'surface';
  const result = await runDungeon(s);
  assert.equal(result.reason, 'local');
});
