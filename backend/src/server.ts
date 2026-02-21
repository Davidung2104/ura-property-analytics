/**
 * server.ts — Express application entry point (Phase 2 integrated)
 *
 * Feature-flagged infrastructure:
 *   ENABLE_DB=true    → PostgreSQL via Drizzle ORM
 *   ENABLE_REDIS_CACHE=true → Redis caching + BullMQ
 *   ENABLE_AUTH=true  → JWT authentication
 *
 * All features work with flags disabled (in-memory fallback).
 */
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

dotenv.config();
import { env } from './config/env.ts';

// Routes
import uraRoutes from './routes/ura.ts';
import authRoutes from './routes/auth.ts';
import healthRoutes from './routes/health.ts';

// Phase 3: Logging, Metrics, Error tracking
import { logger, requestLogger } from './shared/logger.ts';
import { metricsMiddleware, metricsEndpoint } from './shared/metrics.ts';
import { initSentry, sentryErrorHandler, flushSentry, captureException } from './config/sentry.ts';

// Services
import { initDashboard, buildDashboardData, getFullCacheInfo } from './services/uraService.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOOT_TIME = Date.now();

const app = express();
app.set('trust proxy', 1);

// ─── Security & Performance ───

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['*'];

app.use(cors({
  origin: ALLOWED_ORIGINS.includes('*') ? true : ALLOWED_ORIGINS,
  credentials: true,
}));

app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: '100kb' }));

// ─── Prometheus metrics (early — measures everything) ───

app.use(metricsMiddleware());

// ─── Structured request logging (Pino) ───

app.use(requestLogger());

// ─── Security headers ───

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// ─── Rate limiting (in-memory, upgradeable to Redis) ───

const ipHits = new Map<string, number>();
setInterval(() => ipHits.clear(), env.RATE_LIMIT_WINDOW_MS);

app.use('/api', (req, res, next) => {
  if (req.method !== 'GET') return next();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const hits = (ipHits.get(ip) || 0) + 1;
  ipHits.set(ip, hits);
  res.setHeader('X-RateLimit-Limit', String(env.RATE_LIMIT_MAX));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, env.RATE_LIMIT_MAX - hits)));
  if (hits > env.RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Rate limited', retryAfter: 60 });
  }
  next();
});

// ─── API Routes ───

app.get('/api/metrics', metricsEndpoint);
app.use('/api', uraRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/health', healthRoutes);

// ─── Legacy health endpoints (backward compatible) ───

app.get('/health/live', (_req, res) => {
  res.json({ status: 'alive', uptime: Math.round(process.uptime()) });
});

app.get('/health/ready', (_req, res) => {
  const info = getFullCacheInfo();
  const ready = (info as any).memory?.hasDashboard;
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'loading',
    hasDashboard: (info as any).memory?.hasDashboard,
    hasRealRental: (info as any).memory?.hasRealRental,
  });
});

app.get('/health', (_req, res) => {
  const info = getFullCacheInfo();
  const mem = process.memoryUsage();
  res.json({
    status: (info as any).memory?.hasDashboard ? 'ready' : 'loading',
    uptime: Math.round(process.uptime()),
    bootMs: Date.now() - BOOT_TIME,
    memoryMB: Math.round(mem.heapUsed / 1048576),
    rssMB: Math.round(mem.rss / 1048576),
    cache: info,
    features: { database: env.ENABLE_DB, redis: env.ENABLE_REDIS_CACHE, auth: env.ENABLE_AUTH },
    env: { nodeEnv: env.NODE_ENV, nodeVersion: process.version },
  });
});

// ─── Static Frontend ───

const distPath = join(__dirname, '../../frontend/dist');

app.get('/snapshot.json', (_req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  next();
});

app.use(express.static(distPath, {
  maxAge: '7d',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

app.get('*', (_req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

// ─── Error handling: Sentry first, then structured response ───

app.use(sentryErrorHandler());

app.use((err: any, req: any, res: any, _next: any) => {
  const errId = req.id || randomUUID().slice(0, 8);
  logger.error({ err, reqId: errId, method: req.method, url: req.url }, `Unhandled error [${errId}]`);
  captureException(err, { requestId: errId, url: req.url });
  res.status(err.status || 500).json({
    success: false,
    error: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    requestId: errId,
  });
});

// ─── Auto-refresh cron ───

const AUTO_REFRESH_HOURS = parseFloat(process.env.AUTO_REFRESH_HOURS || '0');
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

function scheduleAutoRefresh(): void {
  if (AUTO_REFRESH_HOURS <= 0) return;
  const ms = AUTO_REFRESH_HOURS * 3600000;
  logger.info({ intervalHours: AUTO_REFRESH_HOURS }, 'Auto-refresh scheduled');
  autoRefreshTimer = setInterval(async () => {
    try {
      await buildDashboardData(true);
      logger.info('Auto-refresh complete');
    } catch (err) {
      logger.error({ err }, 'Auto-refresh failed');
      captureException(err as Error, { context: 'auto-refresh' });
    }
  }, ms);
  if (autoRefreshTimer.unref) autoRefreshTimer.unref();
}

// ─── Infrastructure init ───

async function initInfrastructure(): Promise<void> {
  // Sentry (error tracking)
  await initSentry();

  // Database
  if (env.ENABLE_DB) {
    try {
      const { pingDb } = await import('./config/database.ts');
      const latency = await pingDb();
      logger.info({ latencyMs: latency }, 'PostgreSQL connected');
    } catch (err) {
      logger.error({ err }, 'PostgreSQL failed — using in-memory fallback');
    }
  } else {
    logger.info('Database disabled (ENABLE_DB=false)');
  }

  // Redis
  if (env.ENABLE_REDIS_CACHE) {
    try {
      const { getRedis } = await import('./config/redis.ts');
      const redis = getRedis();
      await redis.connect();
      logger.info('Redis connected');
    } catch (err) {
      logger.warn({ err }, 'Redis failed — using in-memory cache');
    }
  } else {
    logger.info('Redis disabled (ENABLE_REDIS_CACHE=false)');
  }

  logger.info({ auth: env.ENABLE_AUTH }, `Auth: ${env.ENABLE_AUTH ? 'enabled (JWT)' : 'disabled (dev-user bypass)'}`);
}

// ─── Graceful shutdown ───

let server: ReturnType<typeof app.listen>;

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down...');
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);

  if (server) server.close(() => logger.info('HTTP server closed'));

  try {
    await flushSentry(2000);
    if (env.ENABLE_DB) { const { closeDb } = await import('./config/database.ts'); await closeDb(); }
    if (env.ENABLE_REDIS_CACHE) { const { closeRedis } = await import('./config/redis.ts'); await closeRedis(); }
  } catch (err) { logger.warn({ err }, 'Cleanup error'); }

  setTimeout(() => { logger.warn('Forced exit (10s timeout)'); process.exit(1); }, 10000).unref();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection');
  captureException(reason instanceof Error ? reason : new Error(String(reason)));
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  captureException(err);
  setTimeout(() => process.exit(1), 1000).unref();
});

// ─── Start ───

server = app.listen(env.PORT, async () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV, bootMs: Date.now() - BOOT_TIME }, 'Server started');
  await initInfrastructure();

  try {
    const t0 = Date.now();
    await initDashboard();
    logger.info({ initMs: Date.now() - t0, totalMs: Date.now() - BOOT_TIME }, 'Data ready');
    scheduleAutoRefresh();
  } catch (err) {
    logger.error({ err }, 'Data init failed');
    captureException(err as Error, { context: 'init-dashboard' });
    scheduleAutoRefresh();
  }
});
