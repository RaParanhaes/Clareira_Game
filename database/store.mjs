import { GAME_DAY_DURATION_MS } from '../game/day-night.mjs';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  EMPTY_INVENTORY, hashPassword, normalizeUsername, tokenDigest,
  validPassword, validateInventory, validateUsername, verifyPassword,
} from '../scripts/account-store.mjs';
import { validateFurniture } from '../scripts/room-store.mjs';
import { furnitureByKind } from '../game/content-catalog.mjs';
import { isCabin, MAX_CABIN_KEYS } from '../game/cabin-access.mjs';
import { normalizeAppearance } from '../game/appearance.mjs';
import { WORLD_DIMENSION_ID, WORLD_DOCUMENT_ID, emptyWorldDefinition, normalizeWorldDefinition } from '../game/world-edits.mjs';
import { normalizePlayerLocation, normalizePlayerDimensionPosition } from '../scripts/player-location-store.mjs';
import { CURRENCY_KEYS, MAX_WALLET_VALUE, currencyValue, formatCoins, walletFromValue } from '../game/lodging-catalog.mjs';
import { inventoryFromRows, inventoryRows } from '../game/inventory.mjs';
import { RESOURCE_CONTRACTS, normalizeResourceContractState, resourceContractDayKey } from '../game/resource-contracts.mjs';
import { normalizeInteractionEvent } from './interaction-events.mjs';
import { accumulateGovernmentTax } from './tax-remainders.mjs';

import { DEFAULT_DIMENSIONS, normalizeDimensions } from '../game/dimensions.mjs';

const SCRYPT_N = 1 << 17;
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const GUEST_SESSION_MS = 24 * 60 * 60 * 1000;
const INVENTORY_KEYS = Object.keys(EMPTY_INVENTORY);

async function storeWallet(executor, profileId, wallet) {
  for (const itemId of CURRENCY_KEYS) {
    await executor.query(
      'INSERT INTO inventory_items (profile_id, item_id, quantity) VALUES ($1, $2, $3) ' +
      'ON CONFLICT (profile_id, item_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()',
      [profileId, itemId, wallet[itemId]],
    );
  }
}

async function withTransaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function writeProgress(client, accountId, values) {
  await client.query('DELETE FROM inventory_items WHERE profile_id = $1 AND NOT (item_id = ANY($2::text[]))', [accountId, CURRENCY_KEYS]);
  for (const { itemId, quantity } of inventoryRows(values)) {
    await client.query(
      'INSERT INTO inventory_items (profile_id, item_id, quantity) VALUES ($1, $2, $3) ' +
      'ON CONFLICT (profile_id, item_id) ' +
      'DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()',
      [accountId, itemId, quantity],
    );
  }
}

async function insertInteractionEvent(executor, event) {
  await executor.query(
    'INSERT INTO interaction_events (event_id, actor_profile_id, action, dimension_id, location, place_id, instance_id, ' +
    'position, object_id, object_kind, object_properties, transfer, details, happened_at) ' +
    'VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14)',
    [event.eventId, event.actorProfileId, event.action, event.dimensionId, event.location, event.placeId,
      event.instanceId, JSON.stringify(event.position), event.objectId, event.objectKind,
      JSON.stringify(event.objectProperties), JSON.stringify(event.transfer), JSON.stringify(event.details), event.happenedAt],
  );
  return event;
}

function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

async function persistWorldEdits(client, definition, documentId, dimensionId) {
  const result = await client.query(
    'SELECT chunk_x, chunk_y, entity_id, operation, payload, edit_index FROM world_chunk_changes WHERE world_id=$1 AND dimension_id=$2',
    [documentId, dimensionId],
  );
  const existing = new Map(result.rows.map(row => [
    Math.floor(Number(row.chunk_x)) + ':' + Math.floor(Number(row.chunk_y)) + ':' + row.entity_id,
    row,
  ]));
  const retained = new Set();
  for (const [index, edit] of definition.edits.entries()) {
    const chunkX = Math.floor(edit.x / 16);
    const chunkY = Math.floor(edit.y / 16);
    const key = chunkX + ':' + chunkY + ':' + edit.id;
    const previous = existing.get(key);
    retained.add(key);
    const priorPayload = typeof previous?.payload === 'string' ? JSON.parse(previous.payload) : previous?.payload;
    if (previous && previous.operation === 'upsert'
        && Number(previous.edit_index) === index && stableJson(priorPayload) === stableJson(edit)) continue;
    if (previous) {
      await client.query(
        "UPDATE world_chunk_changes SET operation='upsert',payload=$6::jsonb,edit_index=$7,updated_at=now() " +
        'WHERE world_id=$1 AND dimension_id=$2 AND chunk_x=$3 AND chunk_y=$4 AND entity_id=$5',
        [documentId, dimensionId, chunkX, chunkY, edit.id, JSON.stringify(edit), index],
      );
    } else {
      await client.query(
        "INSERT INTO world_chunk_changes (world_id, dimension_id, chunk_x, chunk_y, entity_id, operation, payload, edit_index) " +
        "VALUES ($1, $2, $3, $4, $5, 'upsert', $6::jsonb, $7)",
        [documentId, dimensionId, chunkX, chunkY, edit.id, JSON.stringify(edit), index],
      );
    }
  }
  for (const [key, row] of existing) {
    if (retained.has(key)) continue;
    await client.query(
      'DELETE FROM world_chunk_changes WHERE world_id=$1 AND dimension_id=$2 AND chunk_x=$3 AND chunk_y=$4 AND entity_id=$5',
      [documentId, dimensionId, row.chunk_x, row.chunk_y, row.entity_id],
    );
  }
}

const SESSION_QUERY =
  'SELECT s.id AS session_id, s.token_hash, s.created_at, s.expires_at, ' +
  'p.id AS profile_id, p.account_id, COALESCE(a.username, p.display_name) AS display_name, p.is_guest, a.username, COALESCE(a.role, \'player\') AS role ' +
  'FROM sessions s JOIN profiles p ON p.id = s.profile_id ' +
  'LEFT JOIN accounts a ON a.id = p.account_id ' +
  'WHERE s.token_hash = $1 AND s.expires_at > now()';

async function sessionForToken(executor, token) {
  if (typeof token !== 'string' || token.length < 40 || token.length > 100) return null;
  const result = await executor.query(SESSION_QUERY, [Buffer.from(tokenDigest(token), 'hex')]);
  return result.rows[0] || null;
}

async function loadInventory(pool, accountId) {
  if (!accountId) return { ...EMPTY_INVENTORY };
  const result = await pool.query(
    'SELECT item_id, quantity FROM inventory_items WHERE profile_id = $1',
    [accountId],
  );
  const saved = {
    ...EMPTY_INVENTORY,
    attributes: { ...EMPTY_INVENTORY.attributes },
    learnedAbilities: [...EMPTY_INVENTORY.learnedAbilities],
  };
  for (const row of result.rows) {
    if (INVENTORY_KEYS.includes(row.item_id) || row.item_id === 'firewood') saved[row.item_id] = Number(row.quantity);
  }
  return validateInventory(inventoryFromRows(
    result.rows.map(row => ({ itemId: row.item_id, quantity: Number(row.quantity) })), saved,
  ));
}

