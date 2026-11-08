import { incomingKnockbackMultiplier } from './progression.mjs';
// Server-owned wildlife rules and shared species metadata. No browser or save state.
export const WILDLIFE_ZONE_SIZE = 24;
export const WILDLIFE_POPULATION_LIMIT = 60;
export const GAME_DAY_DURATION_MS = 24 * 60 * 1000;

const species = [
  {
    id:'rabbit', label:'Coelho', form:'rabbit', habitats:['forest','magic','giants'], diet:'plants-and-berries', shelter:'burrow', activity:'crepuscular', lifeGoal:'comer brotos, beber água e criar a ninhada perto da toca', defense:'foge em zigue-zague; dá um coice se encurralado', attack:{mode:'kick',when:'cornered',reach:.72,force:.7,cooldownMs:1800}, senses:{sight:7,hearing:12,smell:3,night:1.3,cone:2.7}, stats:{speed:3.5,radius:.2,health:2,maturityDays:2,lifespanDays:34,gestationDays:2,litter:[2,4]}, drops:[['rawMeat',1],['hide',1]], colors:{body:'#9b7959',shadow:'#533f32',light:'#c5a27e',accent:'#e9c1bb',mark:'#392e2b'}, size:[17,12], predators:['wolf','leopard','hawk','eagle','snake'], aggression:'timid'
  },
  {
    id:'bear', label:'Urso', form:'bear', habitats:['forest','magic','giants'], diet:'omnivore', shelter:'cave', activity:'nocturnal', lifeGoal:'encontrar frutos e peixe, acumular reservas e proteger o covil', defense:'rosna e avança se alguém chega perto do covil', attack:{mode:'swipe',when:'cornered',reach:1.35,force:2.6,cooldownMs:1800}, senses:{sight:8,hearing:11,smell:15,night:1.5,cone:2.8}, stats:{speed:2.8,radius:.48,health:7,maturityDays:5,lifespanDays:70,gestationDays:5,litter:[1,2]}, drops:[['rawMeat',3],['hide',2],['bone',1]], colors:{body:'#77503a',shadow:'#392920',light:'#ad7952',accent:'#d8a56d',mark:'#231d1b'}, size:[27,22], predators:[], aggression:'territorial'
  },
  {
    id:'deer', label:'Cervo', form:'deer', habitats:['forest','magic','giants'], diet:'leaves-and-grass', shelter:'thicket', activity:'crepuscular', lifeGoal:'pastar em clareiras, reunir-se em grupo e criar filhotes protegidos', defense:'foge depressa; usa os cascos se fica sem saída', attack:{mode:'kick',when:'cornered',reach:1.05,force:1.8,cooldownMs:1500}, senses:{sight:13,hearing:14,smell:9,night:1.2,cone:2.7}, stats:{speed:4.1,radius:.35,health:4,maturityDays:4,lifespanDays:52,gestationDays:5,litter:[1,1]}, drops:[['rawMeat',2],['hide',1],['bone',1]], colors:{body:'#9a6842',shadow:'#503928',light:'#c18a5a',accent:'#e5d2ae',mark:'#372b23'}, size:[24,18], predators:['wolf','leopard'], aggression:'timid'
  },
  {
    id:'mouse', label:'Camundongo', form:'mouse', habitats:['forest','dark','magic','energy'], diet:'seeds-and-crumbs', shelter:'root-hollow', activity:'nocturnal', lifeGoal:'recolher sementes, manter o ninho seco e multiplicar a colônia', defense:'some por frestas e raízes; morde apenas se agarrado', attack:{mode:'bite',when:'cornered',reach:.48,force:.35,cooldownMs:1300}, senses:{sight:4,hearing:13,smell:6,night:2,cone:3.1}, stats:{speed:2.6,radius:.12,health:1,maturityDays:1,lifespanDays:18,gestationDays:1,litter:[3,5]}, drops:[['rawMeat',1],['bone',1]], colors:{body:'#887b72',shadow:'#4b4745',light:'#bdb1a4',accent:'#e0b5b0',mark:'#292729'}, size:[11,8], predators:['cat','snake','wolf','leopard','hawk','eagle'], aggression:'timid'
  },
  {
    id:'rat', label:'Ratazana', form:'rat', habitats:['forest','dark','magic'], diet:'omnivore', shelter:'root-hollow', activity:'nocturnal', lifeGoal:'encontrar comida, manter o ninho protegido e cuidar da colônia', defense:'foge para túneis; rosna e morde se acuada', attack:{mode:'bite',when:'cornered',reach:.57,force:.55,cooldownMs:1200}, senses:{sight:5,hearing:14,smell:8,night:2,cone:3}, stats:{speed:2.5,radius:.16,health:2,maturityDays:1,lifespanDays:24,gestationDays:1,litter:[3,6]}, drops:[['rawMeat',1],['hide',1],['bone',1]], colors:{body:'#675b55',shadow:'#383335',light:'#918078',accent:'#c99491',mark:'#222124'}, size:[14,9], predators:['cat','snake','wolf','leopard','hawk','eagle'], aggression:'defensive'
  },
  {
    id:'leopard', label:'Leopardo', form:'leopard', habitats:['forest','magic','inferno','giants'], diet:'carnivore', shelter:'rock-shelter', activity:'nocturnal', lifeGoal:'caçar em silêncio, guardar território e criar filhotes em abrigo seguro', defense:'rosna, se esconde e salta sobre quem o encurrala', attack:{mode:'pounce',when:'hungry-or-provoked',reach:1.5,force:2.2,cooldownMs:1500}, senses:{sight:15,hearing:13,smell:9,night:2.2,cone:2.8}, stats:{speed:4.2,radius:.36,health:5,maturityDays:5,lifespanDays:58,gestationDays:4,litter:[1,3]}, drops:[['rawMeat',2],['hide',2],['bone',1]], colors:{body:'#d7ab58',shadow:'#68432f',light:'#f0d58a',accent:'#7e4d31',mark:'#35251e'}, size:[25,18], prey:['rabbit','deer','mouse','rat','cow','ox','wildebeest','horse','raccoon','frog'], predators:[], aggression:'predator'
  },
  {
    id:'cow', label:'Vaca', form:'cow', habitats:['forest','giants'], diet:'grass-and-leaves', shelter:'barn-edge', activity:'diurnal', lifeGoal:'pastar em grupo, beber água e cuidar dos bezerros', defense:'se coloca entre a ameaça e o bezerro; chifra se acuada', attack:{mode:'horns',when:'cornered',reach:1.15,force:2,cooldownMs:1900}, senses:{sight:8,hearing:12,smell:8,night:.8,cone:2.6}, stats:{speed:2.3,radius:.43,health:5,maturityDays:5,lifespanDays:68,gestationDays:9,litter:[1,1]}, drops:[['rawMeat',3],['hide',2],['bone',2]], colors:{body:'#e4dccb',shadow:'#625951',light:'#fff3de',accent:'#5d4540',mark:'#332924'}, size:[26,19], predators:['wolf','leopard'], aggression:'protective'
  },
  {
    id:'ox', label:'Boi', form:'ox', habitats:['forest','giants'], diet:'grass-and-leaves', shelter:'barn-edge', activity:'diurnal', lifeGoal:'pastar com o rebanho, descansar e proteger o grupo', defense:'baixa a cabeça e investe quando é cercado', attack:{mode:'charge',when:'cornered',reach:1.35,force:2.7,cooldownMs:1900}, senses:{sight:8,hearing:12,smell:7,night:.8,cone:2.6}, stats:{speed:2.5,radius:.48,health:6,maturityDays:5,lifespanDays:62,gestationDays:9,litter:[1,1]}, drops:[['rawMeat',3],['hide',2],['bone',2]], colors:{body:'#65452f',shadow:'#352821',light:'#967050',accent:'#d4c3a5',mark:'#221c19'}, size:[27,19], predators:['wolf','leopard'], aggression:'protective'
  },
  {
    id:'wildebeest', label:'Gnu', form:'gnu', habitats:['forest','giants'], diet:'grass-and-leaves', shelter:'open-meadow', activity:'diurnal', lifeGoal:'migrar em manada entre pasto e água e proteger os jovens', defense:'o grupo se reúne; adultos investem em defesa da manada', attack:{mode:'charge',when:'cornered',reach:1.4,force:2.8,cooldownMs:1800}, senses:{sight:10,hearing:12,smell:7,night:.8,cone:2.7}, stats:{speed:3.8,radius:.44,health:5,maturityDays:5,lifespanDays:58,gestationDays:8,litter:[1,1]}, drops:[['rawMeat',3],['hide',2],['bone',2]], colors:{body:'#54504a',shadow:'#302f2c',light:'#81796c',accent:'#b29463',mark:'#1d1d1c'}, size:[26,19], predators:['wolf','leopard'], aggression:'protective'
  },
  {
    id:'sparrow', label:'Pardal', form:'bird', habitats:['forest','dark','sky','magic','energy'], diet:'seeds-and-insects', shelter:'hedge-nest', activity:'diurnal', lifeGoal:'buscar sementes, construir ninho e alimentar os filhotes', defense:'voa para a copa e chama o bando', attack:null, senses:{sight:15,hearing:8,smell:1,night:.7,cone:3.1}, stats:{speed:5.5,radius:.1,health:1,maturityDays:2,lifespanDays:22,gestationDays:2,litter:[2,5]}, drops:[['feather',2],['rawMeat',1]], colors:{body:'#9a7950',shadow:'#4d3d2d',light:'#d0ad78',accent:'#d9c8aa',mark:'#312a23'}, size:[13,10], predators:['hawk','eagle','snake','cat'], aggression:'timid'
  },
  {
    id:'bluebird', label:'Pássaro-azul', form:'bird', habitats:['forest','sky','magic','energy'], diet:'berries-and-insects', shelter:'canopy-nest', activity:'diurnal', lifeGoal:'procurar frutos, cantar ao amanhecer e manter o ninho seguro', defense:'dispara para outra árvore e despista o perseguidor', attack:null, senses:{sight:16,hearing:9,smell:1,night:.7,cone:3.1}, stats:{speed:5.8,radius:.1,health:1,maturityDays:2,lifespanDays:24,gestationDays:2,litter:[2,4]}, drops:[['feather',2],['rawMeat',1]], colors:{body:'#397ba0',shadow:'#1d465f',light:'#74b6ce',accent:'#e1c56e',mark:'#244b67'}, size:[14,11], predators:['hawk','eagle','snake','cat'], aggression:'timid'
  },
  {
    id:'goldfinch', label:'Pintassilgo', form:'bird', habitats:['forest','sky','magic','energy'], diet:'seeds-and-berries', shelter:'hedge-nest', activity:'diurnal', lifeGoal:'recolher sementes, formar pares e alimentar a ninhada', defense:'voa em grupo e muda de direção depressa', attack:null, senses:{sight:14,hearing:9,smell:1,night:.7,cone:3.1}, stats:{speed:5.2,radius:.1,health:1,maturityDays:2,lifespanDays:24,gestationDays:2,litter:[2,5]}, drops:[['feather',2],['rawMeat',1]], colors:{body:'#b4a146',shadow:'#5a5024',light:'#e4cf68',accent:'#d35e37',mark:'#262520'}, size:[13,10], predators:['hawk','eagle','snake','cat'], aggression:'timid'
  },
  {
    id:'wolf', label:'Lobo', form:'wolf', habitats:['forest','dark','magic','giants'], diet:'carnivore', shelter:'den', activity:'crepuscular', lifeGoal:'caçar em grupo, manter o território e criar a matilha', defense:'cerca a ameaça e rosna; morde se ela avança', attack:{mode:'bite',when:'hungry-or-provoked',reach:1.2,force:1.8,cooldownMs:1400}, senses:{sight:14,hearing:16,smell:18,night:1.8,cone:3}, stats:{speed:4,radius:.34,health:5,maturityDays:5,lifespanDays:56,gestationDays:5,litter:[2,5]}, drops:[['rawMeat',2],['hide',2],['bone',1]], colors:{body:'#77736e',shadow:'#3d3c3a',light:'#b3aca0',accent:'#c4b294',mark:'#282a2a'}, size:[25,17], prey:['rabbit','deer','mouse','rat','cow','ox','wildebeest','horse','raccoon','frog'], predators:[], aggression:'predator'
  },
  {
    id:'raccoon', label:'Guaxinim', form:'raccoon', habitats:['forest','magic'], diet:'omnivore', shelter:'tree-hollow', activity:'nocturnal', lifeGoal:'buscar frutos e insetos à noite e criar filhotes num oco seco', defense:'sobe em árvores, rosna e usa as patas se encurralado', attack:{mode:'scratch',when:'cornered',reach:.7,force:.65,cooldownMs:1500}, senses:{sight:8,hearing:12,smell:11,night:2,cone:2.9}, stats:{speed:2.7,radius:.22,health:3,maturityDays:4,lifespanDays:42,gestationDays:4,litter:[2,4]}, drops:[['rawMeat',1],['hide',1],['bone',1]], colors:{body:'#77766e',shadow:'#3a3b3a',light:'#b2afa3',accent:'#c7b084',mark:'#25272a'}, size:[18,14], predators:['wolf','leopard'], aggression:'defensive'
  },
  {
    id:'snake', label:'Cobra', form:'snake', habitats:['forest','dark','magic','inferno','energy'], diet:'carnivore', shelter:'warm-rock', activity:'crepuscular', lifeGoal:'caçar pequenos roedores, aquecer-se e mudar de pele', defense:'enrola o corpo e avisa com um silvo antes do bote', attack:{mode:'bite',when:'cornered',reach:.82,force:1.25,cooldownMs:1700}, senses:{sight:5,hearing:3,smell:13,night:1.4,cone:2.1}, stats:{speed:1.7,radius:.15,health:2,maturityDays:4,lifespanDays:44,gestationDays:5,litter:[3,7]}, drops:[['venom',1],['hide',1]], colors:{body:'#6e8a4e',shadow:'#34452f',light:'#a8bd70',accent:'#d1c075',mark:'#263128'}, size:[22,8], prey:['mouse','rat','frog','sparrow','bluebird','goldfinch','rabbit'], predators:[], aggression:'defensive'
  },
  {
    id:'horse', label:'Cavalo', form:'horse', habitats:['forest','sky','giants'], diet:'grass-and-leaves', shelter:'open-meadow', activity:'diurnal', lifeGoal:'pastar em grupo, correr livremente e cuidar dos potros', defense:'recua e foge; dá coice quando alguém o prende', attack:{mode:'kick',when:'cornered',reach:1.15,force:2,cooldownMs:1600}, senses:{sight:13,hearing:16,smell:8,night:1,cone:2.8}, stats:{speed:4.5,radius:.4,health:5,maturityDays:6,lifespanDays:64,gestationDays:11,litter:[1,1]}, drops:[['rawMeat',3],['hide',2],['bone',2]], colors:{body:'#a36a3d',shadow:'#503321',light:'#d39a61',accent:'#ead5ae',mark:'#36241c'}, size:[28,21], predators:['wolf','leopard'], aggression:'timid'
  },
  {
    id:'bull', label:'Touro', form:'bull', habitats:['forest','giants'], diet:'grass-and-leaves', shelter:'open-meadow', activity:'diurnal', lifeGoal:'acompanhar o rebanho, defender o território e proteger os jovens', defense:'bufa, raspa o chão e investe se alguém insiste em se aproximar', attack:{mode:'charge',when:'cornered-or-provoked',reach:1.6,force:3.1,cooldownMs:1800}, senses:{sight:9,hearing:13,smell:8,night:.8,cone:2.7}, stats:{speed:3.2,radius:.5,health:7,maturityDays:6,lifespanDays:62,gestationDays:9,litter:[1,1]}, drops:[['rawMeat',4],['hide',2],['bone',2]], colors:{body:'#604434',shadow:'#322923',light:'#927052',accent:'#d4c5a6',mark:'#241e19'}, size:[29,21], predators:[], aggression:'territorial'
  },
  {
    id:'cat', label:'Gato', form:'cat', habitats:['forest','dark','magic','energy'], diet:'carnivore', shelter:'root-hollow', activity:'nocturnal', lifeGoal:'patrulhar em silêncio, caçar roedores e manter um refúgio seguro', defense:'arqueia o dorso, assovia e arranha se encurralado', attack:{mode:'scratch',when:'cornered',reach:.72,force:.85,cooldownMs:1450}, senses:{sight:12,hearing:16,smell:9,night:2.1,cone:2.8}, stats:{speed:3.8,radius:.2,health:3,maturityDays:4,lifespanDays:48,gestationDays:4,litter:[1,4]}, drops:[['rawMeat',1],['hide',1],['bone',1]], colors:{body:'#c19155',shadow:'#5b402d',light:'#e0bd80',accent:'#d7c4a2',mark:'#4a3021'}, size:[20,14], prey:['mouse','rat','sparrow','bluebird','goldfinch','frog'], predators:[], aggression:'defensive'
  },
  {
    id:'hawk', label:'Gavião', form:'raptor', habitats:['forest','sky','magic','energy'], diet:'carnivore', shelter:'high-nest', activity:'diurnal', lifeGoal:'planar sobre o bosque, caçar roedores e alimentar os filhotes', defense:'abre as asas e mergulha para afastar invasores do ninho', attack:{mode:'swoop',when:'nest-threatened',reach:1.15,force:1.4,cooldownMs:1800}, senses:{sight:22,hearing:7,smell:1,night:.8,cone:3.1}, stats:{speed:5,radius:.15,health:3,maturityDays:5,lifespanDays:44,gestationDays:4,litter:[1,3]}, drops:[['feather',3],['rawMeat',1],['bone',1]], colors:{body:'#89633f',shadow:'#473321',light:'#d0a66f',accent:'#efe3ca',mark:'#33271e'}, size:[22,15], prey:['mouse','rat','rabbit','sparrow','bluebird','goldfinch','frog'], predators:[], aggression:'protective'
  },
  {
    id:'eagle', label:'Águia', form:'raptor', habitats:['forest','sky','magic','giants','inferno','energy'], diet:'carnivore', shelter:'high-nest', activity:'diurnal', lifeGoal:'dominar as correntes de ar, caçar em áreas abertas e renovar o ninho', defense:'avisa com um grito e protege o ninho com mergulhos', attack:{mode:'swoop',when:'nest-threatened',reach:1.3,force:1.8,cooldownMs:1800}, senses:{sight:28,hearing:9,smell:1,night:.9,cone:3.1}, stats:{speed:5.8,radius:.18,health:4,maturityDays:6,lifespanDays:58,gestationDays:5,litter:[1,2]}, drops:[['feather',4],['rawMeat',1],['bone',1]], colors:{body:'#704d31',shadow:'#35261c',light:'#b58b59',accent:'#ead9b7',mark:'#291f19'}, size:[25,17], prey:['mouse','rat','rabbit','sparrow','bluebird','goldfinch','frog'], predators:[], aggression:'protective'
  },
  {
    id:'frog', label:'Sapo', form:'frog', habitats:['forest','magic','energy'], diet:'insects', shelter:'pond-edge', activity:'nocturnal', lifeGoal:'caçar insetos perto da água e voltar ao abrigo úmido', defense:'salta para a água e se camufla entre folhas', attack:null, senses:{sight:6,hearing:8,smell:2,night:1.8,cone:2.4}, stats:{speed:2.2,radius:.13,health:1,maturityDays:2,lifespanDays:16,gestationDays:1,litter:[4,9]}, drops:[['rawMeat',1]], colors:{body:'#638b4d',shadow:'#354c38',light:'#9cb965',accent:'#d3d478',mark:'#344331'}, size:[13,10], prey:['firefly'], predators:['snake','wolf','leopard','hawk','eagle','cat'], aggression:'timid'
  },
  {
    id:'firefly', label:'Vagalume', form:'firefly', habitats:['forest','dark','magic','energy'], diet:'nectar-and-pollen', shelter:'tall-grass', activity:'nocturnal', lifeGoal:'acender luzes no entardecer, encontrar parceiros e polinizar flores', defense:'apaga o brilho e se esconde na relva; não ataca', attack:null, senses:{sight:3,hearing:2,smell:2,night:3,cone:3.1}, stats:{speed:1.2,radius:.06,health:1,maturityDays:1,lifespanDays:7,gestationDays:1,litter:[8,20]}, drops:[['glowDust',1]], colors:{body:'#4c4936',shadow:'#292b25',light:'#9ca856',accent:'#f0e58c',mark:'#24251e'}, size:[7,6], predators:['frog'], aggression:'timid'
  },  {
    id:'ashWraith', label:'Cinza-viva', form:'ashWraith', habitats:['inferno'], diet:'embers', shelter:'warm-rock', activity:'nocturnal', lifeGoal:'guardar fendas vulcânicas e perseguir intrusos', defense:'avança com golpes de brasa e recua para as rochas quentes', attack:{mode:'ember-swipe',when:'intruder',reach:1.25,force:2.1,cooldownMs:1700}, senses:{sight:10,hearing:8,smell:2,night:2.2,cone:3.1}, stats:{speed:3.1,radius:.3,health:10,maturityDays:1,lifespanDays:9999,gestationDays:1,litter:[1,1]}, drops:[['cinderShard',1],['emberCore',1,0.08]], colors:{body:'#783d32',shadow:'#352829',light:'#e27b42',accent:'#ffd36e',mark:'#241e24'}, size:[20,22], predators:[], aggression:'monster', isMonster:true
  },
];

