import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CURRENCY_KEYS, CURRENCY_QUANTITY_LIMITS, MAX_WALLET_VALUE, currencyValue, formatCoins, walletFromValue } from '../game/lodging-catalog.mjs';
import { createInventory, inventorySnapshot } from '../game/inventory.mjs';
import { AXE_TOOL_IDS, PICKAXE_TOOL_IDS, axeDurabilityFor, pickaxeDurabilityFor, maxAxeDurabilityFor, maxPickaxeDurabilityFor } from '../game/tool-progression.mjs';
import { RESOURCE_CONTRACTS, normalizeResourceContractState, resourceContractDayKey } from '../game/resource-contracts.mjs';
import { MAX_PLAYER_LEVEL, xpRequiredForNextLevel } from '../game/progression.mjs';

const scrypt = promisify(scryptCallback);
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const GUEST_SESSION_MS = 24 * 60 * 60 * 1000;
const PASSWORD_BYTES = 64;
const SCRYPT_N = 1 << 17;
const SCRYPT_OPTIONS = { N: SCRYPT_N, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
import { isCabin, MAX_CABIN_KEYS } from '../game/cabin-access.mjs';

export const EMPTY_INVENTORY = Object.freeze({
  wood: 0, timber: 0, sturdyBranch: 0, stone: 0, berries: 0, apples: 0, leaves: 0, vines: 0, plank: 0,
  copperOre: 0, ironOre: 0, coal: 0, charcoal: 0, copperIngot: 0, ironIngot: 0,
  knife: 1, stoneAxe: 0, copperAxe:0, ironAxe:0, stonePickaxe: 0, copperPickaxe:0, ironPickaxe:0, cinderShard:0, emberCore:0,
  axeSharpness: 0, axeDurability: 0, pickaxeDurability: 0,
  level: 1, xp: 0, attributePoints: 0, skillPoints: 0,
  attributes: Object.freeze({ force: 0, attack: 0, defense: 0, agility: 0, magic: 0, speed: 0 }), learnedAbilities: Object.freeze([]),
  gold: 0, silver: 0, bronze: 0,
});
const ACCOUNT_STORE_VERSION = 1;
const DUMMY_SALT = Buffer.from('7c7417e109d99bafc14d9fe8464c3f00', 'hex');
let passwordHashQueue = Promise.resolve();

const DISALLOWED_USERNAME_TERMS = [
  'arrombado', 'arrombada', 'bicha', 'buceta', 'cacete', 'caralho', 'corno', 'cuzona', 'cuzao',
  'desgraca', 'ejaculacao', 'ejacular', 'estuprador', 'estupro', 'fdp', 'filhodaputa', 'fodase', 'foder', 'fodendo', 'fucking', 'fudida', 'fudido',
  'genitais', 'genital', 'hentai', 'masturbacao', 'masturbar', 'merda', 'penis', 'pornografia', 'porno', 'porn', 'porra', 'pqp',
  'prostituta', 'putaria', 'putona', 'sexual', 'vagabunda', 'vagabundo', 'vagina', 'vaginal', 'viado', 'vsf',
  'asshole', 'bitch', 'bullshit', 'cocksucker', 'cunt', 'faggot', 'nigga', 'nigger', 'pussy', 'retard', 'shithead', 'slut', 'whore',
];
const DISALLOWED_USERNAME_AT_EDGE = ['puta', 'puto', 'foda'];
const DISALLOWED_USERNAME_EXACT = ['fuck', 'shit', 'cock', 'dick', 'cunt', 'slut', 'sexo'];
const DISALLOWED_USERNAME_SHORTCODES = ['fdp', 'pqp', 'vsf'];

export function normalizeDisplayName(value) {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFC').replace(/[<>\u0000-\u001f\u007f]/g, '').trim();
  const length = Array.from(name).length;
  return length >= 2 && length <= 16 ? name : null;
}

export function parseCookies(header = '') {
  const cookies = new Map();
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!cookies.has(name)) cookies.set(name, value);
  }
  return cookies;
}

export function tokenDigest(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function validPassword(value) {
  return typeof value === 'string' && value.length >= 10 && value.length <= 128;
}

export function normalizeUsername(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_]{3,20}$/.test(value)) return null;
  return value.toLowerCase();
}

