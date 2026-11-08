import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAccountStore } from './account-store.mjs';
import { LODGING_OFFER_BY_KEY } from '../game/lodging-catalog.mjs';

test('cabin ownership issues a permanent key; other accounts need a saved, revocable key', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clareira-cabin-keys-'));
  try {
    const store = createAccountStore({ directory });
    const owner = await store.register({ username: 'KeyOwner', password: 'key-test-password' });
    const friend = await store.register({ username: 'KeyFriend', password: 'key-test-password' });
    const outsider = await store.register({ username: 'KeyOutsider', password: 'key-test-password' });
    const buildingId = 'cabin-cedar-one';
    assert.deepEqual(await store.getCabinKeys(owner.profile.id), []);
    await store.creditWallet(owner.profile.id, 3200);
    await store.claimLodging({ profileId: owner.profile.id, ...LODGING_OFFER_BY_KEY.get(`${buildingId}:owned`) });
    assert.equal((await store.getCabinKeys(owner.profile.id))[0].isOwner, true);
    assert.deepEqual(await store.getCabinKeys(friend.profile.id), [], 'a friend has no implicit key');
    await assert.rejects(store.setCabinKey({ ownerProfileId: outsider.profile.id, buildingId, username: friend.profile.username }), /Só o dono/);
    await assert.rejects(store.setCabinKey({ ownerProfileId: owner.profile.id, buildingId: 'cabin-cedar-two', username: friend.profile.username }), /Só o dono/);
    await Promise.all([1, 2].map(() => store.setCabinKey({ ownerProfileId: owner.profile.id, buildingId, username: friend.profile.username })));
    assert.equal((await store.getIssuedCabinKeys(owner.profile.id)).length, 1, 'duplicate grants are idempotent');
    const fresh = createAccountStore({ directory });
    const key = (await fresh.getCabinKeys(friend.profile.id))[0];
    assert.equal(key.isOwner, false); assert.equal(key.ownerProfileId, owner.profile.id);
    assert.equal(await fresh.findLodgingClaim(friend.profile.id), null, 'the key never transfers ownership');
    await assert.rejects(fresh.setCabinKey({ ownerProfileId: owner.profile.id, buildingId, profileId: owner.profile.id, revoke: true }), /permanente/);
    await fresh.setCabinKey({ ownerProfileId: owner.profile.id, buildingId, profileId: friend.profile.id, revoke: true });
    assert.deepEqual(await createAccountStore({ directory }).getCabinKeys(friend.profile.id), []);
    assert.equal((await fresh.getCabinKeys(owner.profile.id))[0].isOwner, true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
