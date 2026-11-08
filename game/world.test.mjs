import test from 'node:test';
import assert from 'node:assert/strict';
import { CLEARING_DOOR, DIMENSION_COORDINATE_OFFSET, SHELTER_BOUNDS, SPAWN, SPAWN_CAMPFIRE, WORLD_CHUNK_SIZE, WORLD_SIZE, WORLD_TILE_X, WORLD_TILE_Y, canOccupy, hasTreeCollision, findSpawnPosition, findWalkPath, getObjectiveText, nearestCollectible, nearestResource, PLAYER_RADIUS, RESOURCE_NODES, SOLID_TREES, SOLID_WATER, stepPlayer, getResourcesInBounds, getSolidTreesInBounds, getWorldMapOverview, getWorldDefinition, applyWorldDefinition, isPathTile } from './world.mjs';
import { createChunkCache } from './world-chunks.mjs';
import { appendWorldEdit, emptyWorldDefinition } from './world-edits.mjs';
import { CAMPFIRE_LIFETIME_MS } from './campfire-life.mjs';

const atSurface = value => value + DIMENSION_COORDINATE_OFFSET;
const surfacePosition = (x, y) => ({ x: atSurface(x), y: atSurface(y) });
const readyForCampfire = inventory => ({ stoneAxe: 1, axeSharpness: 100, leaves: 1, ...inventory });

test('central village square is a marked, walkable paved area inside its clearing',()=>{
  const center=surfacePosition(18,17);
  assert.equal(isPathTile(center.x,center.y),true);
  assert.equal(canOccupy(center,.25),true);
  assert.equal(isPathTile(center.x+6,center.y),false);
});

test('chunks gerados voltam idênticos depois que a cache descarta regiões antigas',()=>{
  let generated=0;const chunk=createChunkCache((x,y)=>{generated++;return {x,y,signature:x*100+y};},2);
  const original=chunk(1,2);chunk(4,4);chunk(5,5);
  assert.notEqual(chunk(1,2),original,'a região antiga foi descartada da memória');
  assert.deepEqual(chunk(1,2),original,'a coordenada permite regenerar os mesmos dados do mundo');
  assert.equal(generated,4);
});

test('árvores mantêm distribuição contínua nas bordas dos chunks, sem quadrados vazios',()=>{
 const origin=getWorldDefinition();
 const forest=appendWorldEdit(origin,{id:'chunk-test-forest',type:'forest',x:160,y:160,radius:48},{worldSize:WORLD_SIZE});
 applyWorldDefinition(forest);
 try {
  const counts=[];
  for(let cy=8;cy<12;cy++)for(let cx=8;cx<12;cx++)counts.push(getSolidTreesInBounds({
   left:cx*WORLD_CHUNK_SIZE,right:(cx+1)*WORLD_CHUNK_SIZE,
   top:cy*WORLD_CHUNK_SIZE,bottom:(cy+1)*WORLD_CHUNK_SIZE,
  }).length);
  assert.ok(Math.min(...counts)>=10,'cada região de floresta mantém árvores nas bordas');
  assert.ok(Math.max(...counts)<=Math.min(...counts)*2,'densidade semelhante entre regiões vizinhas');
 } finally { applyWorldDefinition(origin); }
});

test('resumo macro do mundo é leve e lista trilhas e marcos sem detalhes dos objetos',()=>{
 const overview=getWorldMapOverview();
 assert.ok(overview.chunkSize>=16);
 assert.ok(overview.columns<=48);
 assert.equal(overview.chunks.length,overview.columns*overview.rows);
 assert.ok(overview.chunks.some(chunk=>chunk.trail));
 assert.deepEqual(overview.chunks.flatMap(chunk=>chunk.landmarks).map(place=>place.id).sort(),['campfire','highland','pond','shelter']);
 assert.ok(overview.chunks.every(chunk=>!('trees' in chunk)&&!('resources' in chunk)));
});

test('tree broad phase preserves exact collision results across the map and cell boundaries',()=>{
 for(const radius of [.25,.32,.8])for(let i=0;i<800;i++){
  const p={x:((i*173)%9600)/100,y:((i*331)%9600)/100};
  const expected=getSolidTreesInBounds({left:p.x-2,right:p.x+2,top:p.y-2,bottom:p.y+2}).some(tree=>Math.hypot(p.x-tree.x,p.y-tree.y)<tree.r+radius);
  assert.equal(hasTreeCollision(p,radius),expected);
 }
});

