import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyJsonImport, buildJsonImportPlan } from './json-import.mjs';
import { createDatabasePool } from './pool.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const source = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!source || process.argv.slice(2).some(argument => argument.startsWith('--') && argument !== '--apply')) {
    process.stderr.write('Uso: npm run db:import -- /caminho/dos/saves [--apply]\n');
    process.exitCode = 2;
  } else {
    let pool;
    try {
      const plan = await buildJsonImportPlan(source);
      if (apply) {
        if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL para aplicar a importação.');
        pool = createDatabasePool({ applicationName: 'clareira-json-import', max: 1 });
        await pool.query('SELECT 1 FROM schema_migrations LIMIT 1');
        await applyJsonImport(pool, plan);
      }
      process.stdout.write(JSON.stringify({
        status: apply ? 'imported' : 'dry_run',
        readOnly: !apply,
        counts: plan.counts,
      }, null, 2) + '\n');
    } catch (error) {
      process.stderr.write('Importação interrompida: ' + (error.code || error.message) + '\n');
      process.exitCode = 1;
    } finally {
      await pool?.end();
    }
  }
}
