import { calculateTaxWithRemainder } from '../game/economy.mjs';

/** Calculate and store a government's fractional bronze tax carry inside the caller's transaction. */
export async function accumulateGovernmentTax(client, { governmentId, taxCode, grossBronze, rateBps }) {
  if (typeof governmentId !== 'string' || !governmentId || typeof taxCode !== 'string' || !taxCode) {
    throw new TypeError('A government and tax code are required to collect tax.');
  }
  await client.query(
    'INSERT INTO government_tax_remainders(government_id,tax_code,remainder_numerator) VALUES($1,$2,0) ON CONFLICT DO NOTHING',
    [governmentId, taxCode],
  );
  const current = await client.query(
    'SELECT remainder_numerator FROM government_tax_remainders WHERE government_id=$1 AND tax_code=$2 FOR UPDATE',
    [governmentId, taxCode],
  );
  if (!current.rowCount) throw new Error('Could not lock the government tax remainder.');
  const result = calculateTaxWithRemainder(grossBronze, rateBps, Number(current.rows[0].remainder_numerator));
  await client.query(
    'UPDATE government_tax_remainders SET remainder_numerator=$3,updated_at=now() WHERE government_id=$1 AND tax_code=$2',
    [governmentId, taxCode, result.remainderNumerator],
  );
  return result;
}
