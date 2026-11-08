import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventory, INVENTORY_ITEM_KEYS } from './inventory.mjs';
import { AXE_TOOL_IDS } from './tool-progression.mjs';
import { huntWildlifeTarget } from './wildlife-hunt.mjs';
import {
  createWildlifeForZone, playerPerception, stepWildlifePopulation,
  wildlifeStage, WILDLIFE_BY_ID, WILDLIFE_SPECIES, wildlifeCollisionBodies,
} from './wildlife.mjs';

function animal(id, speciesId, x, y, overrides = {}) {
  const definition = WILDLIFE_BY_ID.get(speciesId);
  return {
    id, dimensionId:'test', speciesId, x, y, vx:1, vy:0,
    homeX:x, homeY:y, shelterX:x, shelterY:y,
    sex:'fêmea', ageDays:definition.stats.maturityDays + 1,
    health:definition.stats.health, hunger:12, thirst:10, energy:95,
    state:'explorando', targetX:x, targetY:y, thinkAt:0,
    fleeUntil:0, provokedUntil:0, nextAttackAt:0, pregnancyUntil:0,
    nextBreedAt:0, randomSeed:12345,
    ...overrides,
  };
}

const distantPlayer = {
  id:'player', location:'clearing', dimensionId:'test', moving:false,
  position:{x:30,y:0,vx:0,vy:0,running:false,crouching:false},
};

test('only living ground animals become character collision bodies', () => {
  const bodies = wildlifeCollisionBodies([
    animal('deer', 'deer', 4, 5),
    animal('bird', 'hawk', 6, 7),
    animal('firefly', 'firefly', 8, 9),
    animal('dead-rabbit', 'rabbit', 10, 11, { health:0 }),
  ]);
  assert.deepEqual(bodies, [{ x:4, y:5, radius:WILDLIFE_BY_ID.get('deer').stats.radius, id:'deer' }]);
});

test('perfil opcional da fauna mede decisões, movimento e consultas sem alterar o passo',()=>{
 const rabbit=animal('profile-rabbit','rabbit',2,2,{thirst:90,hunger:80});
 const profile={};
 const result=stepWildlifePopulation(new Map([[rabbit.id,rabbit]]),{dimensionId:'test',players:[distantPlayer],now:10000,
  hours:23,night:true,canOccupy:()=>true,isOccluded:()=>false,findWater:()=>null,profile});
 assert.deepEqual(result,[]);
 assert.equal(profile.activeAnimals,1);assert.equal(profile.decisions,1);assert.equal(profile.findWaterCalls,1);
 assert.ok(profile.behaviorMs>=0&&profile.movementMs>=0&&profile.canOccupyCalls>=0&&profile.isOccludedCalls>=0);
});

test('animais não atravessam uma pessoa parada e conseguem sair de uma sobreposição', () => {
  const definition=WILDLIFE_BY_ID.get('deer'),player={...distantPlayer,position:{x:0,y:0}};
  const moveTowardPlayer=(gap,id)=>{
    const deer=animal(id,'deer',gap,0,{vx:-1,vy:0,targetX:0,targetY:0,thinkAt:200000});
    const population=new Map([[id,deer]]);
    stepWildlifePopulation(population,{dimensionId:'test',players:[player],now:100000,deltaSeconds:.12,
      playerRadius:.25,canOccupy:()=>true});
    return {deer,startGap:gap};
  };
  const clear=moveTowardPlayer(.72,'clear-deer');
  assert.ok(Math.hypot(clear.deer.x,clear.deer.y)>=clear.startGap-1e-6,
    'the animal cannot reduce clearance when its center reaches the person');
  const overlapped=moveTowardPlayer(.4,'overlapped-deer');
  assert.ok(Math.hypot(overlapped.deer.x,overlapped.deer.y)>overlapped.startGap,
    'the animal can recover by moving away when a prior correction leaves overlap');
  assert.equal(Math.hypot(overlapped.deer.x,overlapped.deer.y)>=definition.stats.radius+.25,false,
    'the overlap can persist for one step while it is actively being resolved');
});

