import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { auditPlayerSaves } from '../scripts/audit-player-saves.mjs';
import { inventoryRows } from '../game/inventory.mjs';
import { validateInventory } from '../scripts/account-store.mjs';
import { CURRENCY_QUANTITY_LIMITS, CURRENCY_KEYS } from '../game/lodging-catalog.mjs';

import { normalizeAppearance } from '../game/appearance.mjs';
import { normalizeWorldDefinition, WORLD_DOCUMENT_ID } from '../game/world-edits.mjs';
import { createJsonPlayerLocationStore } from '../scripts/player-location-store.mjs';
import { createJsonCampfireStore } from '../scripts/world-store.mjs';
import { createJsonDimensionStore } from '../scripts/dimension-store.mjs';

const SKIN_IDS = ['skin_clara', 'skin_dourada', 'skin_morena', 'skin_escura'];
const HAIR_IDS = ['hair_dark_brown', 'hair_near_black', 'hair_chestnut', 'hair_honey_blonde', 'hair_copper'];
const COAT_IDS = ['coat_sea', 'coat_cedar', 'coat_moss', 'coat_berry', 'coat_slate'];
const HAIR_STYLES = ['short', 'long', 'curly', 'shaved'];
const OUTFITS = ['peasant', 'classic', 'coat', 'vest', 'robe'];
const HELD_ITEMS = ['none', 'branch', 'lantern'];
const SCRYPT_COSTS = new Set([16384, 32768, 65536, 131072]);

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function dateFromMilliseconds(value, label) {
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw new Error('Data inválida em ' + label);
  return result;
}

function convertAppearance(saved) {
  const version = saved.version === undefined ? 0 : saved.version;
  if (version === 4) {
    const value = normalizeAppearance({ ...saved.appearance, body: saved.appearance.bodyId });
    return { version: 4, bodyId: value.body, archetypeId: value.archetypeId, bodyShapeId: value.bodyShapeId,
      outfitId: value.outfitId, heldItemId: value.mainHandId, auraId: value.auraId };
  }
  if (version === 3) {
    return {
      version: 3,
      bodyId: saved.appearance.bodyId,
      skinId: null,
      hairColorId: null,
      hairStyleId: null,
      height: null,
      muscle: null,
      coatId: null,
      outfitId: null,
      heldItemId: null,
    };
  }
  if (version === 2) {
    const value = saved.appearance;
    return {
      version: 2,
      bodyId: value.bodyId,
      skinId: value.skinId,
      hairColorId: value.hairColorId,
      hairStyleId: value.hairStyleId,
      height: value.height,
      muscle: value.muscle,
      coatId: value.coatId,
      outfitId: value.outfitId,
      heldItemId: value.heldItemId,
    };
  }
  const value = version === 0 ? saved : saved.appearance;
  const bodyId = value.body === 'female' ? 'female' : 'male';
  const skinIndex = Number.isInteger(value.skin) && value.skin >= 0 && value.skin < SKIN_IDS.length ? value.skin : 0;
  const hairIndex = Number.isInteger(value.hair) && value.hair >= 0 && value.hair < HAIR_IDS.length
    ? value.hair : bodyId === 'female' ? 2 : 0;
  const coatIndex = Number.isInteger(value.coat) && value.coat >= 0 && value.coat < COAT_IDS.length ? value.coat : 2;
  return {
    version: 2,
    bodyId,
    skinId: SKIN_IDS[skinIndex],
    hairColorId: HAIR_IDS[hairIndex],
    hairStyleId: HAIR_STYLES.includes(value.hairStyle) ? value.hairStyle : bodyId === 'female' ? 'long' : 'short',
    height: [0.9, 1, 1.1].includes(value.height) ? value.height : 1,
    muscle: [0, 1, 2, 3].includes(value.muscle) ? value.muscle : 1,
    coatId: COAT_IDS[coatIndex],
    outfitId: OUTFITS.includes(value.outfit) ? value.outfit : 'peasant',
    heldItemId: HELD_ITEMS.includes(value.item) ? value.item : 'none',
  };
}

