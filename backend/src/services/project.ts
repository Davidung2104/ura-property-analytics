/**
 * project.js — Project detail service
 * Extracted from uraService.js lines 1137-1530
 * Handles individual project data, nearby comparisons, floor premium analysis.
 */
import { fetchBatch } from './ura-client.ts';
import { parseDate, parseFloor, avg, med, getYield } from './helpers.ts';
import { inferBedrooms } from './bedroom.ts';
import { buildDashboardData } from './dashboard.ts';
import {
  dashboardCache, projectBatchMap, projectCache, PROJECT_CACHE_MAX,
  salesStore, rentalStore, projYearData, computedYield,
} from './state.ts';

import type { ProjectDetail } from '../types.ts';
export async function getProjectData(projectName: string): Promise<ProjectDetail | null> {
  if (!dashboardCache) await buildDashboardData();

  // FIX #3: Check project cache first
  if (projectCache.has(projectName)) {
    return projectCache.get(projectName);
  }

  const pool = dashboardCache?.cmpPool?.find(p => p.name === projectName);
  const idx = !pool ? dashboardCache?.projIndex?.[projectName] : null;
  const meta = pool || (idx ? { dist: idx.dist, type: idx.type, segment: idx.seg, street: idx.street } : null);

  // ── Fast path: build from in-memory salesStore ──
  if (salesStore.length > 0) {
    const projSales = salesStore.filter(r => r.p === projectName);
    if (projSales.length > 0) {
      const first = projSales[0];
      const fakeProject = {
        project: projectName,
        street: first.st || meta?.street || '',
        marketSegment: first.sg || meta?.segment || 'RCR',
        propertyType: first.pt || meta?.type || '',
        transaction: projSales.map(r => ({
          contractDate: (() => {
            const [y, m] = r.d.split('-');
            return `${m}${y.slice(2)}`;
          })(),
          area: String((r.a / 10.7639).toFixed(3)),
          price: r.pr,
          floorRange: r.fl || '-',
          district: r.di ? r.di.replace('D', '') : '',
          typeOfSale: r.tp === 'New Sale' ? '1' : r.tp === 'Sub Sale' ? '2' : '3',
          tenure: r.tn || '',
        })),
      };
      const result = buildProjectResult(fakeProject, meta);
      cacheProject(projectName, result);
      return result;
    }
  }

  // ── Slow path: fetch from URA API ──
  const batch = projectBatchMap[projectName];
  if (!batch) {
    for (let b = 1; b <= 4; b++) {
      try {
        const projects = await fetchBatch('PMI_Resi_Transaction', b);
        const p = projects.find(pr => pr.project === projectName);
        if (p) { projectBatchMap[projectName] = b; const result = buildProjectResult(p, meta); cacheProject(projectName, result); return result; }
      } catch (err) { continue; }
    }
    return null;
  }

  try {
    const projects = await fetchBatch('PMI_Resi_Transaction', batch);
    const p = projects.find(pr => pr.project === projectName);
    if (!p) return null;
    const result = buildProjectResult(p, meta);
    cacheProject(projectName, result);
    return result;
  } catch (err) { console.error('Project error:', err.message); return null; }
}

function cacheProject(name, data) {
  if (projectCache.size >= PROJECT_CACHE_MAX) {
    const oldest = projectCache.keys().next().value;
    projectCache.delete(oldest);
  }
  projectCache.set(name, data);
}

