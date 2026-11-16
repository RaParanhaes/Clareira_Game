import test from 'node:test';
import assert from 'node:assert/strict';
test('PostgreSQL lair claim reserve and release', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const {createDatabasePool}=await import('./pool.mjs');
  const {createLairClaimStore}=await import('./lair-claim-store.mjs');
  const pool=createDatabasePool({connectionString:process.env.TEST_DATABASE_URL});
  t.after(()=>pool.end());
  const store=createLairClaimStore(pool);
  const profileId=process.env.TEST_LAIR_PROFILE_ID;
  if(!profileId) return t.skip('TEST_LAIR_PROFILE_ID is required');
  const actionId=`test-${Date.now()}`;
  const result=await store.reserve(profileId,'ninho',{actionId,now:Date.now(),cooldownMs:60000});
  assert.equal(result.ok,true);
  assert.equal(await store.release(profileId,'ninho',actionId),true);
});
