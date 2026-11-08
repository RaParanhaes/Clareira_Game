import {objectBuildings,subscribeObjectCatalog} from './object-state.mjs';
import { VILLAGE_BUILDINGS } from './village-buildings.mjs';
import { isCabin } from './cabin-access.mjs';

// Stable place IDs refer to the existing world/catalog; these are interaction
// policies, not a second catalog of buildings, inventories or saved objects.
const reception = (sections, label = 'Recepção', fraction = .5) => Object.freeze({
  id: 'reception', label, prompt: 'Conversar', sections: Object.freeze(sections),
  anchor: Object.freeze({ kind: 'counter-front', fraction, gap: .65 }), radius: 1.05,
});

export const SERVICE_SECTIONS = Object.freeze({
  rooms: Object.freeze({ label: 'Quartos', description: 'Consultar diárias e acessar seu quarto.' }),
  properties: Object.freeze({ label: 'Propriedades', description: 'Consultar, anunciar e comprar propriedades.' }),
  directory: Object.freeze({ label: 'Hospedagens da vila', description: 'Conhecer os lugares e onde reservar.' }),
  trade: Object.freeze({ label: 'Mercado de materiais', description: 'Vender recursos à vila ou comprar materiais disponíveis no estoque do balcão.' }),
  orders: Object.freeze({ label: 'Encomendas', description: 'Consultar pedidos e entregar materiais.' }),
  tools: Object.freeze({ label: 'Comprar ferramentas', description: 'Consultar as ferramentas deste balcão.' }),
  government: Object.freeze({ label: 'Governo e impostos', description: 'Ajustar alíquotas do governo autorizado.' }),
  economy: Object.freeze({ label: 'Gestão econômica', description: 'Indicadores, fundos, preços e cargos de economia.' }),
  keys: Object.freeze({ label: 'Chaves da cabana', description: 'Entregar ou revogar chaves para outras contas.' }),
});

const arrivalExchange = Object.freeze({
  ...reception(['trade', 'orders', 'tools', 'government', 'economy'], 'Trocas da vila', .86), id: 'exchange',
});
export const PLACE_SERVICES = {
  arrival: Object.freeze([reception(['directory'], 'Informações', .14), arrivalExchange]),
  'lodging-pine-inn': Object.freeze([reception(['rooms'])]),
  'lodging-rill-guesthouse': Object.freeze([reception(['rooms'])]),
  'lodging-ember-hotel': Object.freeze([reception(['rooms', 'properties'])]),
};

export const CABIN_EXTERIOR_SERVICES = Object.fromEntries(VILLAGE_BUILDINGS.filter(building => isCabin(building.id))
  .map(building => [building.id, Object.freeze({ id: 'property-sign', label: 'Placa da cabana', prompt: 'Consultar',
    sections: Object.freeze(['properties', 'keys']), radius: 1.05,
    anchor: Object.freeze({ kind: 'building-sign', x: building.door.x - 1.8, y: building.door.y + 1.1 }) })]));

subscribeObjectCatalog(()=>{
 for(const key of Object.keys(PLACE_SERVICES))delete PLACE_SERVICES[key];
 for(const key of Object.keys(CABIN_EXTERIOR_SERVICES))delete CABIN_EXTERIOR_SERVICES[key];
 for(const b of objectBuildings()){
  if(b.services?.length)PLACE_SERVICES[b.id]=b.services;
  if(b.kind==='cabin')CABIN_EXTERIOR_SERVICES[b.id]={id:'property-sign',label:'Placa da cabana',prompt:'Consultar',sections:['properties','keys'],radius:1.05,anchor:{kind:'building-sign',x:b.door.x-1.8,y:b.door.y+1.1}};
 }
});

