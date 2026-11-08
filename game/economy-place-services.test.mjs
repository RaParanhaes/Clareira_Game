import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_OBJECT_CATALOG } from './object-catalog-seed.mjs';
import { applyObjectCatalog } from './object-state.mjs';
import { getRoomLayout } from './world.mjs';
import { placeServiceAllowsAction,placeServicePoints } from './place-services.mjs';

test('existing persisted reception catalog gains economic management without moving or replacing services',()=>{
  const catalog=structuredClone(BUILTIN_OBJECT_CATALOG);
  const arrival=catalog.objects.find(item=>item.kind==='building'&&item.properties.id==='arrival');
  assert.ok(arrival);
  const exchange=arrival.properties.services.find(service=>service.id==='exchange');
  assert.ok(exchange);
  exchange.sections=exchange.sections.filter(section=>section!=='economy');
  assert.equal(exchange.sections.includes('government'),true);
  catalog.revision+=1;
  applyObjectCatalog(catalog);
  const points=placeServicePoints(
    {location:'room',roomKind:'lobby',roomBuildingId:'arrival'},getRoomLayout('lobby','arrival'),
  );
  assert.equal(points.length,2,'keep the preexisting information counter and exchange');
  const info=points.find(point=>point.id==='reception');
  const market=points.find(point=>point.id==='exchange');
  assert.ok(info && market);
  assert.equal(market.sections.includes('economy'),true);
  assert.equal(market.sections.includes('government'),true);
  assert.equal(market.sections.filter(section=>section==='economy').length,1);
  assert.equal(placeServiceAllowsAction(market,{name:'economyRefresh'}),true);
  assert.equal(placeServiceAllowsAction(market,{name:'economyRoleSet'}),true);
  assert.equal(placeServiceAllowsAction(info,{name:'economyRoleSet'}),false);
  assert.equal(placeServiceAllowsAction(info,{name:'economyRefresh'}),false);
  assert.equal(placeServiceAllowsAction(null,{name:'economyRoleSet'}),false);
});
