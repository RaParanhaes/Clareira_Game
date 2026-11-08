import {subscribeObjectCatalog} from './object-state.mjs';
import { VILLAGE_BUILDINGS } from './village-buildings.mjs';

export const CABIN_IDS = VILLAGE_BUILDINGS.filter(building => building.kind === 'cabin').map(building => building.id);
subscribeObjectCatalog(()=>CABIN_IDS.splice(0,CABIN_IDS.length,...VILLAGE_BUILDINGS.filter(b=>b.kind==='cabin').map(b=>b.id)));
export const MAX_CABIN_KEYS = 20;
export const isCabin = buildingId => VILLAGE_BUILDINGS.some(building=>building.id===buildingId&&building.kind==='cabin');
export const cabinClaimForKey = key => ({ profileId: key.ownerProfileId, buildingId: key.buildingId,
  unitNumber: key.unitNumber, mode: 'owned', expiresAt: null });
