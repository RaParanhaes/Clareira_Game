import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EMPTY_INVENTORY, normalizeDisplayName, normalizeUsername } from './account-store.mjs';
import { loadAccountRoom } from './room-store.mjs';
import { BAG_SLOT_COUNT, INVENTORY_ITEM_KEYS, INVENTORY_STACK_LIMITS, STONE_AXE_DURABILITY, STONE_PICKAXE_DURABILITY } from '../game/inventory.mjs';
import { ATTRIBUTE_KEYS, PLAYER_ABILITIES } from '../game/progression.mjs';

const ACCOUNT_ID = /^[0-9a-f-]{36}$/i;
const HEX_32 = /^[0-9a-f]{32}$/i;
const HEX_64 = /^[0-9a-f]{128}$/i;
const TOKEN_HASH = /^[0-9a-f]{64}$/i;
const INVENTORY_KEYS = [...new Set([...Object.keys(EMPTY_INVENTORY), ...INVENTORY_ITEM_KEYS])];
const SCRYPT_COSTS = new Set([16384, 32768, 65536, 131072]);
const LEGACY_APPEARANCE_KEYS = new Set(['body', 'skin', 'hair', 'hairStyle', 'height', 'muscle', 'coat', 'outfit', 'item']);
const SKIN_IDS = ['skin_clara', 'skin_dourada', 'skin_morena', 'skin_escura'];
const HAIR_COLOR_IDS = ['hair_dark_brown', 'hair_near_black', 'hair_chestnut', 'hair_honey_blonde', 'hair_copper'];
const COAT_IDS = ['coat_sea', 'coat_cedar', 'coat_moss', 'coat_berry', 'coat_slate'];

function addIssue(issues, name) {
  issues[name] = (issues[name] || 0) + 1;
}

async function listJsonFiles(directory, issues, issueName) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) {
    if (error.code === 'ENOENT') return [];
    addIssue(issues, issueName);
    return [];
  }
  return entries.filter(entry => {
    if (entry.isFile() && entry.name.endsWith('.json')) return true;
    if (entry.name !== '.keep') addIssue(issues, issueName);
    return false;
  }).map(entry => entry.name);
}

async function readJson(file, issues, issueName) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch {
    addIssue(issues, issueName);
    return null;
  }
}

function roomFilename(accountId) {
  return `${createHash('sha256').update(accountId).digest('hex')}.json`;
}

function validLegacyAppearance(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, option]) => {
    if (!LEGACY_APPEARANCE_KEYS.has(key)) return false;
    if (key === 'body') return ['male', 'female'].includes(option);
    if (key === 'skin') return Number.isInteger(option) && option >= 0 && option < 4;
    if (key === 'hair') return Number.isInteger(option) && option >= 0 && option < 5;
    if (key === 'coat') return Number.isInteger(option) && option >= 0 && option < 5;
    if (key === 'hairStyle') return ['short', 'long', 'curly', 'shaved'].includes(option);
    if (key === 'height') return [0.9, 1, 1.1].includes(option);
    if (key === 'muscle') return [0, 1, 2, 3].includes(option);
    if (key === 'outfit') return ['peasant', 'classic', 'coat', 'vest', 'robe'].includes(option);
    if (key === 'item') return ['none', 'branch', 'lantern'].includes(option);
    return false;
  });
}

