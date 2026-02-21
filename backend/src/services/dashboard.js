/**
 * dashboard.js — Dashboard build, init, rental data fetch, cache management
 * Extracted from uraService.js lines 845-1130
 */
import { saveToDisk, loadFromDisk, getCacheStatus, writeSnapshot } from './cache.js';
import { fetchBatch, fetchRental, getTokenInfo } from './ura-client.js';
import { parseDate, avg, med, safeDiv, sleep } from './helpers.js';
import { Agg } from './aggregator.js';
import { buildBedroomModel } from './bedroom.js';
import {
  dashboardCache, cacheTime, CACHE_TTL_MS, projectBatchMap, projectCache,
  salesStore, rentalStore, projYearData,
  MAX_SALES_RECORDS, MAX_RENTAL_RECORDS,
  setDashboardCache, setCacheTime, setProjectBatchMap,
  setSalesStore, setRentalStore, setProjYearData,
} from './state.js';

// ═══ FETCH & AGGREGATE REAL RENTAL DATA ═══

export async function fetchRentalData() {
  console.log('🏠 Fetching rental data...');
  const byProject = {};
  const byDist = {};
  const bySeg = {};
  const byQtr = {};
  let totalRent = 0, totalRentPsf = 0, totalCount = 0;
  const allRents = [];

  // Build project→segment lookup from sales data
  const projSegLookup = {};
  for (const s of salesStore) {
    if (!projSegLookup[s.p]) projSegLookup[s.p] = s.sg;
  }

  // Generate recent quarter keys (last 4 quarters)
  const now = new Date();
  const curY = now.getFullYear() % 100;
  const curQ = Math.ceil((now.getMonth() + 1) / 3);
  const quarters = [];
  for (let i = 0; i < 4; i++) {
    let qy = curY, qq = curQ - i;
    while (qq <= 0) { qq += 4; qy--; }
    quarters.push(`${String(qy).padStart(2, '0')}q${qq}`);
  }

  for (const refPeriod of quarters) {
    try {
      const projects = await fetchRental(refPeriod);
      console.log(`  📥 Rental ${refPeriod}: ${projects.length} projects`);
      for (const p of projects) {
        const name = p.project || '';
        const seg = projSegLookup[name] || (p.marketSegment || 'RCR').toUpperCase();
        const dist = `D${parseInt(p.district) || 0}`;
        const rentals = p.rental || [];

        for (const r of rentals) {
          const sqftStr = r.areaSqft || '';
          const sqftParts = sqftStr.split('-').map(v => parseFloat(v) || 0);
          let areaSqf = sqftParts.length === 2 && sqftParts[0] > 0
            ? Math.round((sqftParts[0] + sqftParts[1]) / 2) : 0;
          if (areaSqf <= 0) {
            const sqmParts = String(r.areaSqm || '').split('-').map(v => parseFloat(v) || 0);
            const areaSqm = sqmParts.length === 2 ? (sqmParts[0] + sqmParts[1]) / 2 : sqmParts[0] || 0;
            areaSqf = Math.round(areaSqm * 10.7639);
          }
          const monthlyRent = parseFloat(r.rent) || 0;
          const numContracts = parseInt(r.noOfRentalContract) || 0;
          const bedrooms = r.noOfBedRoom || '';
          if (areaSqf <= 0 || monthlyRent <= 0) continue;

          const ld = parseDate(r.leaseDate);
          const fallbackDate = (() => {
            const qy = parseInt(refPeriod.slice(0, 2)) || 0;
            const qq = parseInt(refPeriod.slice(-1)) || 1;
            const fy = qy > 50 ? 1900 + qy : 2000 + qy;
            const fm = (qq - 1) * 3 + 2;
            return `${fy}-${String(fm).padStart(2, '0')}`;
          })();
          const rentalDate = ld ? `${ld.year}-${String(ld.month).padStart(2, '0')}` : fallbackDate;
          const rentalQtr = ld ? ld.quarter.replace('Q', 'q') : refPeriod;
          const rentPsf = +(monthlyRent / areaSqf).toFixed(2);

          totalRent += monthlyRent; totalRentPsf += rentPsf; totalCount++;
          if (allRents.length < 5000) allRents.push(monthlyRent);
          else { const j = Math.floor(Math.random() * totalCount); if (j < 5000) allRents[j] = monthlyRent; }

          if (!byProject[name]) byProject[name] = { totalRent: 0, totalPsf: 0, count: 0, seg, dist };
          byProject[name].totalRent += monthlyRent; byProject[name].totalPsf += rentPsf; byProject[name].count++;

          if (!byDist[dist]) byDist[dist] = { totalRent: 0, totalPsf: 0, count: 0, byQ: {} };
          byDist[dist].totalRent += monthlyRent; byDist[dist].totalPsf += rentPsf; byDist[dist].count++;
          if (!byDist[dist].byQ[rentalQtr]) byDist[dist].byQ[rentalQtr] = { totalPsf: 0, count: 0 };
          byDist[dist].byQ[rentalQtr].totalPsf += rentPsf; byDist[dist].byQ[rentalQtr].count++;

          if (!bySeg[seg]) bySeg[seg] = { totalRent: 0, totalPsf: 0, count: 0 };
          bySeg[seg].totalRent += monthlyRent; bySeg[seg].totalPsf += rentPsf; bySeg[seg].count++;

          if (!byQtr[rentalQtr]) byQtr[rentalQtr] = { totalRent: 0, totalMed: [], count: 0 };
          byQtr[rentalQtr].totalRent += monthlyRent; byQtr[rentalQtr].totalMed.push(monthlyRent); byQtr[rentalQtr].count++;

          const fmtRange = sqftStr ? sqftStr.split('-').map(v => parseInt(v).toLocaleString()).join(' - ') : `${areaSqf.toLocaleString()}`;
          rentalStore.push({
            d: rentalDate, p: name, st: p.street || '', di: dist, sg: seg,
            a: areaSqf, af: fmtRange, br: bedrooms, rn: monthlyRent, rp: rentPsf,
            nc: numContracts, lc: r.leaseDate || '',
          });
        }
      }
    } catch (err) {
      console.warn(`  ⚠️ Rental ${refPeriod}: ${err.message}`);
    }
  }

  if (totalCount === 0) {
    console.log('⚠️ No rental data fetched');
    return null;
  }

  for (const p of Object.values(byProject)) { p.avgRent = p.count > 0 ? Math.round(p.totalRent / p.count) : 0; p.avgRentPsf = safeDiv(p.totalPsf, p.count); }
  for (const d of Object.values(byDist)) {
    d.avgRent = d.count > 0 ? Math.round(d.totalRent / d.count) : 0;
    d.avgRentPsf = safeDiv(d.totalPsf, d.count);
    for (const q of Object.values(d.byQ)) { q.avgRentPsf = safeDiv(q.totalPsf, q.count); }
  }
  for (const s of Object.values(bySeg)) { s.avgRent = s.count > 0 ? Math.round(s.totalRent / s.count) : 0; s.avgRentPsf = safeDiv(s.totalPsf, s.count); }
  for (const q of Object.values(byQtr)) { q.avgRent = q.count > 0 ? Math.round(q.totalRent / q.count) : 0; q.medRent = med(q.totalMed); delete q.totalMed; }

  console.log(`✅ Rental: ${totalCount} records from ${Object.keys(byProject).length} projects`);
  return {
    byProject, byDist, bySeg, byQtr,
    overallAvgRent: totalCount > 0 ? Math.round(totalRent / totalCount) : 0,
    overallAvgRentPsf: safeDiv(totalRentPsf, totalCount),
    overallMedRent: med(allRents),
  };
}

