import { Pool } from 'pg';

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export function createDatabasePool({
  connectionString = process.env.DATABASE_URL,
  max = boundedInteger(process.env.PG_POOL_MAX, 10, 1, 100),
  applicationName = 'clareira-game',
} = {}) {
  if (typeof connectionString !== 'string' || !connectionString.trim()) {
    throw new Error('DATABASE_URL precisa apontar para o PostgreSQL.');
  }
  const pool = new Pool({
    connectionString,
    max,
    application_name: applicationName,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
  });
  pool.on('error', error => {
    process.stderr.write('PostgreSQL pool error: ' + (error.code || 'connection') + '\n');
  });
  return pool;
}