function validateAppearanceSave(saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return 'invalid';
  const version = saved.version === undefined ? 0 : saved.version;
  if (!Number.isInteger(version) || version < 0) return 'invalid';
  if (version > 4) return 'future';
  if (version < 2) return validLegacyAppearance(version === 0 ? saved : saved.appearance) ? 'valid' : 'invalid';

  const value = saved.appearance;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'invalid';
  if (version === 2) {
    const keys = ['bodyId', 'skinId', 'hairColorId', 'hairStyleId', 'height', 'muscle', 'coatId', 'outfitId', 'heldItemId'];
    const valid = Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
      && ['male', 'female'].includes(value.bodyId)
      && SKIN_IDS.includes(value.skinId) && HAIR_COLOR_IDS.includes(value.hairColorId)
      && ['short', 'long', 'curly', 'shaved'].includes(value.hairStyleId)
      && [0.9, 1, 1.1].includes(value.height) && [0, 1, 2, 3].includes(value.muscle)
      && COAT_IDS.includes(value.coatId)
      && ['peasant', 'classic', 'coat', 'vest', 'robe'].includes(value.outfitId)
      && ['none', 'branch', 'lantern'].includes(value.heldItemId);
    return valid ? 'valid' : 'invalid';
  }
  if (version === 3) return Object.keys(value).length === 1 && ['male', 'female'].includes(value.bodyId) ? 'valid' : 'invalid';
  const keys = ['archetypeId', 'bodyId', 'outfitId'];
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
    && ['character.base', 'character.peasant', 'character.mage', 'character.dimensional-traveler', 'character.dark-knight', 'character.light-knight'].includes(value.archetypeId)
    && ['male', 'female'].includes(value.bodyId)
    && ['outfit.white-base', 'outfit.commoner', 'outfit.mage-robe', 'outfit.dimension-coat', 'outfit.dark-armor', 'outfit.light-armor'].includes(value.outfitId)
    ? 'valid' : 'invalid';
}

