/**
 * uraService.js — Barrel file (v12 modular architecture)
 * 
 * Previously 2,154 lines. Now decomposed into:
 *   helpers.js      (80 lines)  — Pure utility functions
 *   state.js        (55 lines)  — Shared mutable state
 *   ura-client.js   (100 lines) — URA API token + HTTP client
 *   bedroom.js      (85 lines)  — Bedroom inference model
 *   aggregator.js   (350 lines) — Agg class (core aggregation engine)
 *   dashboard.js    (220 lines) — Dashboard build, init, rental fetch
 *   project.js      (280 lines) — Project detail + nearby projects
 *   query.js        (400 lines) — Search + filtered dashboard
 *
 * This barrel re-exports the same public API so routes/ura.js doesn't change.
 */

// Dashboard lifecycle
export { buildDashboardData, initDashboard, getFullCacheInfo, getCacheInfo } from './dashboard.js';

// Project detail
export { getProjectData } from './project.js';

// Search + filtered dashboard
export { searchSales, searchRental, buildFilteredDashboard, getFilterOptions } from './query.js';

// Token management
export { refreshToken, getTokenInfo } from './ura-client.js';