async function profileFor(pool, row) {
  return {
    session: {
      id: row.session_id,
      tokenHash: Buffer.from(row.token_hash).toString('hex'),
      accountId: row.account_id,
      ...(row.is_guest ? { displayName: row.display_name } : {}),
      guest: row.is_guest,
      createdAt: new Date(row.created_at).getTime(),
      expiresAt: new Date(row.expires_at).getTime(),
    },
    profile: {
      id: row.profile_id,
      username: row.username || null,
      ...(row.is_guest ? { displayName: row.display_name } : {}),
      guest: row.is_guest,
      role: row.role === 'admin' ? 'admin' : 'player',
      inventory: await loadInventory(pool, row.account_id),
    },
  };
}

async function createSession(client, { accountId = null, profileId, displayName, guest }) {
  const token = randomBytes(32).toString('base64url');
  const createdAt = Date.now();
  const expiresAt = createdAt + (guest ? GUEST_SESSION_MS : SESSION_MS);
  const id = randomUUID();
  await client.query(
    'INSERT INTO sessions (id, profile_id, token_hash, created_at, expires_at) VALUES ($1, $2, $3, $4, $5)',
    [id, profileId, Buffer.from(tokenDigest(token), 'hex'), new Date(createdAt), new Date(expiresAt)],
  );
  return { token, id, accountId, ...(guest ? { displayName } : {}), guest, createdAt, expiresAt };
}

async function pruneExpiredSessions(client) {
  await client.query(
    'DELETE FROM profiles WHERE is_guest = true AND id IN ' +
    '(SELECT profile_id FROM sessions WHERE expires_at <= now())',
  );
  await client.query('DELETE FROM sessions WHERE expires_at <= now()');
}

