/**
 * services/dal.ts — Data Access Layer
 *
 * Provides a unified interface for reading transaction data.
 * Feature-flagged: ENABLE_DB=true uses PostgreSQL, false uses in-memory stores.
 *
 * This allows gradual migration:
 *   1. Deploy with ENABLE_DB=false (current behavior)
 *   2. Set up PostgreSQL, run seed migration
 *   3. Flip ENABLE_DB=true — all reads switch to DB
 *   4. Remove in-memory code when stable
 */
import { env } from '../config/env.ts';
import { getDb } from '../config/database.ts';
import { getCache, hashFilters } from './cache-service.ts';
import { salesTransactions, rentalTransactions, users, portfolioHoldings, savedSearches, clientReports } from '../db/schema.ts';
import { eq, and, gte, lte, like, ilike, desc, asc, count, sql, type SQL } from 'drizzle-orm';
import type { SalesRecord, RentalRecord, DashboardFilters, FilterOptions, UserData } from '../types.ts';

// Import in-memory stores for fallback
import { salesStore, rentalStore } from './state.ts';

// ══════════════════════════════════════════════════════
// SALES QUERIES
// ══════════════════════════════════════════════════════

export interface SalesQueryOpts {
  project?: string;
  district?: string;
  segment?: string;
  propertyType?: string;
  tenure?: string;
  yearFrom?: number;
  yearTo?: number;
  q?: string;
  page?: number;
  limit?: number;
  sort?: 'date_desc' | 'date_asc' | 'psf_desc' | 'psf_asc' | 'price_desc';
}

