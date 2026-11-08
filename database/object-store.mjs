import {copyData,editObjectCatalog,resolveObjectCatalog} from '../game/object-catalog.mjs';
import {applyObjectCatalog} from '../game/object-state.mjs';
import {BUILTIN_OBJECT_CATALOG} from '../game/object-catalog-seed.mjs';

export function createPostgresObjectStore(pool){
 async function read(executor){
  const state=await executor.query('SELECT revision FROM object_catalog_state WHERE id=true');
  const templates=await executor.query('SELECT id,base_id AS "baseId",kind,properties,version,archived FROM object_templates ORDER BY id');
  const objects=await executor.query('SELECT id,template_id AS "templateId",parent_id AS "parentId",scene_id AS "sceneId",properties,version,archived FROM scene_objects ORDER BY id');
  return {version:1,revision:Number(state.rows[0]?.revision||0),templates:templates.rows,objects:objects.rows};
 }
 async function rows(client,catalog){
  for(const t of catalog.templates)await client.query('INSERT INTO object_templates(id,base_id,kind,properties,version,archived) VALUES($1,$2,$3,$4::jsonb,$5,$6) ON CONFLICT(id) DO UPDATE SET base_id=EXCLUDED.base_id,kind=EXCLUDED.kind,properties=EXCLUDED.properties,version=EXCLUDED.version,archived=EXCLUDED.archived',[t.id,t.baseId||null,t.kind,JSON.stringify(t.properties),t.version||1,Boolean(t.archived)]);
  for(const o of catalog.objects)await client.query('INSERT INTO scene_objects(id,template_id,parent_id,scene_id,properties,version,archived) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7) ON CONFLICT(id) DO UPDATE SET template_id=EXCLUDED.template_id,parent_id=EXCLUDED.parent_id,scene_id=EXCLUDED.scene_id,properties=EXCLUDED.properties,version=EXCLUDED.version,archived=EXCLUDED.archived',[o.id,o.templateId,o.parentId||null,o.sceneId,JSON.stringify(o.properties),o.version||1,Boolean(o.archived)]);
 }
 async function transaction(callback){const client=await pool.connect();try{await client.query('BEGIN');const value=await callback(client);await client.query('COMMIT');return value;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
 return {
  async ensureObjectCatalog(){return transaction(async client=>{
   await client.query('SELECT pg_advisory_xact_lock(1128352846)');
   const prior=await client.query('SELECT 1 FROM object_catalog_state WHERE id=true');if(prior.rowCount)return;
   const seed=copyData(BUILTIN_OBJECT_CATALOG);applyObjectCatalog(seed,{validateOnly:true});await rows(client,seed);
   await client.query('INSERT INTO object_catalog_state(id,revision) VALUES(true,0)');
  });},
  async objectCatalogRevision(){const result=await pool.query('SELECT revision FROM object_catalog_state WHERE id=true');return Number(result.rows[0]?.revision??-1);},
  async loadObjectCatalog(){const client=await pool.connect();try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const value=await read(client);await client.query('COMMIT');return value;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}},
  async editObjectCatalog({expectedRevision,operations,actor='operator'}){return transaction(async client=>{
   const state=await client.query('SELECT revision FROM object_catalog_state WHERE id=true FOR UPDATE');
   if(Number(state.rows[0]?.revision)!==expectedRevision)throw Object.assign(new Error('Os objetos foram alterados. Releia a revisão antes de salvar.'),{status:409});
   const before=await read(client),after=editObjectCatalog(before,operations);applyObjectCatalog(after,{validateOnly:true});
   // A claimed property cannot be removed or silently changed into a public
   // building. Keys/claims are never included when copying an assembly.
   const active=applyObjectCatalog(after,{validateOnly:true}).buildings;
   const claims=await client.query("SELECT DISTINCT building_id FROM lodging_claims WHERE mode='owned' OR expires_at>now()");
   const previous=applyObjectCatalog(before,{validateOnly:true}).buildings;
   for(const {building_id:id}of claims.rows)if(!active.has(id)||active.get(id).kind!==previous.get(id)?.kind)throw new Error('A construção possui propriedade ou hospedagem ativa.');
   const nextView=applyObjectCatalog(after,{validateOnly:true}),oldView=applyObjectCatalog(before,{validateOnly:true});
   const nextTemplates=resolveObjectCatalog(after).templates,oldTemplates=resolveObjectCatalog(before).templates;
   // A profile can own several units, and its ordinary home is independent.
   // Resolve each saved object against its physical room, not every claim of
   // its owner; otherwise one room is checked against unrelated floor plans.
   const saved=await client.query("SELECT r.owner_profile_id,o.furniture_id,o.x,o.y,o.rotation,o.properties,CASE WHEN r.lodging_key IS NOT NULL THEN split_part(r.lodging_key,':',1) END AS building_id,CASE WHEN r.lodging_key IS NOT NULL THEN split_part(r.lodging_key,':',2) END AS mode FROM room_objects o JOIN rooms r ON r.id=o.room_id");
   const fits=(view,models,row)=>{
    const layout=view.rooms.get(row.building_id?`lodging:${row.building_id}:${row.mode}`:'legacy:arrival:');if(!layout)return false;
    const p=row.properties||{},model=models.get(row.furniture_id)?.properties||{},x=Number(row.x),y=Number(row.y),b=layout.bounds;
    const quarter=Math.abs(Number(row.rotation)||0)%2,width=Number(p.width??model.width??.76),depth=Number(p.depth??model.depth??.76);
    const w=quarter?depth:width,d=quarter?width:depth,rect={left:x-w/2,right:x+w/2,top:y-d/2,bottom:y+d/2};
    const circle=model.physics?.shape==='circle',radius=Math.max(model.physics?.radius??0,width/2,depth/2);
    if(circle?(x-radius<b.left||x+radius>b.right||y-radius<b.top||y+radius>b.bottom)
      :(rect.left<b.left||rect.right>b.right||rect.top<b.top||rect.bottom>b.bottom))return false;
    const obstacles=[...layout.obstacles,...(layout.counter?[layout.counter]:[])];
    return !obstacles.some(obstacle=>circle
      ?Math.hypot(x-Math.max(obstacle.left,Math.min(obstacle.right,x)),y-Math.max(obstacle.top,Math.min(obstacle.bottom,y)))<radius
      :rect.left<obstacle.right&&rect.right>obstacle.left&&rect.top<obstacle.bottom&&rect.bottom>obstacle.top);
   };
   for(const row of saved.rows)if(fits(oldView,oldTemplates,row)&&!fits(nextView,nextTemplates,row))throw new Error('A alteração bloquearia um móvel já salvo. Mova o móvel antes de alterar a estrutura.');
   await rows(client,after);
   await client.query('UPDATE object_catalog_state SET revision=$1 WHERE id=true',[after.revision]);
   await client.query('INSERT INTO object_catalog_history(revision,actor,changes,previous_snapshot) VALUES($1,$2,$3::jsonb,$4::jsonb)',[after.revision,String(actor).slice(0,100),JSON.stringify(operations),JSON.stringify(before)]);return after;
  });},
  async objectCatalogHistory(){const result=await pool.query('SELECT revision,actor,changes,created_at AS "createdAt" FROM object_catalog_history ORDER BY revision DESC LIMIT 50');return result.rows;},
 };
}