function hasDisallowedUsernameTerm(username) {
  const normalizeToken = value => value.toLowerCase()
    .replace(/[013457]/g, character => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' })[character])
    .replace(/(.)\1+/g, '$1');
  const tokens = username.split('_').map(normalizeToken);
  const compact = tokens.join('');
  return DISALLOWED_USERNAME_TERMS.some(term => term.length >= 5 && compact.includes(term))
    || DISALLOWED_USERNAME_EXACT.some(term => tokens.includes(term) || compact === term)
    || DISALLOWED_USERNAME_SHORTCODES.some(term => compact === term || compact.startsWith(term) || compact.endsWith(term))
    || DISALLOWED_USERNAME_AT_EDGE.some(term => compact === term || compact.startsWith(term) || compact.endsWith(term));
}

export function validateUsername(value) {
  const username = normalizeUsername(value);
  return username && !hasDisallowedUsernameTerm(username) ? username : null;
}

export function validateInventory(value) {
  const values = Object.fromEntries(Object.keys(EMPTY_INVENTORY).map(key => [
    key,
    Number.isSafeInteger(value?.[key]) ? Math.max(0, Math.min(CURRENCY_KEYS.includes(key) ? CURRENCY_QUANTITY_LIMITS[key] : key === 'axeSharpness' ? 100 : key === 'axeDurability' ? maxAxeDurabilityFor(value) : key === 'pickaxeDurability' ? maxPickaxeDurabilityFor(value) : 999, value[key]))
      : key === 'axeSharpness' && AXE_TOOL_IDS.some(id => value?.[id] > 0 || value?.slots?.some(stack => stack?.itemId === id)) ? 100
      : key === 'axeDurability' ? axeDurabilityFor(value)
      : key === 'pickaxeDurability' ? pickaxeDurabilityFor(value) : EMPTY_INVENTORY[key],
  ]));
  values.level = Number.isSafeInteger(value?.level) ? Math.max(1, Math.min(MAX_PLAYER_LEVEL, value.level)) : 1;
  values.xp = Number.isSafeInteger(value?.xp) ? Math.max(0, Math.min(xpRequiredForNextLevel(values.level) - 1, value.xp)) : 0;
  // Old saves stored kindling and firewood separately; they now share the wood stack.
  const legacyFirewood = Number.isSafeInteger(value?.firewood) ? Math.max(0, Math.min(999, value.firewood)) : 0;
  return inventorySnapshot(createInventory({ ...values, attributes: value?.attributes, learnedAbilities: value?.learnedAbilities, level: value?.level, xp: value?.xp, attributePoints: value?.attributePoints, skillPoints: value?.skillPoints, firewood: legacyFirewood, slots: value?.slots, selectedSlot: value?.selectedSlot }));
}

export function hashPassword(password, salt, requestedCost = SCRYPT_N) {
  const N = [1 << 14, 1 << 15, 1 << 16, SCRYPT_N].includes(requestedCost) ? requestedCost : SCRYPT_N;
  const result = passwordHashQueue.then(() => scrypt(password, salt, PASSWORD_BYTES, { ...SCRYPT_OPTIONS, N }));
  passwordHashQueue = result.catch(() => {});
  return result;
}

export async function verifyPassword(password, account) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const salt = account ? Buffer.from(account.salt, 'hex') : DUMMY_SALT;
  const expected = account ? Buffer.from(account.passwordHash, 'hex') : Buffer.alloc(PASSWORD_BYTES);
  const candidate = await hashPassword(password, salt, account?.scryptN);
  return Boolean(account && expected.length === candidate.length && timingSafeEqual(expected, candidate));
}

async function readJsonFile(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function atomicWriteJson(file, value, directoryMode = 0o700) {
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true, mode: directoryMode });
  await chmod(directory, directoryMode);
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: 'wx' });
  await chmod(temporary, 0o600);
  await rename(temporary, file);
  await chmod(file, 0o600);
}