function buildProjectResult(p, pool) {
  const projectName = p.project;
  const seg = (p.marketSegment || 'RCR').toUpperCase();
  const yRate = getYield(seg, computedYield);
  const rawDist = p.transaction?.[0]?.district ? `D${parseInt(p.transaction[0].district)}` : '';
  const dist = pool?.dist || rawDist;

  const realProjRentals = rentalStore.filter(r => r.p === projectName);

  const txs = (p.transaction || []).map(tx => {
    const d = parseDate(tx.contractDate); if (!d) return null;
    const area = Math.round((parseFloat(tx.area) || 0) * 10.7639);
    const price = parseFloat(tx.price) || 0;
    if (area <= 0 || price <= 0) return null;
    const psf = Math.round(price / area);
    const fl = parseFloor(tx.floorRange);
    const beds = inferBedrooms(projectName, area);
    let tenure = 'Leasehold';
    if (tx.tenure) { const t = tx.tenure.toLowerCase(); if (t.includes('freehold')) tenure = 'Freehold'; else if (t.includes('999')) tenure = '999-yr'; }
    return { year: String(d.year), quarter: d.quarter, month: d.month, date: `${d.year}-${String(d.month).padStart(2, '0')}`, area, price, psf, floorRange: fl.band, floorMid: fl.mid, saleType: tx.typeOfSale === '1' ? 'New Sale' : tx.typeOfSale === '2' ? 'Sub Sale' : 'Resale', size: area, floor: fl.band, beds, tenure };
  }).filter(Boolean);

  txs.sort((a, b) => (parseInt(b.year) * 100 + b.month) - (parseInt(a.year) * 100 + a.month));

  const years = [...new Set(txs.map(t => t.year))].sort();
  const quarters = [...new Set(txs.map(t => t.quarter))].sort();
  const avgA = txs.length > 0 ? Math.round(txs.reduce((s, t) => s + t.area, 0) / txs.length) : 0;

  // Current PSF: prefer latest quarter, expand if thin
  const latestYear = years[years.length - 1];
  const projQtrs = quarters.slice();
  let psfSource = null, psfPeriod = '';
  for (const window of [1, 2, 4]) {
    const wQtrs = projQtrs.slice(-window);
    const wSet = new Set(wQtrs);
    const wTx = txs.filter(t => wSet.has(t.quarter));
    if (wTx.length >= 3) {
      psfSource = wTx;
      psfPeriod = wQtrs.length === 1 ? wQtrs[0] : `${wQtrs[0]}–${wQtrs[wQtrs.length - 1]}`;
      break;
    }
  }
  if (!psfSource) {
    const latYearTx = txs.filter(t => t.year === latestYear);
    if (latYearTx.length > 0) { psfSource = latYearTx; psfPeriod = latestYear; }
    else { psfSource = txs; psfPeriod = 'all'; }
  }
  const avgP = psfSource.length > 0 ? Math.round(psfSource.reduce((s, t) => s + t.psf, 0) / psfSource.length) : 0;
  const rentPsf = +(avgP * yRate / 12).toFixed(2);

  // Floor premium
  const now = new Date();
  const m12d = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const m12 = `${m12d.getFullYear()}-${String(m12d.getMonth() + 1).padStart(2, '0')}`;
  const recentTx = txs.filter(t => t.date >= m12);
  const bands = ['01-05', '06-10', '11-15', '16-20', '21-25', '26-30', '31-35', '36-40', '41-45', '46-50'];
  const floorSource = recentTx.filter(t => t.floorMid > 0).length >= 3 ? recentTx : txs;
  const floorPeriod = floorSource === recentTx ? '12M' : 'all';
  const loFloor = floorSource.filter(t => t.floorMid > 0 && t.floorMid <= 5);
  const thinThreshold = 3;
  const loFloorAvg = loFloor.length >= thinThreshold ? Math.round(loFloor.reduce((s, t) => s + t.psf, 0) / loFloor.length) : null;
  const bpsf = loFloorAvg || avgP;
  const baselineSource = loFloorAvg ? 'low_floor' : 'project_avg';
  const thinBands = [];

  const projFloor = bands.map(r => {
    const [lo, hi] = r.split('-').map(Number);
    const ft = floorSource.filter(t => t.floorMid >= lo && t.floorMid <= hi);
    if (!ft.length) return null;
    const fp = Math.round(ft.reduce((s, t) => s + t.psf, 0) / ft.length);
    const count = ft.length;
    if (count < thinThreshold) thinBands.push(r);
    return { range: r, premium: bpsf > 0 ? +((fp / bpsf - 1) * 100).toFixed(1) : 0, psf: fp, count, thin: count < thinThreshold };
  }).filter(Boolean);

  // PSF trend by quarter
  const byQ = {};
  txs.forEach(t => { if (!byQ[t.quarter]) byQ[t.quarter] = []; byQ[t.quarter].push(t.psf); });
  const projPsfTrend = quarters.slice(-8).map(q => {
    const v = byQ[q] || [];
    return { q, avg: v.length > 0 ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : 0, med: med(v), vol: v.length };
  });

  // Real rental trend
  let projRentTrend;
  if (realProjRentals.length > 0) {
    const byRQ = {};
    realProjRentals.forEach(r => {
      const rY = r.d.slice(0, 4);
      const rM = parseInt(r.d.slice(5, 7)) || 1;
      const rQ = `${rY.slice(2)}q${Math.ceil(rM / 3)}`;
      if (!byRQ[rQ]) byRQ[rQ] = { rents: [], total: 0, n: 0 };
      byRQ[rQ].rents.push(r.rn); byRQ[rQ].total += r.rn; byRQ[rQ].n++;
    });
    const rqKeys = Object.keys(byRQ).sort();
    projRentTrend = rqKeys.map(q => ({
      q: q.replace('q', 'Q'), avg: byRQ[q].n > 0 ? Math.round(byRQ[q].total / byRQ[q].n) : 0, med: med(byRQ[q].rents),
    }));
  } else {
    projRentTrend = [];
  }

  // Heatmap
  const hmYears = years.slice(-7);
  const hmFloors = projFloor.map(f => f.range);
  const hmMatrix = {};
  hmFloors.forEach(f => {
    const [lo, hi] = f.split('-').map(Number);
    hmYears.forEach(y => {
      const c = txs.filter(t => t.floorMid >= lo && t.floorMid <= hi && t.year === y);
      if (c.length > 0) hmMatrix[`${f}-${y}`] = { psf: Math.round(c.reduce((s, t) => s + t.psf, 0) / c.length), vol: c.length, price: Math.round(c.reduce((s, t) => s + t.price, 0) / c.length) };
    });
  });

  // Size options
  const allSz = [...new Set(txs.map(t => t.area))].sort((a, b) => a - b);
  const std = allSz.length >= 7
    ? [0.05, 0.15, 0.3, 0.5, 0.7, 0.85, 0.95].map(p => allSz[Math.floor(p * (allSz.length - 1))])
    : allSz.length > 0 ? allSz : [];
  const projSizes = [...new Set(std)].sort((a, b) => a - b);
  const distAvg = dashboardCache?.sDistBar?.find(d => d.d === dist)?.v || avgP;

  const projTx = txs.map(t => ({
    date: `${t.year}-${String(t.month).padStart(2, '0')}`,
    address: t.floorRange || '-',
    area: t.area, price: t.price, psf: t.psf, type: t.saleType, beds: t.beds, tenure: t.tenure || '', floorMid: t.floorMid || 0,
  }));
  const projRentTx = realProjRentals.length > 0
    ? [...realProjRentals].sort((a, b) => b.d.localeCompare(a.d)).map(r => ({
        date: r.d, address: '-',
        area: r.af, areaSqf: r.a, bedrooms: r.br || '', rent: r.rn, psf: r.rp,
        leaseDate: r.lc || '', contracts: r.nc || 1,
      }))
    : [];

  // Real rental stats
  const realAvgRent = realProjRentals.length > 0
    ? Math.round(realProjRentals.reduce((s, r) => s + r.rn, 0) / realProjRentals.length) : 0;
  const realRentPsf = realProjRentals.length > 0
    ? +(realProjRentals.reduce((s, r) => s + r.rp, 0) / realProjRentals.length).toFixed(2) : 0;
  const realYield = realProjRentals.length > 0 && avgP > 0
    ? +((realRentPsf * 12 / avgP) * 100).toFixed(2) : 0;
  const rentalQuarters = realProjRentals.length > 0
    ? [...new Set(realProjRentals.map(r => r.d))].sort() : [];
  const rentalPeriod = rentalQuarters.length > 0
    ? (rentalQuarters.length === 1 ? rentalQuarters[0] : `${rentalQuarters[0]}–${rentalQuarters[rentalQuarters.length - 1]}`) : '';

  // ─── Nearby projects ───
  const projStreet = p.street || '';
  const nearbyProjects = _buildNearbyProjects(projectName, dist, projStreet);

  return {
    projInfo: {
      name: projectName, district: `${dist} (${p.street || ''})`.trim(),
      segment: seg, tenure: p.transaction?.[0]?.tenure || '', type: p.propertyType || pool?.type || '', top: '',
      units: txs.length, avgPsf: avgP, psfPeriod, medPsf: med(psfSource.map(t => t.psf)),
      totalTx: txs.length, avgRent: realAvgRent, rentPsf: realRentPsf,
      yield: realYield, distAvg,
      hasRealRental: realProjRentals.length > 0,
      rentalPeriod, rentalCount: realProjRentals.length,
    },
    projPsfTrend, projRentTrend, projFloor, floorPeriod, thinBands, baselineSource,
    projScatter: txs.slice(0, 80).map(t => ({ area: t.area, psf: t.psf, floor: t.floorMid, price: t.price, beds: t.beds })),
    projTx, projRentTx, hmYears, hmFloors, hmMatrix,
    rawTx: txs, projSizes, sizeOptions: allSz, floorRanges: hmFloors, txs,
    nearbyProjects,
    yearPsf: (() => { const yp = {}; years.forEach(y => { const yt = txs.filter(t => t.year === y); if (yt.length) yp[y] = Math.round(yt.reduce((s, t) => s + t.psf, 0) / yt.length); }); return yp; })(),
    yearPrice: (() => { const yp = {}; years.forEach(y => { const yt = txs.filter(t => t.year === y); if (yt.length) yp[y] = Math.round(yt.reduce((s, t) => s + t.price, 0) / yt.length); }); return yp; })(),
    bedYearPsf: (() => {
      const byp = {};
      for (const t of txs) {
        if (!t.beds) continue;
        const bedTypes = t.beds.split('/');
        for (const bt of bedTypes) {
          if (!byp[bt]) byp[bt] = {};
          if (!byp[bt][t.year]) byp[bt][t.year] = { s: 0, n: 0 };
          byp[bt][t.year].s += t.psf; byp[bt][t.year].n++;
        }
      }
      const result = {};
      for (const [beds, byYear] of Object.entries(byp)) {
        result[beds] = {};
        for (const [y, yData] of Object.entries(byYear)) { result[beds][y] = Math.round(yData.s / yData.n); }
      }
      return result;
    })(),
    bedYearPrice: (() => {
      const byp = {};
      for (const t of txs) {
        if (!t.beds) continue;
        const bedTypes = t.beds.split('/');
        for (const bt of bedTypes) {
          if (!byp[bt]) byp[bt] = {};
          if (!byp[bt][t.year]) byp[bt][t.year] = { s: 0, n: 0 };
          byp[bt][t.year].s += t.price; byp[bt][t.year].n++;
        }
      }
      const result = {};
      for (const [beds, byYear] of Object.entries(byp)) {
        result[beds] = {};
        for (const [y, yData] of Object.entries(byYear)) { result[beds][y] = Math.round(yData.s / yData.n); }
      }
      return result;
    })(),
    rentalBedrooms: [...new Set(realProjRentals.map(r => r.br).filter(b => b && b !== '' && /^\d+$/.test(b)))].sort((a, b) => parseInt(a) - parseInt(b)),
    bedOptions: [...new Set(txs.map(t => t.beds).filter(b => b && b !== ''))].sort((a, b) => parseInt(a) - parseInt(b)),
  };
}

