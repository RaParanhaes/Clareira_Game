import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSkyOverrideCache, loadSkyOverrides, saveSkyOverrides } from './sky-overrides-store.mjs';
import { createOverride } from './world-overrides.mjs';

test('a permanent override survives a save and a reload, with its end time restored', () => {
 const dir = mkdtempSync(path.join(tmpdir(), 'sky-'));
 try {
  const file = path.join(dir, 'sky-overrides.json');
  const permanent = createOverride({ key: 'moonColor', value: '#d9573a', scope: 'permanent' }, Date.UTC(2026, 10, 9));
  saveSkyOverrides(file, [permanent]);
  const [loaded] = loadSkyOverrides(file);
  assert.equal(loaded.key, 'moonColor');
  assert.equal(loaded.endsAt, Infinity);
 } finally {
  rmSync(dir, { recursive: true, force: true });
 }
});

test('a missing or broken file means no overrides', () => {
 const dir = mkdtempSync(path.join(tmpdir(), 'sky-'));
 try {
  assert.deepEqual(loadSkyOverrides(path.join(dir, 'missing.json')), []);
  const broken = path.join(dir, 'broken.json');
  saveSkyOverrides(broken, []);
  assert.deepEqual(loadSkyOverrides(broken), []);
 } finally {
  rmSync(dir, { recursive: true, force: true });
 }
});

test('the cache sees a change made by another process', () => {
 const dir = mkdtempSync(path.join(tmpdir(), 'sky-'));
 try {
  const file = path.join(dir, 'sky-overrides.json');
  const cache = createSkyOverrideCache(file);
  assert.deepEqual(cache.current(), []);
  saveSkyOverrides(file, [createOverride({ key: 'darkness', value: 0.8, scope: 'permanent' }, Date.UTC(2026, 10, 9))]);
  assert.equal(cache.current()[0].key, 'darkness');
 } finally {
  rmSync(dir, { recursive: true, force: true });
 }
});
