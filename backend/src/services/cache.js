import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gzipSync, gunzipSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Use CACHE_DIR env var for Railway Volumes, or default to local ./cache
const CACHE_DIR = process.env.CACHE_DIR || join(__dirname, '../../cache');
const META_FILE = join(CACHE_DIR, 'meta.json');
const DASH_FILE = join(CACHE_DIR, 'dashboard.json.gz');
const SALES_FILE = join(CACHE_DIR, 'sales.json.gz');
const RENTAL_FILE = join(CACHE_DIR, 'rental.json.gz');
const BATCH_FILE = join(CACHE_DIR, 'batchmap.json.gz');

// Static snapshot — lives in frontend/public/, committed to git, ships with every build
// Updated by: node sync.js (run locally before deploying)
// Also updated at runtime by POST /api/refresh (writes to dist/ for immediate effect)
const SNAPSHOT_DIR = process.env.SNAPSHOT_DIR || join(__dirname, '../../../frontend/dist');
const SNAPSHOT_FILE = join(SNAPSHOT_DIR, 'snapshot.json');

// Max age is informational only — no auto-refresh, only manual via POST /api/refresh
const CACHE_MAX_AGE = Infinity;

function ensureDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function writeGz(file, data) {
  const json = JSON.stringify(data);
  const buf = gzipSync(json, { level: 6 });
  writeFileSync(file, buf);
  return buf.length;
}

function readGz(file) {
  const buf = readFileSync(file);
  const json = gunzipSync(buf).toString();
  return JSON.parse(json);
}

/**
 * Save all data to disk cache
 * @returns {{ dashKB: number, salesKB: number, rentalKB: number }}
 */
export function saveToDisk(dashboardData, salesStoreData, rentalStoreData, batchMapData) {
  ensureDir();
  const t0 = Date.now();

  const dashSz = writeGz(DASH_FILE, dashboardData);
  const salesSz = writeGz(SALES_FILE, salesStoreData);
  const rentalSz = writeGz(RENTAL_FILE, rentalStoreData);
  const batchSz = writeGz(BATCH_FILE, batchMapData);

  const meta = {
    savedAt: new Date().toISOString(),
    savedAtMs: Date.now(),
    salesCount: salesStoreData.length,
    rentalCount: rentalStoreData.length,
    dashKeys: Object.keys(dashboardData).length,
    sizes: {
      dashboard: dashSz,
      sales: salesSz,
      rental: rentalSz,
      batchMap: batchSz,
    },
  };
  writeFileSync(META_FILE, JSON.stringify(meta, null, 2));

  const elapsed = Date.now() - t0;
  const totalKB = Math.round((dashSz + salesSz + rentalSz + batchSz) / 1024);
  console.log(`💾 Cache saved: ${totalKB}KB total (${elapsed}ms)`);
  console.log(`   Dashboard: ${Math.round(dashSz/1024)}KB, Sales: ${Math.round(salesSz/1024)}KB, Rental: ${Math.round(rentalSz/1024)}KB`);

  return { dashKB: Math.round(dashSz/1024), salesKB: Math.round(salesSz/1024), rentalKB: Math.round(rentalSz/1024) };
}

/**
 * Load all data from disk cache
 * @returns {{ dashboard, salesStore, rentalStore, batchMap, meta } | null}
 */
export function loadFromDisk() {
  if (!existsSync(META_FILE) || !existsSync(DASH_FILE) || !existsSync(SALES_FILE)) {
    console.log('💾 No disk cache found');
    return null;
  }

  try {
    const t0 = Date.now();
    const meta = JSON.parse(readFileSync(META_FILE, 'utf-8'));
    const age = Date.now() - meta.savedAtMs;

    console.log(`💾 Found disk cache from ${meta.savedAt} (${Math.round(age/60000)}min ago)`);

    const dashboard = readGz(DASH_FILE);
    const salesStore = readGz(SALES_FILE);
    const rentalStore = existsSync(RENTAL_FILE) ? readGz(RENTAL_FILE) : [];
    const batchMap = existsSync(BATCH_FILE) ? readGz(BATCH_FILE) : {};

    const elapsed = Date.now() - t0;
    console.log(`💾 Cache loaded: ${meta.salesCount} sales, ${meta.rentalCount} rentals (${elapsed}ms)`);

    return {
      dashboard,
      salesStore,
      rentalStore,
      batchMap,
      meta,
      isStale: age > CACHE_MAX_AGE,
      ageMinutes: Math.round(age / 60000),
    };
  } catch (err) {
    console.error('💾 Cache load failed:', err.message);
    return null;
  }
}

/**
 * Get cache status without loading data
 */
export function getCacheStatus() {
  if (!existsSync(META_FILE)) return { exists: false };
  try {
    const meta = JSON.parse(readFileSync(META_FILE, 'utf-8'));
    const age = Date.now() - meta.savedAtMs;
    return {
      exists: true,
      savedAt: meta.savedAt,
      ageMinutes: Math.round(age / 60000),
      isStale: age > CACHE_MAX_AGE,
      salesCount: meta.salesCount,
      rentalCount: meta.rentalCount,
      totalSizeKB: Math.round(Object.values(meta.sizes || {}).reduce((s, v) => s + v, 0) / 1024),
    };
  } catch {
    return { exists: false };
  }
}

/**
 * Write dashboard data as a static JSON file served to all users.
 * This is the key to instant loading — the file is served by express.static
 * with the same speed as index.html. No API call needed.
 */
export function writeSnapshot(dashboardData) {
  try {
    if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true });
    const json = JSON.stringify(dashboardData);
    writeFileSync(SNAPSHOT_FILE, json);
    const sizeKB = Math.round(json.length / 1024);
    console.log(`📸 Snapshot written: ${SNAPSHOT_FILE} (${sizeKB}KB)`);
    return sizeKB;
  } catch (err) {
    console.error('📸 Snapshot write failed:', err.message);
    return 0;
  }
}

/**
 * Check if a snapshot exists
 */
export function hasSnapshot() {
  return existsSync(SNAPSHOT_FILE);
}
