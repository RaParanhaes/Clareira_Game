import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve('game/art/tree-sprites');
function pngSize(bytes){assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)}}

test('UV tree mesh atlases preserve runtime dimensions, species variants, palette states and wind rows',async()=>{
  const manifest=JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8'));
  assert.equal(manifest.source,'Blender UV-mapped low-poly tree catalog; frames rendered from articulated crown meshes');
  assert.deepEqual(pngSize(await readFile(resolve(root,'broadleaf-frames.png'))),{width:720,height:1456});
  assert.deepEqual(pngSize(await readFile(resolve(root,'pine-frames.png'))),{width:720,height:104});
  assert.deepEqual(pngSize(await readFile(resolve(root,'tree-material-uv-v1.png'))),{width:64,height:240});
  assert.equal(manifest.atlases.broadleaf.variants,7);assert.equal(manifest.atlases.broadleaf.warmRows,2);
  assert.equal(manifest.atlases.pine.variants,1);assert.equal(manifest.playback.mode,'mesh-wind-cycle');
  const files=await readdir(root);assert.ok(files.includes('tree-uv-catalog-v1.blend'));
  assert.ok((await readFile(resolve(root,'tree-uv-catalog-v1.blend'))).byteLength>100_000);
});