export const WILDLIFE_SPECIES = Object.freeze(species.map(value => Object.freeze({
  ...value,
  habitats:Object.freeze([...value.habitats]),
  stats:Object.freeze({...value.stats}),
  senses:Object.freeze({...value.senses}),
  colors:Object.freeze({...value.colors}),
  drops:Object.freeze(value.drops.map(drop => Object.freeze([...drop]))),
  predators:Object.freeze([...(value.predators || value.preyOf || [])]),
  prey:Object.freeze([...(value.prey || [])]),
  attack:value.attack ? Object.freeze({...value.attack}) : null,
  size:Object.freeze([...value.size]),
})));

export const WILDLIFE_BY_ID = new Map(WILDLIFE_SPECIES.map(value => [value.id, value]));

const AIRBORNE_WILDLIFE_FORMS = new Set(['bird', 'raptor', 'firefly']);

export function wildlifeCollisionBodies(animals = []) {
  const values = animals instanceof Map ? animals.values() : animals;
  return [...values].flatMap(animal => {
    const definition = WILDLIFE_BY_ID.get(animal?.speciesId);
    if (!definition || animal.sheltered || AIRBORNE_WILDLIFE_FORMS.has(definition.form) || animal.health <= 0
        || !Number.isFinite(animal.x) || !Number.isFinite(animal.y)) return [];
    return [{ x: animal.x, y: animal.y, radius: definition.stats.radius, id: animal.id }];
  });
}

