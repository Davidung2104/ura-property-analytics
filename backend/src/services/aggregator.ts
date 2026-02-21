/**
 * aggregator.js — Core aggregation engine
 * Extracted from uraService.js lines 259-845
 * The Agg class processes raw URA transaction data into dashboard metrics.
 * All calculation formulas preserved exactly as-is.
 */
import { parseDate, parseFloor, distSort, avg, med, getYield, estRent, domSeg, TopN } from './helpers.ts';
import { salesStore, rentalStore, projectBatchMap, computedYield, setComputedYield } from './state.ts';

import type { UraProject, RentalAggData, MarketSegment, SaleType, TenureType } from '../types.ts';

// Internal bucket types for aggregation
interface YearBucket { s: number; n: number; v: number; p: number[] }
interface QtrBucket { s: number; n: number; v: number; bySeg: Record<string, { s: number; n: number }> }
interface SegBucket { s: number; n: number; byY: Record<string, { s: number; n: number }> }
interface DistBucket { s: number; n: number; v: number; byY: Record<string, { s: number; n: number }>; byQ: Record<string, { s: number; n: number }>; segCounts: Record<string, number> }
interface TypeBucket { s: number; n: number; segCounts: Record<string, number>; byY: Record<string, { s: number; n: number }> }
interface TenureBucket { s: number; n: number; byY: Record<string, { s: number; n: number }> }
interface ProjBucket { name: string; street: string; seg: string; dist: string; tenure: string; pType: string; s: number; n: number; areas: number[]; prices: number[]; byY: Record<string, { s: number; n: number; ps: number }>; byFl: Record<string, { s: number; n: number }>; latest: string }
interface Sample { psf: number; area: number; seg: string; dist: string; year: string }
interface TopTxEntry { date: string; project: string; district: string; segment: string; type: string; unit: string; area: number; floor: number; psf: number; price: number }

export class Agg {
  total: number;
  vol: number;
  samples: Sample[];
  byYear: Record<string, YearBucket>;
  byQtr: Record<string, QtrBucket>;
  bySeg: Record<string, SegBucket>;
  byDist: Record<string, DistBucket>;
  byType: Record<string, TypeBucket>;
  byTenure: Record<string, TenureBucket>;
  byProj: Record<string, ProjBucket>;
  byFloor: Record<string, { s: number; n: number }>;
  topTx: TopN<TopTxEntry>;

  constructor() {
    this.total = 0; this.vol = 0;
    this.samples = [];
    this.byYear = {}; this.byQtr = {};
    this.bySeg = {}; this.byDist = {};
    this.byType = {}; this.byTenure = {};
    this.byProj = {}; this.byFloor = {};
    // FIX #1: Bounded top-500 latest tx — no unbounded array
    this.topTx = new TopN(500, (a, b) => b.date.localeCompare(a.date));
  }

