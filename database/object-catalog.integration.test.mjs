import test from 'node:test';import assert from 'node:assert/strict';import{randomUUID}from'node:crypto';
import{createClient}from'redis';import{createDatabasePool}from'./pool.mjs';import{runMigrations}from'./migrate.mjs';import{createPostgresObjectStore}from'./object-store.mjs';
import{createObjectCatalogCache,objectCacheNamespace}from'./object-cache.mjs';import{applyObjectCatalog}from'../game/object-state.mjs';
import{createPostgresStore}from'./store.mjs';
import{BUILTIN_OBJECT_CATALOG}from'../game/object-catalog-seed.mjs';
const databaseUrl=process.env.TEST_DATABASE_URL,redisUrl=process.env.TEST_REDIS_URL;
test('PostgreSQL stores object graphs, concurrent edits, copies, tombstones and extensible furniture; Redis follows the committed revision', {skip:!databaseUrl||!redisUrl},async()=>{
 const pool=createDatabasePool({connectionString:databaseUrl,max:3}),store=createPostgresObjectStore(pool);
 const namespace=objectCacheNamespace(databaseUrl)+':test:'+randomUUID();
 const cache=createObjectCatalogCache(store,{url:redisUrl,namespace});const redis=createClient({url:redisUrl});redis.on('error',()=>{});let profile;
 try{
  await runMigrations(pool);await store.ensureObjectCatalog();await store.ensureObjectCatalog();await redis.connect();
  const initial=await cache.load();assert.equal(initial.objects.length,BUILTIN_OBJECT_CATALOG.objects.length,'fresh PostgreSQL seed mirrors the current authored scene instances');
  assert.equal(initial.templates.length,BUILTIN_OBJECT_CATALOG.templates.length,'fresh PostgreSQL seed mirrors the current model set');
  assert.equal(initial.objects.filter(o=>o.id.startsWith('building:cabin-cedar-one/window-')).length,1,
   'the residential pilot keeps one bedroom window instead of restoring three obsolete facade windows');
  assert.ok(initial.templates.some(t=>t.id==='furniture.plant'));
  for(const model of initial.templates.filter(t=>t.id.startsWith('furniture.')||t.id.startsWith('fixture.'))){
   assert.ok(model.properties.physics,`${model.id} persists its collider`);
   assert.equal(model.properties.physics.authority,'server');
   assert.equal(model.properties.depthOrder.anchor,'footprint-front');
   assert.equal(model.properties.depthOrder.vertical,'support-base');
  }
  assert.equal(initial.templates.find(t=>t.id==='furniture.plant').properties.physics.shape,'circle');
  assert.equal(initial.templates.find(t=>t.id==='furniture.plant').properties.physics.radiusRatio,.42);
  assert.ok(await redis.get(`${namespace}:revision:${initial.revision}`));
  const next=await store.editObjectCatalog({expectedRevision:initial.revision,actor:'integration-test',operations:[
   {action:'patch',collection:'templates',id:'fixture.chair',properties:{height:2.35,comfort:3}},
   {action:'patch',collection:'templates',id:'furniture.lamp',properties:{palette:'pine',light:{reach:6.25,color:'#ffd89a'}}},
   {action:'copy',id:'building:lodging-rill-guesthouse',newId:'building:test-copy',buildingId:'test-copy',offset:{x:100,y:100},properties:{name:'Cópia de teste'}}]});
  assert.equal((await cache.load()).revision,next.revision);
  const view=applyObjectCatalog(await cache.load(),{validateOnly:true});assert.equal(view.rooms.get('lodging:test-copy:rent').fixtures.find(f=>f.kind==='chair').height,2.35);
  assert.equal((await cache.load()).templates.find(t=>t.id==='furniture.lamp').properties.light.reach,6.25);
  await assert.rejects(store.editObjectCatalog({expectedRevision:initial.revision,operations:[]}),e=>e.status===409);
  const bed=next.objects.find(o=>o.templateId==='fixture.bed');
  await assert.rejects(store.editObjectCatalog({expectedRevision:next.revision,operations:[{action:'patch',id:bed.id,properties:{width:-1}}]}),/móvel/);
  assert.equal(await store.objectCatalogRevision(),next.revision);
  const removed=await store.editObjectCatalog({expectedRevision:next.revision,operations:[{action:'archive',id:'building:test-copy'}]});
  assert.equal(applyObjectCatalog(await cache.load(),{validateOnly:true}).buildings.has('test-copy'),false);
  assert.ok((await store.objectCatalogHistory()).some(h=>Number(h.revision)===removed.revision));
  const pg=createPostgresStore(pool);const account=await pg.accounts.register({username:'obj_'+randomUUID().replaceAll('-','').slice(0,10),password:randomUUID()});profile=account.profile.id;
  const furniture=[{id:randomUUID(),kind:'stool',x:5,y:9,rotation:1,properties:{label:'Banco nomeado',comfort:7}}];
  await pg.saveRoom(profile,furniture);assert.deepEqual(await pg.loadRoom(profile),furniture);
  await pool.query("INSERT INTO lodging_claims(profile_id,building_id,unit_number,mode) VALUES ($1,'cabin-cedar-one',1,'owned'),($1,'cabin-cedar-two',1,'owned')",[profile]);
  await assert.rejects(store.editObjectCatalog({expectedRevision:removed.revision,operations:[{action:'patch',collection:'templates',id:'furniture.stool',properties:{physics:{radius:10}}}]}),/móvel já salvo/);
  assert.equal(await store.objectCatalogRevision(),removed.revision,'a blocked furniture edit is rolled back');
  // Corrupt cache data is discarded; the database survives cache removal.
  await redis.set(`${namespace}:revision:${removed.revision}`,'broken');assert.equal((await cache.load()).revision,removed.revision);
 }finally{
  await cache.close();if(redis.isOpen){let keys=[];for await(const batch of redis.scanIterator({MATCH:namespace+':*'}))keys.push(...(Array.isArray(batch)?batch:[batch]));if(keys.length)await redis.del(keys);await redis.quit();}
  if(profile){await pool.query('DELETE FROM lodging_claims WHERE profile_id=$1',[profile]);await pool.query('DELETE FROM profiles WHERE id=$1',[profile]);await pool.query('DELETE FROM accounts WHERE id=$1',[profile]);}await pool.end();
 }
});