test('all wildlife loot fits the player inventory and has complete life metadata', () => {
  assert.equal(WILDLIFE_SPECIES.length, 23);
  for (const definition of WILDLIFE_SPECIES) {
    assert.ok(definition.lifeGoal);
    assert.ok(definition.shelter);
    assert.ok(definition.diet);
    assert.ok(definition.drops.length);
    for (const [itemId, quantity] of definition.drops) {
      assert.ok(INVENTORY_ITEM_KEYS.includes(itemId), `${definition.id} drop ${itemId} is not a backpack item`);
      assert.ok(Number.isInteger(quantity) && quantity > 0);
    }
    for(const predatorId of definition.predators)
      assert.ok(WILDLIFE_BY_ID.get(predatorId)?.prey.includes(definition.id), `${predatorId} must list ${definition.id} as prey`);
    for(const preyId of definition.prey)
      assert.ok(WILDLIFE_BY_ID.get(preyId)?.predators.includes(definition.id), `${preyId} must list ${definition.id} as a predator`);
  }
});

test('zone generation is deterministic and keeps each family pair close enough to reproduce', () => {
  const options = {dimensionId:'test',theme:'forest',zoneX:2,zoneY:3,now:1000};
  const first = createWildlifeForZone(options);
  const second = createWildlifeForZone(options);
  assert.deepEqual(first.map(({id,x,y,sex})=>({id,x,y,sex})), second.map(({id,x,y,sex})=>({id,x,y,sex})));

  const groups = new Map();
  for (const item of first) {
    if (!groups.has(item.speciesId)) groups.set(item.speciesId, []);
    groups.get(item.speciesId).push(item);
  }
  assert.ok([...groups.values()].some(group => group.length === 2));
  for (const group of groups.values()) {
    if (group.length !== 2) continue;
    assert.notEqual(group[0].sex, group[1].sex);
    assert.ok(Math.hypot(group[0].x-group[1].x,group[0].y-group[1].y) < 1.2);
  }
});

test('senses combine sight, night vision, trees, sound, smell, and crouching', () => {
  const rabbit = animal('rabbit','rabbit',0,0);
  const rabbitDefinition = WILDLIFE_BY_ID.get('rabbit');
  const atEight = {position:{x:8,y:0,vx:0,vy:0,running:false,crouching:false},moving:false};
  assert.equal(playerPerception(rabbit,atEight,rabbitDefinition).seen, false);
  assert.equal(playerPerception(rabbit,atEight,rabbitDefinition,{night:true}).sense, 'visão');

  const crouched = {position:{x:5,y:0,vx:0,vy:0,running:false,crouching:true},moving:false};
  assert.equal(playerPerception(rabbit,crouched,rabbitDefinition).seen, false);
  const behindTree = {position:{x:5,y:0,vx:0,vy:0,running:false,crouching:false},moving:false};
  assert.equal(playerPerception(rabbit,behindTree,rabbitDefinition,{isOccluded:()=>true}).seen, false);
  behindTree.position.running = true;
  behindTree.moving = true;
  assert.equal(playerPerception(rabbit,behindTree,rabbitDefinition,{isOccluded:()=>true}).sense, 'som');
});

