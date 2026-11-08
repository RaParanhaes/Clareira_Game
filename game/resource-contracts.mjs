import { gameDayKey } from './game-calendar.mjs';
export const RESOURCE_CONTRACTS = Object.freeze([
  Object.freeze({ id:'dry-sticks', title:'Lenha para a cozinha', item:'wood', quantity:20, reward:30 }),
  Object.freeze({ id:'planks', title:'Ripas para reparos', item:'plank', quantity:8, reward:120 }),
  Object.freeze({ id:'charcoal', title:'Carvão para a fornalha', item:'charcoal', quantity:6, reward:52 }),
  Object.freeze({ id:'copper-ingots', title:'Lingotes para a oficina', item:'copperIngot', quantity:2, reward:132 }),
]);

export function resourceContractDayKey(now = Date.now()) {
  return gameDayKey(now);
}

export function normalizeResourceContractState(value, dayKey = resourceContractDayKey()) {
  const completed = value?.dayKey === dayKey && Array.isArray(value.completed)
    ? [...new Set(value.completed.filter(id => RESOURCE_CONTRACTS.some(contract => contract.id === id)))] : [];
  return { dayKey, completed };
}

export function resourceContractBoard(state, now = Date.now()) {
  const normalized = normalizeResourceContractState(state, resourceContractDayKey(now));
  return RESOURCE_CONTRACTS.map(contract => ({ ...contract, completed:normalized.completed.includes(contract.id) }));
}
