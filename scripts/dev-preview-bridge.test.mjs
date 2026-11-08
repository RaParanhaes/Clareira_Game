import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createDevPreviewBridge} from './dev-preview-bridge.mjs';

test('the dev bridge preserves the browser host and origin for same-origin checks',async t=>{
  const preview=http.createServer((request,response)=>response.end(JSON.stringify({
    host:request.headers.host,origin:request.headers.origin,
  })));
  await new Promise(resolve=>preview.listen(0,'127.0.0.1',resolve));
  const bridge=createDevPreviewBridge(preview.address(),{port:0});
  t.after(()=>new Promise(resolve=>preview.close(resolve)));
  t.after(()=>bridge.close());
  const address=await bridge.listen(),origin=`http://127.0.0.1:${address.port}`;
  const response=await fetch(`${origin}/dev/health`,{headers:{origin}});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{host:`127.0.0.1:${address.port}`,origin});
});
