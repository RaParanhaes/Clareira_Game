import { GAME_DAY_DURATION_MS } from './day-night.mjs';
import {objectBuildings,subscribeObjectCatalog} from './object-state.mjs';
import { VILLAGE_BUILDINGS } from './village-buildings.mjs';

const byId = new Map(VILLAGE_BUILDINGS.map(building => [building.id, building]));

function offer(buildingId, mode, unitCount, price, durationMs = null) {
  const building = byId.get(buildingId);
  return Object.freeze({
    buildingId,
    buildingName: building.name,
    buildingKind: building.kind,
    mode,
    unitCount,
    price,
    durationMs,
    roomLabel: mode === 'rent' ? 'Quarto' : building.kind === 'hotel' ? 'Apartamento' : 'Cabana',
  });
}

export const LODGING_OFFERS = [
  offer('lodging-rill-guesthouse', 'rent', 8, 6, GAME_DAY_DURATION_MS),
  offer('lodging-pine-inn', 'rent', 12, 12, GAME_DAY_DURATION_MS),
  offer('lodging-ember-hotel', 'rent', 32, 24, GAME_DAY_DURATION_MS),
  offer('lodging-ember-hotel', 'owned', 4, 24_000),
  offer('cabin-cedar-one', 'owned', 1, 3_200),
  offer('cabin-cedar-two', 'owned', 1, 3_200),
  offer('cabin-cedar-three', 'owned', 1, 3_600),
];

export const LODGING_OFFER_BY_KEY = new Map(
  LODGING_OFFERS.map(item => [`${item.buildingId}:${item.mode}`, item]),
);

subscribeObjectCatalog(()=>{
 const offers=objectBuildings().flatMap(b=>(b.offers||[]).map(o=>({...o,durationMs:o.mode==='rent'?GAME_DAY_DURATION_MS:null,buildingId:b.id,buildingName:b.name,buildingKind:b.kind})));
 LODGING_OFFERS.splice(0,LODGING_OFFERS.length,...offers);LODGING_OFFER_BY_KEY.clear();for(const o of offers)LODGING_OFFER_BY_KEY.set(`${o.buildingId}:${o.mode}`,o);
});

export const CURRENCY_SCALE = Object.freeze({ bronze: 1, silver: 100, gold: 10_000 });
export const CURRENCY_KEYS = Object.freeze(['gold', 'silver', 'bronze']);
// Wallet rows live in inventory_items.quantity (PostgreSQL INTEGER). Keep
// currencies normalized while allowing the full representable gold range.
// Older saves can contain unnormalized silver/bronze quantities up to 999.
// Preserve their full value when loading; walletFromValue normalizes transfers.
export const CURRENCY_QUANTITY_LIMITS = Object.freeze({ gold: 2_147_483_647, silver: 999, bronze: 999 });
// Keep walletFromValue normalized (silver/bronze below 100), so the actual
// maximum is the last bronze below the largest representable gold quantity.
export const MAX_WALLET_VALUE = CURRENCY_QUANTITY_LIMITS.gold * CURRENCY_SCALE.gold + CURRENCY_SCALE.gold - 1;
export const LODGING_DAY_MS = GAME_DAY_DURATION_MS;

export const TRADE_PRICES = Object.freeze({
  wood: 1,
  timber: 1,
  stone: 1,
  sturdyBranch: 2,
  berries: 2,
  apples: 3,
  leaves: 1,
  vines: 2,
  plank: 12,
  copperOre: 5,
  ironOre: 8,
  coal: 4,
  charcoal: 7,
  copperIngot: 60,
  ironIngot: 100,
});

export const TOOL_PRICES = Object.freeze({ stoneAxe: 500, stonePickaxe: 700 });

export function currencyValue(wallet = {}) {
  return CURRENCY_KEYS.reduce((total, key) => total + (Number(wallet[key]) || 0) * CURRENCY_SCALE[key], 0);
}

export function walletFromValue(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_WALLET_VALUE) {
    throw new RangeError('O saldo excede a capacidade numérica da carteira.');
  }
  const gold = Math.floor(value / CURRENCY_SCALE.gold);
  const remainder = value - gold * CURRENCY_SCALE.gold;
  const silver = Math.floor(remainder / CURRENCY_SCALE.silver);
  return { gold, silver, bronze: remainder - silver * CURRENCY_SCALE.silver };
}

export function formatCoins(value) {
  const amount = Math.max(0, Math.floor(Number(value) || 0));
  const gold = Math.floor(amount / CURRENCY_SCALE.gold);
  const silver = Math.floor((amount % CURRENCY_SCALE.gold) / CURRENCY_SCALE.silver);
  const bronze = amount % CURRENCY_SCALE.silver;
  const parts = [];
  if (gold) parts.push(`${gold} ${gold === 1 ? 'ouro' : 'ouros'}`);
  if (silver) parts.push(`${silver} ${silver === 1 ? 'prata' : 'pratas'}`);
  if (bronze || !parts.length) parts.push(`${bronze} ${bronze === 1 ? 'bronze' : 'bronzes'}`);
  return parts.join(' e ');
}

export function lodgingRoomKey(claim) {
  return `lodging:${claim.buildingId}:${claim.unitNumber}:${claim.mode}:${claim.profileId}`;
}

export function lodgingLocation(roomKey) {
  if (typeof roomKey !== 'string') return null;
  const match = /^lodging:([a-z0-9-]{1,48}):(\d+):(?:(rent|owned):)?([a-z0-9-]{1,64})$/i.exec(roomKey);
  if (!match) return null;
  return { buildingId: match[1], unitNumber: Number(match[2]), mode: match[3] || null, profileId: match[4] };
}

export function lobbyRoomKey(buildingId = 'arrival') {
  return `lobby:${buildingId}`;
}

export function lodgingStorageKey(claim) { return `${claim.buildingId}:${claim.mode}:${claim.unitNumber}`; }
