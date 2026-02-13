import express from 'express';
import { buildDashboardData, getProjectData, getTokenInfo, getCacheInfo, refreshToken } from '../services/uraService.js';

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
  res.json({
    token: getTokenInfo(),
    cache: getCacheInfo(),
    memory: { heapMB: Math.round(mem.heapUsed/1e6), rssMB: Math.round(mem.rss/1e6) },
    uptime: Math.round(process.uptime()) + 's',
  });
});

/**
 * POST /api/refresh — Force rebuild
 */
router.post('/refresh', async (req, res, next) => {
  try {
    await buildDashboardData(true);
    res.json({ success: true, message: 'Cache rebuilt' });
  } catch (err) { next(err); }
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

export default router;
