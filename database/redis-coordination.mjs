import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';

const CLAIM_SCRIPT = `
if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2]) then
  redis.call('SET', KEYS[2], ARGV[3], 'PX', ARGV[2])
  return 1
end
return 0
`;

const HEARTBEAT_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('PEXPIRE', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], ARGV[3], 'PX', ARGV[2])
return 1
`;

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1], KEYS[2])
return 1
`;

function keysFor(playerId) {
  const tag = `{player:${encodeURIComponent(playerId)}}`;
  return [`clareira:v1:${tag}:lease`, `clareira:v1:${tag}:presence`];
}

export function createRedisCoordination({
  url = process.env.REDIS_URL,
  client: providedClient,
  serverId = process.env.GAME_SERVER_ID || randomUUID(),
  leaseTtlMs = 15_000,
} = {}) {
  if (!Number.isSafeInteger(leaseTtlMs) || leaseTtlMs < 1_000) {
    throw new Error('leaseTtlMs precisa ser um inteiro de pelo menos 1000 ms.');
  }
  if (!providedClient && (typeof url !== 'string' || !url.trim())) {
    return {
      enabled: false,
      serverId,
      async ready() {},
      async claimPlayer() { return null; },
      async getPlayerPresence() { return null; },
      async heartbeat() { return new Set(); },
      async close() {},
    };
  }

  const client = providedClient || createClient({
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 3_000,
      reconnectStrategy: retries => retries > 5 ? new Error('Redis reconnect limit reached.') : Math.min(retries * 100, 3_000),
    },
  });
  const ownsClient = !providedClient;
  const registrations = new Map();
  let connecting;
  let heartbeatRunning = false;
  client.on?.('error', error => {
    process.stderr.write(`Redis coordination error: ${error.code || 'connection'}\n`);
  });

  const waitUntilReady = () => new Promise((resolve, reject) => {
    const finish = error => {
      clearTimeout(timer);
      client.off('ready', onReady);
      client.off('error', onError);
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => finish();
    const onError = error => finish(error);
    const timer = setTimeout(() => finish(new Error('Redis did not become ready in time.')), 3_000);
    client.once('ready', onReady);
    client.once('error', onError);
  });

  const ready = async () => {
    if (client.isReady) return;
    if (connecting) return connecting;
    if (client.isOpen) return waitUntilReady();
    const attempt = client.connect();
    connecting = attempt;
    try { await attempt; }
    finally { if (connecting === attempt) connecting = null; }
  };

  const presenceFor = registration => JSON.stringify({
    playerId: registration.playerId,
    sessionId: registration.sessionId,
    serverId,
    contextId: registration.contextId,
    location: registration.location,
    connectedAt: registration.connectedAt,
    lastSeenAt: Date.now(),
  });

  const claimPlayer = async ({ playerId, sessionId = randomUUID(), contextId = 'dimension.surface/place.clearing', location = 'clearing' }) => {
    if (typeof playerId !== 'string' || !playerId || typeof sessionId !== 'string' || !sessionId) {
      throw new Error('playerId e sessionId são obrigatórios para reservar presença.');
    }
    await ready();
    const [leaseKey, presenceKey] = keysFor(playerId);
    const registration = {
      playerId,
      sessionId,
      leaseKey,
      presenceKey,
      token: randomUUID(),
      contextId,
      location,
      connectedAt: Date.now(),
      released: false,
    };
    const claimed = await client.eval(CLAIM_SCRIPT, {
      keys: [leaseKey, presenceKey],
      arguments: [registration.token, String(leaseTtlMs), presenceFor(registration)],
    });
    if (Number(claimed) !== 1) return null;
    registrations.set(sessionId, registration);

    return {
      sessionId,
      update(context) {
        if (registration.released || !context || typeof context !== 'object') return;
        if (typeof context.contextId === 'string') registration.contextId = context.contextId;
        if (typeof context.location === 'string') registration.location = context.location;
      },
      async release() {
        if (registration.released) return;
        registration.released = true;
        registrations.delete(sessionId);
        if (!client.isReady) return;
        await client.eval(RELEASE_SCRIPT, {
          keys: [leaseKey, presenceKey],
          arguments: [registration.token],
        });
      },
    };
  };

  const heartbeat = async () => {
    if (heartbeatRunning || registrations.size === 0) return new Set();
    heartbeatRunning = true;
    const lostSessions = new Set();
    try {
      await ready();
      const results = await Promise.all([...registrations.values()].map(async registration => {
        try {
          const renewed = await client.eval(HEARTBEAT_SCRIPT, {
            keys: [registration.leaseKey, registration.presenceKey],
            arguments: [registration.token, String(leaseTtlMs), presenceFor(registration)],
          });
          return Number(renewed) === 1 ? null : registration.sessionId;
        } catch {
          // A Redis outage is not proof that this lease was replaced. Keep
          // the registration and retry on the next heartbeat; an expired or
          // replaced lease is reported by HEARTBEAT_SCRIPT returning zero.
          return null;
        }
      }));
      for (const sessionId of results) {
        if (!sessionId) continue;
        lostSessions.add(sessionId);
        const registration = registrations.get(sessionId);
        if (registration) {
          registration.released = true;
          registrations.delete(sessionId);
        }
      }
      return lostSessions;
    } finally {
      heartbeatRunning = false;
    }
  };

  const getPlayerPresence = async playerId => {
    await ready();
    const [, presenceKey] = keysFor(playerId);
    const value = await client.get(presenceKey);
    if (!value) return null;
    try { return JSON.parse(value); }
    catch { return null; }
  };

  return {
    enabled: true,
    serverId,
    ready,
    claimPlayer,
    getPlayerPresence,
    heartbeat,
    async close() {
      await Promise.allSettled([...registrations.values()].map(async registration => {
        const [leaseKey, presenceKey] = [registration.leaseKey, registration.presenceKey];
        registration.released = true;
        await client.eval(RELEASE_SCRIPT, {
          keys: [leaseKey, presenceKey],
          arguments: [registration.token],
        });
      }));
      registrations.clear();
      if (ownsClient && client.isOpen) await client.quit();
    },
  };
}
