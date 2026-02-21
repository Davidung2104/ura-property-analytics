/**
 * services/cache-service.ts — Unified caching layer
 *
 * Redis-backed when ENABLE_REDIS_CACHE=true, in-memory Map fallback otherwise.
 * Provides: get/set/del/invalidatePattern with TTL support.
 * Used by: dashboard, project, search endpoints.
 *
 * Key naming convention:
 *   dash:{filterHash}       — dashboard data
 *   proj:{projectName}      — project detail
 *   search:sales:{hash}     — sales search results
 *   search:rental:{hash}    — rental search results
 *   filter-opts             — filter dropdown options
 */
import { env } from '../config/env.ts';
import { getRedis } from '../config/redis.ts';
import type Redis from 'ioredis';
import { createHash } from 'crypto';

// ── In-memory fallback ──
const memCache = new Map<string, { data: string; expiresAt: number }>();

function memGet(key: string): string | null {
  const entry = memCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memCache.delete(key);
    return null;
  }
  return entry.data;
}

function memSet(key: string, data: string, ttlSec: number): void {
  // Cap in-memory cache at 200 entries (LRU-ish: evict oldest on overflow)
  if (memCache.size > 200) {
    const first = memCache.keys().next().value;
    if (first) memCache.delete(first);
  }
  memCache.set(key, { data, expiresAt: Date.now() + ttlSec * 1000 });
}

function memDel(key: string): void {
  memCache.delete(key);
}

function memInvalidatePattern(pattern: string): number {
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  let count = 0;
  for (const key of memCache.keys()) {
    if (regex.test(key)) {
      memCache.delete(key);
      count++;
    }
  }
  return count;
}

// ── Public API ──

export class CacheService {
  private redis: Redis | null = null;
  private useRedis: boolean;

  constructor() {
    this.useRedis = env.ENABLE_REDIS_CACHE;
    if (this.useRedis) {
      try {
        this.redis = getRedis();
      } catch {
        console.warn('[Cache] Redis unavailable, falling back to in-memory');
        this.useRedis = false;
      }
    }
  }

  /**
   * Get cached value by key. Returns parsed JSON or null.
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const raw = this.useRedis && this.redis
        ? await this.redis.get(key)
        : memGet(key);

      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      console.warn(`[Cache] GET ${key} failed:`, (err as Error).message);
      return null;
    }
  }

  /**
   * Set value with TTL (in seconds).
   */
  async set(key: string, data: unknown, ttlSec: number): Promise<void> {
    try {
      const json = JSON.stringify(data);
      if (this.useRedis && this.redis) {
        await this.redis.setex(key, ttlSec, json);
      } else {
        memSet(key, json, ttlSec);
      }
    } catch (err) {
      console.warn(`[Cache] SET ${key} failed:`, (err as Error).message);
    }
  }

  /**
   * Delete a specific key.
   */
  async del(key: string): Promise<void> {
    try {
      if (this.useRedis && this.redis) {
        await this.redis.del(key);
      } else {
        memDel(key);
      }
    } catch (err) {
      console.warn(`[Cache] DEL ${key} failed:`, (err as Error).message);
    }
  }

  /**
   * Invalidate all keys matching a pattern (e.g. "dash:*", "proj:*").
   * Redis: uses SCAN to avoid blocking. In-memory: regex match.
   */
  async invalidatePattern(pattern: string): Promise<number> {
    try {
      if (this.useRedis && this.redis) {
        // Use SCAN for non-blocking pattern deletion
        let cursor = '0';
        let count = 0;
        const fullPattern = env.REDIS_KEY_PREFIX + pattern;
        do {
          const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', fullPattern, 'COUNT', 100);
          cursor = nextCursor;
          if (keys.length > 0) {
            // Strip prefix since ioredis auto-adds it
            const stripped = keys.map(k => k.replace(env.REDIS_KEY_PREFIX, ''));
            await this.redis.del(...stripped);
            count += keys.length;
          }
        } while (cursor !== '0');
        return count;
      } else {
        return memInvalidatePattern(pattern);
      }
    } catch (err) {
      console.warn(`[Cache] INVALIDATE ${pattern} failed:`, (err as Error).message);
      return 0;
    }
  }

  /**
   * Invalidate all dashboard caches (after filter change or data refresh).
   */
  async invalidateDashboard(): Promise<void> {
    await this.invalidatePattern('dash:*');
    await this.del('filter-opts');
  }

  /**
   * Invalidate all project caches.
   */
  async invalidateProjects(): Promise<void> {
    await this.invalidatePattern('proj:*');
  }

  /**
   * Invalidate everything (after full data refresh).
   */
  async invalidateAll(): Promise<void> {
    await this.invalidatePattern('*');
  }

  /**
   * Get cache stats (for health endpoint).
   */
  async getStats(): Promise<{ type: string; keys?: number; memoryUsed?: string }> {
    if (this.useRedis && this.redis) {
      try {
        const info = await this.redis.info('keyspace');
        const dbLine = info.match(/db0:keys=(\d+)/);
        const memInfo = await this.redis.info('memory');
        const memLine = memInfo.match(/used_memory_human:(.+)/);
        return {
          type: 'redis',
          keys: dbLine?.[1] ? parseInt(dbLine[1]) : 0,
          memoryUsed: memLine?.[1] ? memLine[1].trim() : 'unknown',
        };
      } catch {
        return { type: 'redis', keys: 0, memoryUsed: 'unavailable' };
      }
    }
    return { type: 'memory', keys: memCache.size };
  }
}

// ── Singleton ──
let _cache: CacheService | null = null;
export function getCache(): CacheService {
  if (!_cache) _cache = new CacheService();
  return _cache;
}

// ── Helpers ──

/**
 * Create a stable hash key from filter params.
 * Used for dashboard + search cache keys.
 */
export function hashFilters(filters: Record<string, unknown>): string {
  const sorted = JSON.stringify(filters, Object.keys(filters).sort());
  return createHash('md5').update(sorted).digest('hex').slice(0, 12);
}
