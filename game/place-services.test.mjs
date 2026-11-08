import test from 'node:test';
import assert from 'node:assert/strict';
import { getRoomLayout, canOccupyRoom, canOccupy, findWalkPath, hasClearInteractionPath } from './world.mjs';
import { PLACE_SERVICES, SERVICE_SECTIONS, nearestPlaceService, placeServicePoints, placeServiceAllowsAction, resolveServiceAnchor } from './place-services.mjs';

test('every existing place has reachable service points, away from the entrance', () => {
  for (const roomBuildingId of Object.keys(PLACE_SERVICES)) {
    const context = { location: 'room', roomKind: 'lobby', roomBuildingId };
    const layout = getRoomLayout('lobby', roomBuildingId);
    assert.equal(nearestPlaceService(context, layout.spawn, layout), null, `${roomBuildingId}: entrance is not the counter`);
    for (const point of placeServicePoints(context, layout)) {
      assert.ok(point.sections.every(section => SERVICE_SECTIONS[section]));
      assert.ok(canOccupyRoom(point, .25, [], layout), `${point.key}: reachable floor`);
      assert.ok(findWalkPath(layout.spawn, point, [], 'room', [], [], layout).length, `${point.key}: route from door`);
      const reached = nearestPlaceService(context, point, layout, target =>
        hasClearInteractionPath(point, target, { location: 'room', roomLayout: layout }));
      assert.equal(reached?.key, point.key);
      assert.equal(nearestPlaceService(context, { x: point.x, y: layout.counter.top - .3 }, layout), null,
        'standing behind the counter does not activate the front');
      assert.equal(nearestPlaceService(context, point, layout, () => false), null, 'obstructed points cannot open');
    }
  }
});

test('services and authoritative actions belong to the correct place and counter', () => {
  const points = id => placeServicePoints({ location: 'room', roomKind: 'lobby', roomBuildingId: id }, getRoomLayout('lobby', id));
  const hotel = points('lodging-ember-hotel')[0];
  assert.deepEqual(hotel.sections, ['rooms', 'properties']);
  assert.equal(placeServiceAllowsAction(hotel, { name: 'lodgeClaim', mode: 'rent', buildingId: hotel.placeId }), true);
  for (const name of ['lodgeSell', 'lodgeBuyTool', 'lodgeCompleteContract']) assert.equal(placeServiceAllowsAction(hotel, { name }), false);
  assert.equal(placeServiceAllowsAction(hotel, { name: 'lodgeClaim', mode: 'owned', buildingId: 'cabin-cedar-one' }), false);
  assert.equal(placeServiceAllowsAction(hotel, { name:'setLodgingAutoRenew', buildingId:hotel.placeId }), true);
  assert.equal(placeServiceAllowsAction(hotel, { name:'setLodgingAutoRenew', buildingId:'lodging-pine-inn' }), false);
  const cabin = placeServicePoints({ location: 'clearing', dimensionId: 'surface' }).find(point => point.placeId === 'cabin-cedar-one');
  assert.equal(placeServiceAllowsAction(cabin, { name: 'lodgeClaim', mode: 'rent', buildingId: cabin.placeId }), false);
  const [info, exchange] = points('arrival');
  assert.equal(placeServiceAllowsAction(info, { name: 'lodgeSell' }), false);
  assert.equal(placeServiceAllowsAction(exchange, { name: 'lodgeSell' }), true);
  assert.equal(exchange.sections.includes('government'), true);
  assert.equal(placeServiceAllowsAction(exchange, { name: 'governmentTaxPolicySet' }), true);
  assert.equal(placeServiceAllowsAction(info, { name: 'governmentTaxPolicySet' }), false);
  assert.equal(placeServiceAllowsAction(exchange, { name: 'lodgeClaim', mode: 'rent', buildingId: hotel.placeId }), false);
  assert.equal(placeServiceAllowsAction(null, { name: 'lodgeSell' }), false);
});

test('cabins have exterior signs, no public reception, and cannot authorize another cabin', () => {
  const context = { location: 'clearing', dimensionId: 'surface' };
  const points = placeServicePoints(context);
  assert.equal(points.length, 3);
  for (const point of points) {
    assert.ok(canOccupy(point), `${point.key}: sign is on accessible outdoor floor`);
    assert.equal(nearestPlaceService(context, point)?.key, point.key);
    assert.deepEqual(placeServicePoints({ location: 'room', roomKind: 'lobby', roomBuildingId: point.placeId }, getRoomLayout('lobby', point.placeId)), []);
    assert.equal(getRoomLayout('lobby', point.placeId).counter, null);
    assert.equal(placeServiceAllowsAction(point, { name: 'lodgeEnter', buildingId: 'lodging-ember-hotel' }), false);
    assert.equal(placeServiceAllowsAction(point, { name: 'cabinGrantKey', buildingId: point.placeId }), true);
    assert.equal(placeServiceAllowsAction(point, { name: 'propertyList', buildingId: point.placeId }), true);
    assert.equal(placeServiceAllowsAction(point, { name: 'propertyDelist', buildingId: point.placeId }), true);
    assert.equal(placeServiceAllowsAction(point, { name: 'propertyBuy', buildingId: point.placeId }), true);
    assert.equal(placeServiceAllowsAction(point, { name: 'propertyList', buildingId: point.placeId === 'cabin-cedar-two' ? 'cabin-cedar-one' : 'cabin-cedar-two' }), false);
  }
  assert.deepEqual(placeServicePoints({ location: 'clearing', dimensionId: 'dark' }), []);
});

test('the village directory can authorize a listed-property purchase but cannot list or delist it', () => {
  const info = placeServicePoints({ location:'room', roomKind:'lobby', roomBuildingId:'arrival' }, getRoomLayout('lobby','arrival'))[0];
  assert.ok(info.sections.includes('directory'));
  assert.equal(placeServiceAllowsAction(info, { name:'propertyBuy', buildingId:'cabin-cedar-two' }), true);
  assert.equal(placeServiceAllowsAction(info, { name:'propertyList', buildingId:'cabin-cedar-two' }), false);
  assert.equal(placeServiceAllowsAction(info, { name:'propertyDelist', buildingId:'cabin-cedar-two' }), false);
});

test('private rooms, the forest and unknown places cannot inherit a public counter', () => {
  const layout = getRoomLayout('lobby', 'arrival');
  for (const context of [
    { location: 'clearing', roomKind: 'lobby', roomBuildingId: 'arrival' },
    { location: 'room', roomKind: 'lodging', roomBuildingId: 'lodging-ember-hotel' },
    { location: 'room', roomKind: 'lobby', roomBuildingId: 'unknown' },
    { location: 'room', roomKind: 'lobby', roomBuildingId: '__proto__' },
  ]) assert.deepEqual(placeServicePoints(context, layout), []);
});

test('floor anchors follow their own room dimensions and reject points outside its footprint', () => {
  const layout = getRoomLayout('lobby', 'lodging-ember-hotel');
  assert.deepEqual(resolveServiceAnchor({ kind: 'floor', u: .5, v: .5 }, layout), { x: 8, y: 7, frontEdge: null });
  for (const u of [NaN, -1, 0, 1, Infinity]) assert.equal(resolveServiceAnchor({ kind: 'floor', u, v: .5 }, layout), null);
  assert.equal(resolveServiceAnchor(null, layout), null);
});