export interface PaginatedResult<T> {
  results: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Query sales transactions with filters, pagination, sorting.
 */
export async function querySales(opts: SalesQueryOpts): Promise<PaginatedResult<any>> {
  if (!env.ENABLE_DB) return querySalesInMemory(opts);

  const db = getDb();
  const page = opts.page || 1;
  const limit = Math.min(opts.limit || 50, 200);
  const offset = (page - 1) * limit;

  // Build WHERE conditions
  const conditions: SQL[] = [];
  if (opts.project) conditions.push(eq(salesTransactions.project, opts.project));
  if (opts.district) conditions.push(eq(salesTransactions.district, opts.district));
  if (opts.segment) conditions.push(eq(salesTransactions.marketSegment, opts.segment as any));
  if (opts.propertyType) conditions.push(eq(salesTransactions.propertyType, opts.propertyType));
  if (opts.tenure) conditions.push(eq(salesTransactions.tenure, opts.tenure as any));
  if (opts.yearFrom) conditions.push(gte(salesTransactions.year, opts.yearFrom));
  if (opts.yearTo) conditions.push(lte(salesTransactions.year, opts.yearTo));
  if (opts.q) conditions.push(ilike(salesTransactions.project, `%${opts.q}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Sort
  const orderMap = {
    date_desc: desc(salesTransactions.contractDate),
    date_asc: asc(salesTransactions.contractDate),
    psf_desc: desc(salesTransactions.psf),
    psf_asc: asc(salesTransactions.psf),
    price_desc: desc(salesTransactions.price),
  };
  const orderBy = orderMap[opts.sort || 'date_desc'];

  // Parallel: data + count
  const [results, countResult] = await Promise.all([
    db.select()
      .from(salesTransactions)
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db.select({ total: count() })
      .from(salesTransactions)
      .where(where),
  ]);

  const total = countResult[0]?.total ?? 0;

  return {
    results: results.map(r => ({
      date: r.contractDate,
      project: r.project,
      street: r.street,
      district: r.district,
      segment: r.marketSegment,
      area: Number(r.areaSqft),
      price: r.price,
      psf: Number(r.psf),
      floorRange: r.floorRange,
      floorMid: r.floorMid,
      saleType: r.saleType,
      propertyType: r.propertyType,
      tenure: r.tenure,
      year: String(r.year),
      quarter: r.quarter,
      beds: r.bedrooms,
    })),
    total: Number(total),
    page,
    limit,
    totalPages: Math.ceil(Number(total) / limit),
  };
}

/**
 * In-memory fallback for sales queries (existing behavior).
 */
function querySalesInMemory(opts: SalesQueryOpts): PaginatedResult<any> {
  let txs = [...salesStore];

  if (opts.q) {
    const q = opts.q.toLowerCase();
    txs = txs.filter(t => t.p.toLowerCase().includes(q));
  }
  if (opts.district) txs = txs.filter(t => t.di === opts.district);
  if (opts.segment) txs = txs.filter(t => t.sg === opts.segment);
  if (opts.propertyType) txs = txs.filter(t => t.pt === opts.propertyType);
  if (opts.tenure) txs = txs.filter(t => t.tn === opts.tenure);

  // Sort
  switch (opts.sort) {
    case 'psf_desc': txs.sort((a, b) => b.ps - a.ps); break;
    case 'psf_asc': txs.sort((a, b) => a.ps - b.ps); break;
    case 'price_desc': txs.sort((a, b) => b.pr - a.pr); break;
    case 'date_asc': txs.sort((a, b) => a.d.localeCompare(b.d)); break;
    default: txs.sort((a, b) => b.d.localeCompare(a.d));
  }

  const page = opts.page || 1;
  const limit = Math.min(opts.limit || 50, 200);
  const total = txs.length;
  const results = txs.slice((page - 1) * limit, page * limit);

  return {
    results: results.map(t => ({
      date: t.d, project: t.p, street: t.st, district: t.di,
      segment: t.sg, area: t.a, price: t.pr, psf: t.ps,
      floorRange: t.fl, floorMid: t.fm, saleType: t.tp,
      propertyType: t.pt, tenure: t.tn, year: t.yr, quarter: t.q,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ══════════════════════════════════════════════════════
// FILTER OPTIONS
// ══════════════════════════════════════════════════════

/**
 * Get distinct filter values. Cached.
 */
export async function getFilterOptions(): Promise<FilterOptions> {
  const cache = getCache();
  const cached = await cache.get<FilterOptions>('filter-opts');
  if (cached) return cached;

  let opts: FilterOptions;

  if (env.ENABLE_DB) {
    const db = getDb();
    const [districts, years, segments, types, tenures] = await Promise.all([
      db.selectDistinct({ v: salesTransactions.district }).from(salesTransactions).orderBy(salesTransactions.district),
      db.selectDistinct({ v: salesTransactions.year }).from(salesTransactions).orderBy(desc(salesTransactions.year)),
      db.selectDistinct({ v: salesTransactions.marketSegment }).from(salesTransactions),
      db.selectDistinct({ v: salesTransactions.propertyType }).from(salesTransactions).orderBy(salesTransactions.propertyType),
      db.selectDistinct({ v: salesTransactions.tenure }).from(salesTransactions),
    ]);
    opts = {
      districts: districts.map(r => r.v),
      years: years.map(r => String(r.v)),
      segments: segments.map(r => r.v),
      propertyTypes: types.map(r => r.v),
      tenures: tenures.map(r => r.v),
    };
  } else {
    // In-memory fallback
    opts = {
      districts: [...new Set(salesStore.map(t => t.di))].sort(),
      years: [...new Set(salesStore.map(t => t.yr))].sort().reverse(),
      segments: [...new Set(salesStore.map(t => t.sg))].sort(),
      propertyTypes: [...new Set(salesStore.map(t => t.pt))].sort(),
      tenures: [...new Set(salesStore.map(t => t.tn))].sort(),
    };
  }

  await cache.set('filter-opts', opts, env.CACHE_DASHBOARD_TTL);
  return opts;
}

// ══════════════════════════════════════════════════════
// USER DATA (portfolio, saved searches, reports)
// ══════════════════════════════════════════════════════

/**
 * Get all user data for a given user. DB or localStorage fallback.
 */
export async function getUserData(userId: string): Promise<UserData> {
  if (!env.ENABLE_DB) {
    // Fallback to existing file-based userStore
    const { getUser } = await import('./userStore.ts');
    return getUser(userId);
  }

  const db = getDb();
  const [holdings, searches, reports] = await Promise.all([
    db.select().from(portfolioHoldings).where(eq(portfolioHoldings.userId, userId)),
    db.select().from(savedSearches).where(eq(savedSearches.userId, userId)),
    db.select().from(clientReports).where(eq(clientReports.userId, userId)),
  ]);

  return {
    portfolio: holdings.map(h => ({
      projectName: h.project,
      purchaseDate: h.purchaseDate || '',
      purchasePsf: Number(h.purchasePsf),
      area: Number(h.unitSize),
      floorRange: h.floor || undefined,
      notes: h.notes || undefined,
    })),
    savedSearches: searches.map(s => ({
      id: s.id,
      name: s.name,
      filters: s.filters as any,
      createdAt: s.createdAt?.toISOString() || '',
    })),
    clientReports: reports.map(r => ({
      id: r.id,
      clientName: r.clientName,
      projectName: r.project,
      createdAt: r.createdAt?.toISOString() || '',
      unitConfig: (r.unitConfig as any) || { area: 0 },
      sections: (r.sections as any) || {},
      notes: r.notes || undefined,
      snapshot: (r.reportData as any) || {},
    })),
  };
}

/**
 * Save user data (portfolio, searches, reports).
 */
export async function saveUserData(userId: string, data: Partial<UserData>): Promise<void> {
  if (!env.ENABLE_DB) {
    const { saveUser } = await import('./userStore.ts');
    saveUser(userId, data);
    return;
  }

  const db = getDb();

  // Portfolio: delete all + re-insert (simpler than diff for small datasets)
  if (data.portfolio) {
    await db.delete(portfolioHoldings).where(eq(portfolioHoldings.userId, userId));
    if (data.portfolio.length > 0) {
      await db.insert(portfolioHoldings).values(
        data.portfolio.map(p => ({
          userId,
          project: p.projectName,
          unitSize: String(p.area),
          purchasePsf: String(p.purchasePsf),
          purchaseDate: p.purchaseDate,
          floor: p.floorRange || null,
          notes: p.notes || null,
        }))
      );
    }
  }

  // Saved searches
  if (data.savedSearches) {
    await db.delete(savedSearches).where(eq(savedSearches.userId, userId));
    if (data.savedSearches.length > 0) {
      await db.insert(savedSearches).values(
        data.savedSearches.map(s => ({
          userId,
          name: s.name,
          filters: s.filters,
        }))
      );
    }
  }

  // Client reports
  if (data.clientReports) {
    await db.delete(clientReports).where(eq(clientReports.userId, userId));
    if (data.clientReports.length > 0) {
      await db.insert(clientReports).values(
        data.clientReports.map(r => ({
          userId,
          clientName: r.clientName,
          project: r.projectName,
          unitConfig: r.unitConfig,
          sections: r.sections,
          notes: r.notes || null,
          reportData: r.snapshot,
        }))
      );
    }
  }
}

// ══════════════════════════════════════════════════════
// PROJECT DATA (for project detail page)
// ══════════════════════════════════════════════════════

/**
 * Get all sales transactions for a specific project. Used by project.ts.
 */
export async function getProjectSales(projectName: string): Promise<any[]> {
  if (!env.ENABLE_DB) {
    return salesStore
      .filter(t => t.p === projectName)
      .map(t => ({
        date: t.d, price: t.pr, psf: t.ps, area: t.a,
        floorRange: t.fl, floorMid: t.fm, saleType: t.tp,
        tenure: t.tn, type: t.pt, beds: null, year: t.yr,
      }));
  }

  const db = getDb();
  const rows = await db.select()
    .from(salesTransactions)
    .where(eq(salesTransactions.project, projectName))
    .orderBy(desc(salesTransactions.contractDate));

  return rows.map(r => ({
    date: r.contractDate,
    price: r.price,
    psf: Number(r.psf),
    area: Number(r.areaSqft),
    floorRange: r.floorRange,
    floorMid: r.floorMid,
    saleType: r.saleType,
    tenure: r.tenure,
    type: r.propertyType,
    beds: r.bedrooms,
    year: String(r.year),
  }));
}

/**
 * Get rental data for a specific project.
 */
export async function getProjectRentals(projectName: string): Promise<any[]> {
  if (!env.ENABLE_DB) {
    return rentalStore
      .filter(t => t.p === projectName)
      .map(t => ({
        date: t.d, rent: t.rn, rentPsf: t.rp, area: t.a,
        bedrooms: t.br, contracts: t.nc,
      }));
  }

  const db = getDb();
  const rows = await db.select()
    .from(rentalTransactions)
    .where(eq(rentalTransactions.project, projectName))
    .orderBy(desc(rentalTransactions.leaseDate));

  return rows.map(r => ({
    date: r.leaseDate,
    rent: Number(r.rent),
    rentPsf: Number(r.rentPsf),
    area: Number(r.areaSqft),
    bedrooms: r.bedrooms,
    contracts: r.noOfContracts,
  }));
}

// ══════════════════════════════════════════════════════
// AGGREGATE COUNTS (for dashboard stats)
// ══════════════════════════════════════════════════════

/**
 * Get total transaction counts and key stats.
 */
export async function getAggregateStats(filters?: DashboardFilters) {
  if (!env.ENABLE_DB) return null; // Use in-memory aggregator

  const db = getDb();
  const conditions: SQL[] = [];

  if (filters?.district && filters.district !== 'all') {
    conditions.push(eq(salesTransactions.district, filters.district));
  }
  if (filters?.segment && filters.segment !== 'all') {
    conditions.push(eq(salesTransactions.marketSegment, filters.segment as any));
  }
  if (filters?.year && filters.year !== 'all') {
    conditions.push(eq(salesTransactions.year, parseInt(filters.year)));
  }
  if (filters?.propertyType && filters.propertyType !== 'all') {
    conditions.push(eq(salesTransactions.propertyType, filters.propertyType));
  }
  if (filters?.tenure && filters.tenure !== 'all') {
    conditions.push(eq(salesTransactions.tenure, filters.tenure as any));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [stats] = await db.select({
    totalTx: count(),
    totalVolume: sql<number>`COALESCE(SUM(price), 0)`,
    avgPsf: sql<number>`ROUND(AVG(psf::numeric), 0)`,
    medPsf: sql<number>`ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf::numeric), 0)`,
  })
    .from(salesTransactions)
    .where(where);

  return stats;
}
