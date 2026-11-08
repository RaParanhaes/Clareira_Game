import {objectTemplate} from './object-state.mjs';
// Shared metadata only: no images, browser objects or instance/save data.
import { CHARACTER_CATALOG, CHARACTER_CATEGORIES } from './character-catalog.mjs';
import { WILDLIFE_SPECIES } from './wildlife.mjs';
import { MEDIEVAL_FURNITURE } from './medieval-furniture.mjs';
export const CONTENT_VERSION = 1;
export const CONTENT_CATEGORIES = Object.freeze([...new Set(['world','dimension','place','object','furniture','mob','item','material','animation','style', ...CHARACTER_CATEGORIES])]);
const entry = (id, category, label, extra = {}) => {
  const data={id, category, label, version:1, status:'implemented', refs:[], ...extra};
  if(category==='furniture'){
    const shape=extra.physics?.shape||'box';
    data.physics={shape,authority:'server',...(shape==='box'?{
      colliderWidthRatio:1,colliderDepthRatio:1,
    }:{}),...extra.physics};
    data.depthOrder={anchor:'footprint-front',vertical:'support-base',...extra.depthOrder};
  }
  return data;
};
const metadataSpeciesId=id=>String(id).replace(/[A-Z]/g,letter=>`-${letter.toLowerCase()}`);
export const CONTENT = Object.freeze([
  entry('style.clareira','style','Pixel art isométrica', {projection:{tileX:8,tileY:4.5}, directions:8, palette:'theme.mjs'}),
  entry('style.frame-avatar','style','Personagem em pixel art', {refs:['style.clareira','material.cloth','body.male','body.female'],directions:8,bodies:['male','female'],renderer:'avatar-sprites.mjs',format:'transparent-png-frame-atlases',nativeHeight:80,anchor:'ground-centre'}),
  ...CHARACTER_CATALOG.map(definition => ({...definition, version:1, refs:definition.category==='character'?[...new Set(Object.values(definition.defaults||{}))]:definition.refs})),
  entry('world.clareira','world','Clareira', {refs:['place.clearing','place.room','style.clareira']}),
  entry('dimension.surface','dimension','Superfície', {refs:['world.clareira']}),
  entry('dimension.dark','dimension','O Breu', {status:'planned',refs:['world.clareira'],theme:'dark',features:['campfire-arrival','reduced-resources']}),
  entry('dimension.sky','dimension','Altos do Céu', {status:'planned',refs:['world.clareira'],theme:'sky',features:['cloud-sky','floating-islands']}),
  entry('dimension.magic','dimension','Mundo Mágico', {status:'planned',refs:['world.clareira'],theme:'magic',features:['enchanted-forest','ancient-sites']}),
  entry('dimension.inferno','dimension','Inferno', {status:'planned',refs:['world.clareira'],theme:'inferno',features:['ember-rock','lava']}),
  entry('dimension.giants','dimension','Terra dos Gigantes', {status:'planned',refs:['world.clareira'],theme:'giants',features:['colossal-landmarks']}),
  entry('dimension.energy','dimension','Mundo Energético', {status:'planned',refs:['world.clareira'],theme:'energy',features:['energy-rifts','charged-water']}),
  entry('place.clearing','place','Bosque das Brasas', {scene:'clearing', architecture:{exterior:'madeira escura, pedra musgosa e telhas de barro',interior:'lareiras, tecidos terrosos e móveis rústicos',landmark:'taverna em torno de árvore',variation:['planta','silhueta','proprietário','conservação']}, refs:['dimension.surface','object.tree','object.tree-growth','object.fallen-tree','object.shrub','object.fern','object.rosebush','object.vine','object.fire','object.cabin','object.river','object.stream','object.waterfall','object.ore-vein','object.wood-bench','object.charcoal-kiln','object.stone-furnace','object.production-batch','item.wood','item.timber','item.sturdy-branch','item.stone','item.berries','item.apples','item.leaves','item.vines','item.log','item.plank','item.stone-axe','item.copper-axe','item.iron-axe','item.stone-pickaxe','item.copper-pickaxe','item.iron-pickaxe','item.copper-ore','item.iron-ore','item.coal','item.charcoal','item.copper-ingot','item.iron-ingot','item.raw-meat','item.hide','item.bone','item.feather','item.venom','item.glow-dust',...WILDLIFE_SPECIES.map(definition=>`mob.${metadataSpeciesId(definition.id)}`)], terrain:'natural-continuous'}),
  entry("place.mining-village","place","Vila de mineração", {"status": "planned", "refs": ["dimension.surface", "style.clareira"], "architecture": {"exterior": "pedra bruta, madeira reforçada e ardósia", "interior": "bancadas robustas, bancos coletivos e lampiões", "landmark": "salão subterrâneo", "variation": ["planta", "silhueta", "proprietário", "conservação"]}}),
  entry("place.trade-city","place","Cidade comercial", {"status": "planned", "refs": ["dimension.surface", "style.clareira"], "architecture": {"exterior": "sobrados, fachadas estreitas e toldos", "interior": "ladrilhos, expositores e móveis de várias origens", "landmark": "mercado com pátio", "variation": ["planta", "silhueta", "proprietário", "conservação"]}}),
  entry("place.rich-village","place","Vila Rica", {"status": "planned", "refs": ["dimension.surface", "style.clareira"], "architecture": {"exterior": "pedra trabalhada, jardins e portões", "interior": "madeira entalhada, estofados e lustres", "landmark": "hospedaria com jardim interno", "variation": ["planta", "silhueta", "proprietário", "conservação"]}}),
  entry("place.port-village","place","Vila portuária", {"status": "planned", "refs": ["dimension.surface", "style.clareira"], "architecture": {"exterior": "docas, armazéns e madeira salgada", "interior": "mapas náuticos, redes e beliches", "landmark": "taverna de estivadores", "variation": ["planta", "silhueta", "proprietário", "conservação"]}}),
  entry("place.ghost-city","place","Cidade fantasma", {"status": "planned", "refs": ["dimension.surface", "style.clareira"], "architecture": {"exterior": "fachadas deterioradas e vegetação invasora", "interior": "móveis empoeirados e objetos abandonados", "landmark": "antiga estalagem", "variation": ["planta", "silhueta", "proprietário", "conservação"]}}),
  entry("place.mountain-city","place","Cidade das montanhas", {"status": "planned", "refs": ["dimension.surface", "style.clareira"], "architecture": {"exterior": "pedra, terraços e telhados inclinados", "interior": "fogões, lã e móveis compactos", "landmark": "estalagem escavada na encosta", "variation": ["planta", "silhueta", "proprietário", "conservação"]}}),
  entry("place.cloud-village","place","Vila das Nuvens", {"status": "planned", "refs": ["dimension.surface", "style.clareira"], "architecture": {"exterior": "torres claras, passarelas e cobre", "interior": "vidro, tecidos leves e sinos de vento", "landmark": "salão panorâmico", "variation": ["planta", "silhueta", "proprietário", "conservação"]}}),
  entry("place.rill-woods","place","Bosque dos riachos", {"status": "planned", "refs": ["dimension.surface", "style.clareira"], "architecture": {"exterior": "pontes, jardins e rodas-d’água", "interior": "madeira clara, cerâmica e plantas", "landmark": "taverna do moinho", "variation": ["planta", "silhueta", "proprietário", "conservação"]}}),
  entry("place.fjord-village","place","Vila Fiord", {"status": "planned", "refs": ["dimension.surface", "style.clareira"], "architecture": {"exterior": "madeira colorida, píeres e telhados íngremes", "interior": "madeira entalhada, lã e lareira de pedra", "landmark": "estalagem sobre o píer", "variation": ["planta", "silhueta", "proprietário", "conservação"]}}),
  entry('place.room','place','Seu quarto', {scene:'room', refs:['furniture.stool','material.wood'], terrain:'authored-levels'}),
  ...WILDLIFE_SPECIES.map(definition=>entry(`mob.${metadataSpeciesId(definition.id)}`,'mob',definition.label,{scene:'clearing',kind:definition.form,renderer:'wildlife.mjs',physics:{shape:'none',authority:'server'},clock:'server-simulation',habitats:definition.habitats,diet:definition.diet,shelter:definition.shelter,activity:definition.activity,lifeGoal:definition.lifeGoal,defense:definition.defense,attack:definition.attack,prey:definition.prey,predators:definition.predators,drops:definition.drops,refs:['place.clearing','style.clareira','material.grass']})),
  entry('object.wildlife-shelter','object','Tocas, ninhos e refúgios da fauna',{scene:'clearing',kind:'wildlife-shelter',renderer:'procedural',physics:{shape:'none',authority:'server'},refs:['place.clearing','material.grass']}),
  entry('object.tree','object','Árvore', {physics:{shape:'circle', authority:'server'}, renderer:'procedural'}),
  entry('object.tree-growth','object','Toco, muda e árvore jovem', {scene:'clearing',kind:'tree-regrowth-stage',physics:{shape:'none',authority:'server'},renderer:'procedural',refs:['object.tree']}),
  entry('object.fallen-tree','object','Árvore caída', {physics:{shape:'capsule',radius:.24,halfLength:1.3,authority:'server'}, renderer:'procedural'}),
  entry('object.shrub','object','Moitas e arbustos', {scene:'clearing',kind:'decorative-undergrowth',physics:{shape:'none',authority:'server'},renderer:'procedural',refs:['material.grass']}),
  entry('object.fern','object','Samambaias e folhagens', {scene:'clearing',kind:'decorative-fern',physics:{shape:'none',authority:'server'},renderer:'procedural',refs:['material.grass']}),
  entry('object.rosebush','object','Roseiras e flores silvestres', {scene:'clearing',kind:'decorative-flower',physics:{shape:'none',authority:'server'},renderer:'procedural',refs:['material.grass']}),
  entry('object.vine','object','Cipós', {scene:'clearing',kind:'decorative-vine',physics:{shape:'none',authority:'server'},renderer:'procedural',refs:['material.grass']}),
  entry('object.fire','object','Fogueira', {physics:{shape:'circle',radius:.65,authority:'server'}, renderer:'png-frame-atlas', refs:['animation.campfire-hearth','animation.flame','animation.campfire-aura','animation.campfire-sky-rays']}),
  entry('object.cabin','object','Cabana', {physics:{shape:'box', authority:'server'}, renderer:'procedural', refs:['material.wood','material.stone']}),
  entry('object.river','object','Rio', {scene:'clearing',kind:'river',physics:{shape:'none',authority:'server',interaction:'shallow-current',wadingDepth:.86},renderer:'procedural',refs:['material.water','animation.water']}),
  entry('object.stream','object','Riacho', {scene:'clearing',kind:'stream',physics:{shape:'none',authority:'server',interaction:'shallow-current',wadingDepth:.86},renderer:'procedural',refs:['material.water','animation.water']}),
  entry('object.waterfall','object','Cachoeira', {scene:'clearing',kind:'waterfall',physics:{shape:'none',authority:'server',interaction:'shallow-current',wadingDepth:.86},renderer:'procedural',refs:['material.water','animation.water']}),
  entry('object.ore-vein','object','Veios de minério e carvão', {scene:'clearing',kind:'finite-resource',physics:{shape:'none',authority:'server',interaction:'pickaxe'},renderer:'procedural',refs:['item.copper-ore','item.iron-ore','item.coal']}),
  entry('object.wood-bench','object','Bancada de corte', {scene:'clearing',kind:'wood-processing',physics:{shape:'none',authority:'server',interaction:'production'},renderer:'procedural',refs:['item.timber','item.plank','item.wood']}),
  entry('object.charcoal-kiln','object','Caieira de carvão vegetal', {scene:'clearing',kind:'charcoal-production',physics:{shape:'none',authority:'server',interaction:'production'},renderer:'procedural',refs:['item.timber','item.charcoal']}),
  entry('object.stone-furnace','object','Fornalha de pedra', {scene:'clearing',kind:'smelting',physics:{shape:'none',authority:'server',interaction:'production'},renderer:'procedural',refs:['item.copper-ore','item.iron-ore','item.charcoal','item.coal','item.copper-ingot','item.iron-ingot']}),
  entry('object.production-batch','object','Lote de produção', {scene:'clearing',kind:'timed-output',physics:{shape:'none',authority:'server',interaction:'collect'},renderer:'procedural',refs:['item.wood','item.plank','item.charcoal','item.copper-ingot','item.iron-ingot']}),
  entry('furniture.stool','furniture','Banco', {kind:'stool', width:.76, depth:.76, physics:{shape:'circle',radiusRatio:.5,authority:'server'}, renderer:'png-frame-atlas',manifest:'art/room-furniture/manifest.json', rotations:4, height:1.05, use:'sit', refs:['material.wood']}),
  entry('furniture.chair','furniture','Cadeira', {kind:'chair', width:.52, depth:.52, physics:{shape:'box',authority:'server'}, renderer:'png-frame-atlas',manifest:'art/room-furniture/manifest.json', rotations:4, height:2.2, use:'sit', refs:['material.wood']}),
  entry('furniture.lamp','furniture','Luminária', {kind:'lamp', width:.52, depth:.52, physics:{shape:'box',authority:'server'}, renderer:'png-frame-atlas',manifest:'art/room-furniture/manifest.json', rotations:4, height:2.8, use:'light', light:{height:2.4,reach:5.5,strength:1,color:'#ffcf88',nx:0,ny:0}, refs:['material.wood']}),
  entry('furniture.bed','furniture','Cama', {kind:'bed',width:1.9,depth:1.25,physics:{shape:'box',authority:'server'},renderer:'png-frame-atlas',manifest:'art/room-furniture/manifest.json',rotations:4,height:1.1,use:'lie',refs:['material.wood','animation.furniture']}),
  entry('furniture.shower','furniture','Ducha', {kind:'shower',width:.95,depth:.95,physics:{shape:'box',colliderWidthRatio:.86,colliderDepthRatio:.86,authority:'server'},renderer:'png-frame-atlas',manifest:'art/room-furniture/manifest.json',rotations:4,height:2.65,use:'shower',refs:['material.stone','material.water','animation.furniture']}),
  entry('furniture.nightstand','furniture','Criado-mudo', {kind:'nightstand',width:.7,depth:.65,physics:{shape:'box',authority:'server'},renderer:'png-frame-atlas',manifest:'art/room-furniture/manifest.json',rotations:4,height:1.05,supports:{top:{width:.54,depth:.48,accepts:['plant']}},refs:['material.wood']}),
  entry('furniture.wardrobe','furniture','Guarda-roupa', {kind:'wardrobe',width:1.1,depth:.9,physics:{shape:'box',authority:'server'},renderer:'png-frame-atlas',manifest:'art/room-furniture/manifest.json',rotations:4,height:3,refs:['material.wood']}),
  entry('furniture.bookshelf','furniture','Estante', {kind:'bookshelf',width:1.15,depth:.65,physics:{shape:'box',authority:'server'},renderer:'png-frame-atlas',manifest:'art/room-furniture/manifest.json',rotations:4,height:2.9,refs:['material.wood']}),
  entry('furniture.desk','furniture','Escrivaninha', {kind:'desk',width:1.4,depth:.8,physics:{shape:'box',authority:'server'},renderer:'png-frame-atlas',manifest:'art/room-furniture/manifest.json',rotations:4,height:1.5,supports:{top:{width:1.16,depth:.58,accepts:['plant']}},refs:['material.wood']}),
  entry('furniture.table','furniture','Mesa', {kind:'table',width:1.5,depth:1,physics:{shape:'box',authority:'server'},renderer:'png-frame-atlas',manifest:'art/room-furniture/manifest.json',rotations:4,height:1.5,supports:{top:{width:1.3,depth:.8,accepts:['plant']}},refs:['material.wood']}),
  entry('furniture.sofa','furniture','Sofá', {kind:'sofa',width:1.7,depth:.9,physics:{shape:'box',authority:'server'},renderer:'png-frame-atlas',manifest:'art/room-furniture/manifest.json',rotations:4,height:1.9,refs:['material.wood']}),
  entry('furniture.chest','furniture','Baú', {kind:'chest',width:1,depth:.65,physics:{shape:'box',authority:'server'},renderer:'png-frame-atlas',manifest:'art/room-furniture/manifest.json',rotations:4,height:1,supports:{top:{width:.78,depth:.43,accepts:['plant']}},refs:['material.wood']}),
  entry('furniture.plant','furniture','Planta', {kind:'plant',width:.52,depth:.52,physics:{shape:'circle',radiusRatio:.42,authority:'server'},renderer:'png-frame-atlas',manifest:'art/room-furniture/manifest.json',rotations:4,height:1.9,stackable:true,refs:['material.wood']}),
  ...MEDIEVAL_FURNITURE.map(item=>entry(item.id,'furniture',item.label,{...item,category:'furniture',catalogCategory:item.category,kind:item.renderKind,refs:['material.wood','style.clareira']})),
  ...['wood','timber','sturdyBranch','stone','berries','apples','leaves','vines','log','plank','copperOre','ironOre','coal','charcoal','copperIngot','ironIngot','knife','stone-axe','stone-pickaxe','rawMeat','hide','bone','feather','venom','glowDust'].map(kind=>entry(`item.${kind==='sturdyBranch'?'sturdy-branch':kind==='copperOre'?'copper-ore':kind==='ironOre'?'iron-ore':kind==='copperIngot'?'copper-ingot':kind==='ironIngot'?'iron-ingot':kind==='rawMeat'?'raw-meat':kind==='glowDust'?'glow-dust':kind}`,'item', {
    wood:'Graveto seco',timber:'Madeira bruta',sturdyBranch:'Galho forte',stone:'Pedra solta',berries:'Frutinha',apples:'Maçã',leaves:'Folha seca',vines:'Cipó',log:'Tora',plank:'Ripa de madeira',copperOre:'Minério de cobre',ironOre:'Minério de ferro',coal:'Carvão mineral',charcoal:'Carvão vegetal',copperIngot:'Lingote de cobre',ironIngot:'Lingote de ferro',rawMeat:'Carne crua',hide:'Couro',bone:'Osso',feather:'Pena',venom:'Veneno',glowDust:'Pó de luz',knife:'Faca simples','stone-axe':'Machado de pedra','stone-pickaxe':'Picareta de pedra',
  }[kind], {kind,renderer:'procedural'})),
  ...['wood','stone','cloth','grass','water'].map(kind=>entry(`material.${kind}`,'material',kind,{renderer:'procedural',palette:'theme.mjs'})),
  entry('item.copper-axe','item','Machado de cobre',{kind:'copperAxe',renderer:'procedural'}),
  entry('item.iron-axe','item','Machado de ferro',{kind:'ironAxe',renderer:'procedural'}),
  entry('item.copper-pickaxe','item','Picareta de cobre',{kind:'copperPickaxe',renderer:'procedural'}),
  entry('item.iron-pickaxe','item','Picareta de ferro',{kind:'ironPickaxe',renderer:'procedural'}),
  entry('animation.wildlife','animation','Movimento e ciclos da fauna', {clock:'server-simulation',actions:['forage','drink','rest','hide','flee','defend','hunt','breed','age'],renderer:'procedural',refs:['style.clareira','material.grass']}),
  entry('animation.water','animation','Água corrente, vento e respingos', {clock:'simulation',actions:['wind-ripples','flow','footstep-splash','waterfall'],renderer:'procedural',refs:['material.water']}),
  entry('animation.furniture','animation','Ações com móveis', {clock:'server-state',actions:['sit','lie-under-covers','shower','water-drops','sleep-breath'],renderer:'canvas-and-png-atlas',manifest:'art/room-furniture/manifest.json',refs:['furniture.chair','furniture.bed','furniture.shower']}),
  entry('animation.avatar','animation','Base do personagem', {refs:['style.frame-avatar'],directions:8,clock:'direction-only',actions:['idle'],renderer:'png-frame-atlas',manifest:'art/avatar-frames/character-layers-v1/manifest.json',sourceCaveats:['quadros de movimento ainda precisam ser desenhados e revisados'],nativeHeight:80}),
  entry('animation.campfire-hearth','animation','Lenha, pedras e chamas da fogueira', {clock:'simulation',renderer:'png-frame-atlas',manifest:'art/fire/campfire-hearth-frames.json',frameCount:8,frameDurationMs:100,loop:true,anchor:{x:20,y:36},display:{width:40,height:40},actions:['flicker','ignition-ramp'],motionReducedFrame:0,refs:['object.fire','style.clareira','material.wood','material.stone']}),
  entry('animation.flame','animation','Chama, fumaça e brasas', {clock:'simulation',renderer:'canvas-frame-atlas',manifest:'art/fire/campfire-flame-frames.json',frameCount:16,frameDurationMs:80,actions:['flicker','wind-drift','buoyant-smoke','rising-embers']}),
  entry('animation.campfire-aura','animation','Magia e estrelas da fogueira', {clock:'simulation',renderer:'png-frame-atlas',manifest:'art/fire/campfire-aura-frames.json',frameCount:8,frameDurationMs:120,loop:true,anchor:{x:32,y:48},display:{width:64,height:64},actions:['ground-orbit','floating-star-motes'],motionReducedFrame:0,onlyTheme:'dark',refs:['object.fire','style.clareira']}),
  entry('animation.campfire-sky-rays','animation','Feixes celestes da fogueira', {clock:'arrival-cinematic',renderer:'png-frame-atlas',manifest:'art/fire/campfire-sky-rays-frames.json',frameCount:16,frameDurationMs:60,loop:true,anchor:{x:64,y:384},direction:'sky-to-campfire-spawn',interpolated:true,motionReducedFrame:0,refs:['object.fire','style.clareira']}),
]);
const index = new Map(CONTENT.map(value=>[value.id,Object.freeze(value)]));
export function contentById(id) { return index.get(id); }
export function furnitureByKind(kind) {
  const builtin=CONTENT.find(value=>value.category==='furniture'&&value.kind===kind&&value.status==='implemented');
  const authored=objectTemplate(`furniture.${kind}`)?.properties||objectTemplate(`fixture.${kind}`)?.properties;
  return builtin&&authored?{...builtin,...authored,id:builtin.id,kind,physics:{...builtin.physics,...authored.physics}}:builtin;
}
export function furnitureByCatalogId(id){return MEDIEVAL_FURNITURE.find(item=>item.id===id);}
export function validateContent(entries) {
  if (!Array.isArray(entries)) return ['Catálogo precisa ser uma lista'];
  const errors=[], ids=new Set();
  for(const value of entries){
    if(!value || !/^[a-z]+(?:-[a-z]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id||''))errors.push('ID inválido');
    if(ids.has(value?.id))errors.push(`ID duplicado: ${value.id}`); ids.add(value?.id);
    if(!CONTENT_CATEGORIES.includes(value?.category) || (typeof value?.id!=='string' || !value.id.startsWith(`${value.category}.`)))errors.push(`Categoria inválida: ${value?.id}`);
    if(value?.version!==1 || !['implemented','planned'].includes(value?.status) || (typeof value?.label!=='string' || !value.label.trim()))errors.push(`Metadados inválidos: ${value?.id}`);
    if(!Array.isArray(value?.refs))errors.push(`Referências inválidas: ${value?.id}`);
    if(value?.physics && (value.physics.authority!=='server' || !['circle','ellipse','capsule','box','none'].includes(value.physics.shape) || (value.physics.shape==='capsule' && (!Number.isFinite(value.physics.halfLength) || value.physics.halfLength<=0)) || (value.physics.radius!==undefined && (!Number.isFinite(value.physics.radius) || !(value.physics.radius>0))) || (value.physics.radiusRatio!==undefined&&(!Number.isFinite(value.physics.radiusRatio)||value.physics.radiusRatio<=0||value.physics.radiusRatio>1)) || (value.category==='furniture'&&value.physics.shape==='circle'&&!Number.isFinite(value.physics.radius)&&!Number.isFinite(value.physics.radiusRatio)) || (value.physics.colliderWidthRatio!==undefined&&(!Number.isFinite(value.physics.colliderWidthRatio)||value.physics.colliderWidthRatio<=0||value.physics.colliderWidthRatio>1.5)) || (value.physics.colliderDepthRatio!==undefined&&(!Number.isFinite(value.physics.colliderDepthRatio)||value.physics.colliderDepthRatio<=0||value.physics.colliderDepthRatio>1.5)) || (value.physics.colliderWidth!==undefined && (!Number.isFinite(value.physics.colliderWidth)||value.physics.colliderWidth<=0)) || (value.physics.colliderDepth!==undefined && (!Number.isFinite(value.physics.colliderDepth)||value.physics.colliderDepth<=0))))errors.push(`Física inválida: ${value.id}`);
    if(value?.category==='furniture'&&(!value.depthOrder||value.depthOrder.anchor!=='footprint-front'||value.depthOrder.vertical!=='support-base'))errors.push(`Profundidade de móvel inválida: ${value.id}`);
    if(value?.directions!==undefined && value.directions!==8)errors.push(`Direções inválidas: ${value.id}`);
  }
  for(const value of entries)for(const ref of Array.isArray(value?.refs)?value.refs:[])if(!ids.has(ref))errors.push(`Referência ausente: ${value.id} → ${ref}`);
  return errors;
}
