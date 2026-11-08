// Pure pricing rules shared by the market, admin tooling and deterministic simulations.
// Values are bronze-denominated integer prices; this module has no storage side effects.
export const ECONOMY_POLICY = Object.freeze({
  smoothing: 0.30,
  demandWeight: 0.55,
  stockWeight: 0.45,
  minSignal: 0.50,
  maxSignal: 2.00,
  minBaseFactor: 0.55,
  maxBaseFactor: 1.80,
  maxPeriodChange: 0.30,
  tradeSpread: 0.15,
});

export const ECONOMY_RECIPES = Object.freeze({
  plank: Object.freeze({ timber: 4 }), // batch 20 timber -> 5 planks
  charcoal: Object.freeze({ timber: 20 / 6 }), // batch 20 timber -> 6 charcoal
  copperIngot: Object.freeze({ copperOre: 1, charcoal: 2 }),
  ironIngot: Object.freeze({ ironOre: 1, charcoal: 2 }),
});

export const GOVERNMENT_TAX_POLICY = Object.freeze({ smoothing: 0.20 });
export const MONEY_SUPPLY_POLICY = Object.freeze({
  sensitivity: 0.25, minFactor: 0.75, maxFactor: 1.50, smoothing: 0.20, maxDailyChange: 0.10,
});
export const BANK_INTEREST_POLICY = Object.freeze({ smoothingBps: 2000, maxDailyChangeBps: 100 });

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function integerAmount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/**
 * Calculate a bounded quote from reference price, relative completed demand and
 * eligible supply. Private inventory is deliberately supplied only as an
 * aggregate quantity, never as per-profile data.
 */
export function calculateDynamicQuote({
  basePrice,
  previousPrice = basePrice,
  recentUnitsSold = 0,
  expectedUnitsSold = 0,
  eligibleStock = 0,
  targetStock = 0,
  inputCost = 0,
  moneySupplyFactor = 1,
  policy = ECONOMY_POLICY,
}) {
  if (!Number.isSafeInteger(basePrice) || basePrice < 1) throw new TypeError('basePrice must be a positive integer');
  const demandRatio = expectedUnitsSold > 0
    ? clamp(integerAmount(recentUnitsSold) / expectedUnitsSold, policy.minSignal, policy.maxSignal)
    : 1;
  const stockRatio = targetStock > 0
    ? clamp(targetStock / Math.max(1, integerAmount(eligibleStock)), policy.minSignal, policy.maxSignal)
    : 1;
  const signal = clamp(policy.demandWeight * demandRatio + policy.stockWeight * stockRatio, policy.minSignal, policy.maxSignal);
  const monetaryFactor = Number.isFinite(moneySupplyFactor) ? clamp(moneySupplyFactor, 0.5, 2) : 1;
  const target = clamp(basePrice * signal * monetaryFactor, basePrice * policy.minBaseFactor, basePrice * policy.maxBaseFactor);
  const prior = Number.isSafeInteger(previousPrice) && previousPrice > 0 ? previousPrice : basePrice;
  const smoothed = Math.round(prior + (target - prior) * policy.smoothing);
  const periodMin = Math.ceil(prior * (1 - policy.maxPeriodChange));
  const periodMax = Math.floor(prior * (1 + policy.maxPeriodChange));
  const marketPrice = clamp(smoothed, periodMin, periodMax);
  const productionFloor = integerAmount(inputCost) > 0
    ? integerAmount(inputCost) + Math.ceil(basePrice * 0.08)
    : 0;
  const sellPrice = Math.max(1, marketPrice);
  const buyPrice = Math.max(1, Math.min(sellPrice, Math.round(sellPrice * (1 - policy.tradeSpread))));
  return Object.freeze({
    sellPrice,
    buyPrice,
    marketPrice,
    productionFloor,
    moneySupplyFactor: monetaryFactor,
    demandRatio,
    stockRatio,
    observedAt: new Date().toISOString(),
  });
}