export function createAccountStore({ directory }) {
  const authFile = path.join(directory, 'accounts.json');
  const progressDirectory = path.join(directory, 'progress');
  let mutationQueue = Promise.resolve();
  let singleNameMigration;

  async function migrateLegacyNames() {
    const data = await readJsonFile(authFile, { accounts: [], sessions: [] });
    if (!Array.isArray(data.accounts) || !Array.isArray(data.sessions)) throw new Error('Invalid account store');
    if (data.schemaVersion !== undefined && data.schemaVersion !== ACCOUNT_STORE_VERSION) {
      throw new Error('Unsupported account store version');
    }
    let changed = data.schemaVersion !== ACCOUNT_STORE_VERSION;
    for (const account of data.accounts) {
      if (account && typeof account === 'object' && Object.hasOwn(account, 'displayName')) {
        delete account.displayName;
        changed = true;
      }
    }
    for (const session of data.sessions) {
      if (session && typeof session === 'object' && session.accountId && Object.hasOwn(session, 'displayName')) {
        delete session.displayName;
        changed = true;
      }
    }
    if (changed) await atomicWriteJson(authFile, { ...data, schemaVersion: ACCOUNT_STORE_VERSION });
  }

  async function readState() {
    singleNameMigration ||= migrateLegacyNames();
    await singleNameMigration;
    const data = await readJsonFile(authFile, { accounts: [], sessions: [] });
    if (!Array.isArray(data.accounts) || !Array.isArray(data.sessions)) throw new Error('Invalid account store');
    if (data.schemaVersion !== undefined && data.schemaVersion !== ACCOUNT_STORE_VERSION) {
      throw new Error('Unsupported account store version');
    }
    return { ...data, lodgingClaims: Array.isArray(data.lodgingClaims) ? data.lodgingClaims : [], schemaVersion: ACCOUNT_STORE_VERSION };
  }

  async function mutate(callback) {
    const previous = mutationQueue;
    let release;
    mutationQueue = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      const data = await readState();
      const result = await callback(data);
      await atomicWriteJson(authFile, data);
      return result;
    } finally { release(); }
  }

  function makeSession(data, { accountId = null, displayName, guest }) {
    const token = randomBytes(32).toString('base64url');
    const createdAt = Date.now();
    const session = {
      id: randomUUID(),
      tokenHash: tokenDigest(token),
      accountId,
      ...(guest ? { displayName } : {}),
      guest,
      createdAt,
      expiresAt: createdAt + (guest ? GUEST_SESSION_MS : SESSION_MS),
    };
    data.sessions = data.sessions.filter(item => item.expiresAt > createdAt);
    data.sessions.push(session);
    return { token, session };
  }

  async function readProgress(accountId) {
    if (!accountId) return { ...EMPTY_INVENTORY };
    const saved = await readJsonFile(path.join(progressDirectory, `${accountId}.json`), {});
      if (saved?.version !== undefined) {
      if (![1, 2].includes(saved.version)) throw new Error('Unsupported inventory save version');
      return validateInventory(saved.inventory);
    }
    return validateInventory(saved);
  }

  function walletFor(account) {
    return Object.fromEntries(CURRENCY_KEYS.map(key => [key,
      Number.isSafeInteger(account?.wallet?.[key]) ? Math.max(0, Math.min(CURRENCY_QUANTITY_LIMITS[key], account.wallet[key])) : 0,
    ]));
  }

  async function publicProfile(session, account) {
    return {
      id: account?.id || session.id,
      username: account?.username || null,
      ...(session.guest ? { displayName: session.displayName } : {}),
      guest: session.guest,
      role: account?.role === 'admin' ? 'admin' : 'player',
      inventory: validateInventory({ ...await readProgress(account?.id), ...walletFor(account) }),
    };
  }

  async function getSession(token) {
    if (typeof token !== 'string' || token.length < 40 || token.length > 100) return null;
    const digest = tokenDigest(token);
    const data = await readState();
    const session = data.sessions.find(item => item.tokenHash === digest);
    if (!session || session.expiresAt <= Date.now()) return null;
    const account = session.accountId ? data.accounts.find(item => item.id === session.accountId) : null;
    if (session.accountId && !account) return null;
    return { session, profile: await publicProfile(session, account) };
  }

  return {
    async register({ username, password }) {
      const normalizedUsername = validateUsername(username);
      if (!normalizedUsername) throw Object.assign(new Error('Use um nome de usuário de 3 a 20 letras, números ou _, sem palavrões ou palavras obscenas.'), { status: 400 });
      if (!validPassword(password)) throw Object.assign(new Error('A senha precisa ter de 10 a 128 caracteres.'), { status: 400 });
      const salt = randomBytes(16);
      const passwordHash = await hashPassword(password, salt);
      const created = await mutate(data => {
        if (data.accounts.some(account => account.username === normalizedUsername)) {
          throw Object.assign(new Error('Esse nome de usuário já existe.'), { status: 409 });
        }
        const account = {
          id: randomUUID(), username: normalizedUsername,
          salt: salt.toString('hex'), passwordHash: passwordHash.toString('hex'), scryptN: SCRYPT_N,
          role: 'player', createdAt: Date.now(),
        };
        data.accounts.push(account);
        return { ...makeSession(data, { accountId: account.id, guest: false }), account };
      });
      return { token: created.token, maxAge: SESSION_MS, profile: await publicProfile(created.session, created.account) };
    },

    async login({ username, password }) {
      const normalizedUsername = normalizeUsername(username);
      if (typeof password !== 'string' || password.length > 128) throw Object.assign(new Error('Usuário ou senha incorretos.'), { status: 401 });
      const state = await readState();
      const account = normalizedUsername ? state.accounts.find(item => item.username === normalizedUsername) : null;
      if (!await verifyPassword(password, account)) {
        throw Object.assign(new Error('Usuário ou senha incorretos.'), { status: 401 });
      }
      const created = await mutate(data => {
        const currentAccount = data.accounts.find(item => item.id === account.id && item.passwordHash === account.passwordHash);
        if (!currentAccount) throw Object.assign(new Error('Usuário ou senha incorretos.'), { status: 401 });
        return { ...makeSession(data, { accountId: currentAccount.id, guest: false }), account: currentAccount };
      });
      return { token: created.token, maxAge: SESSION_MS, profile: await publicProfile(created.session, created.account) };
    },

    async guest() {
      const cleanDisplayName = `Visitante ${randomUUID().slice(0, 4)}`;
      const created = await mutate(data => makeSession(data, { displayName: cleanDisplayName, guest: true }));
      return { token: created.token, maxAge: GUEST_SESSION_MS, profile: await publicProfile(created.session, null) };
    },

    async updateUsername(token, username) {
      const normalizedUsername = validateUsername(username);
      if (!normalizedUsername) throw Object.assign(new Error('Use um nome de usuário de 3 a 20 letras, números ou _, sem palavrões ou palavras obscenas.'), { status: 400 });
      const changed = await mutate(data => {
        const session = data.sessions.find(item => item.tokenHash === tokenDigest(token) && item.expiresAt > Date.now());
        if (!session) throw Object.assign(new Error('Sua sessão expirou. Entre de novo.'), { status: 401 });
        if (!session.accountId) throw Object.assign(new Error('Visitantes não podem alterar o nome de usuário.'), { status: 403 });
        const account = data.accounts.find(item => item.id === session.accountId);
        if (!account) throw Object.assign(new Error('Conta não encontrada.'), { status: 401 });
        if (data.accounts.some(item => item.id !== account.id && item.username === normalizedUsername)) {
          throw Object.assign(new Error('Esse nome de usuário já existe.'), { status: 409 });
        }
        account.username = normalizedUsername;
        delete account.displayName;
        for (const accountSession of data.sessions) {
          if (accountSession.accountId === account.id) delete accountSession.displayName;
        }
        return { session, account };
      });
      return publicProfile(changed.session, changed.account);
    },

    async logout(token) {
      if (typeof token !== 'string') return;
      await mutate(data => { data.sessions = data.sessions.filter(item => item.tokenHash !== tokenDigest(token)); });
    },

    async setRole(username, role) {
      const normalizedUsername = normalizeUsername(username);
      if (!normalizedUsername) throw Object.assign(new Error('Usuário inválido.'), { status: 400 });
      if (role !== 'admin' && role !== 'player') throw Object.assign(new Error('Perfil de conta inválido.'), { status: 400 });
      return mutate(data => {
        const account = data.accounts.find(item => item.username === normalizedUsername);
        if (!account) throw Object.assign(new Error('Conta não encontrada.'), { status: 404 });
        account.role = role;
        return { username: account.username, role };
      });
    },

    async listLodgingClaims() {
      const data = await readState();
      const sampledAt = Date.now();
      return data.lodgingClaims.filter(claim => claim.mode === 'owned' || claim.expiresAt > sampledAt)
        .map(claim => ({ ...claim }));
    },

    async findLodgingClaim(profileId, selector = {}) {
      if (typeof profileId !== 'string') return null;
      const data = await readState();
      const sampledAt = Date.now();
      const claim = data.lodgingClaims.find(item => item.profileId === profileId
        && (!selector.buildingId || item.buildingId === selector.buildingId)
        && (!selector.mode || item.mode === selector.mode) && (!selector.unitNumber || item.unitNumber === selector.unitNumber)
        && (item.mode === 'owned' || item.expiresAt > sampledAt));
      return claim ? { ...claim } : null;
    },

    async claimLodging({ profileId, buildingId, mode, unitCount, price, durationMs = null, additionalUnit = false }) {
      if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)) {
        throw Object.assign(new Error('Crie uma conta para reservar um quarto ou comprar uma propriedade.'), { status: 403 });
      }
      return mutate(data => {
        const sampledAt = Date.now();
        data.lodgingClaims = (data.lodgingClaims || [])
          .filter(claim => claim.mode === 'owned' || claim.expiresAt > sampledAt);
        const existing = additionalUnit ? null : data.lodgingClaims.find(claim => claim.profileId === profileId && claim.buildingId === buildingId && claim.mode === mode);
        const account = data.accounts.find(item => item.id === profileId);
        if (!account) throw Object.assign(new Error('A conta não está disponível para esta reserva.'), { status: 403 });
        if (existing) {
          if (existing.buildingId === buildingId && existing.mode === mode) {
            return { claim: { ...existing }, wallet: walletFor(account), alreadyClaimed: true };
          }
        }
        const capacity = Number.isSafeInteger(unitCount) ? Math.max(1, Math.min(100, unitCount)) : 0;
        const cost = Number.isSafeInteger(price) ? Math.max(0, price) : Number.MAX_SAFE_INTEGER;
        if (!capacity) throw Object.assign(new Error('Não há unidades disponíveis neste lugar.'), { status: 409 });
        const used = new Set(data.lodgingClaims
          .filter(claim => claim.buildingId === buildingId && claim.mode === mode)
          .map(claim => claim.unitNumber));
        let unitNumber = 1;
        while (used.has(unitNumber) && unitNumber <= capacity) unitNumber += 1;
        if (unitNumber > capacity) throw Object.assign(new Error('Todas as unidades deste lugar já foram reservadas.'), { status: 409 });
        const wallet = walletFor(account);
        const balance = currencyValue(wallet);
        if (balance < cost) throw Object.assign(new Error(`Faltam ${formatCoins(cost - balance)} para esta opção.`), { status: 402 });
        const nextWallet = walletFromValue(balance - cost);
        account.wallet = nextWallet;
        const claim = {
          profileId, buildingId, unitNumber, mode,
          expiresAt: mode === 'rent' ? sampledAt + Math.max(60_000, Number(durationMs) || 0) : null,
        };
        data.lodgingClaims.push(claim);
        return { claim: { ...claim }, wallet: { ...nextWallet }, alreadyClaimed: false };
      });
    },

    async getCabinKeys(profileId) {
      if (!profileId) return [];
      const data = await readState();
      return data.lodgingClaims.filter(claim => claim.mode === 'owned' && isCabin(claim.buildingId))
        .flatMap(claim => {
          const owner = data.accounts.find(account => account.id === claim.profileId);
          const isOwner = claim.profileId === profileId;
          if (!owner || (!isOwner && !owner.cabinKeys?.some(key => key.buildingId === claim.buildingId && key.profileId === profileId))) return [];
          return [{ buildingId: claim.buildingId, unitNumber: claim.unitNumber,
            ownerProfileId: claim.profileId, ownerName: owner.username, isOwner }];
        });
    },

    async getIssuedCabinKeys(ownerProfileId) {
      const data = await readState();
      const claim = data.lodgingClaims.find(claim => claim.profileId === ownerProfileId && claim.mode === 'owned' && isCabin(claim.buildingId));
      if (!claim) return [];
      return (data.accounts.find(account => account.id === ownerProfileId)?.cabinKeys || [])
        .filter(key => key.buildingId === claim.buildingId)
        .flatMap(key => {
          const holder = data.accounts.find(account => account.id === key.profileId);
          return holder ? [{ buildingId: key.buildingId, profileId: holder.id, username: holder.username }] : [];
        });
    },

    async setCabinKey({ ownerProfileId, buildingId, username, profileId, revoke = false }) {
      return mutate(data => {
        const owner = data.accounts.find(account => account.id === ownerProfileId);
        const claim = data.lodgingClaims.find(claim => claim.profileId === ownerProfileId && claim.buildingId === buildingId && claim.mode === 'owned');
        if (!owner || !claim || !isCabin(buildingId)) throw Object.assign(new Error('Só o dono pode entregar ou revogar chaves desta cabana.'), { status: 403 });
        const holder = data.accounts.find(account => revoke ? account.id === profileId : account.username === normalizeUsername(username));
        if (!holder) throw Object.assign(new Error('Não encontrei uma conta com esse nome de usuário.'), { status: 404 });
        if (holder.id === ownerProfileId) throw Object.assign(new Error('A chave do proprietário é permanente.'), { status: 400 });
        const keys = owner.cabinKeys || [];
        const exists = keys.some(key => key.buildingId === buildingId && key.profileId === holder.id);
        if (!revoke && !exists && keys.filter(key => key.buildingId === buildingId).length >= MAX_CABIN_KEYS)
          throw Object.assign(new Error(`Esta cabana já tem ${MAX_CABIN_KEYS} chaves compartilhadas.`), { status: 409 });
        owner.cabinKeys = keys.filter(key => key.buildingId !== buildingId || key.profileId !== holder.id);
        if (!revoke) owner.cabinKeys.push({ buildingId, profileId: holder.id });
        return { profileId: holder.id, username: holder.username, revoked: revoke };
      });
    },

    async creditWallet(profileId, amount) {
      if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)
          || !Number.isSafeInteger(amount) || amount < 1 || amount > 999_999) {
        throw Object.assign(new Error('Esta venda não pôde ser concluída.'), { status: 400 });
      }
      return mutate(data => {
        const account = data.accounts.find(item => item.id === profileId);
        if (!account) throw Object.assign(new Error('Crie uma conta para guardar as moedas.'), { status: 403 });
        const nextValue = currencyValue(walletFor(account)) + amount;
        if (nextValue > MAX_WALLET_VALUE) throw Object.assign(new Error('A carteira atingiu o limite técnico de armazenamento.'), { status: 409 });
        account.wallet = walletFromValue(nextValue);
        return { ...account.wallet };
      });
    },

    async debitWallet(profileId, amount) {
      if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)
          || !Number.isSafeInteger(amount) || amount < 1 || amount > 999_999) {
        throw Object.assign(new Error('Esta compra não pôde ser concluída.'), { status: 400 });
      }
      return mutate(data => {
        const account = data.accounts.find(item => item.id === profileId);
        if (!account) throw Object.assign(new Error('Crie uma conta para guardar as moedas.'), { status: 403 });
        const balance = currencyValue(walletFor(account));
        if (balance < amount) throw Object.assign(new Error(`Faltam ${formatCoins(amount - balance)} para esta compra.`), { status: 402 });
        account.wallet = walletFromValue(balance - amount);
        return { ...account.wallet };
      });
    },

    async getResourceContractState(profileId, dayKey = resourceContractDayKey()) {
      if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)) return normalizeResourceContractState(null, dayKey);
      const state = await readState();
      const account = state.accounts.find(item => item.id === profileId);
      return normalizeResourceContractState(account?.resourceContracts, dayKey);
    },

    async completeResourceContract({ profileId, contractId, dayKey }) {
      if (typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)
          || typeof contractId !== 'string' || !RESOURCE_CONTRACTS.some(item => item.id === contractId)
          || dayKey !== resourceContractDayKey()) {
        throw Object.assign(new Error('Esta encomenda não está disponível.'), { status:400 });
      }
      const contract = RESOURCE_CONTRACTS.find(item => item.id === contractId);
      return mutate(data => {
        const account = data.accounts.find(item => item.id === profileId);
        if (!account) throw Object.assign(new Error('Crie uma conta para guardar as moedas da encomenda.'), { status:403 });
        const state = normalizeResourceContractState(account.resourceContracts, dayKey);
        if (state.completed.includes(contractId)) throw Object.assign(new Error('Você já entregou esta encomenda hoje.'), { status:409 });
        const balance = currencyValue(walletFor(account));
        const nextValue = balance + contract.reward;
        if (nextValue > MAX_WALLET_VALUE) throw Object.assign(new Error('A carteira atingiu o limite técnico de armazenamento.'), { status:409 });
        const contractState = { dayKey, completed:[...state.completed, contractId] };
        account.wallet = walletFromValue(nextValue);
        account.resourceContracts = contractState;
        return { wallet:{ ...account.wallet }, contractState };
      });
    },

    getSession,
  };
}

export async function saveAccountProgress(directory, accountId, inventory) {
  if (typeof accountId !== 'string' || !/^[0-9a-f-]{36}$/i.test(accountId)) return;
  const values = validateInventory(inventory);
  for (const key of CURRENCY_KEYS) delete values[key];
  await atomicWriteJson(path.join(directory, 'progress', `${accountId}.json`), {
    version: 2,
    inventory: values,
  });
}
