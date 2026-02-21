/**
 * query.js — Search + filtered dashboard
 * Extracted from uraService.js lines 1540-2154
 * Paginated transaction search + dynamic re-aggregation with user filters.
 */
import { avg, med, distSort, getYield, domSeg } from './helpers.ts';
import { buildDashboardData } from './dashboard.ts';
import { dashboardCache, salesStore, rentalStore, computedYield } from './state.ts';
import type { SalesSearchOpts, RentalSearchOpts, DashboardFilters, FilterOptions } from '../types.ts';
import type { SalesSearchOpts, RentalSearchOpts, DashboardFilters, FilterOptions, SearchResult, SalesRecord, RentalRecord } from '../types.ts';

// ═══ PAGINATED SEARCH ═══

export async function searchSales(opts: Partial<SalesSearchOpts> = {}): Promise<SearchResult<any>> {
  if (!dashboardCache) await buildDashboardData();
  const { q: rawQ = '', district = '', segment = '', type = '', tenure = '',
          page = 1, limit = 50, sort = 'date_desc' } = opts;
  const q = rawQ.slice(0, 200);

  let results = salesStore;
  if (q) { const ql = q.toLowerCase(); results = results.filter(r => r.p.toLowerCase().includes(ql) || r.st.toLowerCase().includes(ql)); }
  if (district) results = results.filter(r => r.di === district);
  if (segment) results = results.filter(r => r.sg === segment);
  if (type) results = results.filter(r => r.tp === type);
  if (tenure) results = results.filter(r => r.tn === tenure);

  if (sort === 'price_desc') results = [...results].sort((a, b) => b.pr - a.pr);
  else if (sort === 'price_asc') results = [...results].sort((a, b) => a.pr - b.pr);
  else if (sort === 'psf_desc') results = [...results].sort((a, b) => b.ps - a.ps);
  else if (sort === 'psf_asc') results = [...results].sort((a, b) => a.ps - b.ps);
  else if (sort === 'area_desc') results = [...results].sort((a, b) => b.a - a.a);
  else if (sort === 'area_asc') results = [...results].sort((a, b) => a.a - b.a);
  else if (sort === 'date_asc') results = [...results].sort((a, b) => a.d.localeCompare(b.d));
  else results = [...results].sort((a, b) => b.d.localeCompare(a.d));

  const total = results.length;
  const pages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const slice = results.slice(start, start + limit);

  return {
    total, page, pages, limit,
    results: slice.map(r => ({
      date: r.d, project: r.p, street: r.st, district: r.di, segment: r.sg,
      area: r.a, price: r.pr, psf: r.ps, floor: r.fl, type: r.tp,
      propertyType: r.pt, tenure: r.tn,
    })),
  };
}

export async function searchRental(opts: Partial<RentalSearchOpts> = {}): Promise<SearchResult<any>> {
  if (!dashboardCache) await buildDashboardData();
  const { q: rawQ = '', district = '', segment = '', bedrooms = '', areaSqft = '',
          page = 1, limit = 50, sort = 'date_desc' } = opts;
  const q = rawQ.slice(0, 200);

  let results = rentalStore;
  if (q) { const ql = q.toLowerCase(); results = results.filter(r => r.p.toLowerCase().includes(ql) || r.st.toLowerCase().includes(ql)); }
  if (district) results = results.filter(r => r.di === district);
  if (segment) results = results.filter(r => r.sg === segment);
  if (bedrooms) results = results.filter(r => r.br === bedrooms);
  if (areaSqft) {
    const [lo, hi] = areaSqft.split('-').map(Number);
    if (lo >= 0 && hi > 0) results = results.filter(r => r.a >= lo && r.a < hi);
  }

  if (sort === 'rent_desc') results = [...results].sort((a, b) => b.rn - a.rn);
  else if (sort === 'rent_asc') results = [...results].sort((a, b) => a.rn - b.rn);
  else if (sort === 'psf_desc') results = [...results].sort((a, b) => b.rp - a.rp);
  else if (sort === 'psf_asc') results = [...results].sort((a, b) => a.rp - b.rp);
  else if (sort === 'area_desc') results = [...results].sort((a, b) => b.a - a.a);
  else if (sort === 'area_asc') results = [...results].sort((a, b) => a.a - b.a);
  else if (sort === 'date_asc') results = [...results].sort((a, b) => a.d.localeCompare(b.d));
  else results = [...results].sort((a, b) => b.d.localeCompare(a.d));

  const total = results.length;
  const pages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const slice = results.slice(start, start + limit);

  return {
    total, page, pages, limit,
    results: slice.map(r => ({
      period: r.d, project: r.p, street: r.st, district: r.di, segment: r.sg,
      area: r.af, bedrooms: r.br || '', rent: r.rn, rentPsf: r.rp,
      contracts: r.nc, leaseDate: r.lc,
    })),
  };
}

