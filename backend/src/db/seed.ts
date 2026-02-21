/**
 * db/seed.ts — Seed PostgreSQL from existing JSON cache
 *
 * Reads the gzip JSON cache files (produced by cache.ts) and bulk-inserts
 * all sales + rental records into PostgreSQL tables.
 *
 * Usage: npx tsx src/db/seed.ts
 *
 * Safe to run multiple times — uses ON CONFLICT DO NOTHING for dedup.
 */
import { readFileSync, existsSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import { getDb } from '../config/database.ts';
import { salesTransactions, rentalTransactions } from './schema.ts';
import type { NewSalesTransaction, NewRentalTransaction } from './schema.ts';
import type { SalesRecord, RentalRecord } from '../types.ts';

const CACHE_DIR = join(process.cwd(), 'data');
const BATCH_SIZE = 500;

async function loadGzip<T>(filename: string): Promise<T[]> {
  const path = join(CACHE_DIR, filename);
  if (!existsSync(path)) {
    console.warn(`  ⚠️  ${filename} not found, skipping`);
    return [];
  }
  const raw = readFileSync(path);
  const json = gunzipSync(raw).toString('utf-8');
  return JSON.parse(json) as T[];
}

async function seedSales(): Promise<number> {
  console.log('📦 Loading sales data...');
  const records = await loadGzip<SalesRecord>('ura-sales.json.gz');
  if (!records.length) return 0;

  console.log(`  Found ${records.length.toLocaleString()} sales records`);

  const db = getDb();
  let inserted = 0;

  // Transform SalesRecord → NewSalesTransaction
  const rows: NewSalesTransaction[] = records.map(r => ({
    project: r.p,
    street: r.st,
    district: r.di,
    marketSegment: r.sg as 'CCR' | 'RCR' | 'OCR',
    propertyType: r.pt,
    tenure: r.tn as 'Freehold' | 'Leasehold',
    areaSqft: String(r.a),
    price: r.pr,
    psf: String(r.ps),
    floorRange: r.fl || null,
    floorMid: r.fm || null,
    saleType: r.tp as 'New Sale' | 'Sub Sale' | 'Resale',
    contractDate: r.d,
    year: parseInt(r.yr),
    quarter: r.q,
    bedrooms: null,  // Not stored in SalesRecord (inferred at runtime)
    batchNum: r.bn,
  }));

  // Batch insert with dedup
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    try {
      const result = await db.insert(salesTransactions)
        .values(batch)
        .onConflictDoNothing();
      inserted += batch.length;
    } catch (err) {
      console.error(`  ❌ Batch ${Math.floor(i / BATCH_SIZE)} failed:`, (err as Error).message);
    }

    if ((i + BATCH_SIZE) % 10_000 === 0 || i + BATCH_SIZE >= rows.length) {
      console.log(`  ... ${Math.min(i + BATCH_SIZE, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}`);
    }
  }

  return inserted;
}

async function seedRentals(): Promise<number> {
  console.log('📦 Loading rental data...');
  const records = await loadGzip<RentalRecord>('ura-rental.json.gz');
  if (!records.length) return 0;

  console.log(`  Found ${records.length.toLocaleString()} rental records`);

  const db = getDb();
  let inserted = 0;

  const rows: NewRentalTransaction[] = records.map(r => ({
    project: r.p,
    street: r.st,
    district: r.di,
    marketSegment: (r.sg || null) as 'CCR' | 'RCR' | 'OCR' | null,
    areaSqft: String(r.a),
    rent: String(r.rn),
    rentPsf: String(r.rp),
    bedrooms: r.br || null,
    leaseDate: r.d,
    quarter: r.lc || r.d.slice(0, 4) + 'Q' + Math.ceil(parseInt(r.d.slice(5, 7)) / 3),
    noOfContracts: r.nc || 1,
  }));

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    try {
      await db.insert(rentalTransactions)
        .values(batch)
        .onConflictDoNothing();
      inserted += batch.length;
    } catch (err) {
      console.error(`  ❌ Batch ${Math.floor(i / BATCH_SIZE)} failed:`, (err as Error).message);
    }

    if ((i + BATCH_SIZE) % 10_000 === 0 || i + BATCH_SIZE >= rows.length) {
      console.log(`  ... ${Math.min(i + BATCH_SIZE, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}`);
    }
  }

  return inserted;
}

async function refreshViews(): Promise<void> {
  console.log('🔄 Refreshing materialized views...');
  const { getPool } = await import('../config/database.ts');
  const pool = getPool();
  await pool.query('REFRESH MATERIALIZED VIEW mv_dashboard_by_year');
  await pool.query('REFRESH MATERIALIZED VIEW mv_dashboard_by_district');
  await pool.query('REFRESH MATERIALIZED VIEW mv_project_summary');
  console.log('  ✅ Views refreshed');
}

// ── Main ──

async function main() {
  console.log('🌱 URA Database Seed');
  console.log(`   Cache dir: ${CACHE_DIR}`);
  console.log('');

  const startTime = Date.now();

  const salesCount = await seedSales();
  console.log(`  ✅ Sales: ${salesCount.toLocaleString()} records`);
  console.log('');

  const rentalCount = await seedRentals();
  console.log(`  ✅ Rentals: ${rentalCount.toLocaleString()} records`);
  console.log('');

  try {
    await refreshViews();
  } catch (err) {
    console.warn('  ⚠️  View refresh failed (run migration first):', (err as Error).message);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🎉 Seed complete in ${elapsed}s`);
  console.log(`   Sales: ${salesCount.toLocaleString()}`);
  console.log(`   Rentals: ${rentalCount.toLocaleString()}`);

  // Close connections
  const { closeDb } = await import('../config/database.ts');
  await closeDb();
  process.exit(0);
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