const THEME_POOLS = Object.freeze({
  forest:['rabbit','bear','deer','mouse','rat','leopard','cow','ox','wildebeest','sparrow','bluebird','goldfinch','wolf','raccoon','snake','horse','bull','cat','hawk','eagle','frog','firefly'],
  dark:['mouse','rat','snake','cat','wolf','raccoon','frog','firefly'],
  sky:['sparrow','bluebird','goldfinch','horse','hawk','eagle','rabbit'],
  magic:['rabbit','bear','deer','mouse','rat','leopard','sparrow','bluebird','goldfinch','wolf','raccoon','snake','cat','hawk','eagle','frog','firefly'],
  inferno:['rat','leopard','snake','eagle','firefly','ashWraith'],
  giants:['bear','deer','wildebeest','cow','ox','horse','bull','wolf','leopard','eagle'],
  energy:['mouse','sparrow','bluebird','goldfinch','snake','cat','hawk','eagle','frog','firefly'],
});

export function wildlifePoolForTheme(theme) {
  return (THEME_POOLS[theme] || THEME_POOLS.forest).map(id => WILDLIFE_BY_ID.get(id)).filter(definition=>definition&&!definition.isMonster);
}

// Game schedules use the shared world clock, including its accelerated day.
export function wildlifeIsActive(definition, hours) {
  const hour=((hours%24)+24)%24;
  return definition.activity==='nocturnal' ? hour>=19||hour<6
    : definition.activity==='diurnal' ? hour>=6&&hour<19
      : hour>=5&&hour<9||hour>=17&&hour<21;
}
export function wildlifeFitsHabitat(definition, habitat) {
  if(!habitat)return true;
  if(definition.isMonster)return habitat.rocky===true;
  if(['bear','wolf','leopard','eagle'].includes(definition.id)
      && (habitat.settlementDistance<32||!habitat.woodland&&!habitat.rocky))return false;
  if(['cow','ox','bull'].includes(definition.id))return habitat.farm===true&&habitat.meadow;
  if(['horse','wildebeest'].includes(definition.id))return habitat.meadow;
  if(definition.shelter==='pond-edge')return habitat.water;
  if(['cave','rock-shelter','warm-rock'].includes(definition.shelter))return habitat.rocky;
  if(['canopy-nest','high-nest','tree-hollow','root-hollow','den','thicket'].includes(definition.shelter))return habitat.woodland;
  return habitat.woodland||habitat.meadow;
}

