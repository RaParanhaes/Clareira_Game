import {readFile} from 'node:fs/promises';
import {createClient} from 'redis';
import {createDatabasePool} from './pool.mjs';
const config=JSON.parse(await readFile(new URL('../.local/preview-backend.json',import.meta.url),'utf8'));
const pool=createDatabasePool({connectionString:config.DATABASE_URL,max:1});
const redis=createClient({url:config.REDIS_URL,disableOfflineQueue:true,socket:{connectTimeout:3000,reconnectStrategy:false}});
redis.on('error',()=>{});
try {
 const {rows}=await pool.query('SELECT max(version)::integer AS version FROM schema_migrations');
 const role=await pool.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user');
 await redis.connect();
 console.log(JSON.stringify({postgres:'ready',schemaVersion:rows[0].version,applicationSuperuser:role.rows[0].rolsuper,redis:await redis.ping(),stateDirectory:config.stateDirectory},null,2));
}finally{if(redis.isOpen)await redis.quit();await pool.end();}