test('click route from the shelter to the west resource clears whole tree segments with natural movement',()=>{
 let p={x:3.2,y:16.05,vx:0,vy:0,z:0,vz:0};const target={x:2.3,y:7},path=findWalkPath(p,target);
 assert.ok(path.length);let previous=p;
 for(const node of path){for(let t=0;t<=1;t+=.02)assert.ok(canOccupy({x:previous.x+(node.x-previous.x)*t,y:previous.y+(node.y-previous.y)*t}));previous=node;}
 for(let tick=0;path.length&&tick<600;tick++){
  while(path.length&&Math.hypot(path[0].x-p.x,path[0].y-p.y)<.08)path.shift();if(!path.length)break;
  const dx=path[0].x-p.x,dy=path[0].y-p.y,length=Math.hypot(dx,dy),speed=Math.min(1,length/(3.2/60));
  p=stepPlayer(p,{x:dx/length*speed,y:dy/length*speed,motion:true},1/60);
 }
 assert.equal(path.length,0);assert.ok(Math.hypot(p.x-target.x,p.y-target.y)<.1);
});

test('normaliza diagonais para não andar mais rápido', () => {
  const from = { x: 8, y: 12 };
  const straight = stepPlayer(from, { x: 1, y: 0 }, 1 / 60);
  const diagonal = stepPlayer(from, { x: 1, y: 1 }, 1 / 60);
  assert.ok(Math.abs(Math.hypot(diagonal.x - from.x, diagonal.y - from.y) - (straight.x - from.x)) < 1e-9);
});

test('bloqueia árvores e limites do mapa, mas permite nadar em água funda', () => {
  const blockingTree=SOLID_TREES.find(tree=>hasTreeCollision(tree));
  assert.ok(blockingTree,'the authored grove contains a collidable tree');
  assert.equal(canOccupy({ x: blockingTree.x, y: blockingTree.y }), false);
  const pond = { x: (SOLID_WATER.left + SOLID_WATER.right) / 2, y: (SOLID_WATER.top + SOLID_WATER.bottom) / 2 };
  assert.equal(canOccupy(pond), true, 'deep water is traversable so swimming can extinguish fire');
  assert.equal(canOccupy({ x: -1, y: 5 }), false);
});

test('desliza pela borda de uma árvore em vez de travar os dois eixos', () => {
  const tree = SOLID_TREES[0];
  const start = { x: tree.x - tree.r - 0.4, y: tree.y - tree.r - 0.1 };
  const next = stepPlayer(start, { x: 1, y: 1 }, 0.05);
  assert.ok(next.y > start.y);
  assert.ok(next.x >= start.x);
  assert.ok(canOccupy(next));
});

test('não desloca o jogador ao caminhar diretamente contra uma árvore', () => {
  const tree = SOLID_TREES[0];
  const from = { x: tree.x - tree.r - PLAYER_RADIUS, y: tree.y };
  const next = stepPlayer(from, { x: 1, y: 0 }, 1 / 60);
  assert.deepEqual(next, from);
});

test('caminhada por clique encontra um caminho livre ao redor da água e das árvores', () => {
  const start = { x: 8.2, y: 12.3 };
  const target = { x: 8.2, y: 5.3 };
  const path = findWalkPath(start, target);

  assert.ok(path.length > 1);
  assert.ok(path.every(position => canOccupy(position)));
  assert.ok(Math.hypot(path.at(-1).x - target.x, path.at(-1).y - target.y) < 0.4);
});

test('movimento para diante de outro viajante sem atravessá-lo', () => {
  const start = { x: 8.2, y: 12.3 };
  const other = { x: start.x + 0.8, y: start.y };
  let next = start;
  for (let index=0;index<12;index++) next=stepPlayer(next,{x:1,y:0},0.05,[other]);
  assert.ok(next.x > start.x);
  assert.ok(Math.hypot(next.x-other.x,next.y-other.y)>=PLAYER_RADIUS*2);
  assert.deepEqual(stepPlayer(next,{x:1,y:0},0.05,[other]),next);
});

