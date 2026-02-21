/**
 * config/database.ts — PostgreSQL connection via Drizzle ORM
 *
 * Uses node-postgres Pool for connection management.
 * Provides typed Drizzle client for all DB operations.
 * Graceful shutdown on SIGTERM/SIGINT.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from './env.ts';
import * as schema from '../db/schema.ts';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Get or create the database connection pool and Drizzle client.
 * Safe to call multiple times — returns cached instance.
 */
export function getDb() {
  if (db) return db;

  if (!env.ENABLE_DB) {
    throw new Error('Database is disabled (ENABLE_DB=false). Use in-memory fallback.');
  }

  pool = new Pool({
    connectionString: env.DATABASE_URL,
    min: env.DB_POOL_MIN,
    max: env.DB_POOL_MAX,
    ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
  });

  db = drizzle(pool, { schema });
  return db;
}

/**
 * Get the raw pg Pool (for health checks, direct queries).
 */
export function getPool(): pg.Pool {
  if (!pool) getDb(); // Initialize pool
  return pool!;
}

/**
 * Check database connectivity. Returns latency in ms or throws.
 */
export async function pingDb(): Promise<number> {
  const start = Date.now();
  const client = await getPool().connect();
  try {
    await client.query('SELECT 1');
    return Date.now() - start;
  } finally {
    client.release();
  }
}

/**
 * Gracefully close the pool. Call on shutdown.
 */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
    console.log('[DB] Connection pool closed');
  }
}

export type Database = ReturnType<typeof getDb>;
