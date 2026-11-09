import test from 'node:test';import assert from 'node:assert/strict';
import{BUILTIN_OBJECT_CATALOG as seed}from'./object-catalog-seed.mjs';
import{editObjectCatalog,resolveObjectCatalog,copyData}from'./object-catalog.mjs';
import{applyObjectCatalog}from'./object-state.mjs';
import{canOccupyRoom}from'./world.mjs';

test('assembly copies have independent IDs, local architecture and interiors linked to the new building',()=>{
 const c=editObjectCatalog(seed,[{action:'copy',id:'building:lodging-rill-guesthouse',newId:'building:example',buildingId:'example',offset:{x:100,y:20},properties:{name:'Casa de exemplo'}}]);
 const view=applyObjectCatalog(c,{validateOnly:true}),source=view.buildings.get('lodging-rill-guesthouse'),clone=view.buildings.get('example');
 assert.equal(clone.bounds.left-source.bounds.left,100);assert.equal(clone.door.x-source.door.x,100);
 assert.equal(clone.windowObjects[0].y-source.windowObjects[0].y,20);
 const layout=view.rooms.get('lodging:example:rent');assert.ok(layout);assert.equal(layout.fixtures.length+layout.presets.length,5);
 // Predefined pieces are room furniture: they block the player through the room's furniture list.
 assert.equal(canOccupyRoom(layout.presets[0],.25,layout.presets,layout),false);
 assert.ok(c.objects.filter(o=>o.parentId==='building:example').every(o=>o.id.startsWith('building:example/')));
 assert.equal(seed.objects.some(o=>o.id==='building:example'),false);
});
test('database seed assigns physical and depth properties to editable and fixed room furniture',()=>{
 const templates=new Map(seed.templates.map(template=>[template.id,template]));
 for(const template of seed.templates.filter(value=>value.id.startsWith('furniture.'))){
  assert.ok(template.properties.physics,`${template.id} has a collider`);
  assert.equal(template.properties.physics.authority,'server');
  assert.equal(template.properties.depthOrder.anchor,'footprint-front');
  assert.equal(template.properties.depthOrder.vertical,'support-base');
 }
 for(const template of seed.templates.filter(value=>value.id.startsWith('fixture.'))){
  assert.ok(template.properties.physics,`${template.id} has a collider`);
  assert.equal(template.properties.physics.authority,'server');
  assert.equal(template.properties.depthOrder.anchor,'footprint-front');
  assert.equal(template.properties.depthOrder.vertical,'support-base');
 }
 assert.equal(templates.get('fixture.fireplace').properties.physics.shape,'box');
 assert.equal(templates.get('fixture.counter').properties.physics.shape,'box');
});
test('template properties inherit while instance overrides and future fields remain independent',()=>{
 const c=editObjectCatalog(seed,[{action:'put',collection:'templates',value:{id:'fixture.soft-chair',baseId:'fixture.chair',kind:'fixture',properties:{comfort:5,height:2.35}}},
  {action:'put',value:{id:'test-chair',templateId:'fixture.soft-chair',parentId:'room:legacy:legacy:main',sceneId:'interior:legacy',properties:{x:8,y:6,width:.7,depth:.7,comfort:9}}}]);
 const row=resolveObjectCatalog(c).objects.get('test-chair');assert.equal(row.properties.height,2.35);assert.equal(row.properties.comfort,9);assert.equal(row.properties.kind,'chair');
 assert.throws(()=>editObjectCatalog(c,[{action:'put',collection:'templates',value:{id:'fixture.chair',baseId:'fixture.soft-chair',kind:'fixture',properties:{}}}]),/circular/);
 assert.throws(()=>editObjectCatalog(c,[{action:'patch',id:'test-chair',properties:JSON.parse('{"__proto__":{"polluted":true}}')}]),/reservada/);
 assert.equal({}.polluted,undefined);
});
test('archiving a window removes its visual/light emitter and archiving an assembly removes its whole subtree',()=>{
 const c=editObjectCatalog(seed,[{action:'archive',id:'building:lodging-ember-hotel/window-0'}]);
 const before=applyObjectCatalog(seed,{validateOnly:true}).buildings.get('lodging-ember-hotel'),after=applyObjectCatalog(c,{validateOnly:true}).buildings.get('lodging-ember-hotel');
 assert.equal(after.windowObjects.length,before.windowObjects.length-1);
 const removed=editObjectCatalog(c,[{action:'archive',id:'building:lodging-ember-hotel'}]);assert.equal(applyObjectCatalog(removed,{validateOnly:true}).buildings.has('lodging-ember-hotel'),false);
 assert.throws(()=>applyObjectCatalog(editObjectCatalog(seed,[{action:'archive',id:'building:arrival'}]),{validateOnly:true}),/recepção/);
 const invalid=copyData(seed);invalid.objects.find(o=>o.templateId==='fixture.chair').properties.x=NaN;assert.throws(()=>resolveObjectCatalog(invalid),/Número/);
});

test('stored flat-room doors and spawns remain editable instead of being reset to defaults',()=>{
 const room=seed.objects.find(o=>o.templateId==='architecture.room'&&o.properties.elevation==='flat');
 const door={...room.properties.door,x:room.properties.door.x+.4},spawn={...room.properties.spawn,x:door.x};
 const c=editObjectCatalog(seed,[{action:'patch',id:room.id,properties:{door,spawn}}]);
 const layout=[...applyObjectCatalog(c,{validateOnly:true}).rooms.values()].find(l=>l.objectId===room.id);
 assert.deepEqual(layout.door,door);assert.deepEqual(layout.spawn,spawn);
 assert.equal(canOccupyRoom(spawn,.25,[],layout),true);
});

test('catalog-backed hotel lobby uses the same cutout floor as the builtin plan',()=>{
 const lobby=applyObjectCatalog(seed,{validateOnly:true}).rooms.get('lobby:lodging-ember-hotel:');
 assert.equal(canOccupyRoom({x:2,y:10.8},.25,[],lobby),false);
 assert.equal(canOccupyRoom({x:8,y:10.8},.25,[],lobby),true);
});
