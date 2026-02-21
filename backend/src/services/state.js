/**
 * state.js — Shared mutable state
 * Extracted from uraService.js lines 96-110, 160-170
 * Single source of truth for all in-memory state.
 * Future: replace with Redis/PostgreSQL.
 */

// ═══ CACHE STATE ═══
export let dashboardCache = null;
export let cacheTime = null;

// FIX #4: Optional auto-refresh interval via env var
export const CACHE_TTL_MS = process.env.CACHE_TTL_HOURS
  ? parseFloat(process.env.CACHE_TTL_HOURS) * 3600000
  : Infinity;

export let projectBatchMap = {};
export let projectCache = new Map(); // FIX #3: LRU project cache
export const PROJECT_CACHE_MAX = 20;

// ═══ TRANSACTION STORES ═══
export let salesStore = [];   // All sales tx, compact format
export let rentalStore = [];  // All rental tx from PMI_Resi_Rental

// FIX #6: Memory bounds — cap transaction stores to prevent unbounded growth
export const MAX_SALES_RECORDS = 250_000;   // ~25MB at ~100 bytes each
export const MAX_RENTAL_RECORDS = 100_000;  // ~10MB

// ═══ DERIVED STATE ═══
export let projYearData = {}; // project → { street, dist, seg, n, type, yearPsf } for nearby lookup
export let bedroomModel = null; // Area→bedroom inference from rental data
export let computedYield = null; // Filled from real URA rental data when available

// ═══ STATE SETTERS ═══
// Necessary because ES module exports are live bindings but can only be
// reassigned from the declaring module.

export function setDashboardCache(val) { dashboardCache = val; }
export function setCacheTime(val) { cacheTime = val; }
export function setProjectBatchMap(val) { projectBatchMap = val; }
export function setProjectCache(val) { projectCache = val; }
export function setSalesStore(val) { salesStore = val; }
export function setRentalStore(val) { rentalStore = val; }
export function setProjYearData(val) { projYearData = val; }
export function setBedroomModel(val) { bedroomModel = val; }
export function setComputedYield(val) { computedYield = val; }

/** Reset all state (useful for testing) */
export function resetAll() {
  dashboardCache = null;
  cacheTime = null;
  projectBatchMap = {};
  projectCache = new Map();
  salesStore = [];
  rentalStore = [];
  projYearData = {};
  bedroomModel = null;
  computedYield = null;
}
