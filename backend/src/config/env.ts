/**
 * config/env.ts — Zod-validated environment configuration
 * Fails fast at startup if required vars are missing.
 * Provides typed access to all config values.
 */
import { z } from 'zod';

const envSchema = z.object({
  // ── Server ──
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_BASE: z.string().default('/api'),

  // ── PostgreSQL ──
  DATABASE_URL: z.string().url().startsWith('postgres').describe('PostgreSQL connection string'),
  DB_POOL_MIN: z.coerce.number().int().min(0).default(2),
  DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
  DB_SSL: z.coerce.boolean().default(false),

  // ── Redis ──
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_KEY_PREFIX: z.string().default('ura:'),

  // ── URA API ──
  URA_ACCESS_KEY: z.string().min(1).describe('URA API access key'),
  URA_BASE_URL: z.string().url().default('https://www.ura.gov.sg/uraDataService'),

  // ── JWT Auth ──
  JWT_SECRET: z.string().min(32).describe('JWT signing secret (≥32 chars)'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // ── Rate Limiting ──
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),

  // ── Cache TTL (seconds) ──
  CACHE_DASHBOARD_TTL: z.coerce.number().int().min(60).default(3600),      // 1 hour
  CACHE_PROJECT_TTL: z.coerce.number().int().min(60).default(1800),        // 30 min
  CACHE_SEARCH_TTL: z.coerce.number().int().min(10).default(300),          // 5 min

  // ── BullMQ ──
  INGESTION_CRON: z.string().default('0 3 * * *'),  // 3am daily
  INGESTION_CONCURRENCY: z.coerce.number().int().min(1).default(1),

  // ── Logging ──
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // ── Error Tracking ──
  SENTRY_DSN: z.string().url().optional(),

  // ── Feature flags ──
  ENABLE_AUTH: z.coerce.boolean().default(false),       // Gradual rollout
  ENABLE_REDIS_CACHE: z.coerce.boolean().default(true),
  ENABLE_DB: z.coerce.boolean().default(false),         // false = in-memory fallback
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate environment.
 * In development, missing DB/Redis vars fall back to defaults via ENABLE_* flags.
 */
function loadEnv(): Env {
  // Relaxed parsing for dev: allow missing DATABASE_URL/JWT_SECRET if features disabled
  const raw = { ...process.env };

  // Provide safe defaults for optional infra in dev mode
  if (!raw.DATABASE_URL && raw.ENABLE_DB !== 'true') {
    raw.DATABASE_URL = 'postgres://localhost:5432/ura_dev';
  }
  if (!raw.JWT_SECRET && raw.ENABLE_AUTH !== 'true') {
    raw.JWT_SECRET = 'dev-secret-minimum-32-characters-long!!';
  }
  if (!raw.URA_ACCESS_KEY) {
    raw.URA_ACCESS_KEY = raw.URA_ACCESS_KEY || 'missing-set-URA_ACCESS_KEY';
  }

  const result = envSchema.safeParse(raw);
  if (!result.success) {
    console.error('❌ Environment validation failed:');
    for (const issue of result.error.issues) {
      console.error(`   ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
