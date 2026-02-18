import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import uraRoutes from './routes/ura.js';
import { initDashboard, getFullCacheInfo } from './services/uraService.js';

dotenv.config();
const __dirname = dirname(fileURLToPath(import.meta.url));

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
app.set('trust proxy', 1); // Trust first proxy (Railway/Vercel)
const PORT = process.env.PORT || 3001;

// ─── Security & Performance ───
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['*']; // In production, set ALLOWED_ORIGINS=https://yourdomain.com

app.use(cors({
  origin: ALLOWED_ORIGINS.includes('*') ? true : ALLOWED_ORIGINS,
}));
app.use(express.json({ limit: '100kb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ─── Read endpoint rate limiting (per IP, 120 req/min) ───
const ipHits = new Map();
const RATE_WINDOW = 60_000;
const RATE_LIMIT = 120;
setInterval(() => ipHits.clear(), RATE_WINDOW);
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET') return next();
  const ip = req.ip || req.connection.remoteAddress;
  const hits = (ipHits.get(ip) || 0) + 1;
  ipHits.set(ip, hits);
  if (hits > RATE_LIMIT) return res.status(429).json({ error: 'Rate limited — try again in a minute' });
  next();
});

// ─── API Routes ───
app.use('/api', uraRoutes);

// Health endpoint
app.get('/health', (req, res) => {
  const info = getFullCacheInfo();
  res.json({
    status: info.memory.hasDashboard ? 'ready' : 'loading',
    uptime: Math.round(process.uptime()),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1048576),
    cache: info,
  });
});

// ─── Static Frontend + Snapshot ───
const distPath = join(__dirname, '../../frontend/dist');

// snapshot.json gets short cache (5 min) so users get fresh data after a sync
app.get('/snapshot.json', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  next();
});

// Static assets (JS/CSS) get long cache, HTML gets no-cache
app.use(express.static(distPath, {
  maxAge: '7d',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// SPA catch-all — serves index.html for all non-API, non-file routes
app.get('*', (req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

// ─── Error handler (MUST be last middleware) ───
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ success: false, error: err.message });
});

// ─── Start ───
app.listen(PORT, async () => {
  console.log(`🚀 Server on port ${PORT}`);
  try {
    await initDashboard();
    console.log('✅ Ready to serve');
  } catch (err) {
    console.error('⚠️ Cache load failed:', err.message);
    console.log('   snapshot.json still serves dashboard if baked into build.');
    console.log('   API endpoints may be limited until URA data loads.');
  }
});