  add(proj: UraProject, batchNum: number): void {
    const txs = proj.transaction || [];
    const name = proj.project || 'Unknown';
    const street = proj.street || '';
    const seg = (proj.marketSegment || 'RCR').toUpperCase();
    projectBatchMap[name] = batchNum;

    for (const tx of txs) {
      const d = parseDate(tx.contractDate);
      if (!d) continue;
      const sqm = parseFloat(tx.area) || 0;
      const area = Math.round(sqm * 10.7639);
      const price = parseFloat(tx.price) || 0;
      if (area <= 0 || price <= 0) continue;
      const psf = Math.round(price / area);
      if (psf <= 0 || psf > 50000) continue;

      const fl = parseFloor(tx.floorRange);
      const dist = `D${parseInt(tx.district) || 0}`;
      const pType = tx.propertyType || 'Unknown';
      let tenure = 'Leasehold';
      if (tx.tenure) {
        const t = tx.tenure.toLowerCase();
        if (t.includes('freehold')) tenure = 'Freehold';
        else if (t.includes('999')) tenure = '999-yr';
      }

      this.total++;
      this.vol += price;

      const y = String(d.year);

      // Reservoir sampling
      if (this.samples.length < 2000) {
        this.samples.push({ psf, area, seg, dist, year: y });
      } else {
        const j = Math.floor(Math.random() * this.total);
        if (j < 2000) this.samples[j] = { psf, area, seg, dist, year: y };
      }

      if (!this.byYear[y]) this.byYear[y] = { s: 0, n: 0, v: 0, p: [] };
      const yb = this.byYear[y];
      yb.s += psf; yb.n++; yb.v += price;
      if (yb.p.length < 500) { yb.p.push(psf); }
      else { const j = Math.floor(Math.random() * yb.n); if (j < 500) yb.p[j] = psf; }

      const q = d.quarter;
      if (!this.byQtr[q]) this.byQtr[q] = { s: 0, n: 0, v: 0, bySeg: {} };
      const qb = this.byQtr[q];
      qb.s += psf; qb.n++; qb.v += price;
      if (!qb.bySeg[seg]) qb.bySeg[seg] = { s: 0, n: 0 };
      qb.bySeg[seg].s += psf; qb.bySeg[seg].n++;

      if (!this.bySeg[seg]) this.bySeg[seg] = { s: 0, n: 0, byY: {} };
      this.bySeg[seg].s += psf; this.bySeg[seg].n++;
      if (!this.bySeg[seg].byY[y]) this.bySeg[seg].byY[y] = { s: 0, n: 0 };
      this.bySeg[seg].byY[y].s += psf; this.bySeg[seg].byY[y].n++;

      if (!this.byDist[dist]) this.byDist[dist] = { s: 0, n: 0, v: 0, byY: {}, byQ: {}, segCounts: {} };
      const dd = this.byDist[dist];
      dd.s += psf; dd.n++; dd.v += price;
      dd.segCounts[seg] = (dd.segCounts[seg] || 0) + 1;
      if (!dd.byY[y]) dd.byY[y] = { s: 0, n: 0 }; dd.byY[y].s += psf; dd.byY[y].n++;
      if (!dd.byQ[q]) dd.byQ[q] = { s: 0, n: 0 }; dd.byQ[q].s += psf; dd.byQ[q].n++;

      if (!this.byType[pType]) this.byType[pType] = { s: 0, n: 0, segCounts: {}, byY: {} };
      this.byType[pType].s += psf; this.byType[pType].n++;
      this.byType[pType].segCounts[seg] = (this.byType[pType].segCounts[seg] || 0) + 1;
      if (!this.byType[pType].byY[y]) this.byType[pType].byY[y] = { s: 0, n: 0 };
      this.byType[pType].byY[y].s += psf; this.byType[pType].byY[y].n++;

      if (!this.byTenure[tenure]) this.byTenure[tenure] = { s: 0, n: 0, byY: {} };
      this.byTenure[tenure].s += psf; this.byTenure[tenure].n++;
      if (!this.byTenure[tenure].byY[y]) this.byTenure[tenure].byY[y] = { s: 0, n: 0 };
      this.byTenure[tenure].byY[y].s += psf; this.byTenure[tenure].byY[y].n++;

      if (!this.byProj[name]) this.byProj[name] = { name, street, seg, dist, tenure: tx.tenure || '', pType, s: 0, n: 0, areas: [], prices: [], byY: {}, byFl: {}, latest: '' };
      const bp = this.byProj[name];
      bp.s += psf; bp.n++;
      if (bp.areas.length < 50) bp.areas.push(area);
      if (bp.prices.length < 50) { bp.prices.push(psf); }
      else { const j = Math.floor(Math.random() * bp.n); if (j < 50) bp.prices[j] = psf; }
      if (!bp.byY[y]) bp.byY[y] = { s: 0, n: 0, ps: 0 }; bp.byY[y].s += psf; bp.byY[y].n++; bp.byY[y].ps += price;
      if (fl.band) { if (!bp.byFl[fl.band]) bp.byFl[fl.band] = { s: 0, n: 0 }; bp.byFl[fl.band].s += psf; bp.byFl[fl.band].n++; }
      const ds = `${d.year}-${String(d.month).padStart(2, '0')}`;
      if (ds > bp.latest) bp.latest = ds;

      if (fl.band) { if (!this.byFloor[fl.band]) this.byFloor[fl.band] = { s: 0, n: 0 }; this.byFloor[fl.band].s += psf; this.byFloor[fl.band].n++; }

      // FIX #1: Bounded insert — only keeps top 500 by date
      const txDate = `${d.year}-${String(d.month).padStart(2, '0')}`;
      this.topTx.add({ date: txDate, project: name, district: dist, segment: seg, type: pType, unit: fl.band || '-', area, floor: fl.mid, psf, price });

      // Store ALL transactions for full browsing/search
      salesStore.push({
        d: txDate, p: name, st: street, di: dist, sg: seg,
        a: area, pr: price, ps: psf, fl: fl.band || '-', fm: fl.mid,
        tp: tx.typeOfSale === '1' ? 'New Sale' : tx.typeOfSale === '2' ? 'Sub Sale' : 'Resale',
        pt: pType, tn: tenure,
      });
    }
  }

