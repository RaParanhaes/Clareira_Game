import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePrediction } from './prediction.mjs';
import { stepPlayer, SPAWN } from './world.mjs';

test('snapshots atrasados não repetem passos já confirmados e mantêm os pendentes',()=>{
  const commands=Array.from({length:30},(_,i)=>({seq:i+1,x:1,y:0}));
  let server={...SPAWN};
  for(const command of commands.slice(0,18))server=stepPlayer(server,command,1/60);
  let predicted={...SPAWN};for(const command of commands)predicted=stepPlayer(predicted,command,1/60);
  const result=reconcilePrediction({...server,inputSeq:18},commands,stepPlayer);
  assert.deepEqual(result.position,predicted);
  assert.equal(result.pending.length,12);
  assert.equal(result.pending[0].seq,19);
});
test('parada permanece parada depois da confirmação e bloqueios não são atravessados',()=>{
  const commands=Array.from({length:12},(_,i)=>({seq:i+1,x:0,y:0}));
  const result=reconcilePrediction({...SPAWN,inputSeq:6},commands,stepPlayer);
  assert.deepEqual(result.position,SPAWN);
});

test('a full prediction window recovers after missing progress, but tolerates normal RTT', async () => {
  const { shouldRecoverPrediction } = await import('./prediction.mjs');
  assert.equal(shouldRecoverPrediction(100, 1000, 3499), false);
  assert.equal(shouldRecoverPrediction(100, 1000, 3500), true);
  assert.equal(shouldRecoverPrediction(99, 1000, 9000), false);
  assert.equal(shouldRecoverPrediction(100, 3400, 3500), false);
  assert.equal(shouldRecoverPrediction(130, 1000, 4000, { maxPending:180, stalledMs:5000,
    pressureSince:2000, pressureThreshold:120, pressureMs:2500 }), false);
  assert.equal(shouldRecoverPrediction(130, 1000, 4500, { maxPending:180, stalledMs:5000,
    pressureSince:2000, pressureThreshold:120, pressureMs:2500 }), true,
  'repeated partial acknowledgements cannot keep a saturated prediction queue frozen forever');
});


test('a large recovering prediction window does not reconnect while ACKs keep advancing',async()=>{
 const {shouldRecoverPrediction}=await import('./prediction.mjs');
 const options={maxPending:180,stalledMs:5000,pressureSince:1000,pressureThreshold:120,pressureMs:2500};
 for(const now of [4000,5000,6000,7000])assert.equal(shouldRecoverPrediction(160,now-100,now,options),false);
 assert.equal(shouldRecoverPrediction(160,6000,7000,options),true,'real ACK silence under sustained pressure still recovers');
});
