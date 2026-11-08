import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTRY_COPY_VARIANTS, getDailyEntryCopy } from './entry-copy.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('entry copy stays stable in one browser for the day', () => {
  const storage = memoryStorage();
  const date = new Date(2026, 9, 8, 12);
  const first = getDailyEntryCopy(storage, date, () => 0.6);
  const repeat = getDailyEntryCopy(storage, new Date(2026, 9, 8, 23), () => { throw new Error('should reuse saved copy'); });

  assert.equal(repeat, first);
});

test('entry copy changes on the next day without repeating the previous line', () => {
  const storage = memoryStorage();
  const first = getDailyEntryCopy(storage, new Date(2026, 9, 8), () => 0);
  const next = getDailyEntryCopy(storage, new Date(2026, 9, 9), () => 0);

  assert.notEqual(next, first);
  assert.ok(ENTRY_COPY_VARIANTS.includes(next));
});

test('entry copy still works when browser storage is unavailable', () => {
  const blockedStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const copy = getDailyEntryCopy(blockedStorage, new Date(2026, 9, 8), () => 0.99);

  assert.equal(copy, ENTRY_COPY_VARIANTS.at(-1));
});