// Entrances are discovered nearby, while the supporting tree/rock remains visible normally.
export function canObserveWildlifeShelter(shelter,viewer) {
  const cover=shelter?.cover;
  return Boolean(cover&&Number.isFinite(cover.x)&&Number.isFinite(cover.y)
    &&Math.hypot(viewer.x-shelter.x,viewer.y-shelter.y)<=3.5);
}

function hashSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFrom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function createAnimal({id, dimensionId, definition, x, y, random, now, shelterAt = null, ageDays}) {
  const stats = definition.stats;
  const sex = random() < .5 ? 'fêmea' : 'macho';
  const age = Math.max(0, ageDays ?? random() * Math.max(1, stats.maturityDays * 2.4));
  const shelter = shelterAt?.(definition.shelter, x, y, random) || {x, y};
  return {
    id, dimensionId, speciesId:definition.id, x, y, vx:0, vy:0,
    homeX:x, homeY:y, shelterX:shelter.x, shelterY:shelter.y, shelterCover:shelter.cover||null,
    sex, ageDays:age, lifeStage:wildlifeStage(definition,age),
    health:stats.health, hunger:12 + random() * 32, thirst:8 + random() * 28, energy:55 + random() * 40,
    state:'explorando', targetX:x, targetY:y, thinkAt:now + random() * 1200,
    fleeUntil:0, provokedUntil:0, nextAttackAt:0, pregnancyUntil:0, nextBreedAt:now + 120_000,
    groupId:`${dimensionId}:${definition.id}:${Math.floor(x / WILDLIFE_ZONE_SIZE)},${Math.floor(y / WILDLIFE_ZONE_SIZE)}`,
    randomSeed:Math.floor(random() * 0x7fffffff), lastEventAt:0,
  };
}