// ═══ FILTERED DASHBOARD ═══

export function buildFilteredDashboard(filters: Partial<DashboardFilters> = {}): Record<string, any> | null {
  if (!dashboardCache) return null;

  let sales = salesStore;
  if (filters.district) sales = sales.filter(r => r.di === filters.district);
  if (filters.year)     sales = sales.filter(r => r.d.startsWith(filters.year));
  if (filters.segment)  sales = sales.filter(r => r.sg === filters.segment);
  if (filters.propertyType) sales = sales.filter(r => r.pt === filters.propertyType);
  if (filters.tenure)   sales = sales.filter(r => r.tn === filters.tenure);

  let rentals = rentalStore;
  if (filters.district) rentals = rentals.filter(r => r.di === filters.district);
  if (filters.year)     rentals = rentals.filter(r => r.d.startsWith(filters.year));
  if (filters.segment)  rentals = rentals.filter(r => r.sg === filters.segment);

  if (sales.length === 0) return null;

  // ── Single-pass aggregation ──
  const byYear = {}, byQtr = {}, bySeg = {}, byDist = {}, byType = {}, byTenure = {}, byProj = {};
  let totalVol = 0;
  const allPsf = [];
  const psfSample = [];

  for (const r of sales) {
    const year = r.d.slice(0, 4);
    const month = parseInt(r.d.slice(5, 7)) || 1;
    const qtr = `${year.slice(2)}Q${Math.ceil(month / 3)}`;
    totalVol += r.pr;

    if (psfSample.length < 2000) {
      psfSample.push({ psf: r.ps, area: r.a, seg: r.sg, dist: r.di, year });
    } else {
      const j = Math.floor(Math.random() * (allPsf.length + 1));
      if (j < 2000) psfSample[j] = { psf: r.ps, area: r.a, seg: r.sg, dist: r.di, year };
    }
    allPsf.push(r.ps);

    if (!byYear[year]) byYear[year] = { s: 0, n: 0, v: 0, p: [] };
    byYear[year].s += r.ps; byYear[year].n++; byYear[year].v += r.pr;
    if (byYear[year].p.length < 500) byYear[year].p.push(r.ps);

    if (!byQtr[qtr]) byQtr[qtr] = { s: 0, n: 0, v: 0, bySeg: {} };
    byQtr[qtr].s += r.ps; byQtr[qtr].n++; byQtr[qtr].v += r.pr;
    if (!byQtr[qtr].bySeg[r.sg]) byQtr[qtr].bySeg[r.sg] = { s: 0, n: 0 };
    byQtr[qtr].bySeg[r.sg].s += r.ps; byQtr[qtr].bySeg[r.sg].n++;

    if (!bySeg[r.sg]) bySeg[r.sg] = { s: 0, n: 0, byY: {} };
    bySeg[r.sg].s += r.ps; bySeg[r.sg].n++;
    if (!bySeg[r.sg].byY[year]) bySeg[r.sg].byY[year] = { s: 0, n: 0 };
    bySeg[r.sg].byY[year].s += r.ps; bySeg[r.sg].byY[year].n++;

    if (!byDist[r.di]) byDist[r.di] = { s: 0, n: 0, v: 0, byY: {}, byQ: {}, segCounts: {} };
    const dd = byDist[r.di];
    dd.s += r.ps; dd.n++; dd.v += r.pr;
    dd.segCounts[r.sg] = (dd.segCounts[r.sg] || 0) + 1;
    if (!dd.byY[year]) dd.byY[year] = { s: 0, n: 0 }; dd.byY[year].s += r.ps; dd.byY[year].n++;
    if (!dd.byQ[qtr]) dd.byQ[qtr] = { s: 0, n: 0 }; dd.byQ[qtr].s += r.ps; dd.byQ[qtr].n++;

    if (!byType[r.pt]) byType[r.pt] = { s: 0, n: 0, segCounts: {}, byY: {} };
    byType[r.pt].s += r.ps; byType[r.pt].n++;
    byType[r.pt].segCounts[r.sg] = (byType[r.pt].segCounts[r.sg] || 0) + 1;
    if (!byType[r.pt].byY[year]) byType[r.pt].byY[year] = { s: 0, n: 0 };
    byType[r.pt].byY[year].s += r.ps; byType[r.pt].byY[year].n++;

    if (!byTenure[r.tn]) byTenure[r.tn] = { s: 0, n: 0, byY: {} };
    byTenure[r.tn].s += r.ps; byTenure[r.tn].n++;
    if (!byTenure[r.tn].byY[year]) byTenure[r.tn].byY[year] = { s: 0, n: 0 };
    byTenure[r.tn].byY[year].s += r.ps; byTenure[r.tn].byY[year].n++;

    if (!byProj[r.p]) byProj[r.p] = { name: r.p, seg: r.sg, dist: r.di, pType: r.pt, s: 0, n: 0, areas: [], byY: {} };
    const bp = byProj[r.p];
    bp.s += r.ps; bp.n++;
    if (bp.areas.length < 50) bp.areas.push(r.a);
    if (!bp.byY[year]) bp.byY[year] = { s: 0, n: 0 }; bp.byY[year].s += r.ps; bp.byY[year].n++;
  }

  // ── Rental aggregation ──
  const rByQtr = {}, rBySeg = {}, rByDist = {}, rByProj = {};
  let rTotalRent = 0, rTotalPsf = 0, rCount = 0;
  const allRents = [];

  for (const r of rentals) {
    rTotalRent += r.rn; rTotalPsf += r.rp; rCount++;
    if (allRents.length < 5000) allRents.push(r.rn);
    const rYear = r.d.slice(0, 4);
    const rMonth = parseInt(r.d.slice(5, 7)) || 1;
    const rQtr = `${rYear.slice(2)}q${Math.ceil(rMonth / 3)}`;

    if (!rByQtr[rQtr]) rByQtr[rQtr] = { total: 0, rents: [], n: 0 };
    rByQtr[rQtr].total += r.rn; rByQtr[rQtr].rents.push(r.rn); rByQtr[rQtr].n++;

    if (!rBySeg[r.sg]) rBySeg[r.sg] = { total: 0, totalPsf: 0, n: 0 };
    rBySeg[r.sg].total += r.rn; rBySeg[r.sg].totalPsf += r.rp; rBySeg[r.sg].n++;

    if (!rByDist[r.di]) rByDist[r.di] = { total: 0, totalPsf: 0, n: 0, byQ: {} };
    rByDist[r.di].total += r.rn; rByDist[r.di].totalPsf += r.rp; rByDist[r.di].n++;
    if (!rByDist[r.di].byQ[rQtr]) rByDist[r.di].byQ[rQtr] = { totalPsf: 0, n: 0 };
    rByDist[r.di].byQ[rQtr].totalPsf += r.rp; rByDist[r.di].byQ[rQtr].n++;

    if (!rByProj[r.p]) rByProj[r.p] = { total: 0, totalPsf: 0, n: 0, seg: r.sg, dist: r.di };
    rByProj[r.p].total += r.rn; rByProj[r.p].totalPsf += r.rp; rByProj[r.p].n++;
  }

  const hasRental = rCount > 0;

  // ── Derived metrics ──
  const totalTx = sales.length;
  const years = Object.keys(byYear).sort();
  const qtrs = Object.keys(byQtr).sort();
  const latY = years[years.length - 1];
  const prevY = years.length > 1 ? years[years.length - 2] : null;

  const latOr = (obj) => {
    const ly = obj.byY?.[latY];
    return ly && ly.n >= 3 ? avg(ly.s, ly.n) : avg(obj.s, obj.n);
  };

  // Rolling window
  const latestDate = sales.length > 0 ? sales.reduce((mx, r) => r.d > mx ? r.d : mx, sales[0].d) : '';
  const ldParts = latestDate.split('-');
  const ldY = parseInt(ldParts[0]) || 2026;
  const ldM = parseInt(ldParts[1]) || 1;

  let salesWindowF, psfPeriod;
  for (const months of [3, 6, 12]) {
    const mAgo = new Date(ldY, ldM - months, 1);
    const cutoff = `${mAgo.getFullYear()}-${String(mAgo.getMonth() + 1).padStart(2, '0')}`;
    const filtered = sales.filter(r => r.d >= cutoff);
    if (filtered.length >= 20) { salesWindowF = filtered; psfPeriod = `${months}M`; break; }
  }
  if (!salesWindowF) {
    salesWindowF = sales.filter(r => r.d.startsWith(latY));
    if (salesWindowF.length === 0) salesWindowF = sales;
    psfPeriod = latY;
  }

  const avgPsf = salesWindowF.length > 0
    ? Math.round(salesWindowF.reduce((s, r) => s + r.ps, 0) / salesWindowF.length)
    : (latY && byYear[latY] ? avg(byYear[latY].s, byYear[latY].n) : avg(allPsf.reduce((s, v) => s + v, 0), totalTx));
  const medPsf = salesWindowF.length > 0
    ? med(salesWindowF.map(r => r.ps))
    : (latY && byYear[latY]?.p?.length > 0 ? med(byYear[latY].p) : med(allPsf));

  const latSamples = psfSample.filter(s => s.year === latY);
  const recentSamples = latSamples.length >= 50 ? latSamples : psfSample;
  const avgArea = recentSamples.length > 0 ? Math.round(recentSamples.reduce((s, p) => s + p.area, 0) / recentSamples.length) : 0;

  const latYAvg = byYear[latY] ? avg(byYear[latY].s, byYear[latY].n) : avgPsf;
  const prvAvg = prevY && byYear[prevY] ? avg(byYear[prevY].s, byYear[prevY].n) : 0;
  const yoyPct = prvAvg > 0 ? +((latYAvg / prvAvg - 1) * 100).toFixed(1) : null;

  const sortedPsf = recentSamples.map(s => s.psf).sort((a, b) => a - b);
  const pctl = (p) => sortedPsf.length > 10 ? sortedPsf[Math.floor(sortedPsf.length * p)] : 0;

  const overallYield = (() => {
    let tw = 0, tn = 0;
    for (const [seg, { n }] of Object.entries(bySeg)) { tw += getYield(seg, computedYield) * n; tn += n; }
    return tn > 0 ? tw / tn : 0.028;
  })();

  // ── YoY trend ──
  const yoy = years.map((y, i) => {
    const b = byYear[y];
    const a = avg(b.s, b.n);
    const m = med(b.p);
    const pa = i > 0 ? avg(byYear[years[i - 1]].s, byYear[years[i - 1]].n) : null;
    return { year: y, avg: a, med: m, yoy: pa ? +((a / pa - 1) * 100).toFixed(1) : null };
  });

  // ── Rental trend ──
  const rQtrs = Object.keys(rByQtr).sort();
  const rTrend = (rQtrs.length > 0 ? rQtrs : qtrs).slice(-8).map((q, i, arr) => {
    const qLabel = q.replace('q', 'Q');
    const rq = rByQtr[q];
    if (rq && rq.n > 0) {
      const a = Math.round(rq.total / rq.n);
      const m = med(rq.rents);
      const pq = i > 0 ? rByQtr[arr[i - 1]] : null;
      const pRent = pq && pq.n > 0 ? Math.round(pq.total / pq.n) : null;
      return { q: qLabel, avg: a, med: m, qoq: pRent ? +((a / pRent - 1) * 100).toFixed(1) : null, real: true };
    }
    const qb = byQtr[q];
    if (!qb) return { q: qLabel, avg: 0, med: 0, qoq: null, real: false };
    const a = avg(qb.s, qb.n);
    const rent = Math.round(a * overallYield / 12 * avgArea);
    return { q: qLabel, avg: rent, med: rent, qoq: null, real: false };
  });

  // ── Segments ──
  const sSeg = ['CCR', 'RCR', 'OCR'].map(s => ({
    name: s, val: bySeg[s] ? latOr(bySeg[s]) : 0, count: bySeg[s]?.n || 0,
  })).filter(s => s.count > 0);
  const rSeg = sSeg.map(s => {
    if (hasRental && rBySeg[s.name]) {
      return { name: s.name, val: rBySeg[s.name].n > 0 ? Math.round(rBySeg[s.name].total / rBySeg[s.name].n) : 0, count: rBySeg[s.name].n };
    }
    return { name: s.name, val: 0, count: 0 };
  });

  const sTop = Object.values(byProj).sort((a, b) => b.n - a.n).slice(0, 8).map(p => ({ n: p.name, c: p.n }));
  const rTop = hasRental
    ? Object.entries(rByProj).map(([name, rp]) => ({ n: name, c: rp.n })).sort((a, b) => b.c - a.c).slice(0, 8)
    : sTop;

  const dNames = Object.keys(byDist).sort(distSort);
  const topDist = Object.entries(byDist).sort((a, b) => b[1].n - a[1].n).slice(0, 5).map(([d]) => d);

  const sDistLine = qtrs.slice(-8).map(q => {
    const row = { q };
    topDist.forEach(d => { const dq = byDist[d]?.byQ[q]; row[d] = dq ? avg(dq.s, dq.n) : null; });
    return row;
  });
  const rDistLine = sDistLine.map(row => {
    const r = { q: row.q };
    const rqKey = row.q.replace('Q', 'q');
    topDist.forEach(d => {
      if (hasRental && rByDist[d]?.byQ?.[rqKey]?.n > 0) r[d] = +(rByDist[d].byQ[rqKey].totalPsf / rByDist[d].byQ[rqKey].n).toFixed(2);
      else if (hasRental && rByDist[d]?.n > 0) r[d] = +(rByDist[d].totalPsf / rByDist[d].n).toFixed(2);
      else r[d] = null;
    });
    return r;
  });

  const sDistBar = dNames.map(d => {
    const latD = byDist[d]?.byY?.[latY];
    const v = latD ? avg(latD.s, latD.n) : avg(byDist[d].s, byDist[d].n);
    return { d, v };
  }).sort((a, b) => b.v - a.v).slice(0, 10);
  const rDistBar = sDistBar.map(d => {
    if (hasRental && rByDist[d.d]) return { d: d.d, v: +(rByDist[d.d].totalPsf / rByDist[d.d].n).toFixed(2) };
    return { d: d.d, v: 0 };
  });

  const sType = Object.entries(byType).map(([t, v]) => ({ t, v: latOr(v) })).sort((a, b) => b.v - a.v).slice(0, 5);
  const rType = sType.map(t => {
    if (hasRental) {
      const projsOfType = Object.values(byProj).filter(p => p.pType === t.t);
      const rents = projsOfType.map(p => rByProj[p.name]).filter(Boolean);
      if (rents.length > 0) {
        const totalRent = rents.reduce((s, r) => s + r.total, 0);
        const totalCount = rents.reduce((s, r) => s + r.n, 0);
        if (totalCount > 0) return { t: t.t, v: Math.round(totalRent / totalCount) };
      }
    }
    return { t: t.t, v: 0 };
  });
  const sTenure = Object.entries(byTenure).map(([t, v]) => ({ t, v: latOr(v) })).sort((a, b) => b.v - a.v);

  // Histograms
  const psfVals = recentSamples.map(s => s.psf);
  const pMin = Math.floor(Math.min(...psfVals) / 200) * 200;
  const pMax = Math.ceil(Math.max(...psfVals) / 200) * 200;
  const sHist = [];
  for (let r = pMin; r < pMax; r += 200) sHist.push({ r: `$${r}`, c: psfVals.filter(p => p >= r && p < r + 200).length });

  let rHist;
  if (rentals.length > 0) {
    const realRents = rentals.slice(0, 2000).map(r => r.rn);
    const rMin = Math.floor(Math.min(...realRents) / 500) * 500;
    const rMax = Math.ceil(Math.max(...realRents) / 500) * 500;
    rHist = [];
    for (let r = rMin; r < rMax; r += 500) rHist.push({ r: `$${r}`, c: realRents.filter(p => p >= r && p < r + 500).length });
  } else { rHist = []; }

  const shuffled = [...recentSamples];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const sScat = shuffled.slice(0, 200).map(s => ({ a: s.area, p: s.psf, s: s.seg }));
  const rScat = rentals.length > 0 ? rentals.slice(0, 200).map(r => ({ a: r.a, p: r.rp, s: r.sg })) : [];

  const sCum = qtrs.slice(-12).map(q => ({ d: q, v: byQtr[q]?.v || 0 }));
  const rCum = qtrs.slice(-12).map(q => {
    const rqKey = q.replace('Q', 'q');
    return { d: q, v: rByQtr[rqKey]?.n || 0 };
  });

  // Investment
  const ydAll = dNames.map(d => {
    const b = byDist[d];
    const latD = b.byY?.[latY];
    const bp = latD ? avg(latD.s, latD.n) : avg(b.s, b.n);
    const dSeg = domSeg(b.segCounts);
    let yld, rp;
    if (hasRental && rByDist[d]) {
      rp = +(rByDist[d].totalPsf / rByDist[d].n).toFixed(2);
      yld = bp > 0 ? +((rp * 12 / bp) * 100).toFixed(2) : 0;
    } else { yld = 0; rp = 0; }
    return { d, rp, bp, y: yld, seg: dSeg };
  }).filter(d => d.bp > 0);
  const yd = [...ydAll].filter(d => d.y > 0).sort((a, b) => b.y - a.y).slice(0, 8);

  const CAGR_WINDOW = 5;
  const eY = years[years.length - 1];
  const sY = String(parseInt(eY) - CAGR_WINDOW);
  const cagrData = dNames.map(d => {
    const b = byDist[d];
    const sA = b.byY?.[sY] ? avg(b.byY[sY].s, b.byY[sY].n) : null;
    const eA = b.byY?.[eY] ? avg(b.byY[eY].s, b.byY[eY].n) : null;
    if (!sA || !eA) return null;
    const lowConf = (b.byY[sY]?.n || 0) < 3 || (b.byY[eY]?.n || 0) < 3;
    const cagr = +((Math.pow(eA / sA, 1 / CAGR_WINDOW) - 1) * 100).toFixed(1);
    const yRec = ydAll.find(y => y.d === d);
    const yld = yRec ? yRec.y : 0;
    return { d, cagr, y: yld, seg: domSeg(b.segCounts), bp: eA, total: +(cagr + yld).toFixed(2), cagrYears: CAGR_WINDOW, lowConf };
  }).filter(Boolean).sort((a, b) => b.total - a.total).slice(0, 8);

  const distPerf = dNames.map(d => {
    const b = byDist[d];
    const sA = b.byY?.[sY] ? avg(b.byY[sY].s, b.byY[sY].n) : null;
    const eA = b.byY?.[eY] ? avg(b.byY[eY].s, b.byY[eY].n) : null;
    if (!sA || !eA || sA <= 0) return null;
    const sTx = b.byY[sY]?.n || 0;
    const eTx = b.byY[eY]?.n || 0;
    const lowConf = sTx < 3 || eTx < 3;
    const absDiff = Math.round(eA - sA);
    const pctChg = +((eA / sA - 1) * 100).toFixed(1);
    const cagr = +((Math.pow(eA / sA, 1 / CAGR_WINDOW) - 1) * 100).toFixed(1);
    const yRec = ydAll.find(y => y.d === d);
    const yld = yRec ? yRec.y : 0;
    const totalReturn = +(cagr + yld).toFixed(2);
    return {
      d, seg: domSeg(b.segCounts),
      startPsf: Math.round(sA), endPsf: Math.round(eA),
      absDiff, pctChg, cagr, yield: yld, totalReturn,
      startYear: sY, endYear: eY, window: CAGR_WINDOW,
      txStart: sTx, txEnd: eTx, txTotal: b.n, lowConf,
    };
  }).filter(Boolean).sort((a, b) => b.cagr - a.cagr);

  const projPerf = Object.values(byProj).map(p => {
    if (p.n < 5) return null;
    const sD = p.byY?.[sY]; const eD = p.byY?.[eY];
    if (!sD || !eD) return null;
    const sA = avg(sD.s, sD.n); const eA = avg(eD.s, eD.n);
    if (sA <= 0 || eA <= 0) return null;
    const lowConf = sD.n < 2 || eD.n < 2;
    const absDiff = Math.round(eA - sA);
    const pctChg = +((eA / sA - 1) * 100).toFixed(1);
    const cagr = +((Math.pow(eA / sA, 1 / CAGR_WINDOW) - 1) * 100).toFixed(1);
    const rp = hasRental ? rByProj[p.name] : null;
    const yld = rp && eA > 0 ? +((rp.totalPsf / rp.n * 12 / eA) * 100).toFixed(2) : 0;
    const totalReturn = +(cagr + yld).toFixed(2);
    return {
      name: p.name, dist: p.dist, seg: p.seg, street: '',
      startPsf: Math.round(sA), endPsf: Math.round(eA),
      absDiff, pctChg, cagr, yield: yld, totalReturn,
      startYear: sY, endYear: eY, window: CAGR_WINDOW,
      txStart: sD.n, txEnd: eD.n, txTotal: p.n, lowConf,
    };
  }).filter(Boolean).sort((a, b) => b.cagr - a.cagr);

  const mktSaleTx = [...sales].sort((a, b) => b.d.localeCompare(a.d)).slice(0, 500).map(r => ({
    date: r.d, project: r.p, district: r.di, segment: r.sg, type: r.pt,
    unit: r.fl, area: r.a, floor: r.fm, psf: r.ps, price: r.pr,
  }));
  const mktRentTx = rentals.length > 0
    ? [...rentals].sort((a, b) => b.d.localeCompare(a.d)).slice(0, 500).map(r => ({
        date: r.d, project: r.p, district: r.di, segment: r.sg, unit: '-',
        area: r.af, bedrooms: r.br || '', floor: 0, rent: r.rn, rentPsf: r.rp,
      }))
    : [];

  const cmpPool = dashboardCache.cmpPool || [];
  const projList = dashboardCache.projList || [];
  const projIndex = dashboardCache.projIndex || {};
  const distTopPsf = dashboardCache.distTopPsf || [];

  // Rental stats
  let rentalWindowF, rentalPeriodLabel;
  for (const months of [3, 6, 12]) {
    const mAgo = new Date(ldY, ldM - months, 1);
    const cutoff = `${mAgo.getFullYear()}-${String(mAgo.getMonth() + 1).padStart(2, '0')}`;
    const filtered = rentals.filter(r => r.d >= cutoff);
    if (filtered.length >= 20) { rentalWindowF = filtered; rentalPeriodLabel = `${months}M`; break; }
  }
  if (!rentalWindowF) { rentalWindowF = rentals; rentalPeriodLabel = 'all'; }
  const latRentalTotal = rentalWindowF.length;
  const avgRent = latRentalTotal > 0 ? Math.round(rentalWindowF.reduce((s, r) => s + r.rn, 0) / latRentalTotal) : Math.round(avgPsf * overallYield / 12 * avgArea);
  const avgRentPsf = latRentalTotal > 0 ? +(rentalWindowF.reduce((s, r) => s + r.rp, 0) / latRentalTotal).toFixed(2) : +(avgPsf * overallYield / 12).toFixed(2);
  const latRentalMed = latRentalTotal > 0 ? med(rentalWindowF.map(r => r.rn)) : avgRent;
  const latRentalSegCounts = {};
  for (const r of rentalWindowF) latRentalSegCounts[r.sg] = (latRentalSegCounts[r.sg] || 0) + 1;

  return {
    totalTx, avgPsf, medPsf, yoyPct, latestYear: latY, psfPeriod,
    totalVolume: totalVol,
    avgRent, avgRentPsf,
    bestYield: yd[0] || null, hasRealRental: hasRental,
    segCounts: { CCR: bySeg['CCR']?.n || 0, RCR: bySeg['RCR']?.n || 0, OCR: bySeg['OCR']?.n || 0 },
    rentalTotal: latRentalTotal,
    rentalPeriod: rentalPeriodLabel,
    rentalSegCounts: { CCR: latRentalSegCounts['CCR'] || 0, RCR: latRentalSegCounts['RCR'] || 0, OCR: latRentalSegCounts['OCR'] || 0 },
    medRent: latRentalMed,
    psfP5: pctl(0.05), psfP95: pctl(0.95), psfP25: pctl(0.25), psfP75: pctl(0.75),
    years, quarters: qtrs, topDistricts: topDist, districtNames: dNames,
    yoy, rTrend, sSeg, rSeg, sTop, rTop,
    sDistLine, rDistLine, sDistBar, rDistBar,
    sType, rType, sTenure,
    sHist, rHist, sScat, rScat, sCum, rCum,
    yd, cagrData, distPerf, projPerf,
    avgCagr: distPerf.length > 0 ? +(distPerf.reduce((s, d) => s + d.cagr, 0) / distPerf.length).toFixed(1) : 0,
    avgYield: yd.length > 0 ? +(yd.reduce((s, d) => s + d.y, 0) / yd.length).toFixed(2) : 0,
    mktSaleTx, mktRentTx, cmpPool, projList, projIndex, distTopPsf,
    appliedFilters: filters,
    filteredSalesCount: sales.length,
    filteredRentalCount: rentals.length,
    lastUpdated: dashboardCache.lastUpdated,
  };
}

export function getFilterOptions(): FilterOptions {
  const districts = [...new Set(salesStore.map(r => r.di))].sort(distSort);
  const segments = [...new Set(salesStore.map(r => r.sg))].sort();
  const types = [...new Set(salesStore.map(r => r.tp))].sort();
  const tenures = [...new Set(salesStore.map(r => r.tn))].sort();
  const propertyTypes = [...new Set(salesStore.map(r => r.pt))].sort();
  const years = [...new Set(salesStore.map(r => r.d.slice(0, 4)))].sort();
  const bedrooms = [...new Set(rentalStore.map(r => r.br).filter(b => b && b !== ''))].sort((a, b) => parseInt(a) - parseInt(b));
  const areaSqftRanges = [
    { label: 'Under 500 sf', value: '0-500' },
    { label: '500 - 1,000 sf', value: '500-1000' },
    { label: '1,000 - 1,500 sf', value: '1000-1500' },
    { label: '1,500 - 2,000 sf', value: '1500-2000' },
    { label: '2,000 - 3,000 sf', value: '2000-3000' },
    { label: '3,000+ sf', value: '3000-99999' },
  ];
  return { districts, segments, types, tenures, propertyTypes, years, bedrooms, areaSqftRanges };
}
