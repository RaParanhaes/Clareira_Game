import { createHousingMarketStore } from './housing-market.mjs';
import { createPropertyMarketStatisticsStore } from './property-market-statistics.mjs';
import {createPostgresObjectStore} from './object-store.mjs';
import { createEconomyStore } from './economy-store.mjs';
import {createJsonObjectStore} from './json-object-store.mjs';
import { createJsonInteractionStore } from './json-interaction-store.mjs';
import { createAccountStore, saveAccountProgress } from '../scripts/account-store.mjs';
import { loadAppearance, saveAppearance } from '../scripts/appearance-store.mjs';
import { loadAccountRoom, saveAccountRoom } from '../scripts/room-store.mjs';
import { createDatabasePool } from './pool.mjs';
import { createPostgresStore } from './store.mjs';
import { createStaffManagementStore } from './staff-management.mjs';
import { createRoomChestStore } from './room-chest-store.mjs';
import { createJsonCampfireStore, createJsonWorldStore } from '../scripts/world-store.mjs';
import { createJsonPlayerLocationStore } from '../scripts/player-location-store.mjs';
import { createJsonDimensionStore } from '../scripts/dimension-store.mjs';

export function createStorageAdapter({
  directory,
  databaseUrl = process.env.DATABASE_URL,
  pool: providedPool,
} = {}) {
  if (!databaseUrl && !providedPool) {
    const accounts = createAccountStore({ directory });
    const interactions = createJsonInteractionStore(directory);
    return {
      accounts,
      ...interactions,
      ...createJsonObjectStore(directory),
      ...createJsonWorldStore(directory),
      ...createJsonCampfireStore(directory),
      ...createJsonDimensionStore(directory),
      ...createJsonPlayerLocationStore(directory),
      saveProgress: (accountId, inventory) => saveAccountProgress(directory, accountId, inventory),
      saveProgressAndRecordInteraction: async (accountId, inventory, event) => {
        await saveAccountProgress(directory, accountId, inventory);
        return interactions.recordInteraction(event);
      },
      loadRoom: accountId => loadAccountRoom(directory, accountId),
      saveRoom: (accountId, furniture) => saveAccountRoom(directory, accountId, furniture),
      loadAppearance: accountId => loadAppearance(directory, accountId),
      saveAppearance: (accountId, appearance) => saveAppearance(directory, accountId, appearance),
      listLodgingClaims: (...args) => accounts.listLodgingClaims(...args),
      findLodgingClaim: (...args) => accounts.findLodgingClaim(...args),
      claimLodging: (...args) => accounts.claimLodging(...args),
      getCabinKeys: (...args) => accounts.getCabinKeys(...args),
      getIssuedCabinKeys: (...args) => accounts.getIssuedCabinKeys(...args),
      setCabinKey: (...args) => accounts.setCabinKey(...args),
      getPropertyListings: async () => [],
      listOwnedProperty: async () => { throw Object.assign(new Error('O mercado de propriedades requer o banco PostgreSQL.'), { status:409 }); },
      removePropertyListing: async () => { throw Object.assign(new Error('O mercado de propriedades requer o banco PostgreSQL.'), { status:409 }); },
      buyListedProperty: async () => { throw Object.assign(new Error('O mercado de propriedades requer o banco PostgreSQL.'), { status:409 }); },
      getLodgingLease: async () => null,
      setLodgingAutoRenew: async () => { throw Object.assign(new Error('A renovação automática requer o banco PostgreSQL.'), { status:409 }); },
      processDueLodgingLeases: async () => [],
      creditWallet: (...args) => accounts.creditWallet(...args),
      debitWallet: (...args) => accounts.debitWallet(...args),
      getResourceContractState: (...args) => accounts.getResourceContractState(...args),
      completeResourceContract: (...args) => accounts.completeResourceContract(...args),
      async ready() {},
      async close() {},
      recurringLeasesAvailable: false,
      backend: 'json',
    };
  }

  const pool = providedPool || createDatabasePool({ connectionString: databaseUrl });
  const ownsPool = !providedPool;
  const postgres = createPostgresStore(pool);
  const economy = createEconomyStore(pool);
  return {
    ...postgres,
    ...createPostgresObjectStore(pool),
    ...economy,
    ...createHousingMarketStore(pool),
    ...createPropertyMarketStatisticsStore(pool),
    staffManagement: createStaffManagementStore(pool),
    roomChests: createRoomChestStore(pool),
    ready: async () => {
      const { rows } = await pool.query('SELECT max(version) AS version FROM schema_migrations');
      if (Number(rows[0]?.version) < 36) throw new Error('Aplique todas as migrações PostgreSQL antes de iniciar o jogo.');
    },
    close: async () => {
      if (ownsPool) await pool.end();
    },
    recurringLeasesAvailable: true,
    backend: 'postgres',
  };
}