// ═══ BUILD ═══

let _refreshLock = null;

export async function buildDashboardData(force = false) {
  if (!force && dashboardCache && cacheTime && (Date.now() - cacheTime < CACHE_TTL_MS)) {
    return dashboardCache;
  }
  if (_refreshLock) {
    console.log('⏳ Refresh already in progress — waiting for it to complete...');
    return _refreshLock;
  }
  _refreshLock = _doBuildDashboardData(force);
  try { return await _refreshLock; }
  finally { _refreshLock = null; }
}

async function _doBuildDashboardData(force) {
  console.log('🔄 Building dashboard from URA API...');
  setSalesStore([]);
  setRentalStore([]);
  const agg = new Agg();

  for (let batch = 1; batch <= 4; batch++) {
    let success = false;
    for (let attempt = 1; attempt <= 3 && !success; attempt++) {
      try {
        console.log(`📥 Batch ${batch}${attempt > 1 ? ` (retry ${attempt}/3)` : ''}...`);
        const projects = await fetchBatch('PMI_Resi_Transaction', batch);
        console.log(`✅ Batch ${batch}: ${projects.length} projects`);
        for (const p of projects) agg.add(p, batch);
        success = true;
      } catch (err) {
        console.error(`❌ Batch ${batch} attempt ${attempt}:`, err.message);
        if (attempt < 3) {
          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 16000);
          console.log(`   ⏳ Retrying batch ${batch} in ${delay}ms...`);
          await sleep(delay);
        } else {
          console.error(`   ❌ Batch ${batch} FAILED after 3 attempts — data will be incomplete`);
        }
      }
    }
  }

  let rentalData = null;
  try { rentalData = await fetchRentalData(); }
  catch (err) { console.error('❌ Rental fetch failed:', err.message); }

  // Sort transaction stores by date (newest first)
  salesStore.sort((a, b) => b.d.localeCompare(a.d));
  rentalStore.sort((a, b) => b.d.localeCompare(a.d));

  // FIX #6: Enforce memory bounds
  if (salesStore.length > MAX_SALES_RECORDS) {
    console.warn(`⚠️ salesStore exceeds cap (${salesStore.length} > ${MAX_SALES_RECORDS}), trimming`);
    setSalesStore(salesStore.slice(0, MAX_SALES_RECORDS));
  }
  if (rentalStore.length > MAX_RENTAL_RECORDS) {
    console.warn(`⚠️ rentalStore exceeds cap (${rentalStore.length} > ${MAX_RENTAL_RECORDS}), trimming`);
    setRentalStore(rentalStore.slice(0, MAX_RENTAL_RECORDS));
  }

  if (rentalStore.length > 0) buildBedroomModel();

  console.log(`📊 ${agg.total} sales, ${salesStore.length} stored, ${rentalStore.length} rental records`);
  const result = agg.build(rentalData);

  // Extract internal projYearData and update state
  const { _projYearData, ...dashboardData } = result;
  if (_projYearData) setProjYearData(_projYearData);

  setDashboardCache(dashboardData);
  dashboardCache.lastUpdated = new Date().toISOString();
  setCacheTime(Date.now());
  projectCache.clear();
  console.log(`✅ Dashboard ready (${Math.round(JSON.stringify(dashboardCache).length / 1024)}KB, rental: ${dashboardCache.hasRealRental ? 'REAL' : 'ESTIMATED'})`);

  try {
    saveToDisk(dashboardCache, salesStore, rentalStore, projectBatchMap);
    writeSnapshot(dashboardCache);
  } catch (err) {
    console.error('💾 Disk save failed:', err.message);
  }

  return dashboardCache;
}