export function createPostgresStore(pool) {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new TypeError('Um pool PostgreSQL é necessário.');
  }

  const accounts = {
    async register({ username, password }) {
      const normalizedUsername = validateUsername(username);
      if (!normalizedUsername) throw Object.assign(new Error('Use um nome de usuário de 3 a 20 letras, números ou _, sem palavrões ou palavras obscenas.'), { status: 400 });
      if (!validPassword(password)) throw Object.assign(new Error('A senha precisa ter de 10 a 128 caracteres.'), { status: 400 });
      const accountId = randomUUID();
      const salt = randomBytes(16);
      const passwordHash = await hashPassword(password, salt);
      const createdAt = new Date();
      try {
        const session = await withTransaction(pool, async client => {
          await client.query(
            'INSERT INTO accounts (id, username, password_salt, password_hash, scrypt_n, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
            [accountId, normalizedUsername, salt, passwordHash, SCRYPT_N, createdAt],
          );
          await client.query(
            'INSERT INTO profiles (id, account_id, display_name, is_guest, created_at) VALUES ($1, $1, $2, false, $3)',
            [accountId, normalizedUsername, createdAt],
          );
          await pruneExpiredSessions(client);
          return createSession(client, {
            accountId, profileId: accountId, guest: false,
          });
        });
        return {
          token: session.token,
          maxAge: SESSION_MS,
          profile: {
            id: accountId, username: normalizedUsername,
            guest: false, role: 'player', inventory: { ...EMPTY_INVENTORY },
          },
        };
      } catch (error) {
        if (error.code === '23505') throw Object.assign(new Error('Esse nome de usuário já existe.'), { status: 409 });
        throw error;
      }
    },

    async login({ username, password }) {
      const normalizedUsername = normalizeUsername(username);
      if (typeof password !== 'string' || password.length > 128) throw Object.assign(new Error('Usuário ou senha incorretos.'), { status: 401 });
      const found = normalizedUsername
        ? await pool.query(
          "SELECT a.id, a.username, encode(a.password_salt, 'hex') AS salt, " +
          "encode(a.password_hash, 'hex') AS password_hash, a.scrypt_n, COALESCE(a.role, 'player') AS role " +
          'FROM accounts a JOIN profiles p ON p.account_id = a.id WHERE a.username = $1',
          [normalizedUsername],
        )
        : { rows: [] };
      const row = found.rows[0] || null;
      const account = row && { salt: row.salt, passwordHash: row.password_hash, scryptN: row.scrypt_n };
      if (!await verifyPassword(password, account)) {
        throw Object.assign(new Error('Usuário ou senha incorretos.'), { status: 401 });
      }
      const session = await withTransaction(pool, async client => {
        await pruneExpiredSessions(client);
        return createSession(client, {
          accountId: row.id, profileId: row.id, guest: false,
        });
      });
      return {
        token: session.token,
        maxAge: SESSION_MS,
        profile: {
          id: row.id, username: row.username,
          guest: false, role: row.role === 'admin' ? 'admin' : 'player', inventory: await loadInventory(pool, row.id),
        },
      };
    },

    async guest() {
      const cleanDisplayName = `Visitante ${randomUUID().slice(0, 4)}`;
      const profileId = randomUUID();
      const createdAt = new Date();
      const session = await withTransaction(pool, async client => {
        await client.query(
          'INSERT INTO profiles (id, account_id, display_name, is_guest, created_at) VALUES ($1, NULL, $2, true, $3)',
          [profileId, cleanDisplayName, createdAt],
        );
        await pruneExpiredSessions(client);
        return createSession(client, {
          profileId, displayName: cleanDisplayName, guest: true,
        });
      });
      return {
        token: session.token,
        maxAge: GUEST_SESSION_MS,
        profile: {
          id: profileId, username: null, displayName: cleanDisplayName,
          guest: true, role: 'player', inventory: { ...EMPTY_INVENTORY },
        },
      };
    },

    async updateUsername(token, username) {
      const normalizedUsername = validateUsername(username);
      if (!normalizedUsername) throw Object.assign(new Error('Use um nome de usuário de 3 a 20 letras, números ou _, sem palavrões ou palavras obscenas.'), { status: 400 });
      try {
        const updated = await withTransaction(pool, async client => {
          const row = await sessionForToken(client, token);
          if (!row) throw Object.assign(new Error('Sua sessão expirou. Entre de novo.'), { status: 401 });
          if (!row.account_id) throw Object.assign(new Error('Visitantes não podem alterar o nome de usuário.'), { status: 403 });
          await client.query('UPDATE accounts SET username = $2 WHERE id = $1', [row.account_id, normalizedUsername]);
          await client.query('UPDATE profiles SET display_name = $2 WHERE id = $1', [row.profile_id, normalizedUsername]);
          return { ...row, username: normalizedUsername };
        });
        return {
          id: updated.profile_id,
          username: updated.username,
          guest: updated.is_guest,
          role: updated.role === 'admin' ? 'admin' : 'player',
          inventory: await loadInventory(pool, updated.account_id),
        };
      } catch (error) {
        if (error.code === '23505') throw Object.assign(new Error('Esse nome de usuário já existe.'), { status: 409 });
        throw error;
      }
    },

    async logout(token) {
      if (typeof token !== 'string') return;
      await withTransaction(pool, async client => {
        const row = await sessionForToken(client, token);
        if (!row) return;
        if (row.is_guest) await client.query('DELETE FROM profiles WHERE id = $1', [row.profile_id]);
        else await client.query('DELETE FROM sessions WHERE id = $1', [row.session_id]);
      });
    },

    async getSession(token) {
      const row = await sessionForToken(pool, token);
      return row ? profileFor(pool, row) : null;
    },

    async setRole(username, role) {
      const normalizedUsername = normalizeUsername(username);
      if (!normalizedUsername) throw Object.assign(new Error('Usuário inválido.'), { status: 400 });
      if (role !== 'admin' && role !== 'player') throw Object.assign(new Error('Perfil de conta inválido.'), { status: 400 });
      const result = await pool.query('UPDATE accounts SET role = $2 WHERE username = $1 RETURNING username, role', [normalizedUsername, role]);
      if (!result.rowCount) throw Object.assign(new Error('Conta não encontrada.'), { status: 404 });
      return { username: result.rows[0].username, role: result.rows[0].role };
    },
  };

  return {
    accounts,
    async loadDimensions() {
      const legacy = await pool.query("SELECT to_regclass('public.dimension_catalog') AS table_name");
      if (legacy.rows[0]?.table_name) {
        const result = await pool.query('SELECT revision, dimensions FROM dimension_catalog WHERE id=true');
        if (result.rowCount) return { revision: Number(result.rows[0].revision), dimensions: normalizeDimensions(result.rows[0].dimensions) };
      }
      const result = await pool.query(`
        SELECT catalog.revision,
          COALESCE(jsonb_agg(jsonb_build_object(
            'id', dimension.dimension_id,
            'universeId', dimension.universe_id,
            'name', dimension.name,
            'theme', dimension.theme,
            'spawn', jsonb_build_object('x', dimension.spawn_x, 'y', dimension.spawn_y),
            'campfire', CASE WHEN dimension.campfire_x IS NOT NULL AND dimension.campfire_y IS NOT NULL
              THEN jsonb_build_object('x', dimension.campfire_x, 'y', dimension.campfire_y) END,
            'guide', CASE WHEN dimension.guide_x IS NOT NULL AND dimension.guide_y IS NOT NULL
              THEN jsonb_build_object('x', dimension.guide_x, 'y', dimension.guide_y) END,
            'instanceType', dimension.instance_type,
            'ownerProfileId', dimension.owner_profile_id,
            'builtIn', dimension.built_in
          ) ORDER BY dimension.sort_order, dimension.dimension_id)
          FILTER (WHERE dimension.dimension_id IS NOT NULL), '[]'::jsonb) AS dimensions
        FROM dimension_catalog_state AS catalog
        LEFT JOIN dimensions AS dimension ON dimension.universe_id = 'clareira'
        WHERE catalog.id = true
        GROUP BY catalog.revision
      `);
      if (!result.rowCount) return { revision: 0, dimensions: normalizeDimensions(DEFAULT_DIMENSIONS) };
      const row = result.rows[0];
      return { revision: Number(row.revision), dimensions: normalizeDimensions(row.dimensions?.length ? row.dimensions : DEFAULT_DIMENSIONS) };
    },
    async saveDimensions(value, expectedRevision) {
      const dimensions = normalizeDimensions(value);
      return withTransaction(pool, async client => {
        await client.query('INSERT INTO dimension_catalog(id,revision,dimensions) VALUES(true,0,$1::jsonb) ON CONFLICT DO NOTHING', [JSON.stringify(DEFAULT_DIMENSIONS)]);
        const result = await client.query('UPDATE dimension_catalog SET revision=revision+1,dimensions=$1::jsonb WHERE id=true AND revision=$2 RETURNING revision', [JSON.stringify(dimensions),expectedRevision]);
        if (!result.rowCount) throw Object.assign(new Error('As dimensões foram alteradas em outra sessão. Atualize e tente novamente.'), { status: 409 });
        return { revision: Number(result.rows[0].revision), dimensions };
      });
    },
    async loadCampfires(dimensionId = 'surface') {
      const result = await pool.query('SELECT fires FROM dimension_campfires WHERE dimension_id=$1', [dimensionId]);
      return result.rowCount ? result.rows[0].fires : null;
    },
    async saveCampfires(dimensionId = 'surface', fires = []) {
      if (!Array.isArray(fires)) throw new TypeError('Lista de fogueiras inválida.');
      const safe = fires.filter(fire => typeof fire?.id === 'string' && Number.isFinite(fire.x) && Number.isFinite(fire.y) && Number.isFinite(fire.litAt));
      await pool.query('INSERT INTO dimension_campfires(dimension_id,fires) VALUES($1,$2::jsonb) ON CONFLICT(dimension_id) DO UPDATE SET fires=EXCLUDED.fires,updated_at=now()', [dimensionId,JSON.stringify(safe)]);
    },
    async deleteCampfires(dimensionId) {
      if (dimensionId === 'surface') throw new Error('A dimensão inicial não pode ser excluída.');
      await pool.query('DELETE FROM dimension_campfires WHERE dimension_id=$1', [dimensionId]);
    },
    async loadWorld(dimensionId = WORLD_DIMENSION_ID) {
      const documentId = dimensionId === WORLD_DIMENSION_ID ? WORLD_DOCUMENT_ID : `${WORLD_DOCUMENT_ID}-${dimensionId}`;
      const world = await pool.query('SELECT revision, seed, generation_version, theme FROM worlds WHERE id = $1', [documentId]);
      if (!world.rowCount) return emptyWorldDefinition(dimensionId);
      const changes = await pool.query(
        "SELECT payload FROM world_chunk_changes WHERE world_id = $1 AND dimension_id = $2 " +
        "AND operation = 'upsert' ORDER BY edit_index, updated_at, entity_id",
        [documentId, dimensionId],
      );
      return normalizeWorldDefinition({
        version: 1,
        dimensionId, theme: world.rows[0].theme,
        revision: Number(world.rows[0].revision),
        seed: Number(world.rows[0].seed),
        generationVersion: Number(world.rows[0].generation_version),
        edits: changes.rows.map(row => typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload),
      });
    },

    async saveWorld(value, expectedRevision, dimensionId = WORLD_DIMENSION_ID) {
      const definition = normalizeWorldDefinition(value);
      const documentId = dimensionId === WORLD_DIMENSION_ID ? WORLD_DOCUMENT_ID : `${WORLD_DOCUMENT_ID}-${dimensionId}`;
      return withTransaction(pool, async client => {
        await client.query(
          'INSERT INTO worlds (id, seed, generation_version, revision) VALUES ($1, $2, $3, 0) ON CONFLICT (id) DO NOTHING',
          [documentId, definition.seed, definition.generationVersion],
        );
        const current = await client.query('SELECT revision FROM worlds WHERE id = $1 FOR UPDATE', [documentId]);
        if (Number(current.rows[0].revision) !== expectedRevision) {
          throw Object.assign(new Error('O mapa foi alterado por outra sessão. Atualize e tente de novo.'), { status: 409 });
        }
        if (definition.revision !== expectedRevision + 1) throw new Error('Revisão do mapa inválida.');
        await persistWorldEdits(client, definition, documentId, dimensionId);
        await client.query('UPDATE worlds SET revision=$2,seed=$3,generation_version=$4,theme=$5 WHERE id=$1', [documentId,definition.revision,definition.seed,definition.generationVersion,definition.theme]);
        return definition;
      });
    },

    async saveWorldAndProgress(value, expectedRevision, dimensionId = WORLD_DIMENSION_ID, accountId = null, inventory = null) {
      const definition = normalizeWorldDefinition(value);
      const documentId = dimensionId === WORLD_DIMENSION_ID ? WORLD_DOCUMENT_ID : `${WORLD_DOCUMENT_ID}-${dimensionId}`;
      const validAccountId = typeof accountId === 'string' && /^[0-9a-f-]{36}$/i.test(accountId);
      const values = validAccountId ? validateInventory(inventory) : null;
      return withTransaction(pool, async client => {
        await client.query(
          'INSERT INTO worlds (id, seed, generation_version, revision) VALUES ($1, $2, $3, 0) ON CONFLICT (id) DO NOTHING',
          [documentId, definition.seed, definition.generationVersion],
        );
        const current = await client.query('SELECT revision FROM worlds WHERE id = $1 FOR UPDATE', [documentId]);
        if (Number(current.rows[0].revision) !== expectedRevision) {
          throw Object.assign(new Error('O mapa foi alterado em outra sessão. Atualize e tente de novo.'), { status: 409 });
        }
        if (definition.revision !== expectedRevision + 1) throw new Error('Revisão do mapa inválida.');
        await persistWorldEdits(client, definition, documentId, dimensionId);
        await client.query('UPDATE worlds SET revision=$2,seed=$3,generation_version=$4,theme=$5 WHERE id=$1', [documentId,definition.revision,definition.seed,definition.generationVersion,definition.theme]);
        if (validAccountId) await writeProgress(client, accountId, values);
        return definition;
      });
    },

    async saveWorldAndProgressAndRecordInteraction(value, expectedRevision, dimensionId = WORLD_DIMENSION_ID, accountId = null, inventory = null, interactionValue) {
      const definition = normalizeWorldDefinition(value);
      const documentId = dimensionId === WORLD_DIMENSION_ID ? WORLD_DOCUMENT_ID : `${WORLD_DOCUMENT_ID}-${dimensionId}`;
      const event = normalizeInteractionEvent(interactionValue);
      const validAccountId = typeof accountId === 'string' && /^[0-9a-f-]{36}$/i.test(accountId);
      const values = validAccountId ? validateInventory(inventory) : null;
      if (validAccountId && !event.actorProfileId) event.actorProfileId = accountId;
      return withTransaction(pool, async client => {
        await client.query(
          'INSERT INTO worlds (id, seed, generation_version, revision) VALUES ($1, $2, $3, 0) ON CONFLICT (id) DO NOTHING',
          [documentId, definition.seed, definition.generationVersion],
        );
        const current = await client.query('SELECT revision FROM worlds WHERE id = $1 FOR UPDATE', [documentId]);
        if (Number(current.rows[0].revision) !== expectedRevision) {
          throw Object.assign(new Error('O mapa foi alterado em outra sessão. Atualize e tente de novo.'), { status: 409 });
        }
        if (definition.revision !== expectedRevision + 1) throw new Error('Revisão do mapa inválida.');
        await persistWorldEdits(client, definition, documentId, dimensionId);
        await client.query('UPDATE worlds SET revision=$2,seed=$3,generation_version=$4,theme=$5 WHERE id=$1', [documentId,definition.revision,definition.seed,definition.generationVersion,definition.theme]);
        if (validAccountId) await writeProgress(client, accountId, values);
        await insertInteractionEvent(client, event);
        return definition;
      });
    },

    async deleteWorld(dimensionId) {
      if (dimensionId === WORLD_DIMENSION_ID) throw new Error('A dimensão inicial não pode ser excluída.');
      const documentId = `${WORLD_DOCUMENT_ID}-${dimensionId}`;
      await pool.query('DELETE FROM worlds WHERE id = $1', [documentId]);
    },

    async saveProgress(accountId, inventory) {
      if (typeof accountId !== 'string' || !/^[0-9a-f-]{36}$/i.test(accountId)) return;
      const values = validateInventory(inventory);
      await withTransaction(pool, client => writeProgress(client, accountId, values));
    },

    async saveProgressAndDiscoverDimension(accountId, inventory, dimensionId, discoverySource = 'knowledge') {
      if (typeof accountId !== 'string' || !/^[0-9a-f-]{36}$/i.test(accountId)) return false;
      if (typeof dimensionId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,47}$/u.test(dimensionId)
          || !['portal', 'knowledge'].includes(discoverySource)) throw new TypeError('Descoberta dimensional inválida.');
      const values = validateInventory(inventory);
      return withTransaction(pool, async client => {
        await writeProgress(client, accountId, values);
        await client.query(
          'INSERT INTO player_dimension_discoveries(profile_id,dimension_id,discovery_source) VALUES($1,$2,$3) ON CONFLICT(profile_id,dimension_id) DO NOTHING',
          [accountId, dimensionId, discoverySource],
        );
        return true;
      });
    },

    async saveProgressAndRecordInteraction(accountId, inventory, value) {
      if (typeof accountId !== 'string' || !/^[0-9a-f-]{36}$/i.test(accountId)) return;
      const values = validateInventory(inventory);
      const event = normalizeInteractionEvent(value);
      if (!event.actorProfileId) event.actorProfileId = accountId;
      await withTransaction(pool, async client => {
        await writeProgress(client, accountId, values);
        await insertInteractionEvent(client, event);
      });
      return event;
    },

    async recordInteraction(value) {
      const event = normalizeInteractionEvent(value);
      await insertInteractionEvent(pool, event);
      return event;
    },

    async listInteractionEvents({ actorProfileId, limit = 100 } = {}) {
      const profileId = typeof actorProfileId === 'string' && /^[0-9a-f-]{36}$/i.test(actorProfileId)
        ? actorProfileId : null;
      const result = await pool.query(
        'SELECT event_id AS "eventId", actor_profile_id AS "actorProfileId", action, dimension_id AS "dimensionId", ' +
        'location, place_id AS "placeId", instance_id AS "instanceId", position, object_id AS "objectId", ' +
        'object_kind AS "objectKind", object_properties AS "objectProperties", transfer, details, happened_at AS "happenedAt" ' +
        'FROM interaction_events WHERE ($1::uuid IS NULL OR actor_profile_id = $1) ORDER BY happened_at DESC LIMIT $2',
        [profileId, Math.max(1, Math.min(500, Math.floor(limit)))],
      );
      return result.rows;
    },

    async getWallet(profileId) { const inventory=await loadInventory(pool,profileId); return Object.fromEntries(CURRENCY_KEYS.map(key=>[key,inventory[key]||0])); },

    async listLodgingClaims(profileId = null) {
      const result = await pool.query(
        "SELECT profile_id, building_id, unit_number, mode, expires_at FROM lodging_claims " +
        "WHERE (mode = 'owned' OR expires_at > now()) AND ($1::uuid IS NULL OR profile_id=$1) ORDER BY building_id,mode,unit_number", [profileId],
      );
      return result.rows.map(row => ({ profileId: row.profile_id, buildingId: row.building_id,
        unitNumber: Number(row.unit_number), mode: row.mode,
        expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null }));
    },

    async findLodgingClaim(profileId, selector = {}) {
      if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)) return null;
      const result = await pool.query(
        "SELECT profile_id, building_id, unit_number, mode, expires_at FROM lodging_claims " +
        "WHERE profile_id = $1 AND (mode = 'owned' OR expires_at > now()) " +
        "AND ($2::text IS NULL OR building_id=$2) AND ($3::text IS NULL OR mode=$3) " +
        "AND ($4::integer IS NULL OR unit_number=$4) ORDER BY created_at,building_id,mode,unit_number",
        [profileId, selector.buildingId || null, selector.mode || null, selector.unitNumber || null],
      );
      const row = result.rows[0];
      return row ? { profileId: row.profile_id, buildingId: row.building_id,
        unitNumber: Number(row.unit_number), mode: row.mode,
        expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null } : null;
    },

    async claimLodging({ profileId, buildingId, mode, unitCount, price, durationMs = null,
      autoRenew = false, additionalUnit = false, requestId = null, landlordProfileId = null, governmentId = 'surface:arrival' }) {
      if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)) {
        throw Object.assign(new Error('Crie uma conta para reservar um quarto ou comprar uma propriedade.'), { status: 403 });
      }
      return withTransaction(pool, async client => {
        if(landlordProfileId && landlordProfileId===profileId)throw Object.assign(new Error('Você já é dono desta propriedade.'),{status:409});
        for(const id of [...new Set([profileId,landlordProfileId].filter(Boolean))].sort()) await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',['lodging-profile',id]);
        if (requestId) {
          if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw Object.assign(new Error('Identificador de reserva inválido.'), {status:400});
          const prior = await client.query('SELECT result FROM lodging_action_receipts WHERE profile_id=$1 AND request_id=$2',[profileId,requestId]);
          if(prior.rowCount){const result=prior.rows[0].result;
            if(result.claim.buildingId!==buildingId||result.claim.mode!==mode)throw Object.assign(new Error('Reserva já utilizada para outra opção.'),{status:409});
            const active=await client.query("SELECT 1 FROM lodging_claims WHERE profile_id=$1 AND building_id=$2 AND mode=$3 AND unit_number=$4 AND (mode='owned' OR expires_at>now())",[profileId,buildingId,mode,result.claim.unitNumber]);
            if(!active.rowCount)throw Object.assign(new Error('Esta reserva já foi processada e encerrada.'),{status:409});
            return {...result,wallet:await loadInventory(client,profileId),alreadyClaimed:true};
          }
        }

        await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [`lodging-building:${mode}`, buildingId]);
        await client.query(
          "UPDATE lodging_leases SET status='ended',ended_at=now(),updated_at=now() " +
          "WHERE status='active' AND auto_renew=false AND next_charge_at<=now()",
        );
        await client.query(
          "DELETE FROM lodging_claims claim WHERE claim.mode='rent' AND claim.expires_at<=now() " +
          "AND NOT EXISTS (SELECT 1 FROM lodging_leases lease WHERE lease.building_id=claim.building_id " +
          "AND lease.unit_number=claim.unit_number AND lease.status='active' AND lease.auto_renew=true)",
        );
        if(landlordProfileId){
          const listing=await client.query("SELECT l.rent_bronze FROM property_rental_listings l JOIN lodging_claims c ON c.building_id=l.building_id AND c.unit_number=l.unit_number AND c.mode='owned' AND c.profile_id=l.owner_profile_id WHERE l.building_id=$1 AND l.owner_profile_id=$2 FOR UPDATE OF l,c",[buildingId,landlordProfileId]);
          if(!listing.rowCount || Number(listing.rows[0].rent_bronze)*(durationMs/GAME_DAY_DURATION_MS)!==price)throw Object.assign(new Error('O anúncio de aluguel mudou. Atualize a placa.'),{status:409});
        }
        const previous = await client.query(
          'SELECT profile_id, building_id, unit_number, mode, expires_at FROM lodging_claims WHERE profile_id = $1',
          [profileId],
        );
        const current = additionalUnit ? null : previous.rows.find(row => row.building_id === buildingId && row.mode === mode);
        if (current) {
          if (current.building_id === buildingId && current.mode === mode) {
            const wallet = await loadInventory(client, profileId);
            const activeLease = mode === 'rent' ? await client.query(
              "SELECT lease_id,auto_renew,next_charge_at,rent_bronze,period_ms,periods_paid FROM lodging_leases " +
              "WHERE profile_id=$1 AND building_id=$2 AND unit_number=$3 AND status='active'", [profileId, buildingId, current.unit_number]) : { rows:[] };
            return { claim: { profileId, buildingId, unitNumber: Number(current.unit_number), mode,
              expiresAt: current.expires_at ? new Date(current.expires_at).getTime() : null },
              wallet: Object.fromEntries(CURRENCY_KEYS.map(key => [key, wallet[key]])),
              lease: activeLease.rows[0] ? { leaseId:activeLease.rows[0].lease_id, profileId, buildingId,
                unitNumber:Number(current.unit_number), rentBronze:Number(activeLease.rows[0].rent_bronze),
                periodMs:Number(activeLease.rows[0].period_ms), periodsPaid:Number(activeLease.rows[0].periods_paid),
                autoRenew:activeLease.rows[0].auto_renew, nextChargeAt:new Date(activeLease.rows[0].next_charge_at).getTime(), status:'active' } : null,
              alreadyClaimed: true };
          }
        }
        const capacity = Number.isSafeInteger(unitCount) ? Math.max(1, Math.min(100, unitCount)) : 0;
        const cost = Number.isSafeInteger(price) ? Math.max(0, price) : Number.MAX_SAFE_INTEGER;
        if (!capacity) throw Object.assign(new Error('Não há unidades disponíveis neste lugar.'), { status: 409 });
        const slot = await client.query(
          'SELECT candidate.unit_number FROM generate_series(1, $1::integer) AS candidate(unit_number) ' +
          'WHERE NOT EXISTS (SELECT 1 FROM lodging_claims claim WHERE claim.building_id = $2 ' +
          'AND claim.mode = $3 AND claim.unit_number = candidate.unit_number) ' +
          'ORDER BY candidate.unit_number LIMIT 1',
          [capacity, buildingId, mode],
        );
        if (!slot.rowCount) throw Object.assign(new Error('Todas as unidades deste lugar já foram reservadas.'), { status: 409 });
        const wallet = await loadInventory(client, profileId);
        const balance = currencyValue(wallet);
        if (balance < cost) throw Object.assign(new Error(`Faltam ${formatCoins(cost - balance)} para esta opção.`), { status: 402 });
        const nextWallet = walletFromValue(balance - cost);
        await storeWallet(client, profileId, nextWallet);
        const periodMs = mode === 'rent' ? Math.max(60_000, Number(durationMs) || 0) : null;
        const expiresAt = mode === 'rent' ? Date.now() + periodMs : null;
        await client.query(
          'INSERT INTO lodging_claims (profile_id, building_id, unit_number, mode, expires_at) ' +
          'VALUES ($1, $2, $3, $4, $5)',
          [profileId, buildingId, Number(slot.rows[0].unit_number), mode, expiresAt === null ? null : new Date(expiresAt)],
        );
        let lease = null;
        if (mode === 'rent') {
          if (!Number.isSafeInteger(cost) || cost < 1 || typeof governmentId !== 'string' || !governmentId)
            throw Object.assign(new Error('A cobrança recorrente não tem preço ou governo válido.'), { status:409 });
          const taxQuote = await client.query(
            "SELECT rate_bps FROM government_tax_quotes WHERE government_id=$1 AND tax_code='lease_income'", [governmentId],
          );
          if (!taxQuote.rowCount) throw Object.assign(new Error('O imposto de aluguel deste governo não está configurado.'), { status:409 });
          const { taxBronze:rentTax } = await accumulateGovernmentTax(client, {
            governmentId, taxCode:'lease_income', grossBronze:cost, rateBps:Number(taxQuote.rows[0].rate_bps),
          });
          const marketIncome = cost - rentTax;
          if(landlordProfileId){const landlordWallet=await loadInventory(client,landlordProfileId);await storeWallet(client,landlordProfileId,walletFromValue(currencyValue(landlordWallet)+marketIncome));}
          if (rentTax > 0) {
            const fund = await client.query(
              "UPDATE government_fund_accounts SET balance_bronze=balance_bronze+$2,updated_at=now() " +
              "WHERE government_id=$1 AND fund_code='general' RETURNING balance_bronze", [governmentId, rentTax],
            );
            if (!fund.rowCount) throw Object.assign(new Error('O tesouro deste governo não está configurado.'), { status:409 });
          }
          const transactionId = randomUUID();
          await client.query(
            'INSERT INTO economy_journal_transactions(transaction_id,event_type,actor_profile_id,reference_id) VALUES($1,$2,$3,$4)',
            [transactionId, 'lodging_rent_payment', profileId, `${buildingId}:${Number(slot.rows[0].unit_number)}:1`],
          );
          await client.query(
            'INSERT INTO economy_journal_lines(transaction_id,line_number,account_code,profile_id,amount_bronze) VALUES($1,1,$2,$3,$4)',
            [transactionId, 'profile', profileId, -cost],
          );
          let line = 2;
          if (marketIncome > 0) await client.query(
            'INSERT INTO economy_journal_lines(transaction_id,line_number,account_code,profile_id,amount_bronze) VALUES($1,$2,$3,$4,$5)',
            [transactionId, line++, landlordProfileId?'profile':'market_treasury', landlordProfileId, marketIncome],
          );
          if (rentTax > 0) await client.query(
            'INSERT INTO economy_journal_lines(transaction_id,line_number,account_code,profile_id,amount_bronze,government_id,fund_code) VALUES($1,$2,$3,NULL,$4,$5,$6)',
            [transactionId, line, 'government_treasury', rentTax, governmentId, 'general'],
          );
          const leaseId = randomUUID(), unitNumber = Number(slot.rows[0].unit_number), nextChargeAt = new Date(expiresAt);
          await client.query(
            'INSERT INTO lodging_leases(lease_id,profile_id,building_id,unit_number,government_id,rent_bronze,period_ms,periods_paid,next_charge_at,auto_renew,landlord_profile_id) ' +
            'VALUES($1,$2,$3,$4,$5,$6,$7,1,$8,$9,$10)',
            [leaseId, profileId, buildingId, unitNumber, governmentId, cost, periodMs, nextChargeAt, Boolean(autoRenew), landlordProfileId],
          );
          await client.query(
            'INSERT INTO lodging_lease_charges(charge_id,lease_id,period_number,due_at,status,rent_bronze,tax_bronze,journal_transaction_id) ' +
            'VALUES($1,$2,1,$3,$4,$5,$6,$7)',
            [randomUUID(), leaseId, new Date(Date.now()), 'paid', cost, rentTax, transactionId],
          );
          lease = { leaseId, profileId, buildingId, unitNumber, rentBronze:cost, periodMs, periodsPaid:1,
            autoRenew:Boolean(autoRenew), nextChargeAt:nextChargeAt.getTime(), status:'active' };
        }
        const result = { claim: { profileId, buildingId, unitNumber: Number(slot.rows[0].unit_number), mode, expiresAt },
          wallet: nextWallet, lease, alreadyClaimed: false };
        if(requestId) await client.query('INSERT INTO lodging_action_receipts(profile_id,request_id,result) VALUES($1,$2,$3::jsonb)',[profileId,requestId,JSON.stringify(result)]);
        return result;
      });
    },

    async getCabinKeys(profileId) {
      if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)) return [];
      const result = await pool.query(
        "SELECT c.building_id,c.unit_number,c.profile_id AS owner_profile_id,a.username AS owner_name " +
        "FROM lodging_claims c JOIN profiles p ON p.id=c.profile_id JOIN accounts a ON a.id=p.account_id " +
        "WHERE c.mode='owned' AND (c.profile_id=$1 OR EXISTS (SELECT 1 FROM cabin_keys k " +
        "WHERE k.building_id=c.building_id AND k.owner_profile_id=c.profile_id AND k.holder_profile_id=$1) OR EXISTS (SELECT 1 FROM lodging_leases l WHERE l.building_id=c.building_id AND l.unit_number=c.unit_number AND l.landlord_profile_id=c.profile_id AND l.profile_id=$1 AND l.status='active' AND l.next_charge_at>now()))", [profileId]);
      return result.rows.filter(row => isCabin(row.building_id)).map(row => ({ buildingId: row.building_id,
        unitNumber: Number(row.unit_number), ownerProfileId: row.owner_profile_id, ownerName: row.owner_name,
        isOwner: row.owner_profile_id === profileId }));
    },

    async getIssuedCabinKeys(ownerProfileId) {
      if (typeof ownerProfileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(ownerProfileId)) return [];
      const result = await pool.query(
        "SELECT k.building_id,k.holder_profile_id,a.username FROM cabin_keys k " +
        "JOIN lodging_claims c ON c.profile_id=k.owner_profile_id AND c.building_id=k.building_id AND c.mode='owned' " +
        "JOIN profiles p ON p.id=k.holder_profile_id JOIN accounts a ON a.id=p.account_id WHERE k.owner_profile_id=$1 " +
        "ORDER BY a.username", [ownerProfileId]);
      return result.rows.filter(row => isCabin(row.building_id)).map(row => ({ buildingId: row.building_id,
        profileId: row.holder_profile_id, username: row.username }));
    },

    async setCabinKey({ ownerProfileId, buildingId, username, profileId, revoke = false }) {
      if (!isCabin(buildingId) || typeof ownerProfileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(ownerProfileId))
        throw Object.assign(new Error('Só o dono pode entregar ou revogar chaves desta cabana.'), { status: 403 });
      return withTransaction(pool, async client => {
        const claim = await client.query("SELECT profile_id FROM lodging_claims WHERE profile_id=$1 AND building_id=$2 AND mode='owned' FOR UPDATE", [ownerProfileId, buildingId]);
        if (!claim.rowCount) throw Object.assign(new Error('Só o dono pode entregar ou revogar chaves desta cabana.'), { status: 403 });
        if (revoke && (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)))
          throw Object.assign(new Error('Essa chave não foi encontrada.'), { status: 404 });
        const holder = await client.query('SELECT p.id,a.username FROM profiles p JOIN accounts a ON a.id=p.account_id WHERE ' +
          (revoke ? 'p.id=$1' : 'a.username=$1'), [revoke ? profileId : normalizeUsername(username)]);
        if (!holder.rowCount) throw Object.assign(new Error('Não encontrei uma conta com esse nome de usuário.'), { status: 404 });
        const target = holder.rows[0];
        if (target.id === ownerProfileId) throw Object.assign(new Error('A chave do proprietário é permanente.'), { status: 400 });
        const issued = await client.query('SELECT holder_profile_id FROM cabin_keys WHERE owner_profile_id=$1 AND building_id=$2', [ownerProfileId, buildingId]);
        if (!revoke && !issued.rows.some(row => row.holder_profile_id === target.id) && issued.rowCount >= MAX_CABIN_KEYS)
          throw Object.assign(new Error(`Esta cabana já tem ${MAX_CABIN_KEYS} chaves compartilhadas.`), { status: 409 });
        if (revoke) await client.query('DELETE FROM cabin_keys WHERE building_id=$1 AND owner_profile_id=$2 AND holder_profile_id=$3', [buildingId, ownerProfileId, target.id]);
        else await client.query('INSERT INTO cabin_keys(building_id,owner_profile_id,holder_profile_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [buildingId, ownerProfileId, target.id]);
        return { profileId: target.id, username: target.username, revoked: revoke };
      });
    },

    async creditWallet(profileId, amount) {
      if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)
          || !Number.isSafeInteger(amount) || amount < 1 || amount > 999_999) {
        throw Object.assign(new Error('Esta venda não pôde ser concluída.'), { status: 400 });
      }
      return withTransaction(pool, async client => {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', ['lodging-profile', profileId]);
        const wallet = await loadInventory(client, profileId);
        const nextValue = currencyValue(wallet) + amount;
        if (nextValue > MAX_WALLET_VALUE) throw Object.assign(new Error('A carteira atingiu o limite técnico de armazenamento.'), { status: 409 });
        const nextWallet = walletFromValue(nextValue);
        await storeWallet(client, profileId, nextWallet);
        return nextWallet;
      });
    },

    async debitWallet(profileId, amount) {
      if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)
          || !Number.isSafeInteger(amount) || amount < 1 || amount > 999_999) {
        throw Object.assign(new Error('Esta compra não pôde ser concluída.'), { status: 400 });
      }
      return withTransaction(pool, async client => {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', ['lodging-profile', profileId]);
        const wallet = await loadInventory(client, profileId);
        const balance = currencyValue(wallet);
        if (balance < amount) throw Object.assign(new Error(`Faltam ${formatCoins(amount - balance)} para esta compra.`), { status: 402 });
        const nextWallet = walletFromValue(balance - amount);
        await storeWallet(client, profileId, nextWallet);
        return nextWallet;
      });
    },

    async getResourceContractState(profileId, dayKey = resourceContractDayKey()) {
      if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)) return normalizeResourceContractState(null, dayKey);
      const result = await pool.query(
        'SELECT contract_id FROM resource_contract_completions WHERE profile_id = $1 AND contract_day = $2::date ORDER BY contract_id',
        [profileId, dayKey],
      );
      return { dayKey, completed:result.rows.map(row => row.contract_id) };
    },

    async completeResourceContract({ profileId, contractId, dayKey }) {
      const contract = RESOURCE_CONTRACTS.find(item => item.id === contractId);
      if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId) || !contract || dayKey !== resourceContractDayKey()) {
        throw Object.assign(new Error('Esta encomenda não está disponível.'), { status:400 });
      }
      return withTransaction(pool, async client => {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', ['lodging-profile', profileId]);
        const profile = await client.query('SELECT id FROM profiles WHERE id = $1 AND is_guest = false', [profileId]);
        if (!profile.rowCount) throw Object.assign(new Error('Crie uma conta para guardar as moedas da encomenda.'), { status:403 });
        const inserted = await client.query(
          'INSERT INTO resource_contract_completions (profile_id, contract_day, contract_id) VALUES ($1, $2::date, $3) ' +
          'ON CONFLICT DO NOTHING RETURNING contract_id',
          [profileId, dayKey, contractId],
        );
        if (!inserted.rowCount) throw Object.assign(new Error('Você já entregou esta encomenda hoje.'), { status:409 });
        const wallet = await loadInventory(client, profileId);
        const nextValue = currencyValue(wallet) + contract.reward;
        if (nextValue > MAX_WALLET_VALUE) throw Object.assign(new Error('A carteira atingiu o limite técnico de armazenamento.'), { status:409 });
        const nextWallet = walletFromValue(nextValue);
        await storeWallet(client, profileId, nextWallet);
        const completed = await client.query(
          'SELECT contract_id FROM resource_contract_completions WHERE profile_id = $1 AND contract_day = $2::date ORDER BY contract_id',
          [profileId, dayKey],
        );
        return { wallet:nextWallet, contractState:{ dayKey, completed:completed.rows.map(row => row.contract_id) } };
      });
    },

    async loadPlayerDimensionPositions(profileId) {
      if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)) return [];
      const { rows } = await pool.query(
        'SELECT dimension_id,x,y,world_version FROM player_dimension_positions WHERE profile_id=$1', [profileId]);
      return rows.map(row=>normalizePlayerDimensionPosition({dimensionId:row.dimension_id,x:Number(row.x),y:Number(row.y),worldVersion:Number(row.world_version)})).filter(Boolean);
    },

    async loadPlayerDimensionDiscoveries(profileId) {
      if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)) return [];
      const { rows } = await pool.query(
        'SELECT dimension_id FROM player_dimension_discoveries WHERE profile_id=$1 ORDER BY discovered_at,dimension_id',
        [profileId],
      );
      return rows.map(row => row.dimension_id);
    },

    async discoverPlayerDimension(profileId, dimensionId, discoverySource = 'portal') {
      if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)
          || typeof dimensionId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,47}$/u.test(dimensionId)
          || !['starter', 'portal', 'knowledge'].includes(discoverySource)) return false;
      const result = await pool.query(
        'INSERT INTO player_dimension_discoveries(profile_id,dimension_id,discovery_source) VALUES($1,$2,$3) ON CONFLICT(profile_id,dimension_id) DO NOTHING',
        [profileId, dimensionId, discoverySource],
      );
      return result.rowCount > 0;
    },

    async savePlayerDimensionPosition(profileId,value) {
      if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)) return;
      const position=normalizePlayerDimensionPosition(value);if(!position)return;
      await pool.query(
        'INSERT INTO player_dimension_positions (profile_id,dimension_id,x,y,world_version) VALUES ($1,$2,$3,$4,$5) '
        +'ON CONFLICT (profile_id,dimension_id) DO UPDATE SET x=EXCLUDED.x,y=EXCLUDED.y,world_version=EXCLUDED.world_version,updated_at=now()',
        [profileId,position.dimensionId,position.x,position.y,position.worldVersion]);
    },

    async loadPlayerMapExploration(profileId,dimensionId) {
      if(typeof profileId!=='string'||!/^[0-9a-f-]{36}$/i.test(profileId)||typeof dimensionId!=='string'||!/^[a-z0-9][a-z0-9-]{0,47}$/i.test(dimensionId))return [];
      const {rows}=await pool.query('SELECT chunks FROM player_map_exploration WHERE profile_id=$1 AND dimension_id=$2',[profileId,dimensionId.toLowerCase()]);
      return [...new Set((rows[0]?.chunks||[]).map(Number).filter(Number.isSafeInteger).filter(cell=>cell>=0&&cell<2304))].sort((a,b)=>a-b);
    },

    async savePlayerMapExploration(profileId,dimensionId,chunks) {
      if(typeof profileId!=='string'||!/^[0-9a-f-]{36}$/i.test(profileId)||typeof dimensionId!=='string'||!/^[a-z0-9][a-z0-9-]{0,47}$/i.test(dimensionId)||!Array.isArray(chunks))return;
      const cells=[...new Set(chunks.filter(Number.isSafeInteger).filter(cell=>cell>=0&&cell<2304))].sort((a,b)=>a-b);
      await pool.query(
        'INSERT INTO player_map_exploration(profile_id,dimension_id,chunks) VALUES($1,$2,$3::smallint[]) '
        +'ON CONFLICT(profile_id,dimension_id) DO UPDATE SET chunks=(SELECT ARRAY(SELECT DISTINCT cell FROM unnest(player_map_exploration.chunks || EXCLUDED.chunks) AS cells(cell) ORDER BY cell)),updated_at=now()',
        [profileId,dimensionId.toLowerCase(),cells]);
    },

    async loadPlayerLocation(profileId) {
      if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)) return null;
      const result = await pool.query(
        'SELECT location, dimension_id, x, y, room_key, room_owner_name, color, world_version FROM player_locations WHERE profile_id = $1',
        [profileId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return normalizePlayerLocation({
        location: row.location,
        dimensionId: row.dimension_id,
        x: Number(row.x),
        y: Number(row.y),
        roomKey: row.room_key,
        roomOwnerName: row.room_owner_name,
        color: Number(row.color),
        worldVersion: Number(row.world_version),
      });
    },

    async savePlayerLocation(profileId, value) {
      if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)) return;
      const location = normalizePlayerLocation(value);
      if (!location) return;
      await pool.query(
        'INSERT INTO player_locations (profile_id, location, dimension_id, x, y, room_key, room_owner_name, color, world_version) ' +
        'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ' +
        'ON CONFLICT (profile_id) DO UPDATE SET location = EXCLUDED.location, dimension_id = EXCLUDED.dimension_id, x = EXCLUDED.x, y = EXCLUDED.y, ' +
        'room_key = EXCLUDED.room_key, room_owner_name = EXCLUDED.room_owner_name, color = EXCLUDED.color, ' +
        'world_version = EXCLUDED.world_version, updated_at = now()',
        [profileId, location.location, location.dimensionId, location.x, location.y, location.roomKey, location.roomOwnerName, location.color, location.worldVersion],
      );
    },

    async loadRoom(accountId, lodgingKey = null) {
      const room = await pool.query('SELECT id FROM rooms WHERE ($2::text IS NULL AND owner_profile_id=$1 AND lodging_key IS NULL) OR lodging_key=$2', [accountId, lodgingKey]);
      if (!room.rowCount) return [];
      const result = await pool.query(
        'SELECT object_id, furniture_id, x, y, rotation, enabled, properties FROM room_objects ' +
        'WHERE room_id = $1 ORDER BY object_id',
        [room.rows[0].id],
      );
      return validateFurniture(result.rows.map(row => {
        const kindId = row.furniture_id.startsWith('furniture.')
          ? row.furniture_id.slice('furniture.'.length)
          : row.furniture_id;
        const furniture = furnitureByKind(kindId);
        if (!furniture) throw new Error('Unknown saved furniture id');
        const stored=row.properties&&typeof row.properties==='object'?row.properties:{};
        const {roomSupport,preset,...properties}=stored;
        if (preset===true) return {
          id: row.object_id,
          kind: furniture.kind,
          x: Number(row.x),
          y: Number(row.y),
          rotation: Number(row.rotation),
          preset: true,
          ...(Number.isFinite(stored.width)?{width:stored.width}:{}),
          ...(Number.isFinite(stored.depth)?{depth:stored.depth}:{}),
          ...(Number.isFinite(stored.height)?{height:stored.height}:{}),
          ...(typeof stored.palette==='string'?{palette:stored.palette}:{}),
        };
        return {
          id: row.object_id,
          kind: furniture.kind,
          x: Number(row.x),
          y: Number(row.y),
          rotation: Number(row.rotation),
          ...(Object.keys(properties).length?{properties}:{}),
          ...(roomSupport&&typeof roomSupport==='object'?{supportId:roomSupport.supportId,supportSurface:roomSupport.supportSurface,
            supportOffsetX:roomSupport.supportOffsetX,supportOffsetY:roomSupport.supportOffsetY,baseZ:roomSupport.baseZ}:{}),
          ...(furniture.kind==='lamp'?{enabled:row.enabled!==false}:{}),
        };
      }));
    },

    async saveRoom(accountId, furniture, lodgingKey = null) {
      if (typeof accountId !== 'string' || !/^[0-9a-f-]{36}$/i.test(accountId)) return;
      const normalized = validateFurniture(furniture);
      await withTransaction(pool, async client => {
        const room = await client.query(
          'INSERT INTO rooms (id, owner_profile_id, version, lodging_key) VALUES ($1, $2, 1, $3) ' +
          (lodgingKey ? 'ON CONFLICT (lodging_key) WHERE lodging_key IS NOT NULL ' : 'ON CONFLICT (owner_profile_id) WHERE lodging_key IS NULL ') +
          'DO UPDATE SET updated_at = now() RETURNING id',
          [randomUUID(), accountId, lodgingKey],
        );
        const roomId = room.rows[0].id;
        await client.query('DELETE FROM room_objects WHERE room_id = $1', [roomId]);
        for (const item of normalized) {
          const furnitureId = furnitureByKind(item.kind)?.id;
          if (!furnitureId) throw new Error('Unknown furniture kind');
          await client.query(
            'INSERT INTO room_objects (room_id, object_id, furniture_id, x, y, rotation, enabled, properties) ' +
            'VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)',
            [roomId, item.id, furnitureId, item.x, item.y, item.rotation, item.enabled!==false,JSON.stringify({...(item.preset===true?{preset:true,width:item.width,depth:item.depth,height:item.height,palette:item.palette}:{...(item.properties||{})}),...(item.supportId?{roomSupport:{supportId:item.supportId,supportSurface:item.supportSurface,supportOffsetX:item.supportOffsetX,supportOffsetY:item.supportOffsetY,baseZ:item.baseZ}}:{})})],
          );
        }
      });
    },

    async loadAppearance(accountId) {
      const result = await pool.query(
        'SELECT version, body_id, archetype_id, body_shape_id, outfit_id, held_item_id, aura_id ' +
        'FROM appearances WHERE profile_id = $1',
        [accountId],
      );
      const row = result.rows[0];
      if (row?.version !== 4) return normalizeAppearance({ body: row?.body_id });
      return normalizeAppearance({
        body: row.body_id,
        archetypeId: row.archetype_id,
        bodyShapeId: row.body_shape_id,
        outfitId: row.outfit_id,
        mainHandId: row.held_item_id,
        auraId: row.aura_id,
      });
    },

    async saveAppearance(accountId, value) {
      if (typeof accountId !== 'string' || !/^[0-9a-f-]{36}$/i.test(accountId)) return;
      const appearance = normalizeAppearance(value);
      await pool.query(
        'INSERT INTO appearances (profile_id, version, body_id, archetype_id, body_shape_id, outfit_id, held_item_id, aura_id) ' +
        'VALUES ($1, 4, $2, $3, $4, $5, $6, $7) ' +
        'ON CONFLICT (profile_id) ' +
        'DO UPDATE SET version = 4, body_id = EXCLUDED.body_id, archetype_id = EXCLUDED.archetype_id, ' +
        'body_shape_id = EXCLUDED.body_shape_id, skin_id = NULL, hair_color_id = NULL, hair_style_id = NULL, ' +
        'height = NULL, muscle = NULL, coat_id = NULL, outfit_id = EXCLUDED.outfit_id, ' +
        'held_item_id = EXCLUDED.held_item_id, aura_id = EXCLUDED.aura_id, updated_at = now()',
        [accountId, appearance.body, appearance.archetypeId, appearance.bodyShapeId, appearance.outfitId, appearance.mainHandId, appearance.auraId],
      );
      return appearance;
    },
  };
}
