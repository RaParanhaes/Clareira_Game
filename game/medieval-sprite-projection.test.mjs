import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MEDIEVAL_SPRITE_PROJECTION as p,medievalSpriteDestination} from './medieval-sprite-projection.mjs';

test('sprite pivot and ground basis match measurements from the actual Blender camera',()=>{
  assert.ok(Math.abs(p.anchor.x-64)<1e-4);
  assert.ok(Math.abs(p.anchor.y-89.57807159423828)<1e-4);
  assert.ok(Math.abs(p.canonicalTileX-12.92995071411133)<1e-4);
  assert.ok(Math.abs(p.canonicalTileY-8.750383377075195)<1e-4);
  assert.ok(Math.abs(p.canonicalHeight-13.46213150024414)<1e-4);
});

test('baked ground positions map to room coordinates at every zoom without moving the pivot',()=>{
  for(const tileX of [16,24,32,48]){
    const tileY=tileX/2,ground={x:350,y:400};
    const rect=medievalSpriteDestination(ground,tileX,tileY);
    const scaleX=rect.width/128,scaleY=rect.height/128;
    assert.ok(Math.abs(rect.x+p.anchor.x*scaleX-ground.x)<1);
    assert.ok(Math.abs(rect.y+p.anchor.y*scaleY-ground.y)<1);
    assert.ok(Math.abs(p.canonicalTileX*scaleX-tileX)<.06);
    assert.ok(Math.abs(p.canonicalTileY*scaleY-tileY)<.04);
  }
});

test('the export contract and shipped manifest retain the same measured projection',async()=>{
  for(const file of ['manifest.json','catalog.json']){
    const d=JSON.parse(await readFile(new URL(`./art/room-furniture/medieval-3d-v1/${file}`,import.meta.url),'utf8'));
    assert.deepEqual(d.anchor,p.anchor);assert.equal(d.canonicalTileX,p.canonicalTileX);assert.equal(d.canonicalTileY,p.canonicalTileY);
  }
});
