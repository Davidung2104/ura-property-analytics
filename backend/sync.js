#!/usr/bin/env node

/**
 * URA Data Sync — run this BEFORE deploying.
 * 
 * Usage:
 *   node sync.js                  # Fetch from URA API and write snapshot.json
 *   node sync.js --status         # Show current snapshot info
 * 
 * This fetches all URA data, processes it, and writes snapshot.json
 * into frontend/public/ so it ships with every build.
 * 
 * After running: git add frontend/public/snapshot.json && git commit && git push
 * Railway auto-deploys with the fresh data baked in.
 */

import { buildDashboardData, getCacheInfo } from './src/services/uraService.js';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, '../frontend/public/snapshot.json');

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--status')) {
    if (!existsSync(SNAPSHOT_PATH)) {
      console.log('❌ No snapshot.json found. Run: node sync.js');
      process.exit(1);
    }
    const snap = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8'));
    console.log('📸 Current snapshot:');
    console.log(`   Last updated:  ${snap.lastUpdated}`);
    console.log(`   Transactions:  ${snap.totalTx?.toLocaleString()}`);
    console.log(`   Avg PSF:       $${snap.avgPsf?.toLocaleString()}`);
    console.log(`   Projects:      ${snap.projList?.length}`);
    console.log(`   Has rental:    ${snap.hasRealRental}`);
    console.log(`   File size:     ${Math.round(readFileSync(SNAPSHOT_PATH).length / 1024)}KB`);
    process.exit(0);
  }

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  URA DATA SYNC');
  console.log('═══════════════════════════════════════');
  console.log('');

  const t0 = Date.now();

  try {
    // Fetch all data from URA API
    const data = await buildDashboardData(true);

    if (!data || !data.totalTx) {
      console.error('❌ No data returned. Check your URA API key in .env');
      process.exit(1);
    }

    // Write snapshot to frontend/public/ (ships with vite build)
    const dir = dirname(SNAPSHOT_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const json = JSON.stringify(data);
    writeFileSync(SNAPSHOT_PATH, json);

    const elapsed = Math.round((Date.now() - t0) / 1000);
    const sizeKB = Math.round(json.length / 1024);
    const info = getCacheInfo();

    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('  ✅ SYNC COMPLETE');
    console.log('═══════════════════════════════════════');
    console.log(`  Time:          ${elapsed}s`);
    console.log(`  Transactions:  ${data.totalTx?.toLocaleString()}`);
    console.log(`  Sales stored:  ${info.salesRecords?.toLocaleString()}`);
    console.log(`  Rental stored: ${info.rentalRecords?.toLocaleString()}`);
    console.log(`  Avg PSF:       $${data.avgPsf?.toLocaleString()}`);
    console.log(`  Rental data:   ${data.hasRealRental ? 'REAL' : 'ESTIMATED'}`);
    console.log(`  Snapshot:      ${SNAPSHOT_PATH} (${sizeKB}KB)`);
    console.log('');
    console.log('  Next steps:');
    console.log('    git add frontend/public/snapshot.json');
    console.log('    git commit -m "Update URA data"');
    console.log('    git push   # Railway auto-deploys');
    console.log('');

  } catch (err) {
    console.error('❌ Sync failed:', err.message);
    console.error('   Make sure your .env has URA_ACCESS_KEY set');
    process.exit(1);
  }
}

main();