export function resolveServiceAnchor(anchor, layout) {
  if (anchor?.kind === 'building-sign') return { x: anchor.x, y: anchor.y, frontEdge: null };
  if (!anchor || !layout?.bounds) return null;
  if (anchor.kind === 'counter-front' && layout.counter) {
    const counter = layout.counter;
    return { x: counter.left + (counter.right - counter.left) * anchor.fraction,
      y: counter.bottom + anchor.gap, frontEdge: counter.bottom };
  }
  // Future noticeboards/terminals can use a floor position relative to their
  // room footprint instead of copying screen pixels or another room's counter.
  if (anchor.kind === 'floor' && [anchor.u, anchor.v].every(value => Number.isFinite(value) && value > 0 && value < 1)) {
    const { left, right, top, bottom } = layout.bounds;
    return { x: left + (right - left) * anchor.u, y: top + (bottom - top) * anchor.v, frontEdge: null };
  }
  return null;
}

export function placeServicePoints(context, layout) {
  if (context.location === 'clearing' && context.dimensionId === 'surface')
    return Object.entries(CABIN_EXTERIOR_SERVICES).map(([placeId, definition]) => ({ ...definition, placeId,
      key: `${placeId}:${definition.id}`, ...resolveServiceAnchor(definition.anchor) }));
  if (context.location !== 'room' || context.roomKind !== 'lobby' || !Object.hasOwn(PLACE_SERVICES, context.roomBuildingId)) return [];
  return PLACE_SERVICES[context.roomBuildingId].flatMap(definition => {
    const anchor = resolveServiceAnchor(definition.anchor, layout);
    return anchor ? [{
      ...definition, placeId: context.roomBuildingId,
      key: `${context.roomBuildingId}:${definition.id}`,
      ...anchor,
    }] : [];
  });
}

export function nearestPlaceService(context, position, layout, canReach = () => true) {
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return null;
  return placeServicePoints(context, layout)
    .map(point => ({ ...point, distance: Math.hypot(position.x - point.x, position.y - point.y) }))
    .filter(point => (point.frontEdge === null || position.y >= point.frontEdge + .25)
      && point.distance <= point.radius && canReach(point))
    .sort((first, second) => first.distance - second.distance)[0] || null;
}

const ACTION_SECTIONS = Object.freeze({
  lodgeEnter: ['rooms', 'properties'], lodgeSell: ['trade'], lodgeBuyMaterial: ['trade'],
  lodgeBuyTool: ['tools'], lodgeCompleteContract: ['orders'],
  cabinGrantKey: ['keys'], cabinRevokeKey: ['keys'],
  setLodgingAutoRenew: ['rooms','properties'],
  governmentTaxPolicySet: ['government'], economyRefresh: ['economy'], economyRoleSet: ['economy'],
  propertyRequest:['properties','directory'], propertyQuote:['properties','directory'], propertyRentList:['properties'], propertyRentDelist:['properties'], propertyRent:['properties','directory'],
  propertyList: ['properties'], propertyDelist: ['properties'], propertyBuy: ['properties', 'directory'],
});

export function isPlaceServiceAction(name) {
  return name === 'lodgeClaim' || Object.hasOwn(ACTION_SECTIONS, name);
}

export function placeServiceAllowsAction(point, message) {
  const sections = message.name === 'lodgeClaim'
    ? message.mode === 'rent' ? ['rooms'] : message.mode === 'owned' ? ['properties'] : []
    : ACTION_SECTIONS[message.name] || [];
  return Boolean(point && sections.some(section => point.sections.includes(section))
    && (!['lodgeClaim', 'cabinGrantKey', 'cabinRevokeKey', 'propertyList', 'propertyDelist', 'propertyRentList', 'propertyRentDelist', 'setLodgingAutoRenew'].includes(message.name) || message.buildingId === point.placeId)
    && (!['propertyBuy','propertyRent','propertyRequest','propertyQuote'].includes(message.name) || point.sections.includes('directory') || message.buildingId === point.placeId)
    && (message.name !== 'lodgeEnter' || !message.buildingId || message.buildingId === point.placeId));
}
