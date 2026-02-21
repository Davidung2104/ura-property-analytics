// ═══════════════════════════════════════════════════════
// state.ts — All shared mutable state in one place
// Future: replace with Redis / PostgreSQL
// ═══════════════════════════════════════════════════════
import type { SalesRecord, RentalRecord, DashboardData, YieldMap, BedroomModel } from '../types.ts';

// ── Memory caps ──
export const MAX_SALES_RECORDS = 150_000;
export const MAX_RENTAL_RECORDS = 80_000;
export const CACHE_TTL_MS = Infinity;   // manual-refresh only
export const PROJECT_CACHE_MAX = 20;

// ── Mutable stores ──
// ES modules use live bindings — mutations here are visible to all importers.
// But reassignment (salesStore = [...]) is NOT visible; use setters.

export let salesStore: SalesRecord[] = [];
export let rentalStore: RentalRecord[] = [];

export let dashboardCache: DashboardData | null = null;
export let cacheTime: number = 0;

export let projectBatchMap: Record<string, number[]> = {};
export let projectCache: Map<string, { data: unknown; ts: number }> = new Map();

export let projYearData: Record<string, Record<string, { s: number; n: number }>> = {};
export let bedroomModel: BedroomModel | null = null;
export let computedYield: YieldMap | null = null;

// ── Setters (required for ES module live binding workaround) ──

export function setSalesStore(v: SalesRecord[]): void { salesStore = v; }
export function setRentalStore(v: RentalRecord[]): void { rentalStore = v; }
export function setDashboardCache(v: DashboardData | null): void { dashboardCache = v; }
export function setCacheTime(v: number): void { cacheTime = v; }
export function setProjectBatchMap(v: Record<string, number[]>): void { projectBatchMap = v; }
export function setProjectCache(v: Map<string, { data: unknown; ts: number }>): void { projectCache = v; }
export function setProjYearData(v: Record<string, Record<string, { s: number; n: number }>>): void { projYearData = v; }
export function setBedroomModel(v: BedroomModel | null): void { bedroomModel = v; }
export function setComputedYield(v: YieldMap | null): void { computedYield = v; }

/** Reset all state (for testing) */
export function resetAll(): void {
  salesStore = [];
  rentalStore = [];
  dashboardCache = null;
  cacheTime = 0;
  projectBatchMap = {};
  projectCache = new Map();
  projYearData = {};
  bedroomModel = null;
  computedYield = null;
}
