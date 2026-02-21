/**
 * routes/health.ts — Health check endpoints
 *
 * GET /api/health         — Quick liveness check
 * GET /api/health/ready   — Full readiness check (DB + Redis + Cache)
 */
import { Router, type Request, type Response } from 'express';
import { env } from '../config/env.ts';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    version: process.env.npm_package_version || '3.0.0',
  });
});

router.get('/ready', async (_req: Request, res: Response) => {
  const checks: Record<string, { status: string; latencyMs?: number; error?: string; details?: any }> = {};

  // Database check
  if (env.ENABLE_DB) {
    try {
      const { pingDb } = await import('../config/database.ts');
      const latency = await pingDb();
      checks.database = { status: 'ok', latencyMs: latency };
    } catch (err) {
      checks.database = { status: 'error', error: (err as Error).message };
    }
  } else {
    checks.database = { status: 'disabled' };
  }

  // Redis check
  if (env.ENABLE_REDIS_CACHE) {
    try {
      const { pingRedis } = await import('../config/redis.ts');
      const latency = await pingRedis();
      checks.redis = { status: 'ok', latencyMs: latency };
    } catch (err) {
      checks.redis = { status: 'error', error: (err as Error).message };
    }
  } else {
    checks.redis = { status: 'disabled' };
  }

  // Cache stats
  try {
    const { getCache } = await import('../services/cache-service.ts');
    const stats = await getCache().getStats();
    checks.cache = { status: 'ok', details: stats };
  } catch (err) {
    checks.cache = { status: 'error', error: (err as Error).message };
  }

  // Memory
  const mem = process.memoryUsage();
  checks.memory = {
    status: 'ok',
    details: {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
    },
  };

  // Auth status
  checks.auth = { status: env.ENABLE_AUTH ? 'enabled' : 'disabled' };

  // Overall status
  const hasError = Object.values(checks).some(c => c.status === 'error');
  const statusCode = hasError ? 503 : 200;

  res.status(statusCode).json({
    status: hasError ? 'degraded' : 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    checks,
    config: {
      nodeEnv: env.NODE_ENV,
      enableDb: env.ENABLE_DB,
      enableRedis: env.ENABLE_REDIS_CACHE,
      enableAuth: env.ENABLE_AUTH,
    },
  });
});

export default router;
