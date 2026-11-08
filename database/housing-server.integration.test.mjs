import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import WebSocket from 'ws';
import {createHousingTestPool} from './housing-test-pool.mjs';
import {runMigrations} from './migrate.mjs';
import {createPostgresStore} from './store.mjs';
import {createHousingMarketStore} from './housing-market.mjs';
import {createPrototypeServer} from '../scripts/prototype-server.mjs';
import {placeServicePoints} from '../game/place-services.mjs';
import {getRoomLayout,WORLD_COORDINATE_VERSION} from '../game/world.mjs';
function wait(socket,predicate){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.off('message',listener);reject(new Error('Housing websocket response timed out'));},5000);function listener(data){const m=JSON.parse(data);if(!predicate(m))return;clearTimeout(timer);socket.off('message',listener);resolve(m);}socket.on('message',listener);});}
test('real game commands deliver private house negotiations and a second rental with authoritative persistence',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const isolated=await createHousingTestPool(process.env.TEST_DATABASE_URL),pool=isolated.pool,store=createPostgresStore(pool),housing=createHousingMarketStore(pool);
 const directory=await mkdtemp(path.join(tmpdir(),'housing-server-'));const sockets=[],ids=[];let server;let clock=Date.now();
 try{
  await runMigrations(pool);
  const layout=getRoomLayout('lobby','arrival');const point=placeServicePoints({location:'room',roomKind:'lobby',roomBuildingId:'arrival'},layout).find(p=>p.id==='reception');
  async function person(){const a=await store.accounts.register({username:'ws_'+randomUUID().replaceAll('-','').slice(0,12),password:randomUUID()});ids.push(a.profile.id);await store.creditWallet(a.profile.id,100000);await store.savePlayerLocation(a.profile.id,{location:'room',dimensionId:'surface',x:point.x,y:point.y,roomKey:'lobby:arrival',worldVersion:WORLD_COORDINATE_VERSION});return a;}
  const owner=await person(),buyer=await person(),observer=await person();
  for(const [profileId,buildingId]of [[owner.profile.id,'cabin-cedar-one'],[owner.profile.id,'cabin-cedar-two'],[buyer.profile.id,'cabin-cedar-three']])await store.claimLodging({profileId,buildingId,mode:'owned',unitCount:1,price:3200});
  await store.claimLodging({profileId:buyer.profile.id,buildingId:'lodging-rill-guesthouse',mode:'rent',unitCount:8,price:6,durationMs:1440000});
  const origin='https://housing-test.invalid';server=createPrototypeServer({port:0,stateDirectory:directory,databaseUrl:isolated.databaseUrl,allowedOrigin:origin,ambientCampfire:false,arrivalTutorialEnabled:false,now:()=>clock});const address=await server.listen();
  async function connect(a){const socket=new WebSocket(`ws://127.0.0.1:${address.port}/room`,{headers:{origin,cookie:`clareira_session=${a.token}`}});sockets.push(socket);const state=await wait(socket,m=>m.type==='state');assert.ok(Array.isArray(state.lodgingClaims));return socket;}
  const seller=await connect(owner),customer=await connect(buyer),watcher=await connect(observer);
  async function action(socket,fields,text){clock+=1000;const answer=wait(socket,m=>m.type==='notice');socket.send(JSON.stringify({type:'action',...fields}));const m=await answer;assert.ok(m.text.includes(text),m.text);}
  const sellerRequest=wait(seller,m=>m.type==='state'&&m.propertyRequests?.length===1);
  await action(customer,{name:'propertyRequest',buildingId:'cabin-cedar-one'},'Solicitação enviada');const requests=(await sellerRequest).propertyRequests;assert.equal(requests[0].isBuyer,false);assert.deepEqual((await wait(watcher,m=>m.type==='state')).propertyRequests,[]);
  await action(seller,{name:'propertyQuote',buildingId:'cabin-cedar-one',requestId:requests[0].requestId,askingPriceBronze:5000},'Resposta registrada');
  await action(customer,{name:'propertyBuy',buildingId:'cabin-cedar-one',requestId:requests[0].requestId,expectedPriceBronze:5000},'Propriedade comprada');
  assert.equal((await store.listLodgingClaims(buyer.profile.id)).length,3);
  await housing.listPropertyRental({profileId:owner.profile.id,buildingId:'cabin-cedar-two',rentBronze:40});
  await action(customer,{name:'propertyRent',buildingId:'cabin-cedar-two',rentalDays:7,requestId:randomUUID(),expectedPriceBronze:280},'Aluguel pago');
  assert.equal((await store.listLodgingClaims(buyer.profile.id)).length,4);assert.equal((await store.getCabinKeys(buyer.profile.id)).length,3);
  const customerState=wait(customer,m=>m.type==='state'&&m.lodgingClaims?.length===4);clock+=1000;customer.send(JSON.stringify({type:'clockPing',sequence:1}));
  assert.equal((await customerState).lodgingLeases.length,2);
 }finally{
  for(const socket of sockets){if(socket.readyState===WebSocket.OPEN){const closed=new Promise(r=>socket.once('close',r));socket.close();await closed;}else socket.terminate();}
  if(server)await server.close();
  if(ids.length){await pool.query("UPDATE lodging_leases SET status='cancelled',auto_renew=false WHERE profile_id=ANY($1::uuid[])",[ids]);await pool.query('DELETE FROM property_rental_listings WHERE owner_profile_id=ANY($1::uuid[])',[ids]);await pool.query('DELETE FROM lodging_claims WHERE profile_id=ANY($1::uuid[])',[ids]);}
  await isolated.close();await rm(directory,{recursive:true,force:true});
 }
});
