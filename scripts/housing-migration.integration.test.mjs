import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createDatabasePool} from '../database/pool.mjs';
import {createPostgresStore} from '../database/store.mjs';
import {runMigrations} from '../database/migrate.mjs';
test('migration preserves existing furniture, money and proportion of a paid real-time lease', {skip:!process.env.HOUSING_MIGRATION_ISOLATED},async()=>{
 const pool=createDatabasePool({connectionString:process.env.TEST_DATABASE_URL,max:2});const dir=await mkdtemp(path.join(tmpdir(),'housing-migration-'));
 try{
  for(const file of await readdir(new URL('../database/migrations/',import.meta.url)))if(Number(file.slice(0,3))<=33)await copyFile(new URL('../database/migrations/'+file,import.meta.url),path.join(dir,file));
  await runMigrations(pool,{directory:dir});const store=createPostgresStore(pool);
  const a=await store.accounts.register({username:'migration_'+randomUUID().slice(0,8),password:randomUUID()});const id=a.profile.id;
  await store.creditWallet(id,9000);const wallet=await store.getWallet(id);
  const legacy=await store.accounts.register({username:'legacy_'+randomUUID().slice(0,8),password:randomUUID()});
  const due=new Date(Date.now()+12*60*60*1000);const leaseId=randomUUID();
  await pool.query("INSERT INTO lodging_claims(profile_id,building_id,unit_number,mode,expires_at) VALUES($1,'lodging-pine-inn',1,'rent',$2)",[legacy.profile.id,due]);
  await pool.query("INSERT INTO lodging_claims(profile_id,building_id,unit_number,mode,expires_at) VALUES($1,'lodging-rill-guesthouse',1,'rent',$2)",[id,due]);
  await pool.query("INSERT INTO lodging_leases(lease_id,profile_id,building_id,unit_number,government_id,rent_bronze,period_ms,next_charge_at) VALUES($1,$2,'lodging-rill-guesthouse',1,'surface:arrival',6,86400000,$3)",[leaseId,id,due]);
  await pool.query('INSERT INTO rooms(id,owner_profile_id) VALUES($1,$1)',[id]);
  await pool.query("INSERT INTO room_objects(room_id,object_id,furniture_id,x,y,rotation) VALUES($1,'01020304','furniture.stool',5,9,1)",[id]);
  await runMigrations(pool);
  const legacyClaim=await store.findLodgingClaim(legacy.profile.id);assert.ok(Math.abs((legacyClaim.expiresAt-Date.now())-12*60*1000)<5000,'legacy rentals without a recurring record also use game time');
  const claim=await store.findLodgingClaim(id);assert.ok(Math.abs((claim.expiresAt-Date.now())-12*60*1000)<5000,'half a paid day becomes half a game day');
  assert.equal((await pool.query('SELECT period_ms FROM lodging_leases WHERE lease_id=$1',[leaseId])).rows[0].period_ms,'1440000');
  assert.deepEqual(await store.getWallet(id),wallet);assert.equal((await store.loadRoom(id,'lodging-rill-guesthouse:rent:1')).length,1);assert.equal((await store.loadRoom(id)).length,0);
  await store.saveRoom(id,[]);assert.equal((await store.loadRoom(id,'lodging-rill-guesthouse:rent:1')).length,1,'creating an account room cannot erase the lodging furniture');
 }finally{await pool.end();await rm(dir,{recursive:true,force:true});}
});
