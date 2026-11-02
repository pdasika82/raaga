import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { config } from './config.ts';

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
export async function migrate() {
  await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
}
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await fn(client);
    await client.query('COMMIT');
    return value;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

/** Session lock protects external effects even if BullMQ retries a stalled job concurrently. */
export async function withAttemptLock<T>(namespace: string, id: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const key = `${namespace}-${id}`;
  try {
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [key]);
    return await fn(client);
  } finally {
    try { await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [key]); }
    finally { client.release(); }
  }
}
