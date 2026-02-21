import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  buildDashboardData, buildFilteredDashboard, getProjectData,
  getTokenInfo, getCacheInfo, getFullCacheInfo, refreshToken,
  searchSales, searchRental, getFilterOptions,
} from '../services/uraService.ts';
import { getUser, saveUser } from '../services/userStore.ts';
import {
  FilteredDashboardSchema, SalesSearchSchema, RentalSearchSchema,
  ProjectParamSchema, UserIdSchema, UserBodySchema, AdminAuthSchema,
} from '../schemas.ts';

const router = express.Router();

// ── Zod validation middleware ──

function validate<T extends z.ZodType>(schema: T, source: 'query' | 'params' | 'body' = 'query') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      res.status(400).json({ success: false, error: 'Validation failed', details: errors });
      return;
    }
    // Attach parsed data
    (req as any).validated = result.data;
    next();
  };
}

/**
 * GET /api/dashboard — ALL chart data in one call (~50KB)
 */
router.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await buildDashboardData();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/**
 * GET /api/dashboard/filtered — Filtered dashboard data
 * Zod-validated: district, year, segment, propertyType, tenure
 */
router.get('/dashboard/filtered',
  validate(FilteredDashboardSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { district, year, segment, propertyType, tenure } = (req as any).validated;
      const filters: Record<string, string> = {};
      if (district && district !== 'all') filters.district = district;
      if (year && year !== 'all') filters.year = year;
      if (segment && segment !== 'all') filters.segment = segment;
      if (propertyType && propertyType !== 'all') filters.propertyType = propertyType;
      if (tenure && tenure !== 'all') filters.tenure = tenure;

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
 * Zod-validated: q, district, segment, type, tenure, page, limit, sort
 */
router.get('/sales/search',
  validate(SalesSearchSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const opts = (req as any).validated;
      const data = await searchSales(opts);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  });

/**
 * GET /api/rental/search — Paginated rental search
 * Zod-validated: q, district, segment, bedrooms, areaSqft, page, limit, sort
 */
router.get('/rental/search',
  validate(RentalSearchSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const opts = (req as any).validated;
      const data = await searchRental(opts);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  });

/**
 * GET /api/filters — Available filter options
 */
router.get('/filters', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await buildDashboardData();
    res.json({ success: true, data: getFilterOptions() });
  } catch (err) { next(err); }
});

/**
 * GET /api/project/:name — Project-level detail
 * Zod-validated: name param
 */
router.get('/project/:name',
  validate(ProjectParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await getProjectData(decodeURIComponent(req.params.name!));
      if (!data) return res.status(404).json({ success: false, error: 'Project not found' });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  });

/**
 * GET /api/stats — Health check
 */
router.get('/stats', (req: Request, res: Response) => {
  const mem = process.memoryUsage();
  const cacheInfo = getFullCacheInfo();
  res.json({
    token: getTokenInfo(),
    cache: cacheInfo,
    memory: { heapMB: Math.round(mem.heapUsed / 1e6), rssMB: Math.round(mem.rss / 1e6) },
    uptime: Math.round(process.uptime()) + 's',
  });
});

/**
 * POST /api/refresh — Force rebuild (protected)
 */
let lastRefreshTime = 0;
let refreshInProgress = false;
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    return res.status(403).json({ success: false, error: 'ADMIN_KEY not configured', code: 'NO_ADMIN_KEY' });
  }
  const provided = (req.query.key as string) || req.headers.authorization?.replace('Bearer ', '');
  if (provided !== adminKey) {
    return res.status(403).json({ success: false, error: 'Invalid admin key', code: 'AUTH_FAILED' });
  }
  if (refreshInProgress) {
    return res.status(409).json({ success: false, error: 'Refresh already in progress', code: 'REFRESH_IN_PROGRESS' });
  }
  const now = Date.now();
  if (now - lastRefreshTime < REFRESH_COOLDOWN_MS) {
    const waitSec = Math.ceil((REFRESH_COOLDOWN_MS - (now - lastRefreshTime)) / 1000);
    return res.status(429).json({ success: false, error: `Rate limited — try again in ${waitSec}s`, code: 'RATE_LIMITED', retryAfter: waitSec });
  }
  lastRefreshTime = now;
  refreshInProgress = true;
  const t0 = Date.now();
  try {
    await buildDashboardData(true);
    res.json({ success: true, message: 'Cache rebuilt', durationMs: Date.now() - t0 });
  } catch (err) { next(err); }
  finally { refreshInProgress = false; }
});

/**
 * POST /api/refresh-token — Force URA token refresh (protected)
 */
router.post('/refresh-token', async (req: Request, res: Response, next: NextFunction) => {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return res.status(403).json({ success: false, error: 'ADMIN_KEY not configured', code: 'NO_ADMIN_KEY' });
  const provided = (req.query.key as string) || req.headers.authorization?.replace('Bearer ', '');
  if (provided !== adminKey) return res.status(403).json({ success: false, error: 'Invalid admin key', code: 'AUTH_FAILED' });
  try {
    await refreshToken();
    res.json({ success: true, token: getTokenInfo() });
  } catch (err) { next(err); }
});

// Legacy endpoints
router.get('/transactions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await buildDashboardData();
    res.json({ success: true, data: (data as any).mktSaleTx });
  } catch (err) { next(err); }
});

router.get('/districts/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await buildDashboardData();
    res.json({ success: true, data: (data as any).sDistBar });
  } catch (err) { next(err); }
});

router.get('/property-types/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await buildDashboardData();
    res.json({ success: true, data: (data as any).sType });
  } catch (err) { next(err); }
});

// ═══ USER DATA (portfolio + saved searches) ═══
const userWriteHits = new Map<string, number>();
setInterval(() => userWriteHits.clear(), 60_000);

/**
 * GET /api/user/:id — load user data
 * Zod-validated: id param
 */
router.get('/user/:id',
  validate(UserIdSchema, 'params'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = getUser(req.params.id!);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  });

/**
 * PUT /api/user/:id — save user data
 * Zod-validated: id param + body
 */
router.put('/user/:id',
  validate(UserIdSchema, 'params'),
  validate(UserBodySchema, 'body'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip = req.ip || (req as any).connection?.remoteAddress || 'unknown';
      const hits = (userWriteHits.get(ip) || 0) + 1;
      userWriteHits.set(ip, hits);
      if (hits > 30) return res.status(429).json({ success: false, error: 'Write rate limited', code: 'RATE_LIMITED' });

      const saved = saveUser(req.params.id!, (req as any).validated);
      res.json({ success: true, data: saved });
    } catch (err) { next(err); }
  });

export default router;
