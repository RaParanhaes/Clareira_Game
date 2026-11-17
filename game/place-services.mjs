import {objectBuildings,subscribeObjectCatalog} from './object-state.mjs';
import { VILLAGE_BUILDINGS } from './village-buildings.mjs';
import { isCabin } from './cabin-access.mjs';
import { VILLAGE_JOB_POINTS, VILLAGE_JOBS } from './village-jobs.mjs';

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
  trade: Object.freeze({ label: 'Vender materiais', description: 'Trocar materiais do Inventário por moedas.' }),
  orders: Object.freeze({ label: 'Encomendas', description: 'Consultar pedidos e entregar materiais.' }),
  gear: Object.freeze({ label: 'Armas e armaduras', description: 'Espada curta e gibão de couro para o bosque.' }),
  tools: Object.freeze({ label: 'Comprar ferramentas', description: 'Consultar as ferramentas deste balcão.' }),
  government: Object.freeze({ label: 'Governo e impostos', description: 'Consultar o tesouro e ajustar as alíquotas deste governo.' }),
  keys: Object.freeze({ label: 'Chaves da cabana', description: 'Entregar ou revogar chaves para outras contas.' }),
  jobs: Object.freeze({ label: 'Trabalhos da vila', description: 'Pegue um trabalho pago e conclua no ponto indicado.' }),
});

// Pontos externos dos ofícios (quadro, entrega, fogueira). Ficam fora de
// PLACE_SERVICES, que é reconstruído a cada atualização do catálogo de objetos.
const JOB_POINT_PROMPTS = Object.freeze({ board: 'Ver trabalhos', delivery: 'Entregar caixa', hearth: 'Ver trabalhos' });
// Início é por ofício: cada jobId só começa no ponto de partida do catálogo
// (carrier no quadro, firekeeper na fogueira). Conclusão vale em qualquer
// ponto de destino; cancelamento vale em qualquer ponto de ofício.
const JOB_START_POINT_BY_ID = new Map(VILLAGE_JOBS.map(job => [job.id, job.startPointId]));
const JOB_FINISH_POINT_IDS = new Set(VILLAGE_JOBS.map(job => job.finishPointId));
const JOB_POINT_IDS = new Set(VILLAGE_JOB_POINTS.map(point => point.id));

function jobActionAllowed(point, message) {
  if (!Object.hasOwn(JOB_ACTION_NAMES, message.name)) return true;
  if (!point.jobPointId) return false;
  if (message.name === 'villageJobStart') return JOB_START_POINT_BY_ID.get(message.jobId) === point.jobPointId;
  if (message.name === 'villageJobFinish') return JOB_FINISH_POINT_IDS.has(point.jobPointId);
  return JOB_POINT_IDS.has(point.jobPointId);
}
const JOB_ACTION_NAMES = Object.freeze({ villageJobStart: true, villageJobFinish: true, villageJobCancel: true });
export const EXTERIOR_JOB_SERVICES = Object.freeze(VILLAGE_JOB_POINTS.map(point => Object.freeze({
  id: 'village-job', label: point.label, prompt: JOB_POINT_PROMPTS[point.id] || 'Ver trabalhos',
  sections: Object.freeze(['jobs']), radius: point.radius, jobPointId: point.id, placeId: `village-job:${point.id}`,
  anchor: Object.freeze({ kind: 'world-point', x: point.x, y: point.y }),
})));

const arrivalExchange = Object.freeze({
  ...reception(['trade', 'orders', 'tools', 'gear', 'government'], 'Trocas da vila', .86), id: 'exchange',
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
  if (anchor?.kind === 'building-sign' || anchor?.kind === 'world-point') return { x: anchor.x, y: anchor.y, frontEdge: null };
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
    return [...Object.entries(CABIN_EXTERIOR_SERVICES).map(([placeId, definition]) => ({ ...definition, placeId,
      key: `${placeId}:${definition.id}`, ...resolveServiceAnchor(definition.anchor) })),
    ...EXTERIOR_JOB_SERVICES.map(definition => ({ ...definition, key: `${definition.placeId}:${definition.id}`,
      ...resolveServiceAnchor(definition.anchor) }))];
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
  lodgeEnter: ['rooms', 'properties'], lodgeSell: ['trade'],
  lodgeBuyTool: ['tools'], lodgeBuyGear: ['gear'], lodgeCompleteContract: ['orders'],
  cabinGrantKey: ['keys'], cabinRevokeKey: ['keys'],
  setLodgingAutoRenew: ['rooms','properties'],
  governmentTaxPolicySet: ['government'],
  propertyRequest:['properties','directory'], propertyQuote:['properties','directory'], propertyRentList:['properties'], propertyRentDelist:['properties'], propertyRent:['properties','directory'],
  propertyList: ['properties'], propertyDelist: ['properties'], propertyBuy: ['properties', 'directory'],
  villageJobStart: ['jobs'], villageJobFinish: ['jobs'], villageJobCancel: ['jobs'],
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
    && (message.name !== 'lodgeEnter' || !message.buildingId || message.buildingId === point.placeId)
    && jobActionAllowed(point, message));
}
