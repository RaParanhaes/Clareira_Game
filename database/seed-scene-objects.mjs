import {readFile,mkdir,open} from 'node:fs/promises';import {spawn} from 'node:child_process';
import {createDatabasePool} from './pool.mjs';import {runMigrations} from './migrate.mjs';
import {createPostgresObjectStore} from './object-store.mjs';import {createObjectCatalogCache,objectCacheNamespace} from './object-cache.mjs';
const config=JSON.parse(await readFile(new URL('../.local/preview-backend.json',import.meta.url),'utf8'));
const env=Object.fromEntries((await readFile(new URL('../.local/backends.env',import.meta.url),'utf8')).trim().split('\n').map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));
const database=new URL(config.DATABASE_URL);database.username='clareira';database.password=env.POSTGRES_PASSWORD;
const pool=createDatabasePool({connectionString:database.href,max:2}),store=createPostgresObjectStore(pool);
const cache=createObjectCatalogCache(store,{url:config.REDIS_URL,namespace:objectCacheNamespace(database.href)});
try{
 const backup=new URL(`../.local/backups/objects-${new Date().toISOString().replaceAll(':','-')}/`,import.meta.url);await mkdir(backup,{recursive:true,mode:0o700});
 const file=await open(new URL('before-objects.dump',backup),'wx',0o600);
 try{const child=spawn('docker',['compose','--env-file','.local/backends.env','-f','infra/backends.compose.yml','exec','-T','postgres','pg_dump','-U','clareira','-Fc','clareira'],{cwd:new URL('..',import.meta.url),stdio:['ignore',file.fd,'inherit']});await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Backup PostgreSQL falhou.')));});}finally{await file.close();}
 const migration=await runMigrations(pool);await store.ensureObjectCatalog();const c=await cache.load();
 console.log(JSON.stringify({migrations:migration.migrations,revision:c.revision,templates:c.templates.length,objects:c.objects.length,backup:backup.pathname},null,2));
}finally{await cache.close();await pool.end();}
