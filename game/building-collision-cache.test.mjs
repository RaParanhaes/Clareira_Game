import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_OBJECT_CATALOG as seed } from './object-catalog-seed.mjs';
import { editObjectCatalog } from './object-catalog.mjs';
import { applyObjectCatalog } from './object-state.mjs';
import { canOccupy } from './world.mjs';
import { VILLAGE_BUILDINGS } from './village-buildings.mjs';
import { buildingArchitecture } from './architectural-elements.mjs';

test('cached porch colliders follow catalog replacements, including same-revision data', () => {
  applyObjectCatalog(seed);
  const building = VILLAGE_BUILDINGS.find(b => b.kind === 'hotel');
  const post = buildingArchitecture(building).posts[0];
  const point = { x: (post.left + post.right) / 2, y: post.bottom + .15 };
  assert.equal(canOccupy(point), false);
  const changed = editObjectCatalog(seed, [{ action: 'archive', id: `building:${building.id}/post-0` }]);
  changed.revision = seed.revision;
  try {
    applyObjectCatalog(changed);
    assert.equal(canOccupy(point), true, 'removed pillar no longer blocks movement');
  } finally { applyObjectCatalog(seed); }
  assert.equal(canOccupy(point), false, 'restored pillar blocks again');
});
