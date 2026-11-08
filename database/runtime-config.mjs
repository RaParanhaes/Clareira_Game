import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Only CLI entry points load this private, preview-specific configuration.
// Imported server factories remain controlled entirely by their caller.
export async function loadBackendConfig({ file = fileURLToPath(new URL('../.local/preview-backend.json', import.meta.url)), environment = process.env } = {}) {
  const gate = fileURLToPath(new URL('../.local/preview-maintenance.json', import.meta.url));
  // Restarting the existing preview services drains their writes before the
  // migration snapshot. New processes wait here until conversion completes.
  for (;;) {
    try {
      const maintenance = JSON.parse(await readFile(gate, 'utf8'));
      if (maintenance.stateDirectory !== environment.STATE_DIRECTORY) break;
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  let config;
  try {
    const info = await stat(file);
    if (info.mode & 0o007) throw new Error('A configuração do banco não pode ser acessível a outros usuários.');
    config = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (!config.stateDirectory || config.stateDirectory !== environment.STATE_DIRECTORY) return;
  for (const key of ['DATABASE_URL', 'REDIS_URL']) {
    if (typeof config[key] !== 'string' || !config[key]) throw new Error('Configuração PostgreSQL/Redis incompleta.');
    if (environment[key] === undefined) environment[key] = config[key];
  }
}