/** Gradually adjusts the market price level to aggregate currency supply. */
export function calculateMoneySupplyPriceFactor({
  currentSupplyBronze, referenceSupplyBronze, previousFactor = 1, policy = MONEY_SUPPLY_POLICY,
}) {
  const asBigInt = value => {
    if (typeof value === 'bigint' && value >= 0n) return value;
    if (Number.isSafeInteger(value) && value >= 0) return BigInt(value);
    throw new TypeError('Money supply must be a non-negative integer in bronze.');
  };
  const supply = asBigInt(currentSupplyBronze), referenceInput = asBigInt(referenceSupplyBronze);
  if (!Number.isFinite(previousFactor) || previousFactor <= 0) throw new TypeError('Previous price factor must be positive.');
  const reference = referenceInput > 0n ? referenceInput : (supply > 0n ? supply : 1n);
  const ratio = Number((supply * 1_000_000n) / reference) / 1_000_000;
  if (!Number.isFinite(ratio)) throw new RangeError('Money supply ratio is outside the supported range.');
  if (!policy || !Number.isFinite(policy.sensitivity) || !Number.isFinite(policy.minFactor)
      || !Number.isFinite(policy.maxFactor) || !Number.isFinite(policy.smoothing)
      || !Number.isFinite(policy.maxDailyChange)) {
    throw new TypeError('Money supply policy is invalid.');
  }
  const targetFactor = clamp(Math.pow(Math.max(0.01, ratio), policy.sensitivity), policy.minFactor, policy.maxFactor);
  const smoothed = previousFactor + (targetFactor - previousFactor) * policy.smoothing;
  const bounded = clamp(smoothed, previousFactor * (1 - policy.maxDailyChange), previousFactor * (1 + policy.maxDailyChange));
  return Object.freeze({ referenceSupplyBronze: reference, ratio, targetFactor, priceFactor: Number(bounded.toFixed(6)) });
}

/**
 * Quote the rate for new loans from bank reserve and credit utilization.
 * Government treasuries and bank reserves remain outside circulating supply;
 * disbursed credit enters circulation only when it reaches a player's wallet.
 */
export function calculateBankInterestQuote({
  baseRateBps, minimumRateBps, maximumRateBps, reserveTargetBronze,
  reserveBalanceBronze, rateSensitivityBps, creditCapacityBps,
  outstandingCreditBronze = 0n, previousRateBps = baseRateBps,
  policy = BANK_INTEREST_POLICY,
}) {
  const whole = value => typeof value === 'bigint' && value >= 0n ? value
    : Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  const target = whole(reserveTargetBronze), reserve = whole(reserveBalanceBronze);
  const outstanding = whole(outstandingCreditBronze);
  if (![baseRateBps,minimumRateBps,maximumRateBps,rateSensitivityBps,creditCapacityBps,previousRateBps].every(Number.isSafeInteger)
      || target === null || reserve === null || outstanding === null
      || minimumRateBps < 0 || minimumRateBps > baseRateBps || baseRateBps > maximumRateBps || maximumRateBps > 10000
      || rateSensitivityBps < 0 || rateSensitivityBps > 10000 || creditCapacityBps < 0 || creditCapacityBps > 1_000_000
      || previousRateBps < 0 || previousRateBps > 10000
      || !Number.isSafeInteger(policy.smoothingBps) || policy.smoothingBps < 0 || policy.smoothingBps > 10000
      || !Number.isSafeInteger(policy.maxDailyChangeBps) || policy.maxDailyChangeBps < 0 || policy.maxDailyChangeBps > 10000) {
    throw new TypeError('Bank interest policy or balances are invalid.');
  }
  const capacity = reserve * BigInt(creditCapacityBps) / 10_000n;
  const utilization = capacity > 0n ? Math.min(1, Number(outstanding * 1_000_000n / capacity) / 1_000_000) : 0;
  const reserveRatio = target > 0n ? Number(reserve * 1_000_000n / target) / 1_000_000 : 1;
  const stress = clamp((target > 0n ? 1 - reserveRatio : 0) + utilization, -1, 1);
  const desiredRateBps = clamp(Math.round(baseRateBps + stress * rateSensitivityBps), minimumRateBps, maximumRateBps);
  const smoothedRateBps = Math.round(previousRateBps + (desiredRateBps - previousRateBps) * policy.smoothingBps / 10_000);
  const rateBps = clamp(smoothedRateBps, previousRateBps - policy.maxDailyChangeBps, previousRateBps + policy.maxDailyChangeBps);
  return Object.freeze({
    rateBps:clamp(rateBps,minimumRateBps,maximumRateBps),desiredRateBps,
    creditCapacityBronze:capacity,
    availableCreditBronze:capacity > outstanding ? capacity - outstanding : 0n,
    utilization,
  });
}

/** Domestic product value adds production value less intermediate inputs; a resale is not new GDP. */
export function calculateValueAdded({ outputValueBronze, intermediateInputCostBronze }) {
  const amount = value => typeof value === 'bigint' && value >= 0n ? value
    : Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  const output=amount(outputValueBronze), inputs=amount(intermediateInputCostBronze);
  if (output === null || inputs === null || inputs > output) throw new TypeError('Production values must be non-negative and inputs cannot exceed output.');
  return output-inputs;
}

/** The trade balance is a flow indicator; it does not itself create currency. */
export function calculateTradeBalance({ exportsBronze, importsBronze }) {
  const amount = value => typeof value === 'bigint' && value >= 0n ? value
    : Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  const exports=amount(exportsBronze), imports=amount(importsBronze);
  if (exports === null || imports === null) throw new TypeError('Trade totals must be non-negative integer bronzes.');
  return exports-imports;
}

