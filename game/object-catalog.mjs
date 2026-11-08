// Shared, data-only object definitions. No scripts, node references or credentials.
export const OBJECT_SCHEMA_VERSION=1;
const ID=/^[a-z0-9][a-z0-9:._/-]{0,159}$/i;
const TYPES=new Set(['building','room','fixture','window','roof','wall','canopy','post','balcony','door','rug','decor']);
const FIXTURES=new Set(['bed','shower','nightstand','wardrobe','bookshelf','desk','table','chair','sofa','chest','fireplace','plant','counter','stool','lamp']);
const FIXTURE_PALETTES=new Set(['cedar','pine','hotel','vista']);
export const copyData=value=>JSON.parse(JSON.stringify(value));
export function mergeProperties(base,patch){
 if(patch!==undefined&&patch!==null&&(typeof patch!=='object'||Array.isArray(patch)))throw new Error('Propriedades precisam ser um objeto JSON.');
 const result=copyData(base||{});
 for(const [key,value]of Object.entries(patch||{})){
  if(['__proto__','constructor','prototype'].includes(key))throw new Error('Propriedade reservada.');
  result[key]=value&&typeof value==='object'&&!Array.isArray(value)?mergeProperties(result[key]&&typeof result[key]==='object'?result[key]:{},value):copyData(value);
 }
 return result;
}
function safeData(value,depth=0){
 if(depth>20)throw new Error('Propriedades profundas demais.');
 if(typeof value==='number'&&(!Number.isFinite(value)||Math.abs(value)>1e9))throw new Error('Número inválido.');
 if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){
  if(['__proto__','constructor','prototype'].includes(key))throw new Error('Propriedade reservada.');safeData(child,depth+1);
 }
}
export function validateObjectProperties(value){if(!value||typeof value!=='object'||Array.isArray(value)||JSON.stringify(value).length>16384)throw new Error('Propriedades de objeto inválidas.');safeData(value);return copyData(value);}
const finite=(v,label)=>{if(!Number.isFinite(v))throw new Error(`${label} inválido.`);};
function rectangle(b){if(!b)throw new Error('Área ausente.');for(const k of ['left','right','top','bottom'])finite(b[k],k);if(b.right<=b.left||b.bottom<=b.top)throw new Error('Área invertida.');}
export function resolveObjectCatalog(input){
 if(input?.version!==1||!Number.isSafeInteger(input.revision)||input.revision<0)throw new Error('Versão/revisão de objetos inválida.');
 if(!Array.isArray(input.templates)||!Array.isArray(input.objects)||input.objects.length>10000||input.templates.length>2000)throw new Error('Catálogo de objetos inválido.');
 if(JSON.stringify(input).length>8_000_000)throw new Error('Catálogo de objetos grande demais.');safeData(input);
 const templates=new Map(),objects=new Map(),resolvedTemplates=new Map();
 for(const t of input.templates){if(!ID.test(t.id)||templates.has(t.id)||!TYPES.has(t.kind))throw new Error('Modelo inválido/repetido.');templates.set(t.id,t);}
 function model(id,path=new Set()){
  if(resolvedTemplates.has(id))return resolvedTemplates.get(id);
  const t=templates.get(id);if(!t||t.archived)throw new Error(`Modelo indisponível: ${id}`);
  if(path.has(id))throw new Error('Herança circular de modelos.');path.add(id);
  const parent=t.baseId?model(t.baseId,path):null;
  if(parent&&parent.kind!==t.kind)throw new Error('Modelo derivado deve manter o tipo.');
  const result={...t,properties:mergeProperties(parent?.properties,t.properties)};path.delete(id);resolvedTemplates.set(id,result);return result;
 }
 for(const t of templates.values())if(!t.archived)model(t.id);
 for(const raw of input.objects){
  if(!ID.test(raw.id)||objects.has(raw.id)||!ID.test(raw.sceneId))throw new Error('Objeto/cenário inválido ou repetido.');
  const t=raw.archived?templates.get(raw.templateId):model(raw.templateId);
  if(!t)throw new Error('Referência de modelo inválida.');
  objects.set(raw.id,{...raw,kind:t.kind,properties:mergeProperties(raw.archived?{}:t.properties,raw.properties)});
 }
 for(const o of objects.values()){
  if(o.archived)continue;const chain=new Set([o.id]);let p=o;
  while(p.parentId){p=objects.get(p.parentId);if(!p||p.archived||chain.has(p.id))throw new Error('Hierarquia de objetos inválida.');chain.add(p.id);}
  const v=o.properties;
  if(o.kind==='building'){
   if(!/^[a-z0-9-]{1,48}$/.test(v.id)||typeof v.name!=='string'||!v.name.trim()||v.name.length>80)throw new Error('Identidade de construção inválida.');rectangle(v.bounds);
   if(!['reception','inn','hotel','cabin'].includes(v.kind))throw new Error('Tipo de construção inválido.');
   if(!(v.height>0&&v.height<=50)||!Number.isInteger(v.storeys)||v.storeys<1||v.storeys>10)throw new Error('Altura de construção inválida.');
  }
  if(o.kind==='room'){rectangle(v.bounds);for(const key of ['spawn','door']){finite(v[key]?.x,key);finite(v[key]?.y,key);}}
  if(o.kind==='fixture'){
   if(!FIXTURES.has(v.kind))throw new Error('Móvel sem desenho implementado.');
   for(const key of ['x','y','width','depth','height'])if(v[key]!==undefined)finite(v[key],key);
   if((v.width!==undefined&&(v.width<=0||v.width>30))||(v.depth!==undefined&&(v.depth<=0||v.depth>30))
      ||(v.height!==undefined&&(v.height<=0||v.height>30)))throw new Error('Dimensões do móvel inválidas.');
   if(v.surfaceModel!==undefined){
    const surface=resolvedTemplates.get(v.surfaceModel)?.properties;
    if(v.kind!=='counter'||!surface||!['table','desk'].includes(surface.kind)
      ||!Number.isInteger(v.surfaceCount)||v.surfaceCount<1||v.surfaceCount>8)
      throw new Error('Montagem visual do balcão inválida.');
    if(Math.abs(v.width-surface.width*v.surfaceCount)>.01||Math.abs(v.depth-surface.depth)>.01)
      throw new Error('A montagem visual precisa coincidir com o colisor do balcão.');
   }
   if(v.stackable!==undefined&&typeof v.stackable!=='boolean')throw new Error('Regra de empilhamento inválida.');
   if(v.palette!==undefined&&!FIXTURE_PALETTES.has(v.palette))throw new Error('Paleta de móvel desconhecida.');
   if(v.physics!==undefined){if(!v.physics||typeof v.physics!=='object'||Array.isArray(v.physics)
      ||!['circle','box'].includes(v.physics.shape)||v.physics.authority!=='server'
      ||(v.physics.shape==='circle'&&((!Number.isFinite(v.physics.radius)&&!Number.isFinite(v.physics.radiusRatio))
        ||(v.physics.radius!==undefined&&(v.physics.radius<=0||v.physics.radius>15))
        ||(v.physics.radiusRatio!==undefined&&(v.physics.radiusRatio<=0||v.physics.radiusRatio>1))))
      ||(v.physics.colliderWidth!==undefined&&(!Number.isFinite(v.physics.colliderWidth)||v.physics.colliderWidth<=0||v.physics.colliderWidth>30))
      ||(v.physics.colliderDepth!==undefined&&(!Number.isFinite(v.physics.colliderDepth)||v.physics.colliderDepth<=0||v.physics.colliderDepth>30))
      ||(v.physics.colliderWidthRatio!==undefined&&(!Number.isFinite(v.physics.colliderWidthRatio)||v.physics.colliderWidthRatio<=0||v.physics.colliderWidthRatio>1.5))
      ||(v.physics.colliderDepthRatio!==undefined&&(!Number.isFinite(v.physics.colliderDepthRatio)||v.physics.colliderDepthRatio<=0||v.physics.colliderDepthRatio>1.5)))throw new Error('Colisor do móvel inválido.');}
   if(v.depthOrder!==undefined&&(!v.depthOrder||v.depthOrder.anchor!=='footprint-front'
      ||v.depthOrder.vertical!=='support-base'))throw new Error('Regra de profundidade do móvel inválida.');
   if(v.supports!==undefined){if(!v.supports||typeof v.supports!=='object'||Array.isArray(v.supports))throw new Error('Superfícies de apoio inválidas.');
    for(const [id,surface]of Object.entries(v.supports)){if(!/^[a-z0-9_-]{1,24}$/i.test(id)||!Number.isFinite(surface?.width)||!Number.isFinite(surface?.depth)
      ||surface.width<=0||surface.depth<=0||surface.width>30||surface.depth>30||!Array.isArray(surface.accepts)
      ||surface.accepts.some(kind=>!FIXTURES.has(kind)))throw new Error('Superfície de apoio inválida.');}}
   if(v.light!==undefined){const light=v.light;if(!light||typeof light!=='object'||Array.isArray(light)
      ||!Number.isFinite(light.height)||light.height<0||light.height>30||!Number.isFinite(light.reach)||light.reach<=0||light.reach>50
      ||!Number.isFinite(light.strength)||light.strength<0||light.strength>1||!/^#[a-f0-9]{6}$/i.test(light.color||'')
      ||!Number.isFinite(light.nx)||!Number.isFinite(light.ny))throw new Error('Emissão de luz inválida.');}
   if(v.colors!==undefined){const colors=v.colors;if(!colors||typeof colors!=='object'||Array.isArray(colors))throw new Error('Cores do móvel inválidas.');
    for(const [name,color]of Object.entries(colors))if(!['dark','wood','light','fabric','accent','stone','leaf'].includes(name)||!/^#[a-f0-9]{6}$/i.test(color))throw new Error('Cor do móvel inválida.');}
  }
  if(o.kind==='window'&&(!(v.width>0)||!(v.top>v.bottom)||!Number.isFinite(v.x)))throw new Error('Janela inválida.');
  if(['roof','wall'].includes(o.kind)&&(!Array.isArray(v.colors)||v.colors.length<2||v.colors.some(c=>!/^#[a-f0-9]{6}$/i.test(c))))throw new Error('Cores de construção inválidas.');
  if(o.kind==='roof'&&(!['x','y'].includes(v.axis)||!Number.isFinite(v.rise)||v.rise<0||v.rise>20))throw new Error('Telhado inválido.');
  if(o.kind==='door'){finite(v.x,'porta');finite(v.y,'porta');}
  if(['canopy','post','balcony','rug'].includes(o.kind))rectangle(v);
  if(o.kind==='building'&&v.offers){for(const offer of v.offers){if(!['rent','owned'].includes(offer.mode)||!Number.isInteger(offer.unitCount)||offer.unitCount<1||offer.unitCount>100||!Number.isSafeInteger(offer.price)||offer.price<0||offer.price>999999)throw new Error('Oferta de hospedagem inválida.');}}

 }
 return {templates:resolvedTemplates,objects};
}
export function editObjectCatalog(current,operations){
 const next=copyData(current),templates=new Map(next.templates.map(t=>[t.id,t])),objects=new Map(next.objects.map(o=>[o.id,o]));
 for(const op of operations){
  const target=op.collection==='templates'?templates:objects;
  if(op.action==='put'){
   if(!op.value?.id)throw new Error('Objeto sem ID.');const prior=target.get(op.value.id);
   target.set(op.value.id,{...copyData(op.value),version:(prior?.version||0)+1,archived:false});
  }else if(op.action==='patch'){
   const item=target.get(op.id);if(!item||item.archived)throw new Error('Objeto não encontrado.');
   item.properties=mergeProperties(item.properties,op.properties);item.version=(item.version||0)+1;
  }else if(op.action==='archive'){
   const item=target.get(op.id);if(!item)throw new Error('Objeto não encontrado.');
   const ids=new Set([op.id]);if(target===objects){let changed;do{changed=false;for(const o of objects.values())if(ids.has(o.parentId)&&!ids.has(o.id)){ids.add(o.id);changed=true;}}while(changed);}
   for(const id of ids){const row=target.get(id);row.archived=true;row.version=(row.version||0)+1;}
  }else if(op.action==='restore'){
   const item=target.get(op.id);if(!item)throw new Error('Objeto não encontrado.');item.archived=false;item.version=(item.version||0)+1;
  }else if(op.action==='copy'){
   const source=objects.get(op.id);if(!source||source.archived||!ID.test(op.newId))throw new Error('Cópia inválida.');
   const selected=new Set([source.id]);let changed;do{changed=false;for(const o of objects.values())if(!o.archived&&selected.has(o.parentId)&&!selected.has(o.id)){selected.add(o.id);changed=true;}}while(changed);
   const mapping=new Map([...selected].map((id,index)=>[id,index?`${op.newId}/part-${index}`:op.newId]));
   for(const id of selected){const o=copyData(objects.get(id)),newId=mapping.get(id);if(objects.has(newId))throw new Error('O ID da cópia já existe.');o.id=newId;o.parentId=mapping.get(o.parentId)||o.parentId;o.version=1;
    if(id===source.id){o.properties=mergeProperties(o.properties,op.properties);if(op.buildingId)o.properties.id=op.buildingId;
     if(op.offset){for(const key of ['left','right'])o.properties.bounds[key]+=Number(op.offset.x||0);for(const key of ['top','bottom'])o.properties.bounds[key]+=Number(op.offset.y||0);}}
    if(op.buildingId&&source.properties.id&&o.sceneId===`interior:${source.properties.id}`)o.sceneId=`interior:${op.buildingId}`;
    objects.set(newId,o);
   }
  }else throw new Error('Operação de objetos desconhecida.');
 }
 next.templates=[...templates.values()];next.objects=[...objects.values()];next.revision++;resolveObjectCatalog(next);return next;
}