async function listFiles(directory) {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => entry.name)
      .sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function buildJsonImportPlan(directory, { now = Date.now() } = {}) {
  const audit = await auditPlayerSaves(directory);
  if (audit.status !== 'clean') throw new Error('A auditoria dos saves precisa estar limpa antes de importar.');
  const accountStore = await readJson(path.join(directory, 'accounts.json'));
  const accounts = accountStore.accounts;
  const accountIds = new Set(accounts.map(account => account.id));
  const profileRows = accounts.map(account => {
    if (!SCRYPT_COSTS.has(account.scryptN)) throw new Error('Custo de senha não suportado para a conta ' + account.id);
    return {
      id: account.id,
      username: account.username,
      role: account.role === 'admin' ? 'admin' : 'player',
      salt: Buffer.from(account.salt, 'hex'),
      passwordHash: Buffer.from(account.passwordHash, 'hex'),
      scryptN: account.scryptN,
      displayName: account.username,
      createdAt: dateFromMilliseconds(account.createdAt, 'conta'),
    };
  });

  const activeSessions = accountStore.sessions.filter(session => session.expiresAt > now);
  const sessions = [];
  const guests = [];
  for (const session of activeSessions) {
    const accountId = session.accountId;
    const profileId = accountId || session.id;
    const displayName = accountId
      ? accounts.find(account => account.id === accountId)?.username
      : session.displayName;
    if (!accountId) guests.push({
      id: profileId,
      displayName,
      createdAt: dateFromMilliseconds(session.createdAt, 'visitante'),
    });
    sessions.push({
      id: session.id,
      profileId,
      tokenHash: Buffer.from(session.tokenHash, 'hex'),
      createdAt: dateFromMilliseconds(session.createdAt, 'sessão'),
      expiresAt: dateFromMilliseconds(session.expiresAt, 'sessão'),
    });
  }
  if (sessions.some(session => !session.profileId)) throw new Error('Sessão sem perfil não pode ser importada.');

  const inventories = [];
  for (const name of await listFiles(path.join(directory, 'progress'))) {
    const accountId = name.slice(0, -5);
    if (!accountIds.has(accountId)) continue;
    const saved = await readJson(path.join(directory, 'progress', name));
    const inventory = saved.version === 1 || saved.version === 2 ? saved.inventory : saved;
    const normalized = validateInventory(inventory);
    for (const { itemId, quantity } of inventoryRows(normalized)) {
      inventories.push({ profileId: accountId, itemId, quantity });
    }
  }

  for (const account of accounts) {
    for (const itemId of CURRENCY_KEYS) {
      const index = inventories.findIndex(row => row.profileId === account.id && row.itemId === itemId);
      if (index >= 0) inventories.splice(index, 1);
      const quantity = account.wallet?.[itemId] ?? 0;
      if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > CURRENCY_QUANTITY_LIMITS[itemId]) throw new Error('Saldo inválido na importação.');
      if (quantity) inventories.push({profileId: account.id, itemId, quantity});
    }
  }
  const appearances = [];
  for (const name of await listFiles(path.join(directory, 'appearances'))) {
    const accountId = name.slice(0, -5);
    if (!accountIds.has(accountId)) continue;
    const appearance = convertAppearance(await readJson(path.join(directory, 'appearances', name)));
    appearances.push({ profileId: accountId, ...appearance });
  }

  const roomFilesByAccount = new Map(accounts.map(account => [
    createHash('sha256').update(account.id).digest('hex') + '.json',
    account.id,
  ]));
  const rooms = [];
  for (const name of await listFiles(path.join(directory, 'rooms'))) {
    const accountId = roomFilesByAccount.get(name);
    if (!accountId) continue;
    const saved = await readJson(path.join(directory, 'rooms', name));
    if (saved.version !== 1 || !Array.isArray(saved.furniture)) throw new Error('Formato de quarto não suportado.');
    rooms.push({
      id: accountId,
      ownerProfileId: accountId,
      objects: saved.furniture.map(item => ({
        objectId: item.id,
        furnitureId: 'furniture.' + item.kind,
        x: item.x,
        y: item.y,
        rotation: item.rotation || 0,
        ...(item.kind==='lamp'?{enabled:item.enabled!==false}:{}),
        properties:item.properties||{},
      })),
    });
  }

  const locations = [];
  const locationStore = createJsonPlayerLocationStore(directory);
  for (const profileId of [...accountIds, ...guests.map(guest => guest.id)]) {
    const location = await locationStore.loadPlayerLocation(profileId);
    if (location) locations.push({profileId, ...location});
  }
  const worlds = [], campfires = [];
  const fireStore = createJsonCampfireStore(directory);
  for (const filename of await listFiles(directory)) {
    const match = /^world(?:-([a-z0-9-]+))?\.json$/.exec(filename);
    if (match) {
      const dimensionId = match[1] || 'surface';
      worlds.push({dimensionId, definition: normalizeWorldDefinition({...await readJson(path.join(directory,filename)),dimensionId})});
    }
    const fireMatch = /^campfires(?:-([a-z0-9-]+))?\.json$/.exec(filename);
    if (fireMatch) {
      const dimensionId = fireMatch[1] || 'surface';
      campfires.push({dimensionId, fires: await fireStore.loadCampfires(dimensionId)});
    }
  }
  const dimensions = await createJsonDimensionStore(directory).loadDimensions();
  const claims = (accountStore.lodgingClaims || []).filter(claim => claim.mode === 'owned' || claim.expiresAt > now);
  const cabinKeys = accounts.flatMap(account => (account.cabinKeys || []).filter(key => accountIds.has(key.profileId))
    .map(key => ({...key, ownerProfileId: account.id})));
  const contracts = accounts.flatMap(account => (account.resourceContracts?.completed || [])
    .map(contractId => ({profileId: account.id, contractId, dayKey: account.resourceContracts.dayKey})));
  return {
    source: path.resolve(directory),
    counts: {
      accounts: profileRows.length,
      guestProfiles: guests.length,
      activeSessions: sessions.length,
      inventoryRows: inventories.length,
      appearances: appearances.length,
      locations: locations.length, worlds: worlds.length, campfireDimensions: campfires.length, lodgingClaims: claims.length, cabinKeys: cabinKeys.length,
      rooms: rooms.length,
      roomObjects: rooms.reduce((count, room) => count + room.objects.length, 0),
      expiredSessionsSkipped: accountStore.sessions.length - sessions.length,
    },
    accounts: profileRows,
    guests,
    sessions,
    inventories,
    appearances,
    rooms, locations, worlds, campfires, dimensions, claims, cabinKeys, contracts,
  };
}

