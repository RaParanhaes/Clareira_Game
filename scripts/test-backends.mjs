import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createDatabasePool } from '../database/pool.mjs';

const entries = Object.fromEntries((await readFile(new URL('../.local/backends.env', import.meta.url), 'utf8')).trim().split('\n').map(line => { const i=line.indexOf('='); return [line.slice(0,i),line.slice(i+1)]; }));
const base = new URL('postgres://clareira@127.0.0.1:55432/clareira'); base.password=entries.POSTGRES_PASSWORD;
const redis = new URL('redis://127.0.0.1:56379/15'); redis.password=entries.REDIS_PASSWORD;
const admin = createDatabasePool({connectionString:base.href,max:1});
const suffix = randomUUID().replaceAll('-','');
const name = 'test_' + suffix;
const migrationName = 'migration_' + suffix;
let created = false;
let migrationCreated = false;
try {
  await admin.query(`CREATE DATABASE "${migrationName}"`); migrationCreated=true;
  const migrationDatabase = new URL(base.href); migrationDatabase.pathname='/'+migrationName;
  const migrationChild=spawn(process.execPath,['--test','--test-concurrency=1','database/staff-migration.integration.test.mjs'],{
    stdio:'inherit',env:{...process.env,TEST_DATABASE_URL:migrationDatabase.href,STAFF_MIGRATION_ISOLATED:'1'},cwd:new URL('..',import.meta.url)
  });
  const migrationCode=await new Promise((resolve,reject)=>{migrationChild.once('error',reject);migrationChild.once('exit',(code)=>resolve(code??1));});
  if (migrationCode !== 0) {
    process.exitCode=migrationCode;
  } else {
    await admin.query(`CREATE DATABASE "${name}"`); created=true;
    base.pathname='/'+name;
    const all=process.argv.includes('--all');
    const child=spawn(all?'npm':process.execPath,all?['test']:['--test','--test-concurrency=1','database/postgres.integration.test.mjs','database/redis-coordination.test.mjs','database/object-catalog.integration.test.mjs','database/economy.integration.test.mjs','database/staff-authorization.test.mjs'],{
      stdio:'inherit',env:{...process.env,TEST_DATABASE_URL:base.href,TEST_REDIS_URL:redis.href},cwd:new URL('..',import.meta.url)
    });
    process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code)=>resolve(code??1));});
  }
} finally {
  if(created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  if(migrationCreated) await admin.query(`DROP DATABASE "${migrationName}" WITH (FORCE)`);
  await admin.end();
}
