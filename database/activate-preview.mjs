import {mkdir,readFile,writeFile,rename,rm,cp,stat,chown,chmod,open} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDatabasePool} from './pool.mjs';
import {runMigrations} from './migrate.mjs';
import {buildJsonImportPlan,applyJsonImport} from './json-import.mjs';
import {createPostgresStore} from './store.mjs';
import {applyStaffRuntimePrivileges} from './staff-runtime-privileges.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const local=path.join(root,'.local'),stateDirectory='/var/lib/clareira-dev';
const configFile=path.join(local,'preview-backend.json'),gate=path.join(local,'preview-maintenance.json');
async function run(command,args,stdio='ignore') {
 const child=spawn(command,args,{cwd:root,stdio});
 await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`${command} terminou com código ${code}.`)));});
}
const compose=['compose','--env-file','.local/backends.env','-f','infra/backends.compose.yml'];
const credentials=Object.fromEntries((await readFile(path.join(local,'backends.env'),'utf8')).trim().split('\n').map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));
const database=new URL('postgres://clareira@127.0.0.1:55432/clareira');database.password=credentials.POSTGRES_PASSWORD;
const redis=new URL('redis://127.0.0.1:56379/0');redis.password=credentials.REDIS_PASSWORD;
const pool=createDatabasePool({connectionString:database.href,max:2});
const backup=path.join(local,'backups',new Date().toISOString().replaceAll(':','-'));
let paused=false,published=false;
try {
 try {await stat(configFile);throw new Error('O preview já possui configuração de banco. Use migrações incrementais; não reimporte os JSON.');}
 catch(error){if(error.code!=='ENOENT')throw error;}
 await runMigrations(pool);
 const stateInfo=await stat(stateDirectory);
 await chmod(local,0o750);await chown(local,process.getuid(),stateInfo.gid);
 await mkdir(backup,{recursive:true,mode:0o700});
 await writeFile(gate,JSON.stringify({stateDirectory}),{flag:'wx',mode:0o640});
 await chown(gate,process.getuid(),stateInfo.gid);paused=true;
 // Restart is the only service operation: old processes drain writes; their
 // replacements wait at the gate before accepting HTTP or WebSocket traffic.
 await run('systemctl',['restart','clareira-dev-preview-page.service','clareira-dev-preview-room.service']);
 const snapshot=path.join(backup,'json');
 await cp(stateDirectory,snapshot,{recursive:true,preserveTimestamps:true});
 const plan=await buildJsonImportPlan(snapshot);
 await applyJsonImport(pool,plan);
 const store=createPostgresStore(pool);
 for(const {dimensionId,definition} of plan.worlds) assert.deepEqual(await store.loadWorld(dimensionId),definition);
 for(const {dimensionId,fires} of plan.campfires) assert.deepEqual(await store.loadCampfires(dimensionId),fires);
 assert.deepEqual(await store.loadDimensions(),plan.dimensions);
 for(const location of plan.locations){const {profileId,...expected}=location;assert.deepEqual(await store.loadPlayerLocation(profileId),expected);}
 for(const account of plan.accounts) {
  const {rows}=await pool.query('SELECT role,password_hash FROM accounts WHERE id=$1',[account.id]);
  assert.equal(rows[0].role,account.role);assert.deepEqual(rows[0].password_hash,account.passwordHash);
 }
 for(const item of plan.inventories) {
  const {rows}=await pool.query('SELECT quantity FROM inventory_items WHERE profile_id=$1 AND item_id=$2',[item.profileId,item.itemId]);
  assert.equal(Number(rows[0].quantity),item.quantity);
 }
 for(const room of plan.rooms) assert.equal((await store.loadRoom(room.ownerProfileId)).length,room.objects.length);
 // Exercise an actual dump/restore before switching the preview.
 const dump=path.join(backup,'postgres.dump');const output=await open(dump,'wx',0o600);
 try {await run('docker',[...compose,'exec','-T','postgres','pg_dump','-U','clareira','-Fc','clareira'],['ignore',output.fd,'ignore']);}
 finally {await output.close();}
 const verifyName='restore_'+randomUUID().replaceAll('-','');
 await pool.query(`CREATE DATABASE "${verifyName}"`);
 try {
  const input=await open(dump,'r');
  try{await run('docker',[...compose,'exec','-T','postgres','pg_restore','-U','clareira','-d',verifyName,'--exit-on-error'],[input.fd,'ignore','ignore']);}
  finally{await input.close();}
  const verifyUrl=new URL(database);verifyUrl.pathname='/'+verifyName;
  const restored=createDatabasePool({connectionString:verifyUrl.href,max:1});
  try {
   for (const table of ['accounts','profiles','sessions','inventory_items','appearances','rooms','room_objects','worlds','world_chunk_changes','item_transactions','interaction_events','player_locations','player_dimension_positions','player_map_exploration','lodging_claims','cabin_keys','resource_contract_completions','dimension_catalog','dimension_campfires','schema_migrations']) {
    const sql=`SELECT count(*)::integer AS count,md5(COALESCE(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text),'')) AS digest FROM ${table} t`;
    assert.deepEqual((await restored.query(sql)).rows,(await pool.query(sql)).rows,`Restauração divergente: ${table}`);
   }
  }
  finally{await restored.end();}
 }finally{await pool.query(`DROP DATABASE "${verifyName}" WITH (FORCE)`);}
 if (!/^[a-f0-9]{64}$/.test(credentials.GAME_DATABASE_PASSWORD || '')) throw new Error('Execute backends:up para preparar a credencial de aplicação.');
 const role='clareira_preview_game';
 const existingRole=await pool.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role]);
 const formatted=await pool.query("SELECT format($1::text,$2::text,$3::text) AS sql",[existingRole.rowCount ? 'ALTER ROLE %I LOGIN PASSWORD %L' : 'CREATE ROLE %I LOGIN PASSWORD %L',role,credentials.GAME_DATABASE_PASSWORD]);
 await pool.query(formatted.rows[0].sql);
 await pool.query(`GRANT CONNECT ON DATABASE clareira TO ${role}`);
 await pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
 await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
 await pool.query(`REVOKE INSERT,UPDATE,DELETE ON schema_migrations FROM ${role}`);
 await pool.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
 await applyStaffRuntimePrivileges(pool,role);
 const runtimeDatabase=new URL(database);runtimeDatabase.username=role;runtimeDatabase.password=credentials.GAME_DATABASE_PASSWORD;
 const runtime=createDatabasePool({connectionString:runtimeDatabase.href,max:1});
 try{await runtime.query('SELECT max(version) FROM schema_migrations');}finally{await runtime.end();}
 const temporary=configFile+'.tmp';
 await writeFile(temporary,JSON.stringify({stateDirectory,DATABASE_URL:runtimeDatabase.href,REDIS_URL:redis.href})+'\n',{flag:'wx',mode:0o640});
 await chown(temporary,process.getuid(),stateInfo.gid);await rename(temporary,configFile);
 published=true;
 await writeFile(path.join(root,'logs/backends-migration.json'),JSON.stringify({status:'activated',counts:plan.counts,backup,restoreVerified:true},null,2)+'\n');
 console.log('Importação, conferência e restauração aprovadas. Preview ativado com PostgreSQL e Redis.');
} finally {
 await pool.end();
 if(paused) await rm(gate,{force:true});
 if(paused&&!published) console.error('Ativação interrompida. O preview retoma os JSON preservados; o backup permanece privado.');
}
