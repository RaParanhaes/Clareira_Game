import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDatabasePool } from './pool.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.join(here, 'migrations');
const MIGRATION_LOCK_ID = 1128352845;

function describeMigration(filename) {
  const match = /^(\d{3})_([a-z0-9_-]+)\.sql$/.exec(filename);
  if (!match) throw new Error('Nome de migração inválido: ' + filename);
  return { version: Number(match[1]), name: match[2] };
}

export async function runMigrations(pool, { directory = migrationsDirectory } = {}) {
  const client = await pool.connect();
  const applied = [];
  let locked = false;
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    locked = true;
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (" +
      "version integer PRIMARY KEY CHECK (version > 0), " +
      "name text NOT NULL UNIQUE, " +
      "checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'), " +
      "applied_at timestamptz NOT NULL DEFAULT now())",
    );
    await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text');
    const filenames = (await readdir(directory))
      .filter(filename => filename.endsWith('.sql'))
      .sort();
    let previousVersion = 0;
    for (const filename of filenames) {
      const { version, name } = describeMigration(filename);
      if (version <= previousVersion) throw new Error('Versões de migração precisam ser únicas e crescentes.');
      previousVersion = version;
      const sql = await readFile(path.join(directory, filename), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const prior = await client.query(
        'SELECT name, checksum FROM schema_migrations WHERE version = $1',
        [version],
      );
      if (prior.rowCount) {
        if (prior.rows[0].name !== name || prior.rows[0].checksum !== checksum) {
          throw new Error('Migração ' + filename + ' diverge da versão já aplicada; restaure o arquivo original e crie outra migração.');
        }
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
          [version, name, checksum],
        );
        await client.query('COMMIT');
        applied.push({ version, name });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return { applied, migrations: filenames.length };
  } finally {
    if (locked) {
      try { await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]); }
      catch { /* The database closes session locks when this connection ends. */ }
    }
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.env.DATABASE_URL) {
    process.stderr.write('Defina DATABASE_URL para executar as migrações.\n');
    process.exitCode = 2;
  } else {
    const pool = createDatabasePool({ applicationName: 'clareira-migrations', max: 1 });
    try {
      await pool.query('SELECT 1');
      const result = await runMigrations(pool);
      process.stdout.write(result.applied.length + ' migração(ões) aplicada(s); ' + result.migrations + ' encontrada(s).\n');
    } catch (error) {
      process.stderr.write('Falha na migração PostgreSQL: ' + (error.code || error.message) + '\n');
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  }
}
