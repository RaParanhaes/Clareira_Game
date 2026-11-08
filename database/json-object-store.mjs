import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';import {randomUUID} from 'node:crypto';
import {BUILTIN_OBJECT_CATALOG} from '../game/object-catalog-seed.mjs';
import {copyData,editObjectCatalog} from '../game/object-catalog.mjs';
import {applyObjectCatalog} from '../game/object-state.mjs';
export function createJsonObjectStore(directory){
 const file=path.join(directory,'object-catalog.json');let queue=Promise.resolve();
 async function read(){try{const data=JSON.parse(await readFile(file,'utf8'));applyObjectCatalog(data,{validateOnly:true});return data;}catch(error){if(error.code==='ENOENT')return copyData(BUILTIN_OBJECT_CATALOG);throw error;}}
 return {async ensureObjectCatalog(){},loadObjectCatalog:read,async objectCatalogRevision(){return (await read()).revision;},
  async editObjectCatalog({expectedRevision,operations}){
   const previous=queue;let release;queue=new Promise(resolve=>release=resolve);await previous;
   try{const before=await read();if(before.revision!==expectedRevision)throw Object.assign(new Error('Revisão de objetos desatualizada.'),{status:409});const after=editObjectCatalog(before,operations);applyObjectCatalog(after,{validateOnly:true});await mkdir(directory,{recursive:true,mode:0o700});const temporary=`${file}.${randomUUID()}.tmp`;await writeFile(temporary,JSON.stringify(after),{mode:0o600,flag:'wx'});await rename(temporary,file);return after;}finally{release();}
  },async objectCatalogHistory(){return[];}
 };
}