export async function auditPlayerSaves(directory) {
  const issues = {};
  const totals = {
    accounts: 0,
    sessions: 0,
    activeSessions: 0,
    expiredSessions: 0,
    guestSessions: 0,
    activeGuestSessions: 0,
    activeAccountSessions: 0,
    inventoryFiles: 0,
    nonEmptyInventoryItems: 0,
    appearanceFiles: 0,
    rooms: 0,
    roomObjects: 0,
    feedbackRecords: 0,
  };
  const formats = {
    legacyAccountStore: 0,
    versionedAccountStore: 0,
    legacyInventories: 0,
    versionedInventories: 0,
    legacyAppearances: 0,
    version1Appearances: 0,
    version2Appearances: 0,
    version3Appearances: 0,
    version4Appearances: 0,
    versionedRooms: 0,
  };

  const authFile = await readJson(path.join(directory, 'accounts.json'), issues, 'accountStoreUnreadable');
  const accounts = Array.isArray(authFile?.accounts) ? authFile.accounts : [];
  const sessions = Array.isArray(authFile?.sessions) ? authFile.sessions : [];
  if (!authFile || !Array.isArray(authFile.accounts) || !Array.isArray(authFile.sessions)) {
    addIssue(issues, 'accountStoreInvalid');
  } else if (authFile.schemaVersion === undefined) {
    formats.legacyAccountStore++;
  } else if (authFile.schemaVersion === 1) {
    formats.versionedAccountStore++;
  } else {
    addIssue(issues, 'unsupportedAccountStoreVersion');
  }

  const accountIds = new Set();
  const usernames = new Set();
  for (const account of accounts) {
    const valid = typeof account?.id === 'string' && ACCOUNT_ID.test(account.id)
      && typeof account.username === 'string' && /^[a-z0-9_]{3,20}$/.test(account.username)
      && normalizeUsername(account.username) === account.username
      && (account.displayName === undefined || normalizeDisplayName(account.displayName) === account.displayName)
      && HEX_32.test(account.salt || '') && HEX_64.test(account.passwordHash || '')
      && SCRYPT_COSTS.has(account.scryptN) && Number.isFinite(account.createdAt);
    if (!valid || accountIds.has(account.id) || usernames.has(account.username)) {
      addIssue(issues, 'invalidAccountRecords');
      continue;
    }
    accountIds.add(account.id);
    usernames.add(account.username);
  }
  totals.accounts = accountIds.size;

  const sessionIds = new Set();
  const tokenHashes = new Set();
  for (const session of sessions) {
    const linkedAccount = session?.accountId ? accounts.find(account => account.id === session.accountId) : null;
    const validSessionName = session?.guest
      ? normalizeDisplayName(session.displayName) === session.displayName
      : session.displayName === undefined || session.displayName === linkedAccount?.username
        || normalizeDisplayName(session.displayName) === session.displayName;
    const valid = typeof session?.id === 'string' && ACCOUNT_ID.test(session.id)
      && TOKEN_HASH.test(session.tokenHash || '')
      && (session.accountId === null || accountIds.has(session.accountId))
      && validSessionName
      && typeof session.guest === 'boolean'
      && Number.isFinite(session.createdAt) && Number.isFinite(session.expiresAt);
    if (!valid || sessionIds.has(session.id) || tokenHashes.has(session.tokenHash)) {
      addIssue(issues, 'invalidSessionRecords');
      continue;
    }
    sessionIds.add(session.id);
    tokenHashes.add(session.tokenHash);
    if (session.expiresAt > Date.now()) {
      totals.activeSessions++;
      if (session.guest) totals.activeGuestSessions++;
      else totals.activeAccountSessions++;
    } else {
      totals.expiredSessions++;
    }
    if (session.guest) totals.guestSessions++;
  }
  totals.sessions = sessionIds.size;

  const progressDirectory = path.join(directory, 'progress');
  const progressFiles = await listJsonFiles(progressDirectory, issues, 'invalidProgressFiles');
  for (const name of progressFiles) {
    const accountId = name.slice(0, -5);
    if (!ACCOUNT_ID.test(accountId)) {
      addIssue(issues, 'invalidProgressFiles');
      continue;
    }
    if (!accountIds.has(accountId)) addIssue(issues, 'orphanProgressFiles');
    const saved = await readJson(path.join(progressDirectory, name), issues, 'unreadableProgressFiles');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) continue;

    let inventory = saved;
    if (saved.version === 1 || saved.version === 2) {
      formats.versionedInventories++;
      inventory = saved.inventory;
    } else if (saved.version === undefined) {
      formats.legacyInventories++;
    } else {
      addIssue(issues, 'unsupportedInventoryVersions');
      continue;
    }
    if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) {
      addIssue(issues, 'invalidInventories');
      continue;
    }
    const metadataKeys = new Set(['slots', 'selectedSlot', 'attributes', 'learnedAbilities']);
    const legacyItemKeys = new Set(['firewood']);
    if (Object.keys(inventory).some(key => !INVENTORY_KEYS.includes(key) && !metadataKeys.has(key) && !legacyItemKeys.has(key))) addIssue(issues, 'unknownInventoryItems');
    for (const key of [...INVENTORY_KEYS, ...legacyItemKeys].filter(key => key !== 'attributes' && key !== 'learnedAbilities')) {
      const value = inventory[key] ?? 0;
      const maximum = key === 'axeSharpness' ? 100 : key === 'axeDurability' ? STONE_AXE_DURABILITY : key === 'pickaxeDurability' ? STONE_PICKAXE_DURABILITY
        : inventory.slots && INVENTORY_STACK_LIMITS[key] ? INVENTORY_STACK_LIMITS[key] * BAG_SLOT_COUNT : 999;
      if (!Number.isSafeInteger(value) || value < 0 || value > maximum) addIssue(issues, 'invalidInventoryValues');
      else if (value > 0) totals.nonEmptyInventoryItems++;
    }
    if (inventory.attributes !== undefined && (!inventory.attributes || typeof inventory.attributes !== 'object'
        || Array.isArray(inventory.attributes)
        || Object.entries(inventory.attributes).some(([key, value]) => !ATTRIBUTE_KEYS.includes(key)
          || !Number.isSafeInteger(value) || value < 0 || value > 100))) {
      addIssue(issues, 'invalidProgressionAttributes');
    }
    if (inventory.learnedAbilities !== undefined && (!Array.isArray(inventory.learnedAbilities)
        || inventory.learnedAbilities.some((ability, index, values) => typeof ability !== 'string'
          || !Object.hasOwn(PLAYER_ABILITIES, ability) || values.indexOf(ability) !== index))) {
      addIssue(issues, 'invalidLearnedAbilities');
    }
    if (inventory.slots !== undefined && (!Array.isArray(inventory.slots) || inventory.slots.length !== BAG_SLOT_COUNT
        || inventory.slots.some(stack => stack !== null && (!stack || (!INVENTORY_ITEM_KEYS.includes(stack.itemId) && stack.itemId !== 'firewood')
          || !Number.isSafeInteger(stack.quantity) || stack.quantity < 1 || stack.quantity > (stack.itemId === 'firewood' ? 20 : INVENTORY_STACK_LIMITS[stack.itemId]))))) {
      addIssue(issues, 'invalidInventoryValues');
    }
    if (inventory.selectedSlot !== undefined
        && (!Number.isSafeInteger(inventory.selectedSlot) || inventory.selectedSlot < 0 || inventory.selectedSlot > 8)) {
      addIssue(issues, 'invalidInventoryValues');
    }
    totals.inventoryFiles++;
  }

  const appearanceDirectory = path.join(directory, 'appearances');
  const appearanceFiles = await listJsonFiles(appearanceDirectory, issues, 'invalidAppearanceFiles');
  for (const name of appearanceFiles) {
    const accountId = name.slice(0, -5);
    if (!ACCOUNT_ID.test(accountId)) {
      addIssue(issues, 'invalidAppearanceFiles');
      continue;
    }
    if (!accountIds.has(accountId)) addIssue(issues, 'orphanAppearanceFiles');
    const saved = await readJson(path.join(appearanceDirectory, name), issues, 'unreadableAppearanceFiles');
    totals.appearanceFiles++;
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) continue;
    if (saved.version === undefined) formats.legacyAppearances++;
    else if (saved.version === 1) formats.version1Appearances++;
    else if (saved.version === 2) formats.version2Appearances++;
    else if (saved.version === 3) formats.version3Appearances++;
    else if (saved.version === 4) formats.version4Appearances++;
    const appearanceStatus = validateAppearanceSave(saved);
    if (appearanceStatus === 'future') addIssue(issues, 'unsupportedAppearanceVersions');
    else if (appearanceStatus !== 'valid') addIssue(issues, 'invalidAppearances');
  }

  const roomsDirectory = path.join(directory, 'rooms');
  let roomNames = [];
  try {
    roomNames = (await readdir(roomsDirectory, { withFileTypes: true }))
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => entry.name);
  } catch (error) {
    if (error.code !== 'ENOENT') addIssue(issues, 'invalidRoomFiles');
  }
  const accountByRoomFile = new Map([...accountIds].map(accountId => [roomFilename(accountId), accountId]));
  const discoveredRooms = new Set();
  for (const name of roomNames) {
    const accountId = accountByRoomFile.get(name);
    if (!accountId) {
      addIssue(issues, 'orphanRoomFiles');
      continue;
    }
    try {
      const furniture = await loadAccountRoom(directory, accountId);
      discoveredRooms.add(accountId);
      totals.roomObjects += furniture.length;
      formats.versionedRooms++;
    } catch {
      addIssue(issues, 'invalidRoomFiles');
    }
  }
  totals.rooms = discoveredRooms.size;

  try {
    const feedback = await readFile(path.join(directory, 'feedback.jsonl'), 'utf8');
    totals.feedbackRecords = feedback.split('\n').filter(line => line.trim()).length;
  } catch (error) {
    if (error.code !== 'ENOENT') addIssue(issues, 'unreadableFeedbackFile');
  }

  return {
    status: Object.keys(issues).length ? 'needs_review' : 'clean',
    readOnly: true,
    totals,
    formats,
    issues,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const directory = process.argv[2] || process.env.STATE_DIRECTORY;
  if (!directory) {
    process.stderr.write('Informe o diretório de saves: node scripts/audit-player-saves.mjs /caminho/privado\n');
    process.exitCode = 2;
  } else {
    const result = await auditPlayerSaves(directory);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'clean') process.exitCode = 1;
  }
}
