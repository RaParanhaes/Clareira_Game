import {createHash} from 'node:crypto';
import {createClient} from 'redis';
import {applyObjectCatalog} from '../game/object-state.mjs';
export function objectCacheNamespace(databaseUrl,directory='local'){
 const scope=databaseUrl?new URL(databaseUrl).host+new URL(databaseUrl).pathname:`json:${directory}`;
 return 'clareira:objects:v1:'+createHash('sha256').update(scope).digest('hex').slice(0,20);
}
// PostgreSQL chooses the revision. Cache keys are immutable and revisioned,
// so a delayed reader can never replace a newer catalog with an older one.
export function createObjectCatalogCache(storage,{url=process.env.REDIS_URL,namespace='clareira:objects:v1',client:providedClient}={}){
 const client=providedClient||(url?createClient({url,disableOfflineQueue:true,socket:{connectTimeout:1500,reconnectStrategy:false}}):null);
 client?.on('error',()=>{});let connecting=null;
 async function ready(){if(!client||client.isReady)return;if(!connecting)connecting=client.connect().finally(()=>{connecting=null;});await connecting;}
 return {
  async load(){
   const revision=await storage.objectCatalogRevision(),key=`${namespace}:revision:${revision}`;
   if(client)try{await ready();const cached=await client.get(key);if(cached){const data=JSON.parse(cached);if(data.revision===revision){applyObjectCatalog(data,{validateOnly:true});return data;}}}catch{/* PostgreSQL remains authoritative when the cache is unavailable. */}
   const catalog=await storage.loadObjectCatalog();
   if(client)try{await ready();await client.set(`${namespace}:revision:${catalog.revision}`,JSON.stringify(catalog),{EX:300});}catch{}
   return catalog;
  },
  async close(){if(!providedClient&&client?.isOpen)await client.quit().catch(()=>{});}
 };
}