/** Minimum contractual pay is checked in completed work shifts, not online time. */
export function calculateMinimumShiftPay({ minimumWageBronzePerShift, shifts, agreedGrossWageBronze }) {
  if (![minimumWageBronzePerShift,shifts,agreedGrossWageBronze].every(Number.isSafeInteger)
      || minimumWageBronzePerShift < 0 || shifts < 1 || agreedGrossWageBronze < 0) {
    throw new TypeError('Wage policy and completed shifts are invalid.');
  }
  const minimumGrossBronze=BigInt(minimumWageBronzePerShift)*BigInt(shifts);
  return Object.freeze({minimumGrossBronze,agreedGrossWageBronze:BigInt(agreedGrossWageBronze),
    compliant:BigInt(agreedGrossWageBronze)>=minimumGrossBronze});
}

/** Resolve recipe cost from a set of input quotes, retaining the base-price fallback. */
export function calculateInputCost(recipe, quotes, basePrices = {}) {
  if (!recipe || typeof recipe !== 'object') return 0;
  let total = 0;
  for (const [itemId, rawQuantity] of Object.entries(recipe)) {
    const quantity = Number(rawQuantity);
    const price = quotes[itemId]?.buyPrice ?? quotes[itemId]?.sellPrice ?? basePrices[itemId] ?? 0;
    if (!Number.isFinite(quantity) || quantity < 0 || !Number.isSafeInteger(price) || price < 0) return 0;
    total += Math.ceil(quantity * price);
  }
  return Math.ceil(total);
}

/** Reprice the next daily tax quote from government policy and treasury target. */
export function calculateGovernmentTaxRate({
  baseRateBps,
  minimumRateBps = 0,
  maximumRateBps = 10_000,
  treasuryTargetBronze = 0,
  treasuryBalanceBronze = 0,
  treasurySensitivityBps = 0,
  previousRateBps = baseRateBps,
  smoothing = GOVERNMENT_TAX_POLICY.smoothing,
}) {
  for (const value of [baseRateBps, minimumRateBps, maximumRateBps, treasurySensitivityBps]) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) throw new TypeError('Tax policy basis points must be integers from 0 to 10000');
  }
  if (minimumRateBps > maximumRateBps || baseRateBps < minimumRateBps || baseRateBps > maximumRateBps) {
    throw new RangeError('Tax rate must remain inside its government policy bounds');
  }
  if (!Number.isSafeInteger(treasuryTargetBronze) || treasuryTargetBronze < 0
      || !Number.isSafeInteger(treasuryBalanceBronze) || treasuryBalanceBronze < 0
      || !Number.isSafeInteger(previousRateBps) || previousRateBps < minimumRateBps || previousRateBps > maximumRateBps) {
    throw new TypeError('Treasury and previous tax quote values are invalid');
  }
  const treasuryGap = treasuryTargetBronze > 0
    ? clamp((treasuryTargetBronze - treasuryBalanceBronze) / treasuryTargetBronze, -1, 1)
    : 0;
  const desired = clamp(baseRateBps + Math.round(treasuryGap * treasurySensitivityBps), minimumRateBps, maximumRateBps);
  return clamp(Math.round(previousRateBps + (desired - previousRateBps) * smoothing), minimumRateBps, maximumRateBps);
}

/** Split a property price among its seller and governing treasury. */
export function calculatePropertyTransfer(priceBronze, taxRateBps) {
  if (!Number.isSafeInteger(priceBronze) || priceBronze < 1
      || !Number.isSafeInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10_000) {
    throw new TypeError('Property price and tax rate must be valid integer amounts');
  }
  const taxBronze = Math.floor(priceBronze * taxRateBps / 10_000);
  return Object.freeze({ priceBronze, taxBronze, sellerProceedsBronze: priceBronze - taxBronze });
}

/** Carry sub-bronze tax fractions between charges of the same government and tax. */
export function calculateTaxWithRemainder(grossBronze, taxRateBps, previousRemainder = 0) {
  if (!Number.isSafeInteger(grossBronze) || grossBronze < 0
      || !Number.isSafeInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10_000
      || !Number.isSafeInteger(previousRemainder) || previousRemainder < 0 || previousRemainder >= 10_000) {
    throw new TypeError('Tax amount, rate and remainder must be valid integer values');
  }
  const numerator = BigInt(grossBronze) * BigInt(taxRateBps) + BigInt(previousRemainder);
  const taxBronze = Number(numerator / 10_000n), remainderNumerator = Number(numerator % 10_000n);
  if (!Number.isSafeInteger(taxBronze)) throw new RangeError('Calculated tax exceeds the supported bronze balance');
  return Object.freeze({ taxBronze, remainderNumerator });
}
