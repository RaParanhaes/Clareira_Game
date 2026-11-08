import { loadBackendConfig } from '../database/runtime-config.mjs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createStorageAdapter } from '../database/storage.mjs';

export async function setAccountRole({ username, role, stateDirectory = process.env.STATE_DIRECTORY || path.join(os.tmpdir(), 'clareira-dev'), databaseUrl = process.env.DATABASE_URL } = {}) {
  const storage = createStorageAdapter({ directory: stateDirectory, databaseUrl });
  try {
    await storage.ready();
    return await storage.accounts.setRole(username, role);
  } finally {
    await storage.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [, , username, role] = process.argv;
  if (!username || !role || process.argv.length !== 4) {
    process.stderr.write('Uso: node scripts/set-account-role.mjs USUÁRIO admin|player\n');
    process.exitCode = 2;
  } else {
    try {
      await loadBackendConfig();
      const updated = await setAccountRole({ username, role });
      process.stdout.write(`Conta @${updated.username}: perfil ${updated.role}.\n`);
    } catch (error) {
      process.stderr.write(`${error.message || 'Não foi possível atualizar o perfil da conta.'}\n`);
      process.exitCode = 1;
    }
  }
}
