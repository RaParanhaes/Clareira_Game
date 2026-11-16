import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
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
import { villageJobClaimMatchesCatalog } from '../game/village-jobs.mjs';

export function createStorageAdapter({
  directory,
  databaseUrl = process.env.DATABASE_URL,
  pool: providedPool,
  accounts: injectedAccounts,
} = {}) {
  if (!databaseUrl && !providedPool) {
    const accounts = injectedAccounts || createAccountStore({ directory });
    const villageLedger = new Map();
    const villageLocks = new Map();
    const villageLedgerPath = path.join(directory, 'village-job-ledger.json');
    let villageLedgerReady = null;
    let villageLedgerWrites = Promise.resolve();
    const ensureVillageLedger = () => {
      villageLedgerReady ??= (async () => {
        try {
          const rows = JSON.parse(await readFile(villageLedgerPath, 'utf8'));
          for (const row of rows) villageLedger.set(`${row.profileId}:${row.runId}`, row);
        } catch (error) { if (error.code !== 'ENOENT') { villageLedgerReady = null; throw error; } }
      })();
      return villageLedgerReady;
    };
    // Fila global: uma gravação do ledger por vez, entre todas as contas; arquivo temporário com nome único.
    const persistVillageLedger = () => {
      const write = async () => {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const temporary = `${villageLedgerPath}.${process.pid}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, JSON.stringify([...villageLedger.values()]), { mode: 0o600 });
          await rename(temporary, villageLedgerPath);
        } catch (error) { await rm(temporary, { force: true }).catch(() => {}); throw error; }
      };
      const next = villageLedgerWrites.catch(() => {}).then(write);
      villageLedgerWrites = next;
      return next;
    };
    const withVillageLock = async (accountId, task) => {
      const previous = villageLocks.get(accountId) || Promise.resolve();
      let release;
      const turn = new Promise(resolve => { release = resolve; });
      const chained = previous.then(() => turn);
      villageLocks.set(accountId, chained);
      await previous;
      try { return await task(); }
      finally { release(); if (villageLocks.get(accountId) === chained) villageLocks.delete(accountId); }
    };
    // Falha ao desfazer o crédito: a linha fica marcada no ledger e o erro é registrado, nunca engolido.
    const flagCompensationFailure = async (key, entry, debitError) => {
      const reason = String(debitError?.message || debitError).slice(0, 200);
      console.error(`village-jobs: crédito ${key} sem compensação: ${reason}`);
      villageLedger.set(key, { ...entry, compensationFailed: true, compensationError: reason });
      await persistVillageLedger().catch(persistError => console.error(`village-jobs: ledger não gravado para ${key}: ${persistError?.message || persistError}`));
    };
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
      // JSON usa dois arquivos: grava o inventário com o item primeiro e debita depois;
      // se o débito falhar, regrava o inventário anterior. Uma queda no meio nunca cobra sem entregar.
      debitWalletAndSaveProgress: async (accountId, amount, inventoryAfter, inventoryBefore) => {
        await saveAccountProgress(directory, accountId, inventoryAfter);
        try { return await accounts.debitWallet(accountId, amount); }
        catch (error) {
          if (inventoryBefore) await saveAccountProgress(directory, accountId, inventoryBefore).catch(() => {});
          throw error;
        }
      },
      // JSON: credita primeiro e grava depois (uma queda no meio favorece o jogador; aceito, JSON só serve a testes).
      creditWalletAndSaveProgress: async (accountId, amount, inventory, claim = null) => {
        if (claim) {
          if (!villageJobClaimMatchesCatalog(claim, amount)
              || typeof claim.runId !== 'string' || !/^[0-9a-f-]{36}$/i.test(claim.runId)
              || !/^\d{4}-\d{2}-\d{2}$/.test(claim.dayKey)) throw Object.assign(new Error('Conclusão de ofício inválida.'), { status:400 });
          await ensureVillageLedger();
          return withVillageLock(accountId, async () => {
            const key = `${accountId}:${claim.runId}`;
            const replay = villageLedger.get(key);
            if (replay) return { wallet:await accounts.getWallet(accountId), replay:true, jobId:replay.jobId, amount:replay.amount, paidAt:replay.paidAt };
            const count = [...villageLedger.values()].filter(row => row.profileId === accountId && row.jobId === claim.jobId && row.dayKey === claim.dayKey).length;
            if (count >= claim.dailyLimit) throw Object.assign(new Error('A cota deste ofício já foi completada hoje.'), { status:409, code:'village_quota' });
            const wallet = await accounts.creditWallet(accountId, amount);
            const entry = { profileId:accountId, jobId:claim.jobId, dayKey:claim.dayKey, amount, paidAt:Date.now(), runId:claim.runId };
            try { await saveAccountProgress(directory, accountId, inventory); }
            catch (error) { await accounts.debitWallet(accountId, amount).catch(debitError => flagCompensationFailure(key, entry, debitError)); throw error; }
            villageLedger.set(key, entry);
            try { await persistVillageLedger(); } catch (error) {
              villageLedger.delete(key);
              await accounts.debitWallet(accountId, amount).catch(debitError => flagCompensationFailure(key, entry, debitError));
              throw error;
            }
            return { wallet, replay:false, jobId:claim.jobId, amount, paidAt:entry.paidAt };
          });
        }
        const wallet = await accounts.creditWallet(accountId, amount);
        await saveAccountProgress(directory, accountId, inventory);
        return wallet;
      },
      getVillageJobReplay: async (profileId, runId) => {
        if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId) || typeof runId !== 'string' || !/^[0-9a-f-]{36}$/i.test(runId)) return null;
        await ensureVillageLedger();
        return withVillageLock(profileId, async () => {
          const row = villageLedger.get(`${profileId}:${runId}`);
          return row ? { wallet:await accounts.getWallet(profileId), replay:true, jobId:row.jobId, amount:row.amount, paidAt:row.paidAt } : null;
        });
      },
      getVillageJobCompletions: async (profileId, dayKey) => { await ensureVillageLedger(); return [...villageLedger.values()].filter(row => row.profileId === profileId && row.dayKey === dayKey).map(({ profileId:_profileId, ...row }) => row); },
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
      const { rows } = await pool.query("SELECT max(version) AS version, to_regclass('village_job_completions') AS jobs_table FROM schema_migrations");
      if (Number(rows[0]?.version) < 39 || !rows[0]?.jobs_table) throw new Error('Aplique todas as migrações PostgreSQL antes de iniciar o jogo.');
    },
    close: async () => {
      if (ownsPool) await pool.end();
    },
    recurringLeasesAvailable: true,
    backend: 'postgres',
  };
}