test('hungry predators kill only listed prey, and prey flee from their listed predators', () => {
  const wolf = animal('wolf','wolf',0,0,{hunger:80});
  const rabbit = animal('rabbit','rabbit',1,0,{health:1});
  const population = new Map([[wolf.id,wolf],[rabbit.id,rabbit]]);
  const events = stepWildlifePopulation(population,{dimensionId:'test',players:[distantPlayer],now:10000,
    deltaSeconds:.03,worldSize:100,isOccluded:()=>false});
  assert.ok(events.some(event=>event.type==='prey-taken'&&event.preyId==='rabbit'));
  assert.equal(population.has('rabbit'),false);

  const waryRabbit = animal('wary-rabbit','rabbit',0,0);
  const calmWolf = animal('calm-wolf','wolf',3,0,{hunger:0});
  const herd = new Map([[waryRabbit.id,waryRabbit],[calmWolf.id,calmWolf]]);
  stepWildlifePopulation(herd,{dimensionId:'test',players:[distantPlayer],now:10000,
    deltaSeconds:.03,worldSize:100,isOccluded:()=>false});
  assert.equal(waryRabbit.state,'fugindo');

  const frog=animal('frog-hunter','frog',0,0,{hunger:80});
  const firefly=animal('firefly-prey','firefly',.5,0,{health:1});
  const insects=new Map([[frog.id,frog],[firefly.id,firefly]]);
  const frogEvents=stepWildlifePopulation(insects,{dimensionId:'test',players:[distantPlayer],now:10000,
    deltaSeconds:.03,worldSize:100,isOccluded:()=>false});
  assert.ok(frogEvents.some(event=>event.type==='prey-taken'&&event.preyId===firefly.id));
  assert.equal(insects.has(firefly.id),false);
});

test('territorial animals cannot hit a player through a tree', () => {
  const bear = animal('bear','bear',0,0);
  const player = {id:'player',location:'clearing',dimensionId:'test',moving:false,
    position:{x:1,y:0,vx:0,vy:0,running:false,crouching:false}};
  const population = new Map([[bear.id,bear]]);
  const events = stepWildlifePopulation(population,{dimensionId:'test',players:[player],now:10000,
    deltaSeconds:.03,worldSize:100,isOccluded:()=>true});
  assert.equal(events.some(event=>event.type==='player-attacked'),false);
  assert.equal(player.position.vx,0);

  const openBear = animal('open-bear','bear',0,0);
  const openPlayer = structuredClone(player);
  const openPopulation = new Map([[openBear.id,openBear]]);
  const openEvents = stepWildlifePopulation(openPopulation,{dimensionId:'test',players:[openPlayer],now:10000,
    deltaSeconds:.03,worldSize:100,isOccluded:()=>false});
  assert.ok(openEvents.some(event=>event.type==='player-attacked'));
  assert.ok(openPlayer.position.vx > 0);
  assert.equal(openPlayer.position.crouching,false);
});

test('raptors defend their nest only when the player approaches it', () => {
  const hawk=animal('nest-hawk','hawk',0,0,{shelterX:0,shelterY:0});
  const distantPlayer={id:'visitor',location:'clearing',dimensionId:'test',moving:false,
    position:{x:4,y:0,vx:0,vy:0,running:false,crouching:false}};
  const population=new Map([[hawk.id,hawk]]);
  stepWildlifePopulation(population,{dimensionId:'test',players:[distantPlayer],now:10000,
    deltaSeconds:.03,worldSize:100,isOccluded:()=>false});
  assert.notEqual(hawk.state,'atacando');
  assert.equal(distantPlayer.position.vx,0);

  const nestingHawk=animal('nesting-hawk','hawk',0,0,{shelterX:0,shelterY:0});
  const nestVisitor={id:'visitor',location:'clearing',dimensionId:'test',moving:false,
    position:{x:.8,y:0,vx:0,vy:0,running:false,crouching:false}};
  const nestPopulation=new Map([[nestingHawk.id,nestingHawk]]);
  const events=stepWildlifePopulation(nestPopulation,{dimensionId:'test',players:[nestVisitor],now:10000,
    deltaSeconds:.03,worldSize:100,isOccluded:()=>false});
  assert.ok(events.some(event=>event.type==='player-attacked'&&event.speciesId==='hawk'));
});

