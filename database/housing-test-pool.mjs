// Housing scenarios seed world/catalog state. Keep it outside the import test's
// deliberately empty database, even when node runs every integration file.
import {randomUUID} from 'node:crypto';
import {createDatabasePool} from './pool.mjs';
export async function createHousingTestPool(connectionString) {
  const admin=createDatabasePool({connectionString,max:1});
  const name='housing_'+randomUUID().replaceAll('-','');
  try { await admin.query(`CREATE DATABASE "${name}"`); }
  catch(error){await admin.end();throw error;}
  const url=new URL(connectionString);url.pathname='/'+name;
  const pool=createDatabasePool({connectionString:url.href,max:4});
  return {pool,databaseUrl:url.href,async close(){
    try{await pool.end();await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);}
    finally{await admin.end();}
  }};
}
