import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventory, inventoryFromRows } from './inventory.mjs';
import { CURRENCY_QUANTITY_LIMITS, MAX_WALLET_VALUE, currencyValue, walletFromValue } from './lodging-catalog.mjs';
import { validateInventory } from '../scripts/account-store.mjs';

test('staff-sized wallet values survive inventory snapshots and database row hydration', () => {
  const value = 10_000_123;
  const wallet = walletFromValue(value);
  assert.deepEqual(wallet, { gold: 1000, silver: 1, bronze: 23 });
  for (const inventory of [createInventory(wallet), validateInventory(wallet), inventoryFromRows([
    { itemId: 'gold', quantity: wallet.gold },
    { itemId: 'silver', quantity: wallet.silver },
    { itemId: 'bronze', quantity: wallet.bronze },
  ])]) {
    assert.deepEqual({ gold: inventory.gold, silver: inventory.silver, bronze: inventory.bronze }, wallet);
  }
});

test('currency limits match integer storage and wallet normalization rejects overflow', () => {
  assert.equal(CURRENCY_QUANTITY_LIMITS.gold, 2_147_483_647);
  assert.equal(walletFromValue(MAX_WALLET_VALUE).gold, CURRENCY_QUANTITY_LIMITS.gold);
  assert.deepEqual(walletFromValue(MAX_WALLET_VALUE), { gold: CURRENCY_QUANTITY_LIMITS.gold, silver: 99, bronze: 99 });
  assert.throws(() => walletFromValue(MAX_WALLET_VALUE + 1), RangeError);
  assert.equal(createInventory({ gold: CURRENCY_QUANTITY_LIMITS.gold + 1 }).gold, CURRENCY_QUANTITY_LIMITS.gold);
  const legacyWallet = { gold: 0, silver: 125, bronze: 250 };
  for (const inventory of [createInventory(legacyWallet), validateInventory(legacyWallet), inventoryFromRows(
    Object.entries(legacyWallet).map(([itemId, quantity]) => ({ itemId, quantity })),
  )]) {
    assert.equal(currencyValue(inventory), 12_750, 'legacy denominations must retain their total value');
  }
  assert.deepEqual(walletFromValue(currencyValue(legacyWallet)), { gold: 1, silver: 27, bronze: 50 });
});
