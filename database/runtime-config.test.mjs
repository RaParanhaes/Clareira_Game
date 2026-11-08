import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadBackendConfig} from './runtime-config.mjs';

test('private backend configuration is scoped to the preview and respects explicit environment',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'backend-config-'));
 try {
  const file=path.join(directory,'backend.json');
  await writeFile(file,JSON.stringify({stateDirectory:'/preview',DATABASE_URL:'postgres://local/test',REDIS_URL:'redis://local'}),{mode:0o600});
  const other={STATE_DIRECTORY:'/another'}; await loadBackendConfig({file,environment:other});assert.equal(other.DATABASE_URL,undefined);
  const current={STATE_DIRECTORY:'/preview',DATABASE_URL:'postgres://explicit/test'};
  await loadBackendConfig({file,environment:current});assert.equal(current.DATABASE_URL,'postgres://explicit/test');assert.equal(current.REDIS_URL,'redis://local');
  await writeFile(file,'broken');await assert.rejects(loadBackendConfig({file,environment:current}),SyntaxError);
 } finally {await rm(directory,{recursive:true,force:true});}
});