export async function applyJsonImport(pool, plan) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const counts = await client.query(
      'SELECT (SELECT count(*) FROM accounts) AS accounts, ' +
      '(SELECT count(*) FROM profiles) AS profiles, ' +
      '(SELECT count(*) FROM sessions) AS sessions, ' +
      '(SELECT count(*) FROM inventory_items) AS inventory_items, ' +
      '(SELECT count(*) FROM appearances) AS appearances, ' +
      '(SELECT count(*) FROM rooms) AS rooms, ' +
      '(SELECT count(*) FROM room_objects) AS room_objects, ' +
      '(SELECT count(*) FROM worlds) AS worlds, ' +
      '(SELECT count(*) FROM world_chunk_changes) AS world_chunk_changes, ' +
      '(SELECT count(*) FROM item_transactions) AS item_transactions, ' +
      '(SELECT count(*) FROM dimension_catalog) AS dimension_catalog, ' +
      '(SELECT count(*) FROM dimension_campfires) AS dimension_campfires',
    );
    if (Object.values(counts.rows[0]).some(value => Number(value) !== 0)) {
      throw new Error('Importação JSON só é permitida em uma base sem dados de jogo.');
    }

    for (const account of plan.accounts) {
      await client.query(
        'INSERT INTO accounts (id, username, password_salt, password_hash, scrypt_n, created_at, role) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [account.id, account.username, account.salt, account.passwordHash, account.scryptN, account.createdAt, account.role],
      );
      await client.query(
        'INSERT INTO profiles (id, account_id, display_name, is_guest, created_at) VALUES ($1, $1, $2, false, $3)',
        [account.id, account.displayName, account.createdAt],
      );
    }
    for (const guest of plan.guests) {
      await client.query(
        'INSERT INTO profiles (id, account_id, display_name, is_guest, created_at) VALUES ($1, NULL, $2, true, $3)',
        [guest.id, guest.displayName, guest.createdAt],
      );
    }
    for (const session of plan.sessions) {
      await client.query(
        'INSERT INTO sessions (id, profile_id, token_hash, created_at, expires_at) VALUES ($1, $2, $3, $4, $5)',
        [session.id, session.profileId, session.tokenHash, session.createdAt, session.expiresAt],
      );
    }
    for (const item of plan.inventories) {
      await client.query(
        'INSERT INTO inventory_items (profile_id, item_id, quantity) VALUES ($1, $2, $3)',
        [item.profileId, item.itemId, item.quantity],
      );
    }
    for (const appearance of plan.appearances) {
      await client.query(
        'INSERT INTO appearances ' +
        '(profile_id, version, body_id, skin_id, hair_color_id, hair_style_id, height, muscle, coat_id, outfit_id, held_item_id, archetype_id, body_shape_id, aura_id) ' +
        'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
        [
          appearance.profileId, appearance.version, appearance.bodyId, appearance.skinId,
          appearance.hairColorId, appearance.hairStyleId, appearance.height, appearance.muscle,
          appearance.coatId, appearance.outfitId, appearance.heldItemId,
          appearance.archetypeId, appearance.bodyShapeId, appearance.auraId,
        ],
      );
    }
    for (const room of plan.rooms) {
      await client.query(
        'INSERT INTO rooms (id, owner_profile_id, version) VALUES ($1, $2, 1)',
        [room.id, room.ownerProfileId],
      );
      for (const item of room.objects) {
        await client.query(
          'INSERT INTO room_objects (room_id, object_id, furniture_id, x, y, rotation, enabled, properties) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
          [room.id, item.objectId, item.furnitureId, item.x, item.y, item.rotation, item.enabled!==false,JSON.stringify(item.properties||{})],
        );
      }
    }
    for (const row of plan.locations || []) {
      await client.query('INSERT INTO player_locations(profile_id,location,dimension_id,x,y,room_key,room_owner_name,color,world_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [row.profileId,row.location,row.dimensionId,row.x,row.y,row.roomKey,row.roomOwnerName,row.color,row.worldVersion]);
    }
    for (const {dimensionId, definition: d} of plan.worlds || []) {
      const documentId = dimensionId === 'surface' ? WORLD_DOCUMENT_ID : `${WORLD_DOCUMENT_ID}-${dimensionId}`;
      await client.query('INSERT INTO worlds(id,seed,generation_version,revision,theme) VALUES($1,$2,$3,$4,$5)', [documentId,d.seed,d.generationVersion,d.revision,d.theme]);
      for (const [index,e] of d.edits.entries()) await client.query("INSERT INTO world_chunk_changes(world_id,dimension_id,chunk_x,chunk_y,entity_id,operation,payload,edit_index) VALUES($1,$2,$3,$4,$5,'upsert',$6::jsonb,$7)",
        [documentId,dimensionId,Math.floor(e.x/16),Math.floor(e.y/16),e.id,JSON.stringify(e),index]);
    }
    for (const {dimensionId,fires} of plan.campfires || []) await client.query('INSERT INTO dimension_campfires(dimension_id,fires) VALUES($1,$2::jsonb)',[dimensionId,JSON.stringify(fires)]);
    if (plan.dimensions) await client.query('INSERT INTO dimension_catalog(id,revision,dimensions) VALUES(true,$1,$2::jsonb)',[plan.dimensions.revision,JSON.stringify(plan.dimensions.dimensions)]);
    for (const c of plan.claims || []) await client.query('INSERT INTO lodging_claims(profile_id,building_id,unit_number,mode,expires_at) VALUES($1,$2,$3,$4,$5)',[c.profileId,c.buildingId,c.unitNumber,c.mode,c.expiresAt ? new Date(c.expiresAt) : null]);
    for (const k of plan.cabinKeys || []) await client.query('INSERT INTO cabin_keys(building_id,owner_profile_id,holder_profile_id) VALUES($1,$2,$3)',[k.buildingId,k.ownerProfileId,k.profileId]);
    for (const c of plan.contracts || []) await client.query('INSERT INTO resource_contract_completions(profile_id,contract_day,contract_id) VALUES($1,$2,$3)',[c.profileId,c.dayKey,c.contractId]);
    await client.query('COMMIT');
    return plan.counts;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}
