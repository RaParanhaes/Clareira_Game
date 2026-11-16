import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createJsonLairClaimStore } from './lair-claim-store.mjs';

test('JSON claim reserva, bloqueia recarga, libera e persiste entre instâncias', async t => {
  const directory=await mkdtemp(path.join(os.tmpdir(),'lair-claims-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const store=createJsonLairClaimStore(directory);
  const first=await store.reserve('profile-a','ninho',{actionId:'claim-0001',now:100,cooldownMs:1000});
  assert.deepEqual(first,{ok:true,availableAt:1100});
  assert.deepEqual(await store.reserve('profile-a','ninho',{actionId:'claim-0002',now:200,cooldownMs:1000}),{ok:false,reason:'recarregando',availableAt:1100});
  assert.equal(await store.release('profile-a','ninho','wrong-action'),false);
  assert.equal(await store.release('profile-a','ninho','claim-0001'),true);
  const second=createJsonLairClaimStore(directory);
  assert.deepEqual(await second.list('profile-a'),[]);
  assert.deepEqual(await second.reserve('profile-a','ninho',{actionId:'claim-0003',now:300,cooldownMs:1000}),{ok:true,availableAt:1300});
  assert.equal((await createJsonLairClaimStore(directory).list('profile-a'))[0].lastActionId,'claim-0003');
});