export function createWildlifeForZone({dimensionId='surface', theme='forest', zoneX, zoneY, now=Date.now(), canSpawn=()=>true, shelterAt=null, habitat=null}) {
  const key = `${dimensionId}:${zoneX}:${zoneY}`;
  const random = randomFrom(hashSeed(key));
  const pool = wildlifePoolForTheme(theme).filter(definition=>wildlifeFitsHabitat(definition,habitat));
  if (!pool.length) return [];
  const shuffled = [...pool];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  const count = ['bear','leopard','eagle'].includes(shuffled[0].id)?1:2;
  const groupCount = Math.max(1, Math.ceil(count / 2));
  const groups = shuffled.slice(0,groupCount);
  const result = [];
  const used = [];
  const groupAnchors = new Map(),groupShelters=new Map();
  const left = zoneX * WILDLIFE_ZONE_SIZE, top = zoneY * WILDLIFE_ZONE_SIZE;
  for (let index = 0; index < count; index += 1) {
    const groupIndex=Math.floor(index/2), definition = groups[groupIndex];
    const anchor=groupAnchors.get(groupIndex);
    let position = null;
    for (let attempt = 0; attempt < 28; attempt += 1) {
      const angle=random()*Math.PI*2;
      const gap=anchor && index%2===1 ? .86+random()*.27 : null;
      const candidate = gap===null
        ? {x:left + 2 + random() * (WILDLIFE_ZONE_SIZE - 4), y:top + 2 + random() * (WILDLIFE_ZONE_SIZE - 4)}
        : {x:Math.max(left+1,Math.min(left+WILDLIFE_ZONE_SIZE-1,anchor.x+Math.cos(angle)*gap)),
          y:Math.max(top+1,Math.min(top+WILDLIFE_ZONE_SIZE-1,anchor.y+Math.sin(angle)*gap))};
      if (used.some(other => Math.hypot(candidate.x - other.x, candidate.y - other.y) < .85)) continue;
      if (canSpawn(candidate, definition)) { position = candidate; break; }
    }
    if (!position) continue;
    const shelter=groupShelters.get(groupIndex)|| (shelterAt?shelterAt(definition.shelter,position.x,position.y,random,definition):position);
    if(!shelter||!Number.isFinite(shelter.x)||!Number.isFinite(shelter.y))continue;
    groupShelters.set(groupIndex,shelter);
    used.push(position);
    if(!anchor)groupAnchors.set(groupIndex,{...position,index});
    const id = `wildlife:${key}:${index}`;
    const animal=createAnimal({id,dimensionId,definition,...position,random,now,shelterAt:()=>shelter,
      ageDays:definition.stats.maturityDays*(.65+random()*1.4)});
    animal.sex=index%2===0?'fêmea':'macho';
    animal.groupId=`${dimensionId}:${definition.id}:${zoneX},${zoneY}`;
    animal.shelterId=`shelter:${animal.groupId}`;
    animal.homeX=shelter.x;animal.homeY=shelter.y;
    result.push(animal);
  }
  const monsterDefinition=WILDLIFE_BY_ID.get('ashWraith');
  if(theme==='inferno'&&habitat?.rocky&&hashSeed(`${key}:ashwraith`)%24===0){
    const monsterRandom=randomFrom(hashSeed(`${key}:ashwraith:spawn`));
    let monsterPosition=null;
    for(let attempt=0;attempt<28;attempt+=1){
      const candidate={x:left+2+monsterRandom()*(WILDLIFE_ZONE_SIZE-4),y:top+2+monsterRandom()*(WILDLIFE_ZONE_SIZE-4)};
      if(result.some(other=>distance(candidate,other)<2.2))continue;
      if(canSpawn(candidate,monsterDefinition)){monsterPosition=candidate;break;}
    }
    if(monsterPosition){
      const shelter=shelterAt?.(monsterDefinition.shelter,monsterPosition.x,monsterPosition.y,monsterRandom,monsterDefinition);
      if(shelter&&Number.isFinite(shelter.x)&&Number.isFinite(shelter.y)){
        result.pop();
        const id=`wildlife:${key}:ashwraith`;
        const monster=createAnimal({id,dimensionId,definition:monsterDefinition,...monsterPosition,random:monsterRandom,now,shelterAt:()=>shelter,
          ageDays:monsterDefinition.stats.maturityDays*1.1});
        monster.sex='macho';monster.groupId=id;monster.shelterId=`shelter:${id}`;
        monster.homeX=shelter.x;monster.homeY=shelter.y;
        result.push(monster);
      }
    }
  }
  return result;
}