export async function initDashboard() {
  const cached = loadFromDisk();
  if (cached) {
    setDashboardCache(cached.dashboard);
    setSalesStore(cached.salesStore);
    setRentalStore(cached.rentalStore);
    setProjectBatchMap(cached.batchMap);
    setCacheTime(Date.now());
    _rebuildProjYearData();
    if (rentalStore.length > 0) buildBedroomModel();
    console.log(`🚀 Serving from disk cache (${cached.ageMinutes}min old, ${cached.salesStore.length} sales, ${cached.rentalStore.length} rentals)`);
    console.log(`   Refresh manually via POST /api/refresh when you want fresh URA data.`);
    writeSnapshot(dashboardCache);
    return true;
  }
  console.log('❄️ First run — no disk cache, fetching from URA API...');
  await buildDashboardData(true);
  return true;
}

function _rebuildProjYearData() {
  const idx = dashboardCache?.projIndex;
  if (!idx || !salesStore.length) { setProjYearData({}); return; }

  const projAgg = {};
  for (const r of salesStore) {
    const year = r.d.slice(0, 4);
    if (!projAgg[r.p]) projAgg[r.p] = {};
    if (!projAgg[r.p][year]) projAgg[r.p][year] = { s: 0, n: 0 };
    projAgg[r.p][year].s += r.ps; projAgg[r.p][year].n++;
  }

  const rentalByProj = {};
  for (const r of rentalStore) {
    if (!rentalByProj[r.p]) rentalByProj[r.p] = { totalPsf: 0, n: 0 };
    rentalByProj[r.p].totalPsf += r.rp; rentalByProj[r.p].n++;
  }

  const newProjYearData = {};
  for (const [name, meta] of Object.entries(idx)) {
    const yearPsf = {};
    if (projAgg[name]) {
      for (const [y, yData] of Object.entries(projAgg[name])) {
        yearPsf[y] = avg(yData.s, yData.n);
      }
    }
    const rp = rentalByProj[name];
    const yld = rp && rp.n > 0 && meta.psf > 0 ? +((rp.totalPsf / rp.n * 12 / meta.psf) * 100).toFixed(2) : 0;
    const rent = rp && rp.n > 0 ? Math.round(rp.totalPsf / rp.n) : 0;
    newProjYearData[name] = {
      street: meta.street || '', dist: meta.dist, seg: meta.seg,
      n: meta.n, type: meta.type, psf: meta.psf, yield: yld, yearPsf,
      hasRealRental: !!rp, rent,
    };
  }

  // Fix projIndex yield and yearPsf
  for (const [name, meta] of Object.entries(idx)) {
    const rp = rentalByProj[name];
    meta.yield = rp && meta.psf > 0 ? +((rp.totalPsf / rp.n * 12 / meta.psf) * 100).toFixed(2) : 0;
    meta.hasRealRental = !!rp;
    meta.yearPsf = newProjYearData[name]?.yearPsf || {};
  }

  setProjYearData(newProjYearData);
  console.log(`🔗 Rebuilt projYearData: ${Object.keys(newProjYearData).length} projects (${Object.keys(rentalByProj).length} with real rental)`);
}