function _buildNearbyProjects(projectName, dist, projStreet) {
  if (!Object.keys(projYearData).length) return [];

  const rentalByProj = {};
  for (const r of rentalStore) {
    if (!rentalByProj[r.p]) rentalByProj[r.p] = { total: 0, n: 0 };
    rentalByProj[r.p].total += r.rn; rentalByProj[r.p].n++;
  }

  // Pre-build per-project per-bedroom per-year PSF and Price
  const projBedYearPsf = {};
  const projBedYearPrice = {};
  for (const r of salesStore) {
    const beds = inferBedrooms(r.p, r.a);
    if (!beds) continue;
    const year = r.d.slice(0, 4);
    const bedTypes = beds.split('/');
    for (const bt of bedTypes) {
      if (!projBedYearPsf[r.p]) projBedYearPsf[r.p] = {};
      if (!projBedYearPsf[r.p][bt]) projBedYearPsf[r.p][bt] = {};
      if (!projBedYearPsf[r.p][bt][year]) projBedYearPsf[r.p][bt][year] = { s: 0, n: 0 };
      projBedYearPsf[r.p][bt][year].s += r.ps; projBedYearPsf[r.p][bt][year].n++;
      if (!projBedYearPrice[r.p]) projBedYearPrice[r.p] = {};
      if (!projBedYearPrice[r.p][bt]) projBedYearPrice[r.p][bt] = {};
      if (!projBedYearPrice[r.p][bt][year]) projBedYearPrice[r.p][bt][year] = { s: 0, n: 0 };
      projBedYearPrice[r.p][bt][year].s += r.pr; projBedYearPrice[r.p][bt][year].n++;
    }
  }

  const sameStreet = [];
  const sameDist = [];

  for (const [name, pd] of Object.entries(projYearData)) {
    if (name === projectName) continue;
    let rent = 0;
    const rp = rentalByProj[name];
    if (rp && rp.n > 0) rent = Math.round(rp.total / rp.n / 100) * 100;

    const bedYearPsf = {};
    const bedYearPrice = {};
    if (projBedYearPsf[name]) {
      for (const [beds, byYear] of Object.entries(projBedYearPsf[name])) {
        bedYearPsf[beds] = {};
        for (const [y, yData] of Object.entries(byYear)) { bedYearPsf[beds][y] = avg(yData.s, yData.n); }
      }
    }
    if (projBedYearPrice[name]) {
      for (const [beds, byYear] of Object.entries(projBedYearPrice[name])) {
        bedYearPrice[beds] = {};
        for (const [y, yData] of Object.entries(byYear)) { bedYearPrice[beds][y] = Math.round(yData.s / yData.n); }
      }
    }
    const entry = { name, ...pd, rent, bedYearPsf, bedYearPrice, rel: projStreet && pd.street === projStreet ? 'street' : 'district' };
    if (projStreet && pd.street === projStreet) {
      sameStreet.push(entry);
    } else if (pd.dist === dist) {
      sameDist.push(entry);
    }
  }
  sameStreet.sort((a, b) => b.n - a.n);
  sameDist.sort((a, b) => b.n - a.n);
  const result = [...sameStreet, ...sameDist.slice(0, Math.max(0, 15 - sameStreet.length))];
  return result.slice(0, 15);
}
