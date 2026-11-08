// Aggregates follow the government recorded on each transaction. A settlement
// is an administrative area; it is not a substitute for geographic territory.
export function createPropertyMarketStatisticsStore(pool) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('PostgreSQL é necessário para consultar o mercado.');

  return {
    async getPropertyMarketStatistics({ from, to, dimensionId = null, settlementId = null } = {}) {
      const start = new Date(from), end = new Date(to);
      const validId = value => value === null || (typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(value));
      if (!from || !to || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end
          || !validId(dimensionId) || !validId(settlementId) || (settlementId !== null && dimensionId === null)) {
        throw Object.assign(new Error('Informe período e área válidos para consultar o mercado.'), { status: 400 });
      }
      const { rows } = await pool.query(`
        WITH governments AS (
          SELECT government_id FROM world_governments
          WHERE ($3::text IS NULL OR world_id = $3) AND ($4::text IS NULL OR settlement_id = $4)
        ), listed AS (
          SELECT count(*)::text AS count, COALESCE(sum(asking_price_bronze), 0)::text AS value
          FROM property_market_listings WHERE government_id IN (SELECT government_id FROM governments)
        ), sales AS (
          SELECT count(*)::text AS count, COALESCE(sum(gross_price_bronze), 0)::text AS value,
                 COALESCE(sum(tax_bronze), 0)::text AS tax
          FROM property_transfer_records WHERE government_id IN (SELECT government_id FROM governments)
            AND transferred_at >= $1 AND transferred_at < $2
        ), rentals AS (
          SELECT count(*) FILTER (WHERE status = 'active' AND next_charge_at > now())::text AS active
          FROM lodging_leases WHERE government_id IN (SELECT government_id FROM governments)
        ), charges AS (
          SELECT count(*)::text AS count, COALESCE(sum(c.rent_bronze), 0)::text AS value,
                 COALESCE(sum(c.tax_bronze), 0)::text AS tax
          FROM lodging_lease_charges c JOIN lodging_leases l ON l.lease_id = c.lease_id
          WHERE l.government_id IN (SELECT government_id FROM governments) AND c.status = 'paid'
            AND c.processed_at >= $1 AND c.processed_at < $2
        )
        SELECT listed.count AS listings, listed.value AS listed_value,
          sales.count AS sales, sales.value AS sales_value, sales.tax AS sales_tax,
          rentals.active AS active_leases, charges.count AS rental_payments,
          charges.value AS rental_value, charges.tax AS rental_tax
        FROM listed, sales, rentals, charges`, [start, end, dimensionId, settlementId]);
      const row = rows[0];
      return {
        from: start.toISOString(), to: end.toISOString(), dimensionId, settlementId,
        listings: row.listings, listedValueBronze: row.listed_value,
        sales: row.sales, salesValueBronze: row.sales_value, salesTaxBronze: row.sales_tax,
        activeLeases: row.active_leases, rentalPayments: row.rental_payments,
        rentalValueBronze: row.rental_value, rentalTaxBronze: row.rental_tax,
      };
    },
  };
}
