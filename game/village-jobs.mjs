import { RECEPTION_BUILDING, VILLAGE_BUILDINGS } from './village-buildings.mjs';
import { SPAWN_CAMPFIRE } from './world.mjs';

export const VILLAGE_JOBS = Object.freeze([
  Object.freeze({ id:'carrier', label:'Carregador', description:'Leve a caixa do quadro da Recepção até a Pousada dos Pinheiros.', rewardBronze:150, minDurationMs:12_000, dailyLimit:3, startPointId:'board', finishPointId:'delivery' }),
  Object.freeze({ id:'firekeeper', label:'Ajudante do fogo', description:'Faça um turno junto à fogueira acesa.', rewardBronze:150, minDurationMs:10_000, dailyLimit:3, startPointId:'hearth', finishPointId:'hearth' }),
]);

const reception = RECEPTION_BUILDING.door;
const inn = VILLAGE_BUILDINGS.find(building => building.id === 'lodging-pine-inn')?.door;
if (!inn) throw new Error('Ponto da Pousada dos Pinheiros não encontrado.');

// Raio de uso de cada ponto (entre 1.2 e 1.4). A 2.0 de distância da porta,
// o quadro e a entrega ainda alcançariam a porta pelo raio antigo de 2.4.
const POINT_RADIUS = 1.3;

export const VILLAGE_JOB_POINTS = Object.freeze([
  Object.freeze({ id:'board', label:'Quadro da Recepção', x:reception.x, y:reception.y + 2, radius:POINT_RADIUS, kind:'board' }),
  Object.freeze({ id:'delivery', label:'Entrega da Pousada dos Pinheiros', x:inn.x, y:inn.y + 2, radius:POINT_RADIUS, kind:'delivery' }),
  Object.freeze({ id:'hearth', label:'Fogueira da vila', x:SPAWN_CAMPFIRE.x - 1.2, y:SPAWN_CAMPFIRE.y, radius:POINT_RADIUS, kind:'hearth' }),
]);

const jobsById = new Map(VILLAGE_JOBS.map(job => [job.id, job]));
const pointsById = new Map(VILLAGE_JOB_POINTS.map(point => [point.id, point]));

export function villageJobSnapshot({ dayKey, completions = [], active = null, lastPayment = null, requiresAccount = false } = {}) {
  const counts = new Map();
  for (const row of completions) if (row.dayKey === dayKey) counts.set(row.jobId, (counts.get(row.jobId) || 0) + 1);
  return {
    dayKey,
    jobs: VILLAGE_JOBS.map(job => ({ ...job, completed:counts.get(job.id) || 0, remaining:Math.max(0, job.dailyLimit - (counts.get(job.id) || 0)) })),
    active:active ? { ...active } : null,
    lastPayment:lastPayment ? { ...lastPayment } : null,
    requiresAccount:Boolean(requiresAccount),
  };
}

export function villageJobById(jobId) { return jobsById.get(jobId) || null; }
export function villageJobPointById(pointId) { return pointsById.get(pointId) || null; }
export function villageJobAtPoint(pointId, position, dimensionId, expectedDimensionId = 'surface') {
  const point = pointsById.get(pointId);
  return Boolean(point && dimensionId === expectedDimensionId && Number.isFinite(position?.x) && Number.isFinite(position?.y)
    && Math.hypot(position.x - point.x, position.y - point.y) <= point.radius);
}

// Conferência de uma conclusão contra o catálogo. PostgreSQL e JSON usam esta
// função, para que limite e recompensa não existam como literais na persistência.
export function villageJobClaimMatchesCatalog(claim, amount) {
  const job = villageJobById(claim?.jobId);
  return Boolean(job && amount === job.rewardBronze && claim.rewardBronze === job.rewardBronze && claim.dailyLimit === job.dailyLimit);
}

export function villageJobWithinDistance(position, origin, maxDistance) {
  return Number.isFinite(position?.x) && Number.isFinite(position?.y) && Number.isFinite(origin?.x) && Number.isFinite(origin?.y)
    && Math.hypot(position.x - origin.x, position.y - origin.y) <= maxDistance;
}