export function getFullCacheInfo() {
  return { memory: getCacheInfo(), disk: getCacheStatus() };
}

export function getCacheInfo() {
  const salesMB = salesStore.length > 0 ? +(salesStore.length * 100 / 1048576).toFixed(1) : 0;
  const rentalMB = rentalStore.length > 0 ? +(rentalStore.length * 100 / 1048576).toFixed(1) : 0;
  return {
    hasDashboard: !!dashboardCache, hasRealRental: dashboardCache?.hasRealRental || false,
    cacheAge: cacheTime ? Math.round((Date.now() - cacheTime) / 60000) + 'min' : null,
    totalTx: dashboardCache?.totalTx || 0,
    salesRecords: salesStore.length,
    rentalRecords: rentalStore.length,
    projectCacheSize: projectCache.size,
    estimatedStoreMB: +(salesMB + rentalMB).toFixed(1),
    storeCapacity: `${salesStore.length}/${MAX_SALES_RECORDS} sales, ${rentalStore.length}/${MAX_RENTAL_RECORDS} rental`,
    tokenTTLHours: parseFloat(process.env.URA_TOKEN_TTL_HOURS) || 23,
    cacheTTL: process.env.CACHE_TTL_HOURS ? `${process.env.CACHE_TTL_HOURS}h` : 'manual',
  };
}