test('o personagem para no raio físico do animal terrestre, pode se afastar e a rota desvia', () => {
  const start = { x: 8.2, y: 12.3 };
  const animal = { x: 9.2, y: 12.3, radius: .35 };
  let player = start;
  for (let index = 0; index < 80; index += 1) {
    player = stepPlayer(player, { x: 1, y: 0 }, .05, [], [], 1000, [animal]);
  }
  assert.ok(Math.hypot(player.x-animal.x,player.y-animal.y) >= PLAYER_RADIUS + animal.radius - 1e-6);
  const escaped = stepPlayer({ x: animal.x-.4, y: animal.y }, { x: -1, y: 0 }, .05, [], [], 1000, [animal]);
  assert.ok(escaped.x < animal.x-.4, 'a correction that starts with overlap can move away');

  const target = { x: 10.2, y: 12.3 };
  const path = findWalkPath(start, target, [], 'clearing', [], [], undefined, [animal]);
  assert.ok(path.length > 1, 'the pathfinder routes around the animal');
  let previous = start;
  for (const waypoint of path) {
    for (let progress=0; progress<=1; progress+=.02) {
      const sample = { x: previous.x+(waypoint.x-previous.x)*progress, y: previous.y+(waypoint.y-previous.y)*progress };
      assert.ok(Math.hypot(sample.x-animal.x,sample.y-animal.y) >= PLAYER_RADIUS + animal.radius - .01);
    }
    previous = waypoint;
  }
});

test('distribui jogadores em posições livres e separadas perto da fogueira', () => {
  const positions = [];
  for (let index = 0; index < 12; index += 1) {
    const next = findSpawnPosition(positions);
    assert.ok(canOccupy(next));
    assert.ok(RESOURCE_NODES.every(resource => Math.hypot(next.x - resource.x, next.y - resource.y) >= 1.25));
    assert.ok(positions.every(other => {
      const dx = next.x - other.x;
      const dy = next.y - other.y;
      return Math.abs((dx - dy) * WORLD_TILE_X) >= 18 || Math.abs((dx + dy) * WORLD_TILE_Y) >= 32;
    }));
    positions.push(next);
  }
  assert.deepEqual(positions[0], findSpawnPosition());
});

test('coleta prioriza o recurso alcançável mais próximo', () => {
  const resources = [RESOURCE_NODES[0], RESOURCE_NODES[1]];
  assert.equal(nearestResource(surfacePosition(11.7, 5.5), resources)?.id, 'branch-east');
  assert.equal(nearestResource(surfacePosition(8, 8), resources), null);
});

test('coleta e brilho priorizam material da fogueira que o objetivo ainda pede', () => {
  const resources = [
    { id: 'berry', kind: 'berries', x: 0.2, y: 0 },
    { id: 'branch', kind: 'wood', x: 0.9, y: 0 },
  ];
  const inventory=readyForCampfire({ wood: 0, stone: 0 });
  assert.match(getObjectiveText({ x: 0, y: 0 }, resources, inventory), /^Pegue graveto/);
  assert.equal(nearestCollectible({ x: 0, y: 0 }, resources, inventory)?.id, 'branch');
  assert.equal(nearestCollectible({ x: 0, y: 0 }, [resources[0], { ...resources[1], x: 1.4 }], inventory)?.id, 'berry');
});

test('objetivo mostra o progresso necessário para a fogueira e a próxima coleta', () => {
  const nearbyBranch = RESOURCE_NODES.find(resource => resource.kind === 'wood');
  const startResources = [
    { kind: 'wood', ...surfacePosition(10, 14.1) },
    { kind: 'stone', ...surfacePosition(3, 12.3) },
  ];
  assert.equal(getObjectiveText(surfacePosition(8.2, 12.3), startResources, readyForCampfire({})), 'Procure gravetos ao sul · Fogueira: 0/20 gravetos, 0/10 pedras, 1/1 maço de folhas.');
  assert.equal(getObjectiveText(nearbyBranch, RESOURCE_NODES, readyForCampfire({ wood: 1 })), 'Pegue graveto · Fogueira: 1/20 gravetos, 0/10 pedras, 1/1 maço de folhas.');
  assert.equal(getObjectiveText(surfacePosition(8.2, 12.3), RESOURCE_NODES, readyForCampfire({ wood: 20, stone: 10 })), 'Pressione F para acender uma fogueira · 20 gravetos + 10 pedras + um maço de folhas secas.');
});

