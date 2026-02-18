import express from 'express';
import { buildDashboardData, buildFilteredDashboard, getProjectData, getTokenInfo, getCacheInfo, getFullCacheInfo, refreshToken, searchSales, searchRental, getFilterOptions } from '../services/uraService.js';
import { getUser, saveUser } from '../services/userStore.js';

const router = express.Router();

/**
 * GET /api/dashboard — ALL chart data in one call (~50KB)
 * This is the main endpoint the frontend uses
 */
router.get('/dashboard', async (req, res, next) => {
  try {
    const data = await buildDashboardData();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/**
 * GET /api/dashboard/filtered — Filtered dashboard data
 * Query: district, year, segment, propertyType, tenure
 * Returns same shape as /api/dashboard but filtered from in-memory stores.
 * No URA API calls — runs in <50ms on cached data.
 */
router.get('/dashboard/filtered', async (req, res, next) => {
  try {
    const { district, year, segment, propertyType, tenure } = req.query;
    const filters = {};
    if (district && district !== 'all') filters.district = district;
    if (year && year !== 'all') filters.year = year;
    if (segment && segment !== 'all') filters.segment = segment;
    if (propertyType && propertyType !== 'all') filters.propertyType = propertyType;
    if (tenure && tenure !== 'all') filters.tenure = tenure;

    // If no filters, return normal dashboard
    if (Object.keys(filters).length === 0) {
      const data = await buildDashboardData();
      return res.json({ success: true, data });
    }

    const data = buildFilteredDashboard(filters);
    if (!data) {
      return res.status(404).json({ success: false, error: 'No data matches filters. Try broadening your selection.' });
    }
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/**
 * GET /api/sales/search — Paginated sales transaction search
 * Query: q, district, segment, type, tenure, page, limit, sort
 */
router.get('/sales/search', async (req, res, next) => {
  try {
    const { q, district, segment, type, tenure, page, limit, sort } = req.query;
    const data = await searchSales({
      q, district, segment, type, tenure,
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 50, 200),
      sort: sort || 'date_desc',
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/**
 * GET /api/rental/search — Paginated rental transaction search
 * Query: q, district, segment, page, limit, sort
 */
router.get('/rental/search', async (req, res, next) => {
  try {
    const { q, district, segment, page, limit, sort } = req.query;
    const data = await searchRental({
      q, district, segment,
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 50, 200),
      sort: sort || 'date_desc',
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/**
 * GET /api/filters — Available filter options
 */
router.get('/filters', async (req, res, next) => {
  try {
    await buildDashboardData(); // ensure loaded
    res.json({ success: true, data: getFilterOptions() });
  } catch (err) { next(err); }
});

/**
 * GET /api/project/:name — Project-level detail
 */
router.get('/project/:name', async (req, res, next) => {
  try {
    const data = await getProjectData(decodeURIComponent(req.params.name));
    if (!data) return res.status(404).json({ success: false, error: 'Project not found' });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/**
 * GET /api/stats — Health check
 */
router.get('/stats', (req, res) => {
  const mem = process.memoryUsage();
  const cacheInfo = getFullCacheInfo();
  res.json({
    token: getTokenInfo(),
    cache: cacheInfo,
    memory: { heapMB: Math.round(mem.heapUsed/1e6), rssMB: Math.round(mem.rss/1e6) },
    uptime: Math.round(process.uptime()) + 's',
  });
});

/**
 * POST /api/refresh — Force rebuild (protected)
 * Requires ADMIN_KEY env var, sent as ?key=xxx or Authorization header
 * Rate limited: 1 refresh per 5 minutes
 */
let lastRefreshTime = 0;
let refreshInProgress = false;
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

router.post('/refresh', async (req, res, next) => {
  const adminKey = process.env.ADMIN_KEY;
  // Reject if no ADMIN_KEY configured — don't default to open
  if (!adminKey) {
    return res.status(403).json({ success: false, error: 'ADMIN_KEY not configured — refresh disabled' });
  }
  const provided = req.query.key || req.headers.authorization?.replace('Bearer ', '');
  if (provided !== adminKey) {
    return res.status(403).json({ success: false, error: 'Invalid admin key' });
  }
  // Mutex: reject if already refreshing
  if (refreshInProgress) {
    return res.status(409).json({ success: false, error: 'Refresh already in progress — please wait' });
  }
  // Rate limit
  const now = Date.now();
  if (now - lastRefreshTime < REFRESH_COOLDOWN_MS) {
    const waitSec = Math.ceil((REFRESH_COOLDOWN_MS - (now - lastRefreshTime)) / 1000);
    return res.status(429).json({ success: false, error: `Rate limited — try again in ${waitSec}s` });
  }
  lastRefreshTime = now;
  refreshInProgress = true;
  try {
    await buildDashboardData(true);
    res.json({ success: true, message: 'Cache rebuilt' });
  } catch (err) { next(err); }
  finally { refreshInProgress = false; }
});

/**
 * POST /api/refresh-token
 */
router.post('/refresh-token', async (req, res, next) => {
  try {
    await refreshToken();
    res.json({ success: true, token: getTokenInfo() });
  } catch (err) { next(err); }
});

// Legacy endpoints (redirect to dashboard)
router.get('/transactions', async (req, res, next) => {
  try {
    const data = await buildDashboardData();
    res.json({ success: true, data: data.mktSaleTx });
  } catch (err) { next(err); }
});

router.get('/districts/summary', async (req, res, next) => {
  try {
    const data = await buildDashboardData();
    res.json({ success: true, data: data.sDistBar });
  } catch (err) { next(err); }
});

router.get('/property-types/summary', async (req, res, next) => {
  try {
    const data = await buildDashboardData();
    res.json({ success: true, data: data.sType });
  } catch (err) { next(err); }
});

// ═══ USER DATA (portfolio + saved searches) ═══

/**
 * GET /api/user/:id — load user portfolio + saved searches
 */
router.get('/user/:id', (req, res, next) => {
  try {
    const data = getUser(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/**
 * PUT /api/user/:id — save user portfolio + saved searches
 */
router.put('/user/:id', (req, res, next) => {
  try {
    const saved = saveUser(req.params.id, req.body);
    res.json({ success: true, data: saved });
  } catch (err) { next(err); }
});

export default router;
