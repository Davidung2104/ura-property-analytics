import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import uraRoutes from './routes/ura.js';
import { initDashboard, buildDashboardData, getFullCacheInfo } from './services/uraService.js';

dotenv.config();
const __dirname = dirname(fileURLToPath(import.meta.url));
const BOOT_TIME = Date.now();

// ─── Env Validation ───
const REQUIRED_ENV = ['URA_ACCESS_KEY'];
const RECOMMENDED_ENV = ['ADMIN_KEY', 'ALLOWED_ORIGINS'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ FATAL: Missing required env var ${key}`);
    process.exit(1);
  }
}
for (const key of RECOMMENDED_ENV) {
  if (!process.env[key]) console.warn(`⚠️  Missing recommended env var ${key}`);
}

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// ─── Security & Performance ───
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['*'];

app.use(cors({
  origin: ALLOWED_ORIGINS.includes('*') ? true : ALLOWED_ORIGINS,
}));

// Response compression (gzip) — ~70% smaller payloads
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: '100kb' }));

// ─── Request ID for log correlation ───
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || randomUUID().slice(0, 8);
  res.setHeader('X-Request-Id', req.id);
  next();
});

// ─── Security headers ───
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // HSTS: force HTTPS for 1 year (behind TLS proxy)
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");
  next();
});

// ─── Read endpoint rate limiting (per IP) ───
const ipHits = new Map();
const RATE_WINDOW = 60_000;
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT) || 120;
setInterval(() => ipHits.clear(), RATE_WINDOW);
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET') return next();
  const ip = req.ip || req.connection.remoteAddress;
  const hits = (ipHits.get(ip) || 0) + 1;
  ipHits.set(ip, hits);
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT - hits));
  if (hits > RATE_LIMIT) return res.status(429).json({ error: 'Rate limited', retryAfter: 60 });
  next();
});

// ─── Request logging (lightweight, no external dependency) ───
app.use((req, res, next) => {
  if (req.url.startsWith('/assets/') || req.url.endsWith('.js') || req.url.endsWith('.css')) return next();
  const start = Date.now();
  const origEnd = res.end;
  res.end = function (...args) {
    const ms = Date.now() - start;
    if (req.url.startsWith('/api') || ms > 500) {
      const icon = res.statusCode >= 500 ? '❌' : res.statusCode >= 400 ? '⚠️' : '→';
      console.log(`${icon} ${req.method} ${req.url} ${res.statusCode} ${ms}ms [${req.id}]`);
    }
    origEnd.apply(res, args);
  };
  next();
});

// ─── API Routes ───
app.use('/api', uraRoutes);

// ─── Health endpoints (K8s / Railway compatible) ───
app.get('/health/live', (req, res) => {
  res.json({ status: 'alive', uptime: Math.round(process.uptime()) });
});

app.get('/health/ready', (req, res) => {
  const info = getFullCacheInfo();
  const ready = info.memory.hasDashboard;
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'loading',
    hasDashboard: info.memory.hasDashboard,
    hasRealRental: info.memory.hasRealRental,
  });
});

app.get('/health', (req, res) => {
  const info = getFullCacheInfo();
  const mem = process.memoryUsage();
  res.json({
    status: info.memory.hasDashboard ? 'ready' : 'loading',
    uptime: Math.round(process.uptime()),
    bootMs: Date.now() - BOOT_TIME,
    memoryMB: Math.round(mem.heapUsed / 1048576),
    rssMB: Math.round(mem.rss / 1048576),
    cache: info,
    env: {
      nodeVersion: process.version,
      hasAdminKey: !!process.env.ADMIN_KEY,
      hasCors: ALLOWED_ORIGINS[0] !== '*',
      autoRefreshHours: process.env.AUTO_REFRESH_HOURS || 'disabled',
      cacheTTL: process.env.CACHE_TTL_HOURS || 'manual',
    },
  });
});

// ─── Static Frontend + Snapshot ───
const distPath = join(__dirname, '../../frontend/dist');

app.get('/snapshot.json', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  next();
});

app.use(express.static(distPath, {
  maxAge: '7d',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

app.get('*', (req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

// ─── Error handler ───
app.use((err, req, res, _next) => {
  const errId = req.id || randomUUID().slice(0, 8);
  console.error(`❌ Error [${errId}]:`, err.message);
  if (process.env.NODE_ENV !== 'production') console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    requestId: errId,
  });
});

// ─── Auto-refresh cron (set AUTO_REFRESH_HOURS=24 in Railway) ───
const AUTO_REFRESH_HOURS = parseFloat(process.env.AUTO_REFRESH_HOURS) || 0;
let autoRefreshTimer = null;

function scheduleAutoRefresh() {
  if (AUTO_REFRESH_HOURS <= 0) return;
  const ms = AUTO_REFRESH_HOURS * 3600000;
  console.log(`⏰ Auto-refresh scheduled every ${AUTO_REFRESH_HOURS}h`);
  autoRefreshTimer = setInterval(async () => {
    console.log('⏰ Auto-refresh triggered');
    try {
      await buildDashboardData(true);
      console.log('⏰ Auto-refresh complete');
    } catch (err) {
      console.error('⏰ Auto-refresh failed:', err.message);
    }
  }, ms);
  if (autoRefreshTimer.unref) autoRefreshTimer.unref();
}

// ─── Graceful shutdown ───
let server;

function gracefulShutdown(signal) {
  console.log(`\n🛑 ${signal} — shutting down...`);
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  if (server) {
    server.close(() => {
      console.log('✅ HTTP server closed');
      process.exit(0);
    });
    setTimeout(() => { console.warn('⚠️ Forced exit (10s timeout)'); process.exit(1); }, 10000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (reason) => console.error('❌ Unhandled rejection:', reason));
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err);
  // Node docs: process state is unreliable after uncaught exception — always exit
  // Allow 1s for log flush before forced exit
  setTimeout(() => process.exit(1), 1000).unref();
});

// ─── Start ───
server = app.listen(PORT, async () => {
  console.log(`🚀 Server on port ${PORT} (boot: ${Date.now() - BOOT_TIME}ms)`);
  try {
    const t0 = Date.now();
    await initDashboard();
    console.log(`✅ Ready (init: ${Date.now() - t0}ms, total: ${Date.now() - BOOT_TIME}ms)`);
    scheduleAutoRefresh();
  } catch (err) {
    console.error('⚠️ Init failed:', err.message);
    console.log('   snapshot.json still serves if baked. API limited until data loads.');
    scheduleAutoRefresh();
  }
});
