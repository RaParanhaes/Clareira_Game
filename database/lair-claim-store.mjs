import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';

const valid = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/i.test(value);
const profileKey = value => createHash('sha256').update(String(value)).digest('hex');

export function createLairClaimStore(pool) {
  return {
    async list(profileId) {
      const { rows } = await pool.query('SELECT lair_id, claimed_at, available_at, claim_count, last_action_id FROM lair_treasure_claims WHERE profile_id = $1', [profileId]);
      return rows.map(row => ({ lairId: row.lair_id, claimedAt: new Date(row.claimed_at).getTime(), availableAt: new Date(row.available_at).getTime(), claimCount: row.claim_count, lastActionId: row.last_action_id }));
    },
    async reserve(profileId, lairId, { actionId, now = Date.now(), cooldownMs }) {
      if (!valid(lairId) || !Number.isFinite(now) || !Number.isFinite(cooldownMs) || cooldownMs < 0) throw new Error('Invalid lair claim');
      const availableAt = now + cooldownMs;
      const { rows } = await pool.query(`INSERT INTO lair_treasure_claims (profile_id,lair_id,claimed_at,available_at,claim_count,last_action_id)
        VALUES ($1,$2,to_timestamp($3/1000.0),to_timestamp($4/1000.0),1,$5)
        ON CONFLICT (profile_id,lair_id) DO UPDATE SET claimed_at=EXCLUDED.claimed_at, available_at=EXCLUDED.available_at,
          claim_count=lair_treasure_claims.claim_count+1, last_action_id=EXCLUDED.last_action_id
        WHERE lair_treasure_claims.available_at <= EXCLUDED.claimed_at
        RETURNING available_at`, [profileId, lairId, now, availableAt, actionId]);
      return rows[0] ? { ok: true, availableAt } : { ok: false, reason: 'recarregando', availableAt: null };
    },
    async release(profileId, lairId, actionId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query('SELECT claim_count, claimed_at FROM lair_treasure_claims WHERE profile_id=$1 AND lair_id=$2 AND last_action_id=$3 FOR UPDATE', [profileId, lairId, actionId]);
        if (!rows[0]) { await client.query('COMMIT'); return false; }
        if (rows[0].claim_count <= 1) await client.query('DELETE FROM lair_treasure_claims WHERE profile_id=$1 AND lair_id=$2 AND last_action_id=$3', [profileId, lairId, actionId]);
        else await client.query('UPDATE lair_treasure_claims SET available_at=claimed_at, claim_count=claim_count-1 WHERE profile_id=$1 AND lair_id=$2 AND last_action_id=$3', [profileId, lairId, actionId]);
        await client.query('COMMIT'); return true;
      } catch (error) { await client.query('ROLLBACK').catch(()=>{}); throw error; }
      finally { client.release(); }
    },
  };
}

export function createJsonLairClaimStore(directory) {
  const file = path.join(directory, 'lair-claims.json');
  const writes = new Map();
  const read = async () => { try { const data = JSON.parse(await readFile(file, 'utf8')); return data?.version === 1 && data.claims ? data.claims : {}; } catch (error) { if (error.code === 'ENOENT') return {}; throw error; } };
  const write = async claims => { await mkdir(directory, { recursive: true, mode: 0o700 }); const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`; await writeFile(tmp, `${JSON.stringify({ version: 1, claims })}\n`, { mode: 0o600, flag: 'wx' }); await chmod(tmp, 0o600); await rename(tmp, file); };
  const enqueue = (key, action) => { const prev = writes.get(key) || Promise.resolve(); const next = prev.catch(()=>{}).then(action); writes.set(key,next); return next.finally(()=>{ if(writes.get(key)===next)writes.delete(key); }); };
  return {
    async list(profileId) { return Object.entries(await read()).filter(([key])=>key.startsWith(`${profileKey(profileId)}:`)).map(([,claim])=>({...claim})); },
    reserve(profileId, lairId, { actionId, now = Date.now(), cooldownMs }) {
      if (!valid(lairId) || !Number.isFinite(now) || !Number.isFinite(cooldownMs) || cooldownMs < 0) throw new Error('Invalid lair claim');
      const key = `${profileKey(profileId)}:${lairId}`;
      return enqueue('file', async () => { const claims = await read(); const current = claims[key];
        if (current && current.availableAt > now) return { ok: false, reason: 'recarregando', availableAt: current.availableAt };
        const claim = { lairId, claimedAt: now, availableAt: now + cooldownMs, claimCount: (current?.claimCount || 0) + 1, lastActionId: actionId };
        claims[key] = claim; await write(claims); return { ok: true, availableAt: claim.availableAt };
      });
    },
    release(profileId, lairId, actionId) {
      const key = `${profileKey(profileId)}:${lairId}`;
      return enqueue('file', async () => { const claims = await read(); const claim = claims[key]; if (!claim || claim.lastActionId !== actionId) return false;
        if (claim.claimCount <= 1) delete claims[key]; else { claim.availableAt = claim.claimedAt; claim.claimCount -= 1; }
        await write(claims); return true;
      });
    },
  };
}