  _qtrYield(q: string): number {
    const qb = this.byQtr[q];
    if (!qb || qb.n === 0) return 0.028;
    let tw = 0;
    for (const [seg, { n }] of Object.entries(qb.bySeg)) tw += getYield(seg, computedYield) * n;
    return tw / qb.n;
  }

  _overallYield(): number {
    let tw = 0, tn = 0;
    for (const [seg, { n }] of Object.entries(this.bySeg)) { tw += getYield(seg, computedYield) * n; tn += n; }
    return tn > 0 ? tw / tn : 0.028;
  }

  build(rentalData: RentalAggData | null): Record<string, any> {
    const years = Object.keys(this.byYear).sort();
    const qtrs = Object.keys(this.byQtr).sort();
    const latY = years[years.length - 1];
    const prevY = years.length > 1 ? years[years.length - 2] : null;

    const latOr = (obj: { byY?: Record<string, { s: number; n: number }>; s: number; n: number }): number => {
      const ly = obj.byY?.[latY];
      return ly && ly.n >= 3 ? avg(ly.s, ly.n) : avg(obj.s, obj.n);
    };

    // ── Rolling window for stat cards (consistent for both sales and rental) ──
    const now3M = new Date();
    let salesWindow, psfPeriod;
    for (const months of [3, 6, 12]) {
      const mAgo = new Date(now3M.getFullYear(), now3M.getMonth() - (months - 1), 1);
      const cutoff = `${mAgo.getFullYear()}-${String(mAgo.getMonth() + 1).padStart(2, '0')}`;
      const filtered = salesStore.filter(r => r.d >= cutoff);
      if (filtered.length >= 20) {
        salesWindow = filtered;
        psfPeriod = `${months}M`;
        break;
      }
    }
    if (!salesWindow) {
      salesWindow = salesStore.filter(r => r.d.startsWith(latY));
      if (salesWindow.length === 0) salesWindow = salesStore;
      psfPeriod = latY;
    }
    const avgPsf = salesWindow.length > 0
      ? Math.round(salesWindow.reduce((s, r) => s + r.ps, 0) / salesWindow.length)
      : avg(this.byYear[latY]?.s || 0, this.byYear[latY]?.n || this.total);
    const medPsf = salesWindow.length > 0
      ? med(salesWindow.map(r => r.ps))
      : (this.byYear[latY]?.p?.length > 0 ? med(this.byYear[latY].p) : med(this.samples.map(s => s.psf)));

    const latSamples = this.samples.filter(s => s.year === latY);
    const recentSamples = latSamples.length >= 50 ? latSamples : this.samples;
    const avgArea = recentSamples.length > 0 ? Math.round(recentSamples.reduce((s, p) => s + p.area, 0) / recentSamples.length) : 0;

    const latYAvg = this.byYear[latY] ? avg(this.byYear[latY].s, this.byYear[latY].n) : avgPsf;
    const prvAvg = prevY && this.byYear[prevY] ? avg(this.byYear[prevY].s, this.byYear[prevY].n) : 0;
    const yoyPct = prvAvg > 0 ? +((latYAvg / prvAvg - 1) * 100).toFixed(1) : null;
    const overallYield = this._overallYield();

    // FIX #2: Use real rental data if available
    const hasRental = rentalData && rentalData.byProject && Object.keys(rentalData.byProject).length > 0;

    // Compute real yield per segment
    if (hasRental) {
      const newComputedYield = {};
      const salePsfW = {};
      for (const r of salesWindow) {
        if (!salePsfW[r.sg]) salePsfW[r.sg] = { s: 0, n: 0 };
        salePsfW[r.sg].s += r.ps; salePsfW[r.sg].n++;
      }
      const rentPsfW = {};
      let rentalWindow;
      for (const months of [3, 6, 12]) {
        const mAgo = new Date(now3M.getFullYear(), now3M.getMonth() - (months - 1), 1);
        const cutoff = `${mAgo.getFullYear()}-${String(mAgo.getMonth() + 1).padStart(2, '0')}`;
        const filtered = rentalStore.filter(r => r.d >= cutoff);
        if (filtered.length >= 20) { rentalWindow = filtered; break; }
      }
      if (!rentalWindow) rentalWindow = rentalStore;
      for (const r of rentalWindow) {
        if (!rentPsfW[r.sg]) rentPsfW[r.sg] = { s: 0, n: 0 };
        rentPsfW[r.sg].s += r.rp; rentPsfW[r.sg].n++;
      }
      let fallbackYield = 0, fallbackCount = 0;
      for (const seg of ['CCR', 'RCR', 'OCR']) {
        const sp = salePsfW[seg]?.n > 0 ? avg(salePsfW[seg].s, salePsfW[seg].n) : 0;
        const rp = rentPsfW[seg]?.n > 0 ? +(rentPsfW[seg].s / rentPsfW[seg].n).toFixed(2) : 0;
        if (sp > 0 && rp > 0) {
          newComputedYield[seg] = (rp * 12) / sp;
          fallbackYield += newComputedYield[seg] * (salePsfW[seg]?.n || 1);
          fallbackCount += salePsfW[seg]?.n || 1;
        }
      }
      const avgYieldFallback = fallbackCount > 0 ? fallbackYield / fallbackCount : 0.028;
      for (const seg of ['CCR', 'RCR', 'OCR']) {
        if (!newComputedYield[seg]) newComputedYield[seg] = avgYieldFallback;
      }
      setComputedYield(newComputedYield);
      console.log(`📊 Real yields (${psfPeriod}):`, Object.entries(newComputedYield).map(([k, v]) => `${k}: ${(v * 100).toFixed(2)}%`).join(', '));
    } else {
      setComputedYield(null);
      console.log('⚠️ No rental data — using estimated yields');
    }

    // ── Rental stats ──
    let rentalStatWindow, rentalPeriodLabel;
    for (const months of [3, 6, 12]) {
      const mAgo = new Date(now3M.getFullYear(), now3M.getMonth() - (months - 1), 1);
      const cutoff = `${mAgo.getFullYear()}-${String(mAgo.getMonth() + 1).padStart(2, '0')}`;
      const filtered = rentalStore.filter(r => r.d >= cutoff);
      if (filtered.length >= 20) { rentalStatWindow = filtered; rentalPeriodLabel = `${months}M`; break; }
    }
    if (!rentalStatWindow) { rentalStatWindow = rentalStore; rentalPeriodLabel = 'all'; }
    const latRentalTotal = rentalStatWindow.length;
    const latRentalAvgRent = latRentalTotal > 0 ? Math.round(rentalStatWindow.reduce((s, r) => s + r.rn, 0) / latRentalTotal) : null;
    const latRentalAvgPsf = latRentalTotal > 0 ? +(rentalStatWindow.reduce((s, r) => s + r.rp, 0) / latRentalTotal).toFixed(2) : null;
    const latRentalMed = latRentalTotal > 0 ? med(rentalStatWindow.map(r => r.rn)) : null;
    const latRentalSegCounts = {};
    for (const r of rentalStatWindow) latRentalSegCounts[r.sg] = (latRentalSegCounts[r.sg] || 0) + 1;

    // ─── YoY ───
    const yoy = years.map((y, i) => {
      const b = this.byYear[y];
      const a = avg(b.s, b.n);
      const m = med(b.p);
      const pa = i > 0 ? avg(this.byYear[years[i - 1]].s, this.byYear[years[i - 1]].n) : null;
      return { year: y, avg: a, med: m, yoy: pa ? +((a / pa - 1) * 100).toFixed(1) : null };
    });

    // ─── Rental trend ───
    const rTrend = qtrs.slice(-8).map((q, i) => {
      const qb = this.byQtr[q];
      const a = avg(qb.s, qb.n);
      const qKey = q.replace('Q', 'q');
      const realQ = hasRental && rentalData.byQtr[qKey];
      const rent = realQ ? realQ.avgRent : Math.round(a * this._qtrYield(q) / 12 * avgArea);
      const rentMed = realQ ? realQ.medRent : rent;
      const pq = i > 0 ? qtrs.slice(-8)[i - 1] : null;
      let pRent = null;
      if (pq) {
        const pqKey = pq.replace('Q', 'q');
        const realPQ = hasRental && rentalData.byQtr[pqKey];
        pRent = realPQ ? realPQ.avgRent : Math.round(avg(this.byQtr[pq].s, this.byQtr[pq].n) * this._qtrYield(pq) / 12 * avgArea);
      }
      return { q, avg: rent, med: rentMed, qoq: pRent ? +((rent / pRent - 1) * 100).toFixed(1) : null, real: !!realQ };
    });

    // ─── Segments ───
    const sSeg = ['CCR', 'RCR', 'OCR'].map(s => ({
      name: s, val: this.bySeg[s] ? latOr(this.bySeg[s]) : 0, count: this.bySeg[s]?.n || 0,
    })).filter(s => s.count > 0);
    const rSeg = sSeg.map(s => {
      if (hasRental && rentalData.bySeg[s.name]) {
        return { name: s.name, val: rentalData.bySeg[s.name].avgRent, count: rentalData.bySeg[s.name].count };
      }
      return { name: s.name, val: 0, count: 0 };
    });

    const sTop = Object.values(this.byProj).sort((a, b) => b.n - a.n).slice(0, 8).map(p => ({ n: p.name, c: p.n }));
    let rTop;
    if (hasRental) {
      rTop = Object.entries(rentalData.byProject)
        .map(([name, rp]) => ({ n: name, c: rp.count }))
        .sort((a, b) => b.c - a.c).slice(0, 8);
      if (rTop.length === 0) rTop = sTop;
    } else {
      rTop = sTop;
    }

    const dNames = Object.keys(this.byDist).sort(distSort);
    const topDist = Object.entries(this.byDist).sort((a, b) => b[1].n - a[1].n).slice(0, 5).map(([d]) => d);

    const sDistLine = qtrs.slice(-8).map(q => {
      const row = { q };
      topDist.forEach(d => { const dq = this.byDist[d]?.byQ[q]; row[d] = dq ? avg(dq.s, dq.n) : null; });
      return row;
    });
    const rDistLine = sDistLine.map(row => {
      const r = { q: row.q };
      const rqKey = row.q.replace('Q', 'q');
      topDist.forEach(d => {
        if (hasRental && rentalData.byDist[d]?.byQ?.[rqKey]) {
          r[d] = rentalData.byDist[d].byQ[rqKey].avgRentPsf;
        } else if (hasRental && rentalData.byDist[d]) {
          r[d] = rentalData.byDist[d].avgRentPsf || null;
        } else {
          r[d] = null;
        }
      });
      return r;
    });

    const latYKey = latY;
    const sDistBar = dNames.map(d => {
      const latD = this.byDist[d]?.byY[latYKey];
      const v = latD ? avg(latD.s, latD.n) : avg(this.byDist[d].s, this.byDist[d].n);
      return { d, v };
    }).sort((a, b) => b.v - a.v).slice(0, 10);
    const rDistBar = sDistBar.map(d => {
      if (hasRental && rentalData.byDist[d.d]) return { d: d.d, v: rentalData.byDist[d.d].avgRentPsf };
      return { d: d.d, v: 0 };
    });

    const sType = Object.entries(this.byType).map(([t, v]) => ({ t, v: latOr(v) })).sort((a, b) => b.v - a.v).slice(0, 5);
    const rType = sType.map(t => {
      if (hasRental) {
        const projsOfType = Object.values(this.byProj).filter(p => p.pType === t.t);
        const rents = projsOfType.map(p => rentalData.byProject[p.name]).filter(Boolean);
        if (rents.length > 0) {
          const totalRent = rents.reduce((s, r) => s + r.avgRent * r.count, 0);
          const totalCount = rents.reduce((s, r) => s + r.count, 0);
          if (totalCount > 0) return { t: t.t, v: Math.round(totalRent / totalCount) };
        }
      }
      return { t: t.t, v: 0 };
    });
    const sTenure = Object.entries(this.byTenure).map(([t, v]) => ({ t, v: latOr(v) })).sort((a, b) => b.v - a.v);

    // Histogram
    const psfVals = recentSamples.map(s => s.psf);
    const pMin = Math.floor(psfVals.reduce((a, b) => a < b ? a : b, Infinity) / 200) * 200;
    const pMax = Math.ceil(psfVals.reduce((a, b) => a > b ? a : b, 0) / 200) * 200;
    const sHist = [];
    for (let r = pMin; r < pMax; r += 200) sHist.push({ r: `$${r}`, c: psfVals.filter(p => p >= r && p < r + 200).length });

    const sScat = (() => {
      const shuffled = [...recentSamples];
      for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
      return shuffled.slice(0, 200).map(s => ({ a: s.area, p: s.psf, s: s.seg }));
    })();

    let rHist, rScat;
    if (rentalStore.length > 0) {
      const realRents = rentalStore.slice(0, 2000).map(r => r.rn);
      const rMin = Math.floor(Math.min(...realRents) / 500) * 500;
      const rMax = Math.ceil(Math.max(...realRents) / 500) * 500;
      rHist = [];
      for (let r = rMin; r < rMax; r += 500) rHist.push({ r: `$${r}`, c: realRents.filter(p => p >= r && p < r + 500).length });
      rScat = rentalStore.slice(0, 200).map(r => ({ a: r.a, p: r.rp, s: r.sg }));
    } else {
      rHist = []; rScat = [];
    }

    const sCum = qtrs.slice(-12).map(q => ({ d: q, v: this.byQtr[q]?.v || 0 }));
    const rCum = qtrs.slice(-12).map(q => {
      const rqKey = q.replace('Q', 'q');
      const realQ = hasRental && rentalData.byQtr[rqKey];
      return { d: q, v: realQ ? realQ.count : 0 };
    });

    // Investment: Yield + CAGR
    const ydAll = dNames.map(d => {
      const b = this.byDist[d];
      const latD = b.byY[latY];
      const bp = latD ? avg(latD.s, latD.n) : avg(b.s, b.n);
      const dSeg = domSeg(b.segCounts);
      let yld, rp;
      if (hasRental && rentalData.byDist[d]) {
        rp = rentalData.byDist[d].avgRentPsf;
        yld = bp > 0 ? +((rp * 12 / bp) * 100).toFixed(2) : 0;
      } else {
        yld = 0; rp = 0;
      }
      return { d, rp, bp, y: yld, seg: dSeg };
    }).filter(d => d.bp > 0);
    const yd = [...ydAll].filter(d => d.y > 0).sort((a, b) => b.y - a.y).slice(0, 8);

    const CAGR_WINDOW = 5;
    const eY = years[years.length - 1];
    const sY = String(parseInt(eY) - CAGR_WINDOW);
    const cagrData = dNames.map(d => {
      const b = this.byDist[d];
      const sA = b.byY[sY] ? avg(b.byY[sY].s, b.byY[sY].n) : null;
      const eA = b.byY[eY] ? avg(b.byY[eY].s, b.byY[eY].n) : null;
      if (!sA || !eA) return null;
      const lowConf = (b.byY[sY]?.n || 0) < 3 || (b.byY[eY]?.n || 0) < 3;
      const cagr = +((Math.pow(eA / sA, 1 / CAGR_WINDOW) - 1) * 100).toFixed(1);
      const yRec = ydAll.find(y => y.d === d);
      const yld = yRec ? yRec.y : 0;
      return { d, cagr, y: yld, seg: domSeg(b.segCounts), bp: eA, total: +(cagr + yld).toFixed(2), cagrYears: CAGR_WINDOW, lowConf };
    }).filter(Boolean).sort((a, b) => b.total - a.total).slice(0, 8);

    // District performance table
    const distPerf = dNames.map(d => {
      const b = this.byDist[d];
      const sA = b.byY[sY] ? avg(b.byY[sY].s, b.byY[sY].n) : null;
      const eA = b.byY[eY] ? avg(b.byY[eY].s, b.byY[eY].n) : null;
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

    // Project performance table
    const projPerf = Object.values(this.byProj).map(p => {
      if (p.n < 5) return null;
      const sD = p.byY[sY]; const eD = p.byY[eY];
      if (!sD || !eD) return null;
      const sA = avg(sD.s, sD.n); const eA = avg(eD.s, eD.n);
      if (sA <= 0 || eA <= 0) return null;
      const lowConf = sD.n < 2 || eD.n < 2;
      const absDiff = Math.round(eA - sA);
      const pctChg = +((eA / sA - 1) * 100).toFixed(1);
      const cagr = +((Math.pow(eA / sA, 1 / CAGR_WINDOW) - 1) * 100).toFixed(1);
      const rp = hasRental ? rentalData?.byProject?.[p.name] : null;
      const yld = rp && eA > 0 ? +((rp.avgRentPsf * 12 / eA) * 100).toFixed(2) : 0;
      const totalReturn = +(cagr + yld).toFixed(2);
      return {
        name: p.name, dist: p.dist, seg: p.seg, street: p.street || '',
        startPsf: Math.round(sA), endPsf: Math.round(eA),
        absDiff, pctChg, cagr, yield: yld, totalReturn,
        startYear: sY, endYear: eY, window: CAGR_WINDOW,
        txStart: sD.n, txEnd: eD.n, txTotal: p.n, lowConf,
      };
    }).filter(Boolean).sort((a, b) => b.cagr - a.cagr);

    const mktSaleTx = this.topTx.result();
    const mktRentTx = rentalStore.length > 0
      ? [...rentalStore].sort((a, b) => b.d.localeCompare(a.d)).slice(0, 500).map(r => ({
          date: r.d, project: r.p, district: r.di, segment: r.sg, unit: '-',
          area: r.af, bedrooms: r.br || '', floor: 0, rent: r.rn, rentPsf: r.rp,
        }))
      : [];

    // Comparison pool
    const cmpPool = Object.values(this.byProj).filter(p => p.n >= 5).sort((a, b) => b.n - a.n).slice(0, 30).map(p => {
      const allTimeAvg = avg(p.s, p.n);
      const latestProjYear = Object.keys(p.byY).sort().pop();
      const latestYearData = latestProjYear ? p.byY[latestProjYear] : null;
      const ap = latestYearData ? avg(latestYearData.s, latestYearData.n) : allTimeAvg;
      const aa = p.areas.length > 0 ? Math.round(p.areas.reduce((s, a) => s + a, 0) / p.areas.length) : avgArea;
      const rp = hasRental ? rentalData.byProject[p.name] : null;
      const rent = rp ? Math.round(rp.avgRent / 100) * 100 : 0;
      const yld = rp && ap > 0 ? +((rp.avgRentPsf * 12 / ap) * 100).toFixed(2) : 0;
      const yearPsf = {};
      const yearPrice = {};
      for (const [y, yData] of Object.entries(p.byY)) { yearPsf[y] = avg(yData.s, yData.n); yearPrice[y] = yData.ps > 0 ? Math.round(yData.ps / yData.n) : 0; }
      return {
        name: p.name, psf: ap, rent, yield: yld, dist: p.dist,
        street: p.street || '',
        age: Object.keys(p.byY).sort()[0] || '',
        type: p.pType, units: p.n, segment: p.seg,
        yearPsf, yearPrice, avgArea: aa,
      };
    });
    const projList = Object.values(this.byProj).filter(p => p.n >= 3).sort((a, b) => b.n - a.n).map(p => p.name);

    // ─── Project Index ───
    const projIndex = {};
    const projYearDataLocal = {};
    for (const p of Object.values(this.byProj)) {
      if (p.n < 3) continue;
      const latestY = Object.keys(p.byY).sort().pop();
      const latYData = latestY ? p.byY[latestY] : null;
      const psfVal = latYData ? avg(latYData.s, latYData.n) : avg(p.s, p.n);
      const rp = hasRental ? rentalData?.byProject?.[p.name] : null;
      const yld = rp && psfVal > 0 ? +((rp.avgRentPsf * 12 / psfVal) * 100).toFixed(2) : 0;
      const yearPsf = {};
      const yearPrice = {};
      for (const [y, yData] of Object.entries(p.byY)) { yearPsf[y] = avg(yData.s, yData.n); yearPrice[y] = yData.ps > 0 ? Math.round(yData.ps / yData.n) : 0; }
      const pAvgArea = p.areas?.length > 0 ? Math.round(p.areas.reduce((s, a) => s + a, 0) / p.areas.length) : avgArea;
      projIndex[p.name] = { dist: p.dist, seg: p.seg, psf: psfVal, n: p.n, yield: yld, street: p.street, type: p.pType, yearPsf, yearPrice, avgArea: pAvgArea };
      projYearDataLocal[p.name] = { street: p.street, dist: p.dist, seg: p.seg, n: p.n, type: p.pType, psf: psfVal, yield: yld, yearPsf, yearPrice, avgArea: pAvgArea };
    }

    // ─── District Top PSF ───
    const distGroups = {};
    for (const p of Object.values(this.byProj)) {
      if (p.n < 3) continue;
      const d = p.dist;
      if (!distGroups[d]) distGroups[d] = [];
      const latestY = Object.keys(p.byY).sort().pop();
      const latYData = latestY ? p.byY[latestY] : null;
      const psfVal = latYData ? avg(latYData.s, latYData.n) : avg(p.s, p.n);
      const rp = hasRental ? rentalData?.byProject?.[p.name] : null;
      const yld = rp && psfVal > 0 ? +((rp.avgRentPsf * 12 / psfVal) * 100).toFixed(2) : 0;
      distGroups[d].push({ name: p.name, psf: psfVal, n: p.n, seg: p.seg, street: p.street, tenure: p.tenure, yield: yld, latest: p.latest || '' });
    }
    const distTopPsf = Object.entries(distGroups).map(([d, projs]) => {
      projs.sort((a, b) => b.psf - a.psf);
      const dAvg = Math.round(projs.reduce((s, p) => s + p.psf, 0) / projs.length);
      const dSeg = domSeg(this.byDist[d]?.segCounts);
      return { dist: d, seg: dSeg, avgPsf: dAvg, topPsf: projs[0].psf, topProject: projs[0].name, count: projs.length, projects: projs.slice(0, 15) };
    }).sort((a, b) => b.topPsf - a.topPsf);

    const sortedPsf = recentSamples.map(s => s.psf).sort((a, b) => a - b);
    const pctl = (p) => sortedPsf.length > 10 ? sortedPsf[Math.floor(sortedPsf.length * p)] : 0;

    return {
      totalTx: this.total, avgPsf, medPsf, yoyPct, latestYear: latY, psfPeriod,
      totalVolume: this.vol,
      avgRent: latRentalAvgRent || Math.round(avgPsf * overallYield / 12 * avgArea),
      avgRentPsf: latRentalAvgPsf || +(avgPsf * overallYield / 12).toFixed(2),
      bestYield: yd[0] || null, hasRealRental: hasRental,
      segCounts: { CCR: this.bySeg['CCR']?.n || 0, RCR: this.bySeg['RCR']?.n || 0, OCR: this.bySeg['OCR']?.n || 0 },
      rentalTotal: latRentalTotal,
      rentalPeriod: rentalPeriodLabel,
      rentalSegCounts: { CCR: latRentalSegCounts['CCR'] || 0, RCR: latRentalSegCounts['RCR'] || 0, OCR: latRentalSegCounts['OCR'] || 0 },
      medRent: latRentalMed || Math.round(avgPsf * overallYield / 12 * avgArea),
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
      // Internal: pass projYearData back for state update
      _projYearData: projYearDataLocal,
    };
  }
}