export function wildlifeStage(definition, ageDays) {
  if (ageDays < definition.stats.maturityDays * .45) return 'filhote';
  if (ageDays < definition.stats.maturityDays) return 'jovem';
  if (ageDays > definition.stats.lifespanDays * .8) return 'idoso';
  return 'adulto';
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

export function playerPerception(animal, player, definition, {isOccluded=()=>false, windNoise=0, night=false} = {}) {
  const position = player.position || player;
  const gap = distance(animal, position);
  if (gap <= .35) return {seen:true, sense:'proximidade', distance:gap};
  const crouching = position.crouching === true;
  const moving = player.moving === true || Math.hypot(position.vx || 0, position.vy || 0) > .24;
  const running = position.running === true;
  const vision = definition.senses.sight * (night ? definition.senses.night : 1) * (crouching ? (moving ? .48 : .36) : 1);
  const forwardX = Math.abs(animal.vx) + Math.abs(animal.vy) > .05 ? animal.vx : 1;
  const forwardY = Math.abs(animal.vx) + Math.abs(animal.vy) > .05 ? animal.vy : 0;
  const deltaX = position.x - animal.x, deltaY = position.y - animal.y;
  const dot = (forwardX * deltaX + forwardY * deltaY) / ((Math.hypot(forwardX, forwardY) || 1) * (gap || 1));
  const inView = dot > Math.cos(definition.senses.cone * .5) || gap < vision * .3;
  if (gap <= vision && inView && !isOccluded(animal, position)) return {seen:true, sense:'visão', distance:gap};
  const soundRange = definition.senses.hearing * (running ? 1.65 : 1) * (crouching ? (moving ? .3 : .12) : moving ? 1 : .08) + windNoise;
  if (gap <= soundRange) return {seen:true, sense:'som', distance:gap};
  const smellRange = definition.senses.smell * (crouching ? .68 : 1);
  if (gap <= smellRange) return {seen:true, sense:'cheiro', distance:gap};
  return {seen:false, sense:null, distance:gap};
}

function closest(items, origin, limit, predicate=()=>true) {
  let found = null, nearest = limit;
  for (const item of items) {
    const gap = distance(origin, item.position || item);
    if (gap < nearest && predicate(item)) { found = item; nearest = gap; }
  }
  return found ? {item:found, distance:nearest} : null;
}

function animalHasPlayerClearance(animal, candidate, radius, context) {
  const playerRadius=Math.max(0,Number(context.playerRadius)||.25);
  return context.players.every(player=>{
    const position=player.position;
    if(!Number.isFinite(position?.x)||!Number.isFinite(position?.y))return true;
    const clearance=radius+playerRadius;
    const candidateDistance=distance(candidate,position),currentDistance=distance(animal,position);
    return candidateDistance>=clearance||candidateDistance>=currentDistance-1e-6;
  });
}

function animalCanOccupy(animal, candidate, definition, context) {
  const radius=definition.stats.radius;
  const crowding=context.nearbyAnimals(animal,1).some(other=>other.id!==animal.id&&!other.sheltered
    &&distance(candidate,other)<radius+(WILDLIFE_BY_ID.get(other.speciesId)?.stats.radius||.2)*.72
    &&distance(candidate,other)<distance(animal,other)-1e-6);
  return context.canOccupy(candidate,radius)&&!crowding&&animalHasPlayerClearance(animal,candidate,radius,context);
}

function moveAnimal(animal, dt, definition, context) {
  if(animal.state==='dormindo'){animal.vx=0;animal.vy=0;return;}
  const dx = animal.targetX - animal.x, dy = animal.targetY - animal.y;
  const gap = Math.hypot(dx, dy);
  if (gap < .16) {
    animal.vx *= Math.max(0, 1 - dt * 7);
    animal.vy *= Math.max(0, 1 - dt * 7);
    if(Math.abs(animal.vx)+Math.abs(animal.vy)<1e-6){animal.vx=0;animal.vy=0;return;}
    const proposed={x:animal.x+animal.vx*dt,y:animal.y+animal.vy*dt};
    if(animalCanOccupy(animal,proposed,definition,context))Object.assign(animal,proposed);
    else {animal.vx=0;animal.vy=0;}
    return;
  }
  const speedScale = animal.state === 'fugindo' || animal.state === 'atacando' ? 1.35 : animal.state === 'descansando' || animal.state === 'bebendo' || animal.state==='dormindo' ? 0 : .56;
  const speed = definition.stats.speed * speedScale;
  const targetVx = dx / gap * speed, targetVy = dy / gap * speed;
  const blend = Math.min(1, dt * (animal.state === 'fugindo' ? 8 : 4));
  animal.vx += (targetVx - animal.vx) * blend;
  animal.vy += (targetVy - animal.vy) * blend;
  const proposed = {x:animal.x + animal.vx * dt, y:animal.y + animal.vy * dt};
  const proposedAllowed=animalCanOccupy(animal,proposed,definition,context);
  if (!proposedAllowed && animal.state !== 'fugindo') {
    const side = Math.sin((animal.randomSeed % 997) * .014 + context.now * .001) > 0 ? 1 : -1;
    const alternate = {x:animal.x - animal.vy * dt * side, y:animal.y + animal.vx * dt * side};
    if (animalCanOccupy(animal,alternate,definition,context)) Object.assign(animal, alternate);
    else { animal.vx = 0; animal.vy = 0; animal.thinkAt = Math.min(animal.thinkAt, context.now); }
  } else if (proposedAllowed) Object.assign(animal, proposed);
}

function chooseWanderTarget(animal, definition, context, radius=5) {
  const random = randomFrom(animal.randomSeed ^ Math.floor(context.now / 900));
  for (let attempt=0; attempt<10; attempt+=1) {
    const angle = random() * Math.PI * 2, gap = .8 + random() * radius;
    const candidate = {x:Math.max(1,Math.min(context.worldSize-1,animal.homeX + Math.cos(angle) * gap)),
      y:Math.max(1,Math.min(context.worldSize-1,animal.homeY + Math.sin(angle) * gap))};
    if (context.canOccupy(candidate, definition.stats.radius)) { animal.targetX=candidate.x; animal.targetY=candidate.y; return; }
  }
  animal.targetX=animal.shelterX; animal.targetY=animal.shelterY;
}

function handleAnimalAttack(animal, target, definition, context, events) {
  const attack = definition.attack;
  const targetsPlayer=Boolean(target.position);
  if (targetsPlayer && !attack || context.now < animal.nextAttackAt) return;
  animal.nextAttackAt = context.now + (attack?.cooldownMs || 1800);
  if (target.position) {
    if (Number.isFinite(target.evasionUntil) && target.evasionUntil > context.now) {
      target.evasionUntil = 0;
      animal.state = 'atacando';
      animal.targetX = target.position.x;
      animal.targetY = target.position.y;
      events.push({type:'player-evaded',animalId:animal.id,speciesId:definition.id,playerId:target.id,at:context.now});
      return;
    }
    const directionX = target.position.x - animal.x, directionY = target.position.y - animal.y;
    const length = Math.hypot(directionX, directionY) || 1;
    const knockback = attack.force * incomingKnockbackMultiplier(target.inventory?.attributes);
    target.position.vx = (target.position.vx || 0) + directionX / length * knockback;
    target.position.vy = (target.position.vy || 0) + directionY / length * knockback;
    target.position.crouching = false;
    animal.state = 'atacando';
    animal.targetX = target.position.x;
    animal.targetY = target.position.y;
    events.push({type:'player-attacked', animalId:animal.id, speciesId:definition.id, playerId:target.id, at:context.now});
    return;
  }
  target.health -= 1;
  animal.state = 'caçando';
  animal.targetX = target.x;
  animal.targetY = target.y;
  if (target.health <= 0) {
    target.health = 0;
    animal.hunger = Math.max(0, animal.hunger - 62);
    animal.energy = Math.min(100, animal.energy + 18);
    animal.state = 'alimentando-se';
    animal.stateUntil = context.now + 9000;
    events.push({type:'prey-taken', animalId:animal.id, preyId:target.id, speciesId:definition.id, at:context.now});
  }
}

function chooseBehavior(animal, definition, context, events) {
  animal.thinkAt=context.now+720+(animal.randomSeed%480);
  if(animal.sheltered&&animal.state==='dormindo'&&animal.provokedUntil<=context.now
      &&(!wildlifeIsActive(definition,context.hours)||animal.energy<70)&&animal.hunger<75){
    animal.vx=0;animal.vy=0;return;
  }
  animal.sheltered=false;
  const player = closest(context.players, animal, Math.max(definition.senses.sight, definition.senses.hearing, definition.senses.smell) + 1,
    candidate => playerPerception(animal, candidate, definition, {isOccluded:context.isOccluded,windNoise:context.windNoise,night:context.night}).seen);
  if(player){
    animal.awareness=playerPerception(animal,player.item,definition,{isOccluded:context.isOccluded,windNoise:context.windNoise,night:context.night}).sense;
    animal.awarenessUntil=context.now+1400;
  }else if((animal.awarenessUntil||0)<=context.now)animal.awareness=null;
  const nearbyPredator = closest(context.nearbyAnimals(animal,6), animal, 6, candidate => {
    return !candidate.sheltered&&definition.predators.includes(candidate.speciesId) && Math.hypot(candidate.x-animal.x,candidate.y-animal.y) < 6;
  });
  const nearbyPrey = closest(context.nearbyAnimals(animal,definition.senses.sight * .78), animal, definition.senses.sight * .78,
    candidate => !candidate.sheltered && definition.prey.includes(candidate.speciesId) && candidate.health > 0
      && !context.isOccluded(animal,candidate));

  if (nearbyPredator || player && definition.aggression === 'timid' && animal.provokedUntil <= context.now) {
    const threat = nearbyPredator?.item || player?.item;
    const threatPosition = threat.position || threat;
    const dx = animal.x - threatPosition.x, dy = animal.y - threatPosition.y;
    const length = Math.hypot(dx,dy) || 1;
    const escape = Math.max(3.5, 7 - (nearbyPredator?.distance || player?.distance || 0) * .25);
    animal.state = 'fugindo'; animal.fleeUntil = context.now + 3600;
    animal.targetX = Math.max(1,Math.min(context.worldSize-1,animal.x + dx/length*escape));
    animal.targetY = Math.max(1,Math.min(context.worldSize-1,animal.y + dy/length*escape));
    return;
  }

  const active=wildlifeIsActive(definition,context.hours);
  const shelter={x:animal.shelterX,y:animal.shelterY};
  const disturbed=animal.provokedUntil>context.now||player&&player.distance<2.5;
  const needsRest=animal.energy<18||animal.state==='dormindo'&&animal.energy<70;
  if((!active||needsRest)&&!disturbed&&animal.hunger<75&&!(animal.pregnancyUntil>0&&animal.pregnancyUntil<=context.now)){
    animal.targetX=shelter.x;animal.targetY=shelter.y;
    const arrived=distance(animal,shelter)<.55;
    animal.state=arrived?'dormindo':'voltando-ao-abrigo';
    animal.sheltered=arrived&&['burrow','root-hollow','tree-hollow','cave','den','canopy-nest','high-nest','hedge-nest'].includes(definition.shelter);
    if(arrived){animal.vx=0;animal.vy=0;}
    return;
  }
  animal.sheltered=false;
  if(animal.state==='dormindo'||animal.state==='voltando-ao-abrigo'){animal.state='explorando';animal.stateUntil=0;}
  if (player) {
    const target = player.item;
    const p = target.position || target;
    const attack = definition.attack;
    const isProvoked = animal.provokedUntil > context.now;
    const nestThreatened = attack?.when === 'nest-threatened'
      && distance(p,{x:animal.shelterX,y:animal.shelterY}) < 2.5;
    const youngThreatened=animal.groupId&&(context.groupMembers.get(animal.groupId)||[]).some(other=>other.lifeStage==='filhote'&&distance(p,other)<2);
    const shouldDefend = attack && (isProvoked || definition.aggression === 'territorial' && distance(p,shelter)<2.1 && distance(animal,shelter)<8
      || definition.aggression === 'protective' && (attack.when !== 'nest-threatened' && youngThreatened && player.distance < 1.6 || nestThreatened)
      || definition.aggression === 'defensive' && player.distance < attack.reach * 1.15
      || definition.aggression === 'predator' && animal.hunger > 78 && player.distance < attack.reach * 1.1
      || definition.aggression === 'monster' && player.distance < 7);
    if (shouldDefend) {
      animal.state = player.distance<=attack.reach?'atacando':'em-alerta'; animal.targetX=p.x; animal.targetY=p.y;
      if (player.distance <= attack.reach && !context.isOccluded(animal,p)) handleAnimalAttack(animal,target,definition,context,events);
      return;
    }
    if (definition.aggression === 'predator' && animal.hunger > 48 && player.distance < 4.5) {
      animal.state = 'observando'; animal.targetX=p.x; animal.targetY=p.y;
      return;
    }
    if (definition.aggression === 'defensive' || definition.aggression === 'protective') {
      animal.state = player.distance < 2.2 ? 'em-alerta' : 'explorando';
      animal.targetX = player.distance < 2.2 ? animal.shelterX : animal.targetX;
      animal.targetY = player.distance < 2.2 ? animal.shelterY : animal.targetY;
      return;
    }
  }

  if (nearbyPrey && animal.hunger > 25) {
    const prey = nearbyPrey.item;
    animal.state='caçando'; animal.targetX=prey.x; animal.targetY=prey.y;
    if (nearbyPrey.distance <= (definition.attack?.reach || .8)) handleAnimalAttack(animal,prey,definition,context,events);
    return;
  }

  const stage = wildlifeStage(definition, animal.ageDays);
  animal.lifeStage = stage;
  if (animal.pregnancyUntil && animal.pregnancyUntil <= context.now && context.populationCount < context.populationLimit) {
    const litter = definition.stats.litter;
    const count = litter[0] + Math.floor((animal.randomSeed % 997) / 997 * (litter[1] - litter[0] + 1));
    for (let index=0; index<count && context.populationCount < context.populationLimit && (context.groupMembers.get(animal.groupId)||[]).length<4; index+=1) {
      const childId=`${animal.id}:filhote:${Math.floor(context.now)}:${index}`;
      const random=randomFrom(hashSeed(childId));
      const angle=random()*Math.PI*2, gap=.35+random()*.5;
      const position={x:animal.x+Math.cos(angle)*gap,y:animal.y+Math.sin(angle)*gap};
      if (!context.canOccupy(position,definition.stats.radius*.65)) continue;
      const child=createAnimal({id:childId,dimensionId:animal.dimensionId,definition,...position,random,now:context.now,ageDays:0,shelterAt:()=>({x:animal.shelterX,y:animal.shelterY,cover:animal.shelterCover})});
      child.shelterId=animal.shelterId;child.homeX=animal.homeX;child.homeY=animal.homeY;
      child.groupId=animal.groupId; child.health=Math.max(1,definition.stats.health*.65); child.energy=80;
      context.animals.push(child);
      const key=`${Math.floor(child.x/context.cellSize)},${Math.floor(child.y/context.cellSize)}`;
      const bucket=context.nearbyGrid.get(key)||[];bucket.push(child);context.nearbyGrid.set(key,bucket);
      const members=context.groupMembers.get(child.groupId)||[];members.push(child);context.groupMembers.set(child.groupId,members);
      context.population.set(child.id,child);
      context.populationCount += 1;
      events.push({type:'birth',animalId:child.id,speciesId:definition.id,at:context.now});
    }
    animal.pregnancyUntil=0;
    animal.energy=Math.max(0,animal.energy-18);
    animal.state='cuidando'; animal.stateUntil=context.now+8000;
    animal.targetX=animal.shelterX; animal.targetY=animal.shelterY;
    return;
  }

  if (animal.state === 'fugindo' && animal.fleeUntil > context.now) return;
  if (animal.stateUntil > context.now && ['alimentando-se','bebendo','descansando','cuidando'].includes(animal.state)) return;

  if (animal.thirst > 68) {
    const water=context.findWater(animal.x,animal.y,7);
    if (water) {
      animal.targetX=water.x; animal.targetY=water.y;
      if (distance(animal,water)<.7) { animal.state='bebendo'; animal.thirst=Math.max(0,animal.thirst-18); animal.stateUntil=context.now+3000; }
      else animal.state='procurando-água';
      return;
    }
  }
  if (animal.hunger > 68) {
    animal.state='forrageando';
    if (distance(animal,{x:animal.homeX,y:animal.homeY})<4) {
      animal.hunger=Math.max(0,animal.hunger-12); animal.energy=Math.min(100,animal.energy+2);
      animal.stateUntil=context.now+2200;
    } else { animal.targetX=animal.homeX; animal.targetY=animal.homeY; }
    return;
  }

  const readyToMate=!definition.isMonster&&stage==='adulto'&&animal.pregnancyUntil===0&&context.now>=animal.nextBreedAt
    &&animal.hunger<55&&animal.energy>55&&context.populationCount<context.populationLimit
    &&(context.groupMembers.get(animal.groupId)||[]).length<4;
  if(readyToMate&&animal.groupId){
    const mate=closest(context.groupMembers.get(animal.groupId)||[],animal,6,candidate=>candidate.id!==animal.id
      &&candidate.speciesId===animal.speciesId&&candidate.groupId===animal.groupId
      &&candidate.sex!==animal.sex&&candidate.pregnancyUntil===0&&candidate.nextBreedAt<=context.now
      &&candidate.hunger<55&&candidate.energy>55&&wildlifeStage(definition,candidate.ageDays)==='adulto');
    if(mate){
      if(mate.distance>1.05){
        animal.state='procurando-parceiro';animal.targetX=mate.item.x;animal.targetY=mate.item.y;
        return;
      }
      if(animal.sex==='fêmea'){
        animal.pregnancyUntil=context.now+definition.stats.gestationDays*GAME_DAY_DURATION_MS;
        animal.nextBreedAt=context.now+(definition.stats.gestationDays+2)*GAME_DAY_DURATION_MS;
        mate.item.nextBreedAt=animal.nextBreedAt;
        animal.state='acasalando';mate.item.state='acasalando';
        animal.targetX=mate.item.x;animal.targetY=mate.item.y;
        mate.item.targetX=animal.x;mate.item.targetY=animal.y;
        events.push({type:'breeding',animalId:animal.id,speciesId:definition.id,at:context.now});
        return;
      }
      animal.state='procurando-parceiro';animal.targetX=mate.item.x;animal.targetY=mate.item.y;
      return;
    }
  }

  animal.state='explorando';
  chooseWanderTarget(animal,definition,context,definition.activity==='nocturnal'?6:4.5);
  animal.thinkAt=context.now+1800+((animal.randomSeed % 1300));
}

export function stepWildlifePopulation(population, {dimensionId='surface', players=[], now=Date.now(), deltaSeconds=1/30,
  night=false, hours=12, worldSize=1000, canOccupy=()=>true, isOccluded=()=>false, findWater=()=>null, windNoise=0,
  playerRadius=.25, maxActiveDistance=42, populationLimit=WILDLIFE_POPULATION_LIMIT, profile=null} = {}) {
  const animals=[...population.values()].filter(animal=>animal.dimensionId===dimensionId);
  const activePlayers=players.filter(player=>player.location==='clearing'&&(player.dimensionId||'surface')===dimensionId);
  if (!activePlayers.length) return [];
  const activeAnimals=animals.filter(animal=>activePlayers.some(player=>distance(animal,player.position)<maxActiveDistance));
  const events=[];
  const populationCount=animals.length;
  const profileStats=profile&&typeof profile==='object'?profile:null;
  if(profileStats){
    for(const key of ['activeAnimals','decisions','behaviorMs','movementMs','canOccupyCalls','isOccludedCalls','findWaterCalls'])profileStats[key]??=0;
    profileStats.activeAnimals+=activeAnimals.length;
  }
  const cellSize=6,nearbyGrid=new Map();
  const cellKey=(x,y)=>`${Math.floor(x/cellSize)},${Math.floor(y/cellSize)}`;
  for(const animal of activeAnimals){const key=cellKey(animal.x,animal.y);const bucket=nearbyGrid.get(key)||[];bucket.push(animal);nearbyGrid.set(key,bucket);}
  const nearbyAnimals=(origin,radius)=>{
    // Positions are updated in-place as the step runs; a one-tile margin keeps
    // the broad phase correct for animals that crossed a cell since indexing.
    const queryRadius=radius+1;
    const minX=Math.floor((origin.x-queryRadius)/cellSize),maxX=Math.floor((origin.x+queryRadius)/cellSize);
    const minY=Math.floor((origin.y-queryRadius)/cellSize),maxY=Math.floor((origin.y+queryRadius)/cellSize),result=[];
    for(let cy=minY;cy<=maxY;cy++)for(let cx=minX;cx<=maxX;cx++)result.push(...(nearbyGrid.get(`${cx},${cy}`)||[]));
    return result;
  };
  const groupMembers=new Map();
  for(const animal of animals){const members=groupMembers.get(animal.groupId)||[];members.push(animal);groupMembers.set(animal.groupId,members);}
  const context={animals:activeAnimals,population,players:activePlayers,playerRadius,now,worldSize,night,hours,windNoise,
    cellSize,nearbyGrid,nearbyAnimals,groupMembers,
    canOccupy:profileStats?(...args)=>{profileStats.canOccupyCalls=(profileStats.canOccupyCalls||0)+1;return canOccupy(...args);}:canOccupy,
    isOccluded:profileStats?(...args)=>{profileStats.isOccludedCalls=(profileStats.isOccludedCalls||0)+1;return isOccluded(...args);}:isOccluded,
    findWater:profileStats?(...args)=>{profileStats.findWaterCalls=(profileStats.findWaterCalls||0)+1;return findWater(...args);}:findWater,
    populationCount,populationLimit,events};
  const delta=Math.max(0,Math.min(.12,Number(deltaSeconds)||0));
  for (const animal of activeAnimals) {
    const definition=WILDLIFE_BY_ID.get(animal.speciesId);
    if (!definition) { population.delete(animal.id); continue; }
    animal.ageDays+=(delta*1000)/GAME_DAY_DURATION_MS;
    animal.hunger=Math.min(100,animal.hunger+delta*(definition.diet==='carnivore'?.018:.012));
    animal.thirst=Math.min(100,animal.thirst+delta*.016);
    animal.energy=Math.min(100,Math.max(0,animal.energy+(animal.state==='dormindo'?delta*1.5:0)-delta*(animal.state==='explorando'||animal.state==='fugindo'||animal.state==='caçando'?.04:.008)));
    animal.lifeStage=wildlifeStage(definition,animal.ageDays);
    if (animal.ageDays>definition.stats.lifespanDays || animal.health<=0) {
      population.delete(animal.id);
      continue;
    }
    if ((animal.hunger>=100||animal.thirst>=100)&&animal.health>0) animal.health-=delta*.08;
    if (now>=animal.thinkAt) {
      const decisionStartedAt=profileStats?performance.now():0;
      chooseBehavior(animal,definition,context,events);
      if(profileStats){profileStats.decisions=(profileStats.decisions||0)+1;profileStats.behaviorMs=(profileStats.behaviorMs||0)+performance.now()-decisionStartedAt;}
    }
    const homeDistance=Math.hypot(animal.x-animal.shelterX,animal.y-animal.shelterY);
    if(homeDistance>12&&animal.state!=='fugindo'){
      animal.state='voltando-ao-abrigo';animal.sheltered=false;
      animal.targetX=animal.shelterX;animal.targetY=animal.shelterY;
    }
    const movementStartedAt=profileStats?performance.now():0;
    moveAnimal(animal,delta,definition,context);
    if(profileStats)profileStats.movementMs=(profileStats.movementMs||0)+performance.now()-movementStartedAt;
  }
  return events;
}

export function serializeWildlife(animal) {
  return {
    id:animal.id, speciesId:animal.speciesId, x:animal.x, y:animal.y, vx:animal.vx, vy:animal.vy,
    state:animal.state, health:animal.health, hunger:animal.hunger, thirst:animal.thirst,
    ageDays:animal.ageDays, lifeStage:animal.lifeStage, sex:animal.sex, awareness:animal.awarenessUntil>Date.now()?animal.awareness:null,
    shelter:{id:animal.shelterId||animal.groupId||animal.id,kind:WILDLIFE_BY_ID.get(animal.speciesId)?.shelter,x:animal.shelterX,y:animal.shelterY,cover:animal.shelterCover||null}, sheltered:animal.sheltered===true, pregnancy:animal.pregnancyUntil>0,
  };
}