test('objetivo aguarda snapshot novo durante a reconexão e volta ao normal depois dele', () => {
  const position = surfacePosition(8.2, 12.3);
  const staleFire = { x: position.x, y: position.y };

  assert.equal(getObjectiveText(position, RESOURCE_NODES, readyForCampfire({ wood: 20, stone: 10 }), [staleFire], false), 'A trilha espera. Tentando voltar…');
  assert.equal(getObjectiveText(position, RESOURCE_NODES, readyForCampfire({ wood: 20, stone: 10 }), [staleFire], true), 'A fogueira está acesa. Sente-se ou acene para alguém.');
});

test('objetivo indica direção ao material necessário mais próximo', () => {
  const resources = [
    { kind: 'wood', ...surfacePosition(8.2, 5) },
    { kind: 'stone', ...surfacePosition(3, 12.3) },
  ];
  assert.equal(getObjectiveText(surfacePosition(8.2, 12.3), resources, readyForCampfire({ stone: 1 })), 'Procure pedras a noroeste · Fogueira: 0/20 gravetos, 1/10 pedras, 1/1 maço de folhas.');
});

test('objetivo prioriza acender fogueira quando os materiais já estão completos', () => {
  const besideResource = surfacePosition(11.7, 5.5);
  assert.equal(getObjectiveText(besideResource, RESOURCE_NODES, readyForCampfire({ wood: 20, stone: 10 })), 'Pressione F para acender uma fogueira · 20 gravetos + 10 pedras + um maço de folhas secas.');
});

test('objetivo conduz ao ponto social da fogueira e evita sugerir outra junto dela', () => {
  const position = surfacePosition(8.2, 12.3);
  const fire = { ...surfacePosition(8.2, 12.3), litAt: Date.now() };
  assert.equal(
    getObjectiveText(position, RESOURCE_NODES, readyForCampfire({ wood: 4, stone: 2 }), [fire]),
    'A fogueira está acesa. Sente-se ou acene para alguém.',
  );
  assert.equal(
    getObjectiveText(surfacePosition(9.7, 12.3), RESOURCE_NODES, readyForCampfire({ wood: 4, stone: 2 }), [fire]),
    'A fogueira está acesa. Sente-se ou acene para alguém.',
  );
  assert.equal(getObjectiveText(surfacePosition(8, 8), RESOURCE_NODES, readyForCampfire({}), [fire]), 'Vá até a fogueira a sudoeste.');
});

test('objetivo não afasta o jogador de um recurso necessário para voltar a uma fogueira distante', () => {
  const position = surfacePosition(11.2, 7.4);
  const inventory = readyForCampfire({ wood: 0, stone: 0 });
  const distantFire = { ...surfacePosition(3, 3), litAt: performance.now() - CAMPFIRE_LIFETIME_MS - 1_000 };
  const resources = [
    { id: 'stone-path', kind: 'stone', ...surfacePosition(11.3, 7.4) },
    { id: 'branch-path', kind: 'wood', ...surfacePosition(12.1, 7.4) },
  ];

  assert.equal(nearestCollectible(position, resources, inventory)?.id, 'stone-path');
  assert.equal(
    getObjectiveText(position, resources, inventory, [distantFire]),
    'Pegue graveto · Fogueira: 0/10 gravetos, 1/1 maço de folhas.',
  );
});

test('objetivo oferece acender outra fogueira quando há materiais e o fogo está longe', () => {
  const fire = { ...surfacePosition(12, 12), litAt: Date.now() };
  assert.equal(
    getObjectiveText(surfacePosition(2, 2), RESOURCE_NODES, readyForCampfire({ wood: 20, stone: 10 }), [fire]),
    'Você já tem materiais para acender outra fogueira.',
  );
});

test('objetivo não desvia para frutinhas quando ainda falta material da fogueira', () => {
  const resources = [
    { kind: 'berries', ...surfacePosition(5.5, 5.8) },
    { kind: 'stone', ...surfacePosition(6.3, 5.8) },
  ];
  assert.equal(getObjectiveText(surfacePosition(5.5, 5.8), resources, readyForCampfire({ wood: 2, stone: 0 })), 'Pegue pedra · Fogueira: 2/20 gravetos, 0/10 pedras, 1/1 maço de folhas.');
});