test('hunting wounds first, then grants exact drops and removes the animal', async () => {
  const rabbit=animal('rabbit-target','rabbit',.8,0,{health:2});
  const population=new Map([[rabbit.id,rabbit]]);
  const player={dimensionId:'test',position:{x:0,y:0},inventory:createInventory({knife:1})};
  let saves=0;
  const options={player,animal:rabbit,population,now:1000,persist:async()=>{saves+=1;}};

  const wound=await huntWildlifeTarget(options);
  assert.equal(wound.status,'injured');
  assert.equal(rabbit.health,1);
  assert.equal(population.has(rabbit.id),true);
  assert.equal(saves,0);

  const kill=await huntWildlifeTarget({...options,now:2000});
  assert.equal(kill.status,'killed');
  assert.deepEqual(kill.loot,{rawMeat:1,hide:1});
  assert.equal(player.inventory.rawMeat,1);
  assert.equal(player.inventory.hide,1);
  assert.equal(population.has(rabbit.id),false);
  assert.equal(saves,1);
});

test('stone, copper, and iron axes can all hunt when equipped', async () => {
  for (const tool of AXE_TOOL_IDS) {
    const rabbit=animal(`rabbit-${tool}`,'rabbit',.8,0,{health:2});
    const population=new Map([[rabbit.id,rabbit]]);
    const player={dimensionId:'test',position:{x:0,y:0},inventory:createInventory({[tool]:1})};
    const result=await huntWildlifeTarget({player,animal:rabbit,population,now:1000});
    assert.equal(result.status,'killed',`${tool} should be accepted`);
    assert.equal(population.has(rabbit.id),false);
    assert.equal(player.inventory.rawMeat,1);
    assert.equal(player.inventory.hide,1);
  }
});

test('hunting rejects blocked or unequipped targets and restores state when saving fails', async () => {
  const rabbit=animal('rollback-rabbit','rabbit',.8,0,{health:1,provokedUntil:123});
  const population=new Map([[rabbit.id,rabbit]]);
  const player={dimensionId:'test',position:{x:0,y:0},inventory:createInventory()};
  assert.equal((await huntWildlifeTarget({player,animal:rabbit,population})).status,'no-tool');
  player.inventory=createInventory({knife:1});
  assert.equal((await huntWildlifeTarget({player,animal:rabbit,population,hasClearPath:()=>false})).status,'blocked');
  assert.equal(rabbit.health,1);
  assert.equal(rabbit.provokedUntil,123);

  const failed=await huntWildlifeTarget({player,animal:rabbit,population,now:5000,persist:async()=>{throw new Error('storage down');}});
  assert.equal(failed.status,'save-failed');
  assert.equal(rabbit.health,1);
  assert.equal(rabbit.provokedUntil,123);
  assert.equal(player.inventory.rawMeat,0);
  assert.equal(player.inventory.hide,0);
  assert.equal(population.has(rabbit.id),true);
});

test('a full backpack leaves the animal alive and its loot untouched', async () => {
  const rabbit=animal('full-bag-rabbit','rabbit',.8,0,{health:1});
  const population=new Map([[rabbit.id,rabbit]]);
  const inventory=createInventory({knife:1});
  inventory.slots=inventory.slots.map((stack,index)=>index===0?stack:{itemId:'stone',quantity:50});
  const player={dimensionId:'test',position:{x:0,y:0},inventory};
  const result=await huntWildlifeTarget({player,animal:rabbit,population});
  assert.equal(result.status,'inventory-full');
  assert.equal(rabbit.health,1);
  assert.equal(rabbit.provokedUntil,0);
  assert.equal(inventory.rawMeat,0);
  assert.equal(population.has(rabbit.id),true);
});

