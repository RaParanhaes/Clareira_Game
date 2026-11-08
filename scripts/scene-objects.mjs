import {editObjectCatalog} from '../game/object-catalog.mjs';
import {applyObjectCatalog} from '../game/object-state.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createDatabasePool} from '../database/pool.mjs';
import {createPostgresObjectStore} from '../database/object-store.mjs';
import {createObjectCatalogCache,objectCacheNamespace} from '../database/object-cache.mjs';
const config=JSON.parse(await readFile(new URL('../.local/preview-backend.json',import.meta.url),'utf8'));
const databaseUrl=process.env.DATABASE_URL||config.DATABASE_URL;
const pool=createDatabasePool({connectionString:databaseUrl,max:2});const store=createPostgresObjectStore(pool);
const cache=createObjectCatalogCache(store,{url:process.env.REDIS_URL||config.REDIS_URL,namespace:objectCacheNamespace(databaseUrl)});
const [command,file]=process.argv.slice(2);
try{
 if(command==='list'){
  const c=await store.loadObjectCatalog();console.log(JSON.stringify({revision:c.revision,templates:c.templates.filter(t=>!t.archived).map(({id,kind,baseId})=>({id,kind,baseId})),objects:c.objects.filter(o=>!o.archived).map(({id,parentId,templateId,sceneId})=>({id,parentId,templateId,sceneId}))},null,2));
 }else if(command==='export'&&file){await writeFile(file,JSON.stringify(await store.loadObjectCatalog(),null,2)+'\n',{mode:0o600,flag:'wx'});console.log('Catálogo exportado.');
 }else if(command==='apply'&&file){const request=JSON.parse(await readFile(file,'utf8'));const c=await store.editObjectCatalog(request);await cache.load();console.log(JSON.stringify({revision:c.revision,status:'saved'}));
 }else if(command==='validate'&&file){const request=JSON.parse(await readFile(file,'utf8'));const current=await store.loadObjectCatalog();if(current.revision!==request.expectedRevision)throw new Error('Revisão desatualizada.');const next=editObjectCatalog(current,request.operations);applyObjectCatalog(next,{validateOnly:true});console.log(JSON.stringify({status:'valid',readOnly:true,revision:current.revision}));
 }else if(command==='history')console.log(JSON.stringify(await store.objectCatalogHistory(),null,2));
 else throw new Error('Uso: npm run objects -- list | export ARQUIVO | validate ARQUIVO | apply ARQUIVO | history');
}finally{await cache.close();await pool.end();}
