/**
 * config/redis.ts — Redis connection via ioredis
 *
 * Used for: caching, rate limiting, BullMQ job queue, session storage.
 * Auto-reconnects with exponential backoff.
 */
import Redis from 'ioredis';
import { env } from './env.ts';

let redis: Redis | null = null;

/**
 * Get or create Redis client. Safe to call multiple times.
 */
export function getRedis(): Redis {
  if (redis) return redis;

  redis = new Redis(env.REDIS_URL, {
    keyPrefix: env.REDIS_KEY_PREFIX,
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => {
      if (times > 10) return null; // Stop after 10 retries
      return Math.min(times * 200, 5000); // Exponential backoff, max 5s
    },
    lazyConnect: true,
    enableReadyCheck: true,
  });

  redis.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  redis.on('connect', () => {
    console.log('[Redis] Connected');
  });

  redis.on('ready', () => {
    console.log('[Redis] Ready');
  });

  return redis;
}

/**
 * Check Redis connectivity. Returns latency in ms.
 */
export async function pingRedis(): Promise<number> {
  const start = Date.now();
  const r = getRedis();
  await r.ping();
  return Date.now() - start;
}

/**
 * Gracefully close Redis. Call on shutdown.
 */
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    console.log('[Redis] Connection closed');
  }
}