test('pregnant adults give birth to living young and life stages advance', () => {
  const mother = animal('deer-mother','deer',0,0,{sex:'fêmea',pregnancyUntil:1});
  const father = animal('deer-father','deer',.9,0,{sex:'macho'});
  const population = new Map([[mother.id,mother],[father.id,father]]);
  const events = stepWildlifePopulation(population,{dimensionId:'test',players:[distantPlayer],now:5000,
    deltaSeconds:.03,worldSize:100,populationLimit:10,canOccupy:()=>true});
  const newborns = [...population.values()].filter(item=>item.speciesId==='deer'&&item.ageDays<.01);
  assert.equal(newborns.length,1);
  assert.equal(newborns[0].lifeStage,'filhote');
  assert.ok(events.some(event=>event.type==='birth'&&event.animalId===newborns[0].id));
  assert.equal(wildlifeStage(WILDLIFE_BY_ID.get('deer'),0),'filhote');
  assert.equal(wildlifeStage(WILDLIFE_BY_ID.get('deer'),3),'jovem');
});

test('adult pairs move toward each other and breed within their family group', () => {
  const mother=animal('doe','deer',0,0,{sex:'fêmea',groupId:'herd',nextBreedAt:0,hunger:10,energy:95});
  const father=animal('stag','deer',4,0,{sex:'macho',groupId:'herd',nextBreedAt:0,hunger:10,energy:95});
  const population=new Map([[mother.id,mother],[father.id,father]]);
  const events=[];
  for(let index=0;index<180;index+=1){
    events.push(...stepWildlifePopulation(population,{dimensionId:'test',players:[distantPlayer],
      now:10000+index*120,deltaSeconds:.12,hours:20,worldSize:100,canOccupy:()=>true}));
    if(events.some(event=>event.type==='breeding'))break;
  }
  assert.ok(events.some(event=>event.type==='breeding'));
  assert.ok(mother.pregnancyUntil>10000);
  assert.equal(mother.nextBreedAt,father.nextBreedAt);
});

test('fauna local é pequena, depende do habitat e não nasce sem um abrigo válido', async()=>{
  const {wildlifeFitsHabitat}=await import('./wildlife.mjs');
  assert.equal(wildlifeFitsHabitat(WILDLIFE_BY_ID.get('frog'),{water:false}),false);
  assert.equal(wildlifeFitsHabitat(WILDLIFE_BY_ID.get('bear'),{rocky:true,woodland:true,settlementDistance:8}),false);
  assert.equal(wildlifeFitsHabitat(WILDLIFE_BY_ID.get('bear'),{rocky:true,woodland:true,settlementDistance:60}),true);
  const options={dimensionId:'test',theme:'forest',zoneX:2,zoneY:3,now:1000};
  assert.equal(createWildlifeForZone({...options,shelterAt:()=>null}).length,0);
  const family=createWildlifeForZone({...options,shelterAt:()=>({x:52,y:76})});
  assert.ok(family.length>0&&family.length<=2);
  assert.equal(new Set(family.map(a=>a.shelterId)).size,1);
  assert.ok(family.every(a=>a.shelterX===52&&a.shelterY===76));
});

test('animal noturno volta ao abrigo, dorme, recupera energia e acorda à noite',()=>{
  const mouse=animal('sleeping-mouse','mouse',10,10,{vx:0,shelterX:12,shelterY:10,energy:90});
  const player={...distantPlayer,position:{x:30,y:20}};
  const population=new Map([[mouse.id,mouse]]);
  const step=hours=>stepWildlifePopulation(population,{dimensionId:'test',players:[player],now:10000,deltaSeconds:.1,hours,canOccupy:()=>true});
  step(12);assert.equal(mouse.state,'voltando-ao-abrigo');assert.ok(mouse.x>10,'walks home instead of freezing where it was');
  mouse.x=12;mouse.y=10;mouse.thinkAt=0;step(12);
  assert.equal(mouse.state,'dormindo');assert.equal(mouse.sheltered,true);
  const energy=mouse.energy;step(12);assert.ok(mouse.energy>energy);
  assert.equal(wildlifeCollisionBodies([mouse]).length,0,'an animal inside its burrow does not block the path');
  mouse.thinkAt=0;step(22);assert.notEqual(mouse.state,'dormindo');assert.equal(mouse.sheltered,false);
});

