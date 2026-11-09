// PostgreSQL store for per-room chests. Commits a new chest state only when the
// stored chest still matches the state the move was computed from, and records
// the action once. A repeated action id is reported, never applied twice.

export function roomChestId(roomKey, furnitureId) {
  return `${roomKey}:${furnitureId}`;
}

export async function ensureRoomChest(pool, { roomKey, furnitureId, ownerAccountId = null, capacity = 12 }) {
  const id = roomChestId(roomKey, furnitureId);
  await pool.query(
    `INSERT INTO room_chests (id, room_key, furniture_id, owner_account_id, capacity)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
    [id, roomKey, furnitureId, ownerAccountId, capacity],
  );
  return id;
}

export async function loadRoomChest(pool, chestId) {
  const chest = await pool.query('SELECT capacity FROM room_chests WHERE id = $1', [chestId]);
  if (!chest.rows[0]) return null;
  const slots = Array.from({ length: chest.rows[0].capacity }, () => null);
  const rows = await pool.query(
    'SELECT slot, item_id, quantity FROM room_chest_slots WHERE chest_id = $1 ORDER BY slot',
    [chestId],
  );
  for (const row of rows.rows) slots[row.slot] = { itemId: row.item_id, quantity: row.quantity };
  return { capacity: chest.rows[0].capacity, slots };
}

const sameChest = (a, b) => JSON.stringify(a.slots) === JSON.stringify(b.slots);

// Applies one chest move. `expected` is the chest the move was computed from;
// `next` is the result of the pure transfer rules in game/room-chest.mjs.
export async function commitRoomChestMove(pool, {
  actionId, chestId, profileId, direction, itemId, quantity, expected, next,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lock = await client.query('SELECT capacity FROM room_chests WHERE id = $1 FOR UPDATE', [chestId]);
    if (!lock.rows[0]) { await client.query('ROLLBACK'); return { ok: false, reason: 'bau-inexistente' }; }
    const already = await client.query('SELECT action_id FROM room_chest_ledger WHERE action_id = $1', [actionId]);
    if (already.rows[0]) { await client.query('ROLLBACK'); return { ok: false, reason: 'acao-repetida' }; }
    const current = await loadWithin(client, chestId, lock.rows[0].capacity);
    if (!sameChest(current, expected)) { await client.query('ROLLBACK'); return { ok: false, reason: 'conflito' }; }
    await client.query('DELETE FROM room_chest_slots WHERE chest_id = $1', [chestId]);
    for (const [slot, stack] of next.slots.entries()) {
      if (stack) {
        await client.query(
          'INSERT INTO room_chest_slots (chest_id, slot, item_id, quantity) VALUES ($1, $2, $3, $4)',
          [chestId, slot, stack.itemId, stack.quantity],
        );
      }
    }
    await client.query('UPDATE room_chests SET updated_at = now() WHERE id = $1', [chestId]);
    await client.query(
      `INSERT INTO room_chest_ledger (action_id, chest_id, profile_id, direction, item_id, quantity)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actionId, chestId, profileId, direction, itemId, quantity],
    );
    await client.query('COMMIT');
    return { ok: true };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function loadWithin(client, chestId, capacity) {
  const slots = Array.from({ length: capacity }, () => null);
  const rows = await client.query(
    'SELECT slot, item_id, quantity FROM room_chest_slots WHERE chest_id = $1 ORDER BY slot',
    [chestId],
  );
  for (const row of rows.rows) slots[row.slot] = { itemId: row.item_id, quantity: row.quantity };
  return { capacity, slots };
}

// Bound store for the storage adapter: every function uses the same pool.
export function createRoomChestStore(pool) {
  return {
    ensureRoomChest: args => ensureRoomChest(pool, args),
    loadRoomChest: chestId => loadRoomChest(pool, chestId),
    commitRoomChestMove: args => commitRoomChestMove(pool, args),
  };
}