test('objetivo continua orientando o grupo quando todos os materiais necessários foram recolhidos', () => {
  assert.equal(
    getObjectiveText(surfacePosition(8.2, 12.3), [], readyForCampfire({})),
    'Explore a trilha enquanto os gravetos e as pedras retornam · Fogueira: 0/20 gravetos, 0/10 pedras, 1/1 maço de folhas.',
  );
  assert.equal(
    getObjectiveText(surfacePosition(8.2, 12.3), [{ kind: 'berries', ...surfacePosition(5.5, 5.8) }], readyForCampfire({ wood: 2, stone: 0 })),
    'Procure frutinhas a nordeste para oferecer enquanto os gravetos e as pedras retornam · Fogueira: 2/20 gravetos, 0/10 pedras, 1/1 maço de folhas.',
  );
  assert.equal(
    getObjectiveText(surfacePosition(8.2, 12.3), [{ kind: 'berries', ...surfacePosition(8.4, 12.3) }], readyForCampfire({ wood: 2, stone: 0 })),
    'Pegue frutinhas para oferecer a alguém enquanto os gravetos e as pedras retornam · Fogueira: 2/20 gravetos, 0/10 pedras, 1/1 maço de folhas.',
  );
});

test('gravetos alimentam uma fogueira fraca sem exigir machado', () => {
  const weakFire = { x: 8.2, y: 12.3, burnRemainingMs: 1 };
  assert.equal(
    getObjectiveText({ x: 8.2, y: 12.3 }, RESOURCE_NODES, {}, [weakFire]),
    'Fogueira enfraquecendo · junte 2 gravetos.',
  );
  assert.equal(
    getObjectiveText({ x: 8.2, y: 12.3 }, RESOURCE_NODES, { wood: 2 }, [weakFire]),
    'Pressione F para alimentar a fogueira · 2 gravetos.',
  );
});


test('abrigo bloqueia seu volume e o espaço da fogueira sem fogo permanece caminhável', () => {
  assert.equal(canOccupy({x:(SHELTER_BOUNDS.left+SHELTER_BOUNDS.right)/2,y:(SHELTER_BOUNDS.top+SHELTER_BOUNDS.bottom)/2}),false);
  assert.equal(canOccupy(SPAWN_CAMPFIRE),true);
  const exit={x:CLEARING_DOOR.x,y:CLEARING_DOOR.y+.5};
  assert.equal(canOccupy(exit),true);
  assert.ok(findWalkPath(exit,{x:8.2,y:12.3}).length>1);
  const distant=getResourcesInBounds({left:16,right:48,top:16,bottom:48}).find(node=>canOccupy(node));
  assert.ok(distant,'há coleta utilizável além do mapa anterior');
  assert.ok(findWalkPath({x:8.2,y:12.3},distant).length>1);
  assert.equal(canOccupy({x:WORLD_SIZE+.1,y:20}),false);
});

test('o mundo expandido gera coleta alcançável além da antiga borda e consulta objetos por chunks', () => {
  assert.ok(WORLD_SIZE >= 670);
  const distant = getResourcesInBounds({left:640,right:656,top:640,bottom:656})[0];
  assert.ok(distant, 'há recurso gerado no novo território');
  assert.ok(canOccupy(distant), 'o recurso distante é alcançável');
  const bounds = { left: distant.x - 1, right: distant.x + 1, top: distant.y - 1, bottom: distant.y + 1 };
  assert.ok(getResourcesInBounds(bounds).some(node => node.id === distant.id));
  assert.ok(getSolidTreesInBounds(bounds).every(tree => tree.x >= bounds.left && tree.x <= bounds.right
    && tree.y >= bounds.top && tree.y <= bounds.bottom));
  const region={left:640,right:656,top:640,bottom:656};
  const treesBefore=getSolidTreesInBounds(region).map(({x,y,r,index})=>({x,y,r,index}));
  const resourcesBefore=getResourcesInBounds(region);
  for(let cy=0;cy<12;cy++)for(let cx=0;cx<12;cx++)getSolidTreesInBounds({left:cx*16,right:cx*16+15,top:cy*16,bottom:cy*16+15});
  assert.deepEqual(getSolidTreesInBounds(region).map(({x,y,r,index})=>({x,y,r,index})),treesBefore);
  assert.deepEqual(getResourcesInBounds(region),resourcesBefore,'chunks descarregados são recriados sem alterar o mundo');
});
