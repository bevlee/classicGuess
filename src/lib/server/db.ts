import pg from 'pg';
import { DATABASE_URL } from '$app/env/private';
import { error } from '@sveltejs/kit';
let pool: pg.Pool | undefined;
export function database(): pg.Pool {
  if (!DATABASE_URL) error(503, 'Daily challenges are not configured yet. Practice is available.');
  if (!pool) {
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
    pool.on('error', () => { console.error('An idle Postgres connection failed.'); });
  }
  return pool;
}