test('territorialidade protege o abrigo e não transforma todo encontro em perseguição',()=>{
  const bear=animal('territorial','bear',10,10,{shelterX:20,shelterY:20,energy:90});
  const visitor={...distantPlayer,position:{x:10.8,y:10,vx:0,vy:0}};
  const events=stepWildlifePopulation(new Map([[bear.id,bear]]),{dimensionId:'test',players:[visitor],now:10000,hours:22});
  assert.equal(events.some(event=>event.type==='player-attacked'),false);
  assert.notEqual(bear.state,'atacando');
});

test('filhotes conservam o abrigo da família e uma ninhada não lota a área',()=>{
  const mother=animal('mother','mouse',10,10,{shelterX:11,shelterY:12,shelterId:'family-home',groupId:'family',pregnancyUntil:1});
  const population=new Map([[mother.id,mother]]);
  stepWildlifePopulation(population,{dimensionId:'test',players:[distantPlayer],now:10000,hours:22,populationLimit:60});
  assert.ok(population.size<=4&&population.size>1);
  for(const child of [...population.values()].filter(a=>a.id!==mother.id)){
    assert.equal(child.shelterId,'family-home');assert.equal(child.shelterX,11);assert.equal(child.shelterY,12);
  }
});

test('perigo interrompe o sono fora do abrigo antes da fuga',()=>{
  const mouse=animal('asleep','mouse',10,10,{state:'dormindo',sheltered:false,shelterX:10,shelterY:10,vx:0,vy:0});
  const hawk=animal('threat','hawk',12,10,{hunger:0});
  stepWildlifePopulation(new Map([[mouse.id,mouse],[hawk.id,hawk]]),{dimensionId:'test',players:[distantPlayer],now:10000,hours:12});
  assert.equal(mouse.state,'fugindo');assert.equal(mouse.sheltered,false);
});

test('abrigo coberto mantém o animal protegido de predador e golpes durante o repouso',async()=>{
  const mouse=animal('inside','mouse',10,10,{state:'dormindo',sheltered:true,vx:0,vy:0});
  const hawk=animal('outside','hawk',10.8,10,{hunger:90});
  const population=new Map([[mouse.id,mouse],[hawk.id,hawk]]);
  const events=stepWildlifePopulation(population,{dimensionId:'test',players:[distantPlayer],now:10000,hours:12});
  assert.equal(mouse.state,'dormindo');assert.equal(mouse.sheltered,true);
  assert.equal(events.some(e=>e.preyId==='inside'),false);
  assert.equal(mouse.health,WILDLIFE_BY_ID.get('mouse').stats.health);
  const player={dimensionId:'test',position:{x:10,y:10},inventory:createInventory({knife:1})};
  const hit=await huntWildlifeTarget({player,animal:mouse,population,now:10001});
  assert.equal(hit.status,'missing');assert.equal(population.has(mouse.id),true);
  mouse.thinkAt=0;stepWildlifePopulation(population,{dimensionId:'test',players:[distantPlayer],now:20000,hours:22});
  assert.equal(mouse.sheltered,false,'protection ends when the animal leaves at its active time');
});

test('cobertura do abrigo chega ao cliente e à família sem expor um marcador distante',async()=>{
  const {serializeWildlife,canObserveWildlifeShelter}=await import('./wildlife.mjs');
  const cover={kind:'tree',id:'authored:4',x:52,y:76};
  const family=createWildlifeForZone({dimensionId:'test',theme:'forest',zoneX:2,zoneY:3,shelterAt:()=>({x:53,y:76,cover})});
  assert.ok(family.length);
  for(const a of family){
    const home=serializeWildlife(a).shelter;assert.deepEqual(home.cover,cover);
    assert.equal(canObserveWildlifeShelter(home,{x:54,y:76}),true);
    assert.equal(canObserveWildlifeShelter(home,{x:70,y:76}),false);
    assert.equal(canObserveWildlifeShelter({...home,cover:null},{x:53,y:76}),false);
  }
});
