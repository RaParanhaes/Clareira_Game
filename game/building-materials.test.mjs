import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {architectureUvMatrix} from './building-materials.mjs';

test('architecture UV coordinates map repeated material tiles across projected wall faces',()=>{
  const corners=[[10,20],[110,70],[115,170],[15,120]];
  const uv=architectureUvMatrix(corners,5,5,16,16);
  assert.deepEqual(uv,{a:1.25,b:.625,c:.0625,d:1.25,e:10,f:20});
  assert.equal(uv.a*16,100/5);assert.equal(uv.b*16,50/5);
  assert.equal(uv.c*16,5/5);assert.equal(uv.d*16,100/5);
});

test('architecture texture atlas contains wall, roof, daub and foundation UV cells',async()=>{
  const bytes=await readFile(new URL('./art/building-materials/architecture-uv-v1.png',import.meta.url));
  assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');
  const manifest=JSON.parse(await readFile(new URL('./art/building-materials/manifest.json',import.meta.url),'utf8'));
  assert.deepEqual(manifest.columns,['timber','masonry','shingles','foundation','daub','thatch']);
  assert.deepEqual(manifest.tileSize,[16,16]);
});
