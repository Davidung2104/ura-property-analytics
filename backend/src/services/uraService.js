import axios from 'axios';
import { saveToDisk, loadFromDisk, getCacheStatus, writeSnapshot } from './cache.js';

// URA API URLs — eservice is the documented/working one
const URA_URLS = [
  'https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1',
  'https://www.ura.gov.sg/uraDataService/invokeUraDS',
];
let workingUrl = null;

const TOKEN_URLS = [
  'https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1',
  'https://www.ura.gov.sg/uraDataService/insertNewToken.action',
];

// ═══ TOKEN ═══
let token = { value: null, fetchedAt: null, expiresAt: null };

export async function refreshToken() {
  console.log('🔑 Refreshing URA token...');
  for (const url of TOKEN_URLS) {
    try {
      const res = await axios.get(url, {
        headers: { 'AccessKey': process.env.URA_ACCESS_KEY }
      });
      if (res.data?.Result) {
        token.value = res.data.Result;
        token.fetchedAt = new Date();
        token.expiresAt = new Date(Date.now() + 23 * 3600000);
        console.log(`✅ Token obtained via ${url.includes('eservice') ? 'eservice' : 'www'}`);
        return token;
      }
    } catch (err) {
      console.log(`  ⚠️ Token ${url.includes('eservice') ? 'eservice' : 'www'}: ${err.message}`);
    }
  }
  throw new Error('Failed to get token from all URLs');
}

async function ensureToken() {
  if (token.value && token.expiresAt && Date.now() < token.expiresAt) return token.value;
  await refreshToken();
  return token.value;
}

async function uraGet(params) {
  const t = await ensureToken();
  const headers = { 'AccessKey': process.env.URA_ACCESS_KEY, 'Token': t };

  // If we already know which URL works, use it
  if (workingUrl) {
    const res = await axios.get(workingUrl, { params, headers });
    return res.data?.Result || [];
  }

  // Try each URL until one works
  for (const url of URA_URLS) {
    try {
      console.log(`  🌐 Trying ${url.replace('https://','').split('/')[0]}...`);
      const res = await axios.get(url, { params, headers });
      workingUrl = url;
      console.log(`  ✅ Using ${url.replace('https://','').split('/')[0]}`);
      return res.data?.Result || [];
    } catch (err) {
      if (err.response?.status === 404) continue;
      throw err;
    }
  }
  throw new Error('All URA API URLs returned 404');
}

async function fetchBatch(service, batch) {
  return uraGet({ service, batch });
}

async function fetchRental(refPeriod) {
  return uraGet({ service: 'PMI_Resi_Rental', refPeriod });
}

// ═══ CACHE ═══
let dashboardCache = null;
let cacheTime = null;
const CACHE_TTL = Infinity; // Never auto-expire — only refresh via POST /api/refresh
let projectBatchMap = {};
let projectCache = new Map(); // FIX #3: LRU project cache
const PROJECT_CACHE_MAX = 20;

// ═══ HELPERS ═══
function parseDate(cd) {
  if (!cd || cd.length < 4) return null;
  const mm = parseInt(cd.slice(0, 2));
  const yy = parseInt(cd.slice(2, 4));
  return { year: 2000 + yy, quarter: `${String(yy).padStart(2,'0')}Q${Math.ceil(mm / 3)}`, month: mm };
}

function parseFloor(fr) {
  if (!fr || fr === '-') return { band: null, mid: 0 };
  const parts = fr.replace(/\s/g, '').split('to');
  if (parts.length === 2) {
    const lo = parseInt(parts[0]) || 0, hi = parseInt(parts[1]) || 0;
    return { band: `${String(lo).padStart(2,'0')}-${String(hi).padStart(2,'0')}`, mid: (lo + hi) / 2 };
  }
  return { band: fr, mid: parseInt(fr) || 0 };
}

function distSort(a, b) {
  return (parseInt(a.replace('D','')) || 0) - (parseInt(b.replace('D','')) || 0);
}

const avg = (sum, n) => n > 0 ? Math.round(sum / n) : 0;
function med(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a,b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m-1] + s[m]) / 2);
}

// Estimated yields — ONLY used as last-resort fallback when URA rental API has no data
const DEFAULT_YIELD = { CCR: 0.025, RCR: 0.028, OCR: 0.032 };
let computedYield = null; // Filled from real URA rental data when available
function getYield(seg) { return (computedYield || DEFAULT_YIELD)[seg] || 0.028; }
function estRent(psf, seg) { return +(psf * getYield(seg) / 12).toFixed(2); }

// Unified bedroom classifier — single source of truth for all contexts
function getBed(areaSqf) {
  if (areaSqf < 550) return '1 BR';
  if (areaSqf < 800) return '2 BR';
  if (areaSqf < 1100) return '3 BR';
  if (areaSqf < 1500) return '4 BR';
  return '5 BR';
}
// Bedroom ranges matching getBed() thresholds — for project-level grouping
const BED_RANGES = [
  {bed:'1 BR',min:0,max:550},{bed:'2 BR',min:550,max:800},
  {bed:'3 BR',min:800,max:1100},{bed:'4 BR',min:1100,max:1500},
  {bed:'5 BR',min:1500,max:99999},
];

// Real Singapore district centroids (postal districts)
const DIST_COORDS = {
  1:[1.2870,103.8520], 2:[1.2750,103.8440], 3:[1.2820,103.8380], 4:[1.2710,103.8480],
  5:[1.2730,103.8160], 6:[1.2860,103.8470], 7:[1.3010,103.8550], 8:[1.3060,103.8610],
  9:[1.3080,103.8350], 10:[1.3070,103.8230], 11:[1.3240,103.8370], 12:[1.3280,103.8560],
  13:[1.3360,103.8640], 14:[1.3120,103.8660], 15:[1.3020,103.8990], 16:[1.3280,103.9060],
  17:[1.3380,103.9380], 18:[1.3520,103.9410], 19:[1.3520,103.8740], 20:[1.3600,103.8530],
  21:[1.3320,103.7920], 22:[1.3380,103.9570], 23:[1.3460,103.7680], 25:[1.4380,103.8230],
  26:[1.3900,103.7500], 27:[1.3700,103.8100], 28:[1.3510,103.8860],
};

// Fallback average areas per bedroom type — used only when zero samples exist for a bedroom type
const FALLBACK_BED_AREAS = { '1 BR': 500, '2 BR': 750, '3 BR': 1050, '4 BR': 1300, '5 BR': 1800 };

function domSeg(segCounts) {
  let best = 'RCR', max = 0;
  for (const [seg, n] of Object.entries(segCounts || {})) {
    if (n > max) { max = n; best = seg; }
  }
  return best;
}

// ═══ FULL TRANSACTION STORES (for search/browse) ═══
let salesStore = [];   // All sales tx, compact format (~15MB for 120K)
let rentalStore = [];  // All rental tx from PMI_Resi_Rental

// ═══ FIX #1: Bounded sorted insert (no full array needed) ═══
class TopN {
  constructor(n, cmp) { this.n = n; this.cmp = cmp; this.items = []; }
  add(item) {
    if (this.items.length < this.n) {
      this.items.push(item);
      if (this.items.length === this.n) this.items.sort(this.cmp);
    } else if (this.cmp(item, this.items[this.items.length - 1]) < 0) {
      this.items[this.items.length - 1] = item;
      // Binary insertion would be faster but this is only 500 items
      this.items.sort(this.cmp);
    }
  }
  result() { this.items.sort(this.cmp); return this.items; }
}

// ═══ AGGREGATOR ═══
class Agg {
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

  add(proj, batchNum) {
    const txs = proj.transaction || [];
    const name = proj.project || 'Unknown';
    const street = proj.street || '';
    const seg = proj.marketSegment || 'OCR';
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

      // Reservoir sampling
      if (this.samples.length < 2000) {
        this.samples.push({ psf, area, seg, dist });
      } else {
        const j = Math.floor(Math.random() * this.total);
        if (j < 2000) this.samples[j] = { psf, area, seg, dist };
      }

      const y = String(d.year);
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

      if (!this.bySeg[seg]) this.bySeg[seg] = { s: 0, n: 0 };
      this.bySeg[seg].s += psf; this.bySeg[seg].n++;

      if (!this.byDist[dist]) this.byDist[dist] = { s: 0, n: 0, v: 0, byY: {}, byQ: {}, segCounts: {} };
      const dd = this.byDist[dist];
      dd.s += psf; dd.n++; dd.v += price;
      dd.segCounts[seg] = (dd.segCounts[seg] || 0) + 1;
      if (!dd.byY[y]) dd.byY[y] = { s: 0, n: 0 }; dd.byY[y].s += psf; dd.byY[y].n++;
      if (!dd.byQ[q]) dd.byQ[q] = { s: 0, n: 0 }; dd.byQ[q].s += psf; dd.byQ[q].n++;

      if (!this.byType[pType]) this.byType[pType] = { s: 0, n: 0, segCounts: {} };
      this.byType[pType].s += psf; this.byType[pType].n++;
      this.byType[pType].segCounts[seg] = (this.byType[pType].segCounts[seg] || 0) + 1;

      if (!this.byTenure[tenure]) this.byTenure[tenure] = { s: 0, n: 0 };
      this.byTenure[tenure].s += psf; this.byTenure[tenure].n++;

      if (!this.byProj[name]) this.byProj[name] = { name, street, seg, dist, tenure: tx.tenure || '', pType, s: 0, n: 0, areas: [], prices: [], byY: {}, byFl: {}, latest: '' };
      const bp = this.byProj[name];
      bp.s += psf; bp.n++;
      if (bp.areas.length < 50) bp.areas.push(area);
      if (bp.prices.length < 50) { bp.prices.push(psf); }
      else { const j = Math.floor(Math.random() * bp.n); if (j < 50) bp.prices[j] = psf; }
      if (!bp.byY[y]) bp.byY[y] = { s: 0, n: 0 }; bp.byY[y].s += psf; bp.byY[y].n++;
      if (fl.band) { if (!bp.byFl[fl.band]) bp.byFl[fl.band] = { s: 0, n: 0 }; bp.byFl[fl.band].s += psf; bp.byFl[fl.band].n++; }
      const ds = `${d.year}-${String(d.month).padStart(2,'0')}`;
      if (ds > bp.latest) bp.latest = ds;

      if (fl.band) { if (!this.byFloor[fl.band]) this.byFloor[fl.band] = { s: 0, n: 0 }; this.byFloor[fl.band].s += psf; this.byFloor[fl.band].n++; }

      // FIX #1: Bounded insert — only keeps top 500 by date, no unbounded array
      const txDate = `${d.year}-${String(d.month).padStart(2,'0')}`;
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

  _qtrYield(q) {
    const qb = this.byQtr[q];
    if (!qb || qb.n === 0) return 0.028;
    let tw = 0;
    for (const [seg, { n }] of Object.entries(qb.bySeg)) tw += getYield(seg) * n;
    return tw / qb.n;
  }

  _overallYield() {
    let tw = 0, tn = 0;
    for (const [seg, { n }] of Object.entries(this.bySeg)) { tw += getYield(seg) * n; tn += n; }
    return tn > 0 ? tw / tn : 0.028;
  }

  build(rentalData) {
    const avgArea = this.samples.length > 0 ? Math.round(this.samples.reduce((s,p) => s + p.area, 0) / this.samples.length) : 0;
    const years = Object.keys(this.byYear).sort();
    const qtrs = Object.keys(this.byQtr).sort();
    const latY = years[years.length - 1];
    const prevY = years.length > 1 ? years[years.length - 2] : null;

    const avgPsf = this.byYear[latY] ? avg(this.byYear[latY].s, this.byYear[latY].n) : avg(Object.values(this.byYear).reduce((s,y) => s + y.s, 0), this.total);
    const allTimeAvgPsf = avg(Object.values(this.byYear).reduce((s,y) => s + y.s, 0), this.total);
    const latAvg = avgPsf; // Now same as avgPsf since we use latest year
    const prvAvg = prevY && this.byYear[prevY] ? avg(this.byYear[prevY].s, this.byYear[prevY].n) : 0;
    const yoyPct = prvAvg > 0 ? +((latAvg / prvAvg - 1) * 100).toFixed(1) : null;
    const medPsf = med(this.samples.map(s => s.psf));
    const overallYield = this._overallYield();

    // FIX #2: Use real rental data if available
    const hasRental = rentalData && rentalData.byProject && Object.keys(rentalData.byProject).length > 0;
    const realAvgRent = hasRental ? rentalData.overallAvgRent : null;
    const realAvgRentPsf = hasRental ? rentalData.overallAvgRentPsf : null;

    // Compute real yield per segment from URA rental data (overrides hardcoded defaults)
    if (hasRental) {
      computedYield = {};
      for (const seg of ['CCR', 'RCR', 'OCR']) {
        const salePsf = this.bySeg[seg] ? avg(this.bySeg[seg].s, this.bySeg[seg].n) : 0;
        const rentPsf = rentalData.bySeg[seg]?.avgRentPsf || 0;
        computedYield[seg] = salePsf > 0 && rentPsf > 0 ? (rentPsf * 12) / salePsf : DEFAULT_YIELD[seg];
      }
      console.log('📊 Real yields from URA:', Object.entries(computedYield).map(([k,v])=>`${k}: ${(v*100).toFixed(2)}%`).join(', '));
    } else {
      computedYield = null; // Fall back to DEFAULT_YIELD
      console.log('⚠️ No rental data — using estimated yields');
    }

    // ─── YoY ───
    const yoy = years.map((y, i) => {
      const b = this.byYear[y];
      const a = avg(b.s, b.n);
      const m = med(b.p);
      const pa = i > 0 ? avg(this.byYear[years[i-1]].s, this.byYear[years[i-1]].n) : null;
      return { year: y, avg: a, med: m, yoy: pa ? +((a / pa - 1) * 100).toFixed(1) : null };
    });

    // ─── Rental trend — real data if available, else estimated ───
    const rTrend = qtrs.slice(-8).map((q, i) => {
      const qb = this.byQtr[q];
      const a = avg(qb.s, qb.n);
      // Check for real rental data for this quarter
      const qKey = q.replace('Q','q'); // "24Q1" -> "24q1"
      const realQ = hasRental && rentalData.byQtr[qKey];
      const rent = realQ ? realQ.avgRent : Math.round(a * this._qtrYield(q) / 12 * avgArea);
      const rentMed = realQ ? realQ.medRent : rent; // Without real data, median estimate = avg estimate
      const pq = i > 0 ? qtrs.slice(-8)[i-1] : null;
      let pRent = null;
      if (pq) {
        const pqKey = pq.replace('Q','q');
        const realPQ = hasRental && rentalData.byQtr[pqKey];
        pRent = realPQ ? realPQ.avgRent : Math.round(avg(this.byQtr[pq].s, this.byQtr[pq].n) * this._qtrYield(pq) / 12 * avgArea);
      }
      return { q, avg: rent, med: rentMed, qoq: pRent ? +((rent / pRent - 1) * 100).toFixed(1) : null };
    });

    // ─── Segments ───
    const sSeg = ['CCR','RCR','OCR'].map(s => ({
      name: s, val: avg(this.bySeg[s]?.s || 0, this.bySeg[s]?.n || 0), count: this.bySeg[s]?.n || 0,
    })).filter(s => s.count > 0);
    const rSeg = sSeg.map(s => {
      if (hasRental && rentalData.bySeg[s.name]) {
        return { name: s.name, val: rentalData.bySeg[s.name].avgRent, count: rentalData.bySeg[s.name].count };
      }
      return { name: s.name, val: Math.round(s.val * getYield(s.name) / 12 * avgArea), count: s.count };
    });

    const sTop = Object.values(this.byProj).sort((a,b) => b.n - a.n).slice(0, 8).map(p => ({ n: p.name, c: p.n }));
    // FIX #5: Real rental top projects ranked by rental volume
    let rTop;
    if (hasRental) {
      rTop = Object.entries(rentalData.byProject)
        .map(([name, rp]) => ({ n: name, c: rp.count }))
        .sort((a, b) => b.c - a.c).slice(0, 8);
      if (rTop.length === 0) rTop = sTop; // Fallback
    } else {
      rTop = sTop;
    }

    const dNames = Object.keys(this.byDist).sort(distSort);
    const topDist = Object.entries(this.byDist).sort((a,b) => b[1].n - a[1].n).slice(0, 5).map(([d]) => d);

    const sDistLine = qtrs.slice(-8).map(q => {
      const row = { q };
      topDist.forEach(d => { const dq = this.byDist[d]?.byQ[q]; row[d] = dq ? avg(dq.s, dq.n) : null; });
      return row;
    });
    const rDistLine = sDistLine.map(row => {
      const r = { q: row.q };
      // Convert sale quarter format (e.g. "24Q1") to rental format (e.g. "24q1")
      const rqKey = row.q.replace('Q','q');
      topDist.forEach(d => {
        if (hasRental && rentalData.byDist[d]?.byQ?.[rqKey]) {
          r[d] = rentalData.byDist[d].byQ[rqKey].avgRentPsf;
        } else if (hasRental && rentalData.byDist[d]) {
          // Fall back to overall district average if quarter data missing
          r[d] = rentalData.byDist[d].avgRentPsf || null;
        } else {
          const dSeg = domSeg(this.byDist[d]?.segCounts);
          r[d] = row[d] ? +(row[d] * getYield(dSeg) / 12).toFixed(2) : null;
        }
      });
      return r;
    });

    // C1 FIX: Use LATEST YEAR PSF for "current" charts, not all-time average
    const latYKey = latY; // Latest year in dataset
    const sDistBar = dNames.map(d => {
      // Prefer latest year's average; fall back to all-time if no data in latest year
      const latD = this.byDist[d]?.byY[latYKey];
      const v = latD ? avg(latD.s, latD.n) : avg(this.byDist[d].s, this.byDist[d].n);
      return { d, v };
    }).sort((a,b) => b.v - a.v).slice(0, 10);
    const rDistBar = sDistBar.map(d => {
      if (hasRental && rentalData.byDist[d.d]) return { d: d.d, v: rentalData.byDist[d.d].avgRentPsf };
      const dSeg = domSeg(this.byDist[d.d]?.segCounts);
      return { d: d.d, v: +(d.v * getYield(dSeg) / 12).toFixed(2) };
    });

    const sType = Object.entries(this.byType).map(([t, v]) => ({ t, v: avg(v.s, v.n) })).sort((a,b) => b.v - a.v).slice(0, 5);
    const rType = sType.map(t => {
      // Use real rental data: find projects of this type and average their rent
      if (hasRental) {
        const projsOfType = Object.values(this.byProj).filter(p => p.pType === t.t);
        const rents = projsOfType.map(p => rentalData.byProject[p.name]).filter(Boolean);
        if (rents.length > 0) {
          const totalRent = rents.reduce((s,r) => s + r.avgRent * r.count, 0);
          const totalCount = rents.reduce((s,r) => s + r.count, 0);
          return { t: t.t, v: Math.round(totalRent / totalCount) };
        }
      }
      const tSeg = domSeg(this.byType[t.t]?.segCounts);
      return { t: t.t, v: Math.round(t.v * getYield(tSeg) / 12 * avgArea) };
    });
    const sTenure = Object.entries(this.byTenure).map(([t, v]) => ({ t, v: avg(v.s, v.n) })).sort((a,b) => b.v - a.v);

    // Compute avg area per bedroom from actual URA sales data
    const bedAreas = {};
    this.samples.forEach(s => {
      const bed = getBed(s.area);
      if (!bedAreas[bed]) bedAreas[bed] = { sum: 0, n: 0 };
      bedAreas[bed].sum += s.area; bedAreas[bed].n++;
    });
    const bedSz = {};
    for (const t of ['1 BR','2 BR','3 BR','4 BR','5 BR']) {
      bedSz[t] = bedAreas[t] && bedAreas[t].n > 0 ? Math.round(bedAreas[t].sum / bedAreas[t].n) : FALLBACK_BED_AREAS[t];
    }
    const rBed = Object.entries(bedSz).map(([t, a]) => {
      if (hasRental && rentalData.byBed[t]) {
        return { t, v: rentalData.byBed[t].avgRent, psf: rentalData.byBed[t].avgRentPsf };
      }
      return { t, v: Math.round(avgPsf * overallYield / 12 * a), psf: +(avgPsf * overallYield / 12).toFixed(2) };
    });

    // Histogram
    const psfVals = this.samples.map(s => s.psf);
    const pMin = Math.floor(psfVals.reduce((a,b) => a < b ? a : b, Infinity) / 200) * 200;
    const pMax = Math.ceil(psfVals.reduce((a,b) => a > b ? a : b, 0) / 200) * 200;
    const sHist = [];
    for (let r = pMin; r < pMax; r += 200) sHist.push({ r: `$${r}`, c: psfVals.filter(p => p >= r && p < r + 200).length });

    const sScat = (() => {
      // Shuffle reservoir sample to remove early-batch bias before taking scatter points
      const shuffled = [...this.samples];
      for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
      return shuffled.slice(0, 200).map(s => ({ a: s.area, p: s.psf, s: s.seg }));
    })();

    // Rental histogram & scatter: use REAL rental data when available
    let rHist, rScat;
    if (rentalStore.length > 0) {
      const realRents = rentalStore.slice(0, 2000).map(r => r.rn);
      const rMin = Math.floor(Math.min(...realRents) / 500) * 500;
      const rMax = Math.ceil(Math.max(...realRents) / 500) * 500;
      rHist = [];
      for (let r = rMin; r < rMax; r += 500) rHist.push({ r: `$${r}`, c: realRents.filter(p => p >= r && p < r + 500).length });
      rScat = rentalStore.slice(0, 200).map(r => ({ a: r.a, p: r.rp, s: r.sg }));
    } else {
      // Fallback: estimate from sales
      const rEsts = this.samples.map(s => Math.round(estRent(s.psf, s.seg) * s.area));
      const rMin = Math.floor(rEsts.reduce((a,b) => a < b ? a : b, Infinity) / 500) * 500;
      const rMax = Math.ceil(rEsts.reduce((a,b) => a > b ? a : b, 0) / 500) * 500;
      rHist = [];
      for (let r = rMin; r < rMax; r += 500) rHist.push({ r: `$${r}`, c: rEsts.filter(p => p >= r && p < r + 500).length });
      rScat = (() => {
        const shuffled = [...this.samples];
        for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
        return shuffled.slice(0, 200).map(s => ({ a: s.area, p: estRent(s.psf, s.seg), s: s.seg }));
      })();
    }
    const sCum = qtrs.slice(-12).map(q => ({ d: q, v: this.byQtr[q]?.v || 0 }));
    const rCum = qtrs.slice(-12).map(q => {
      // Use real rental counts if available, else fall back to sales count
      const rqKey = q.replace('Q','q');
      const realQ = hasRental && rentalData.byQtr[rqKey];
      return { d: q, v: realQ ? realQ.count : (this.byQtr[q]?.n || 0) };
    });

    // Investment: Yield uses real rental if available
    // C1 FIX: Use LATEST YEAR PSF as buy price denominator (not all-time avg)
    const yd = dNames.map(d => {
      const b = this.byDist[d];
      const latD = b.byY[latY];
      const bp = latD ? avg(latD.s, latD.n) : avg(b.s, b.n); // Latest year > all-time
      const dSeg = domSeg(b.segCounts);
      let yld, rp;
      if (hasRental && rentalData.byDist[d]) {
        rp = rentalData.byDist[d].avgRentPsf;
        yld = bp > 0 ? +((rp * 12 / bp) * 100).toFixed(2) : 0;  // REAL yield from real rent / real price
      } else {
        yld = +(getYield(dSeg) * 100).toFixed(2);
        rp = +(bp * getYield(dSeg) / 12).toFixed(2);
      }
      return { d, rp, bp, y: yld, seg: dSeg };
    }).filter(d => d.bp > 0).sort((a,b) => b.y - a.y).slice(0, 8);

    const cagrData = dNames.map(d => {
      const b = this.byDist[d];
      const sY = years[0], eY = years[years.length - 1];
      const sA = b.byY[sY] ? avg(b.byY[sY].s, b.byY[sY].n) : null;
      const eA = b.byY[eY] ? avg(b.byY[eY].s, b.byY[eY].n) : null;
      const n = parseInt(eY) - parseInt(sY);
      if (!sA || !eA || n <= 0) return null;
      const cagr = +((Math.pow(eA / sA, 1 / n) - 1) * 100).toFixed(1);
      const yRec = yd.find(y => y.d === d);
      const yld = yRec ? yRec.y : +(getYield(domSeg(b.segCounts)) * 100).toFixed(2);
      return { d, cagr, y: yld, seg: domSeg(b.segCounts), bp: eA, total: +(cagr + yld).toFixed(2) };
    }).filter(Boolean).sort((a,b) => b.total - a.total).slice(0, 8);

    // FIX #1: Get sorted latest transactions from bounded TopN
    const mktSaleTx = this.topTx.result();
    // Market rental transactions: use REAL rental records from URA
    const mktRentTx = rentalStore.length > 0
      ? rentalStore.slice(0, 500).map(r => ({
          date: r.d, project: r.p, district: r.di, segment: r.sg, unit: '-',
          bed: r.bd, area: r.a, floor: 0, rent: r.rn, rentPsf: r.rp,
        }))
      : mktSaleTx.slice(0, 100).map(tx => {
          // Fallback: estimate from sales only if rental API returned nothing
          const rent = Math.round(estRent(tx.psf, tx.segment) * tx.area / 100) * 100;
          return { date: tx.date, project: tx.project, district: tx.district, segment: tx.segment, unit: tx.unit,
            bed: getBed(tx.area),
            area: tx.area, floor: tx.floor, rent, rentPsf: +(rent / tx.area).toFixed(2) };
        });

    // FIX #4: Comparison pool includes per-year PSF for heatmap
    // C1 FIX: Use LATEST YEAR PSF as primary price (not all-time avg)
    const cmpPool = Object.values(this.byProj).filter(p => p.n >= 5).sort((a,b) => b.n - a.n).slice(0, 30).map(p => {
      const allTimeAvg = avg(p.s, p.n);
      // Prefer latest year average as the "current" PSF
      const latestProjYear = Object.keys(p.byY).sort().pop();
      const latestYearData = latestProjYear ? p.byY[latestProjYear] : null;
      const ap = latestYearData ? avg(latestYearData.s, latestYearData.n) : allTimeAvg;
      const aa = p.areas.length > 0 ? Math.round(p.areas.reduce((s,a) => s + a, 0) / p.areas.length) : avgArea;
      const rp = hasRental ? rentalData.byProject[p.name] : null;
      const pYld = getYield(p.seg);
      const rent = rp ? Math.round(rp.avgRent / 100) * 100 : Math.round(ap * pYld / 12 * aa / 100) * 100;
      const yld = rp && ap > 0 ? +((rp.avgRentPsf * 12 / ap) * 100).toFixed(2) : +(pYld * 100).toFixed(2);
      const dn = parseInt(p.dist.replace('D','')) || 1;
      const coords = DIST_COORDS[dn] || [1.3521, 103.8198]; // Fallback to Singapore center
      // FIX #4: Include per-year avg PSF for comparison heatmap
      const yearPsf = {};
      for (const [y, yData] of Object.entries(p.byY)) {
        yearPsf[y] = avg(yData.s, yData.n);
      }
      return {
        name: p.name, psf: ap, rent, yield: yld, dist: p.dist,
        age: Object.keys(p.byY).sort()[0] || '',
        lat: coords[0],
        lng: coords[1],
        type: p.pType, units: p.n, segment: p.seg,
        yearPsf,  // FIX #4: real per-year data
      };
    });
    const projList = Object.values(this.byProj).filter(p => p.n >= 3).sort((a,b) => b.n - a.n).map(p => p.name);

    // Sort once for all percentile lookups
    const sortedPsf = this.samples.map(s => s.psf).sort((a, b) => a - b);
    const pctl = (p) => sortedPsf.length > 10 ? sortedPsf[Math.floor(sortedPsf.length * p)] : 0;

    return {
      totalTx: this.total, avgPsf, medPsf, yoyPct, latestYear: latY,
      totalVolume: this.vol,
      avgRent: realAvgRent || Math.round(avgPsf * overallYield / 12 * avgArea),
      avgRentPsf: realAvgRentPsf || +(avgPsf * overallYield / 12).toFixed(2),
      bestYield: yd[0] || null, hasRealRental: hasRental,
      // Overview summary fields
      segCounts: { CCR: this.bySeg['CCR']?.n || 0, RCR: this.bySeg['RCR']?.n || 0, OCR: this.bySeg['OCR']?.n || 0 },
      rentalTotal: hasRental ? Object.values(rentalData.byProject).reduce((s,p) => s + p.count, 0) : 0,
      rentalSegCounts: { CCR: rSeg.find(s=>s.name==='CCR')?.count||0, RCR: rSeg.find(s=>s.name==='RCR')?.count||0, OCR: rSeg.find(s=>s.name==='OCR')?.count||0 },
      medRent: hasRental ? rentalData.overallMedRent : Math.round(avgPsf * overallYield / 12 * avgArea),
      psfP5: pctl(0.05), psfP95: pctl(0.95), psfP25: pctl(0.25), psfP75: pctl(0.75),
      years, quarters: qtrs, topDistricts: topDist, districtNames: dNames,
      yoy, rTrend, sSeg, rSeg, sTop, rTop,
      sDistLine, rDistLine, sDistBar, rDistBar,
      sType, rType, sTenure, rBed,
      sHist, rHist, sScat, rScat, sCum, rCum,
      yd, cagrData,
      avgCagr: cagrData.length > 0 ? +(cagrData.reduce((s,d) => s + d.cagr, 0) / cagrData.length).toFixed(1) : 0,
      avgYield: yd.length > 0 ? +(yd.reduce((s,d) => s + d.y, 0) / yd.length).toFixed(2) : 0,
      mktSaleTx, mktRentTx, cmpPool, projList,
    };
  }
}

// ═══ FIX #2: FETCH & AGGREGATE REAL RENTAL DATA ═══

async function fetchRentalData() {
  console.log('🏠 Fetching rental data...');
  const byProject = {};
  const byDist = {};
  const bySeg = {};
  const byQtr = {};
  const byBed = {};
  let totalRent = 0, totalRentPsf = 0, totalCount = 0;
  const allRents = []; // For computing real overall median

  // Generate recent quarter keys (last 8 quarters)
  const now = new Date();
  const curY = now.getFullYear() % 100;
  const curQ = Math.ceil((now.getMonth() + 1) / 3);
  const quarters = [];
  for (let i = 0; i < 8; i++) {
    let qy = curY, qq = curQ - i;
    while (qq <= 0) { qq += 4; qy--; }
    quarters.push(`${String(qy).padStart(2,'0')}q${qq}`);
  }

  for (const refPeriod of quarters) {
    try {
      const projects = await fetchRental(refPeriod);
      console.log(`  📥 Rental ${refPeriod}: ${projects.length} projects`);
      for (const p of projects) {
        const name = p.project || '';
        const seg = p.marketSegment || 'RCR';
        const dist = `D${parseInt(p.district) || 0}`;
        const rentals = p.rental || [];

        for (const r of rentals) {
          const areaSqm = parseFloat(r.areaSqm) || 0;
          const areaSqf = Math.round(areaSqm * 10.7639);
          const monthlyRent = parseFloat(r.rent) || 0;
          const numContracts = parseInt(r.noOfRentalContract) || 0;
          if (areaSqf <= 0 || monthlyRent <= 0) continue;

          const rentPsf = +(monthlyRent / areaSqf).toFixed(2);
          const bed = getBed(areaSqf);

          totalRent += monthlyRent;
          totalRentPsf += rentPsf;
          totalCount++;
          if (allRents.length < 5000) allRents.push(monthlyRent);
          else { const j = Math.floor(Math.random() * totalCount); if (j < 5000) allRents[j] = monthlyRent; }

          if (!byProject[name]) byProject[name] = { totalRent: 0, totalPsf: 0, count: 0, seg, dist };
          byProject[name].totalRent += monthlyRent;
          byProject[name].totalPsf += rentPsf;
          byProject[name].count++;

          if (!byDist[dist]) byDist[dist] = { totalRent: 0, totalPsf: 0, count: 0, byQ: {} };
          byDist[dist].totalRent += monthlyRent;
          byDist[dist].totalPsf += rentPsf;
          byDist[dist].count++;
          if (!byDist[dist].byQ[refPeriod]) byDist[dist].byQ[refPeriod] = { totalPsf: 0, count: 0 };
          byDist[dist].byQ[refPeriod].totalPsf += rentPsf;
          byDist[dist].byQ[refPeriod].count++;

          if (!bySeg[seg]) bySeg[seg] = { totalRent: 0, totalPsf: 0, count: 0 };
          bySeg[seg].totalRent += monthlyRent;
          bySeg[seg].totalPsf += rentPsf;
          bySeg[seg].count++;

          if (!byQtr[refPeriod]) byQtr[refPeriod] = { totalRent: 0, totalMed: [], count: 0 };
          byQtr[refPeriod].totalRent += monthlyRent;
          byQtr[refPeriod].totalMed.push(monthlyRent);
          byQtr[refPeriod].count++;

          if (!byBed[bed]) byBed[bed] = { totalRent: 0, totalPsf: 0, count: 0 };
          byBed[bed].totalRent += monthlyRent;
          byBed[bed].totalPsf += rentPsf;
          byBed[bed].count++;

          // Store ALL rental records for full browsing/search
          rentalStore.push({
            d: refPeriod, p: name, st: p.street || '', di: dist, sg: seg,
            a: areaSqf, rn: monthlyRent, rp: rentPsf, bd: bed,
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

  // Compute averages
  for (const p of Object.values(byProject)) { p.avgRent = Math.round(p.totalRent / p.count); p.avgRentPsf = +(p.totalPsf / p.count).toFixed(2); }
  for (const d of Object.values(byDist)) {
    d.avgRent = Math.round(d.totalRent / d.count);
    d.avgRentPsf = +(d.totalPsf / d.count).toFixed(2);
    for (const q of Object.values(d.byQ)) { q.avgRentPsf = +(q.totalPsf / q.count).toFixed(2); }
  }
  for (const s of Object.values(bySeg)) { s.avgRent = Math.round(s.totalRent / s.count); s.avgRentPsf = +(s.totalPsf / s.count).toFixed(2); }
  for (const q of Object.values(byQtr)) { q.avgRent = Math.round(q.totalRent / q.count); q.medRent = med(q.totalMed); delete q.totalMed; }
  for (const b of Object.values(byBed)) { b.avgRent = Math.round(b.totalRent / b.count); b.avgRentPsf = +(b.totalPsf / b.count).toFixed(2); }

  console.log(`✅ Rental: ${totalCount} records from ${Object.keys(byProject).length} projects`);
  return {
    byProject, byDist, bySeg, byQtr, byBed,
    overallAvgRent: Math.round(totalRent / totalCount),
    overallAvgRentPsf: +(totalRentPsf / totalCount).toFixed(2),
    overallMedRent: med(allRents),
  };
}

// ═══ BUILD ═══

export async function buildDashboardData(force = false) {
  if (!force && dashboardCache && cacheTime && (Date.now() - cacheTime < CACHE_TTL)) {
    return dashboardCache;
  }
  console.log('🔄 Building dashboard from URA API...');
  salesStore = [];   // Clear previous
  rentalStore = [];
  const agg = new Agg();

  for (let batch = 1; batch <= 4; batch++) {
    try {
      console.log(`📥 Batch ${batch}...`);
      const projects = await fetchBatch('PMI_Resi_Transaction', batch);
      console.log(`✅ Batch ${batch}: ${projects.length} projects`);
      for (const p of projects) agg.add(p, batch);
    } catch (err) { console.error(`❌ Batch ${batch}:`, err.message); }
  }

  // FIX #2: Fetch real rental data
  let rentalData = null;
  try {
    rentalData = await fetchRentalData();
  } catch (err) {
    console.error('❌ Rental fetch failed:', err.message);
  }

  // Sort transaction stores by date (newest first)
  salesStore.sort((a, b) => b.d.localeCompare(a.d));
  rentalStore.sort((a, b) => b.d.localeCompare(a.d));

  console.log(`📊 ${agg.total} sales, ${salesStore.length} stored, ${rentalStore.length} rental records`);
  dashboardCache = agg.build(rentalData);
  dashboardCache.lastUpdated = new Date().toISOString();
  cacheTime = Date.now();
  projectCache.clear();
  console.log(`✅ Dashboard ready (${Math.round(JSON.stringify(dashboardCache).length / 1024)}KB, rental: ${dashboardCache.hasRealRental ? 'REAL' : 'ESTIMATED'})`);

  // Persist to disk for instant restart + write static snapshot for instant frontend load
  try {
    saveToDisk(dashboardCache, salesStore, rentalStore, projectBatchMap);
    writeSnapshot(dashboardCache);
  } catch (err) {
    console.error('💾 Disk save failed:', err.message);
  }

  return dashboardCache;
}

/**
 * Initialize dashboard — loads from disk cache first for instant startup,
 * then refreshes from URA API in background if cache is stale.
 * Returns true if data is ready to serve immediately.
 */
export async function initDashboard() {
  // 1. Try loading from disk cache
  const cached = loadFromDisk();
  if (cached) {
    dashboardCache = cached.dashboard;
    salesStore = cached.salesStore;
    rentalStore = cached.rentalStore;
    projectBatchMap = cached.batchMap;
    cacheTime = Date.now();

    console.log(`🚀 Serving from disk cache (${cached.ageMinutes}min old, ${cached.salesStore.length} sales, ${cached.rentalStore.length} rentals)`);
    console.log(`   Refresh manually via POST /api/refresh when you want fresh URA data.`);

    // Ensure static snapshot exists for instant frontend loading
    writeSnapshot(dashboardCache);

    return true;
  }

  // 2. No cache — must do full fetch (first-ever run)
  console.log('❄️ First run — no disk cache, fetching from URA API...');
  await buildDashboardData(true);
  return true;
}

/**
 * Get disk + memory cache status for health endpoint
 */
export function getFullCacheInfo() {
  return {
    memory: getCacheInfo(),
    disk: getCacheStatus(),
  };
}

// ═══ PROJECT DETAIL ═══

export async function getProjectData(projectName) {
  if (!dashboardCache) await buildDashboardData();

  // FIX #3: Check project cache first
  if (projectCache.has(projectName)) {
    return projectCache.get(projectName);
  }

  const pool = dashboardCache?.cmpPool?.find(p => p.name === projectName);
  const batch = projectBatchMap[projectName];

  if (!batch) {
    for (let b = 1; b <= 4; b++) {
      try {
        const projects = await fetchBatch('PMI_Resi_Transaction', b);
        const p = projects.find(pr => pr.project === projectName);
        if (p) { projectBatchMap[projectName] = b; const result = buildProjectResult(p, pool); cacheProject(projectName, result); return result; }
      } catch (err) { continue; }
    }
    return null;
  }

  try {
    const projects = await fetchBatch('PMI_Resi_Transaction', batch);
    const p = projects.find(pr => pr.project === projectName);
    if (!p) return null;
    const result = buildProjectResult(p, pool);
    cacheProject(projectName, result); // FIX #3
    return result;
  } catch (err) { console.error('Project error:', err.message); return null; }
}

// FIX #3: LRU-like cache for project data
function cacheProject(name, data) {
  if (projectCache.size >= PROJECT_CACHE_MAX) {
    const oldest = projectCache.keys().next().value;
    projectCache.delete(oldest);
  }
  projectCache.set(name, data);
}

function buildProjectResult(p, pool) {
  const projectName = p.project;
  const seg = p.marketSegment || 'RCR';
  const yRate = getYield(seg);

  // A1 FIX: Fetch real rental records FIRST (before any code that references them)
  const realProjRentals = rentalStore.filter(r => r.p === projectName);

  const txs = (p.transaction || []).map(tx => {
    const d = parseDate(tx.contractDate); if (!d) return null;
    const area = Math.round((parseFloat(tx.area) || 0) * 10.7639);
    const price = parseFloat(tx.price) || 0;
    if (area <= 0 || price <= 0) return null;
    const psf = Math.round(price / area);
    const fl = parseFloor(tx.floorRange);
    return { year: String(d.year), quarter: d.quarter, month: d.month, date: `${d.year}-${String(d.month).padStart(2,'0')}`, area, price, psf, floorRange: fl.band, floorMid: fl.mid, saleType: tx.typeOfSale === '1' ? 'New Sale' : tx.typeOfSale === '2' ? 'Sub Sale' : 'Resale', size: area, floor: fl.band };
  }).filter(Boolean);

  // A2 FIX: parseInt year for numeric sort (year is String like '2024')
  txs.sort((a, b) => (parseInt(b.year) * 100 + b.month) - (parseInt(a.year) * 100 + a.month));

  const avgP = txs.length > 0 ? Math.round(txs.reduce((s,t) => s + t.psf, 0) / txs.length) : 0;
  const avgA = txs.length > 0 ? Math.round(txs.reduce((s,t) => s + t.area, 0) / txs.length) : 0;
  const rentPsf = +(avgP * yRate / 12).toFixed(2);
  const years = [...new Set(txs.map(t => t.year))].sort();
  const quarters = [...new Set(txs.map(t => t.quarter))].sort();

  const bands = ['01-05','06-10','11-15','16-20','21-25','26-30','31-35','36-40','41-45','46-50'];

  // Floor premium: use LAST 12 MONTHS for current market accuracy
  // Fall back to all-time only if < 3 total floor transactions in 12 months
  const now = new Date();
  const m12 = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const recentTx = txs.filter(t => t.date >= m12);
  const floorSource = recentTx.filter(t => t.floorMid > 0).length >= 3 ? recentTx : txs;
  const floorPeriod = floorSource === recentTx ? '12mo' : 'all';

  const loFloor = floorSource.filter(t => t.floorMid > 0 && t.floorMid <= 5);
  const bpsf = loFloor.length > 0 ? Math.round(loFloor.reduce((s,t) => s + t.psf, 0) / loFloor.length) : avgP;
  const thinThreshold = 3;
  const thinBands = [];

  const projFloor = bands.map(r => {
    const [lo, hi] = r.split('-').map(Number);
    const ft = floorSource.filter(t => t.floorMid >= lo && t.floorMid <= hi);
    if (!ft.length) return null;
    const fp = Math.round(ft.reduce((s,t) => s + t.psf, 0) / ft.length);
    const count = ft.length;
    if (count < thinThreshold) thinBands.push(r);
    return { range: r, premium: bpsf > 0 ? +((fp / bpsf - 1) * 100).toFixed(1) : 0, psf: fp, count, thin: count < thinThreshold };
  }).filter(Boolean);

  const byQ = {};
  txs.forEach(t => { if (!byQ[t.quarter]) byQ[t.quarter] = []; byQ[t.quarter].push(t.psf); });
  const projPsfTrend = quarters.slice(-8).map(q => {
    const v = byQ[q] || [];
    return { q, avg: v.length > 0 ? Math.round(v.reduce((s,x) => s + x, 0) / v.length) : 0, med: med(v), vol: v.length };
  });
  // Real rental trend: aggregate from rentalStore for this project
  let projRentTrend;
  if (realProjRentals.length > 0) {
    const byRQ = {};
    realProjRentals.forEach(r => {
      if (!byRQ[r.d]) byRQ[r.d] = { rents: [], total: 0, n: 0 };
      byRQ[r.d].rents.push(r.rn); byRQ[r.d].total += r.rn; byRQ[r.d].n++;
    });
    const rqKeys = Object.keys(byRQ).sort();
    projRentTrend = rqKeys.map(q => ({
      q, avg: Math.round(byRQ[q].total / byRQ[q].n), med: med(byRQ[q].rents),
    }));
  } else {
    // Fallback: estimate from sales PSF trend
    projRentTrend = avgA > 0 ? projPsfTrend.map(q => ({
      q: q.q, avg: Math.round(q.avg * yRate / 12 * avgA), med: Math.round(q.med * yRate / 12 * avgA),
    })) : [];
  }

  const projByBed = BED_RANGES.map(b => {
    const bt = txs.filter(t => t.area >= b.min && t.area < b.max);
    if (!bt.length) return null;
    const ba = Math.round(bt.reduce((s,t) => s + t.psf, 0) / bt.length);
    const bAr = Math.round(bt.reduce((s,t) => s + t.area, 0) / bt.length);
    // Use real rental data for this bedroom type if available
    const realBedRentals = realProjRentals.filter(r => r.bd === b.bed);
    const rent = realBedRentals.length > 0
      ? Math.round(realBedRentals.reduce((s,r) => s + r.rn, 0) / realBedRentals.length)
      : Math.round(ba * yRate / 12 * bAr);
    const rPsf = realBedRentals.length > 0
      ? +(realBedRentals.reduce((s,r) => s + r.rp, 0) / realBedRentals.length).toFixed(2)
      : +(ba * yRate / 12).toFixed(2);
    return { bed: b.bed, avg: Math.round(ba * bAr), psf: ba, rent, rentPsf: rPsf, count: bt.length };
  }).filter(Boolean);

  const hmYears = years.slice(-5);
  const hmFloors = projFloor.map(f => f.range);
  const hmMatrix = {};
  hmFloors.forEach(f => {
    const [lo, hi] = f.split('-').map(Number);
    hmYears.forEach(y => {
      const c = txs.filter(t => t.floorMid >= lo && t.floorMid <= hi && t.year === y);
      if (c.length > 0) hmMatrix[`${f}-${y}`] = { psf: Math.round(c.reduce((s,t) => s + t.psf, 0) / c.length), vol: c.length, price: Math.round(c.reduce((s,t) => s + t.price, 0) / c.length) };
    });
  });

  const allSz = [...new Set(txs.map(t => t.area))].sort((a,b) => a - b);
  // Compute standard sizes from actual data percentiles instead of hardcoded
  const std = allSz.length >= 7
    ? [0.05, 0.15, 0.3, 0.5, 0.7, 0.85, 0.95].map(p => allSz[Math.floor(p * (allSz.length - 1))])
    : allSz.length > 0 ? allSz : [];
  const projSizes = [...new Set(std)].sort((a,b) => a - b);
  const distAvg = dashboardCache?.sDistBar?.find(d => d.d === (pool?.dist || ''))?.v || avgP;

  const projTx = txs.slice(0, 15).map(t => ({
    date: `${t.year}-${String(t.month).padStart(2,'0')}`,
    address: t.floorRange || '-',
    area: t.area, price: t.price, psf: t.psf, type: t.saleType,
  }));
  const projRentTx = realProjRentals.length > 0
    ? realProjRentals.slice(0, 15).map(r => ({
        date: r.d, address: '-', bed: r.bd,
        area: r.a, rent: r.rn, psf: r.rp,
      }))
    : txs.slice(0, 10).map(t => {
        // Fallback: estimate from sales only if no rental records exist
        const rent = Math.round(t.psf * yRate / 12 * t.area / 100) * 100;
        return {
          date: `${t.year}-${String(t.month).padStart(2,'0')}`,
          address: t.floorRange || '-',
          bed: getBed(t.area),
          area: t.area, rent, psf: +(rent / t.area).toFixed(2),
        };
      });

  // Use real rental data for this project if available
  const realAvgRent = realProjRentals.length > 0
    ? Math.round(realProjRentals.reduce((s,r) => s + r.rn, 0) / realProjRentals.length)
    : (avgA > 0 ? Math.round(rentPsf * avgA) : 0);
  const realRentPsf = realProjRentals.length > 0
    ? +(realProjRentals.reduce((s,r) => s + r.rp, 0) / realProjRentals.length).toFixed(2)
    : rentPsf;
  const realYield = realProjRentals.length > 0 && avgP > 0
    ? +((realRentPsf * 12 / avgP) * 100).toFixed(2)
    : +(yRate * 100).toFixed(2);

  return {
    projInfo: {
      name: projectName, district: `${pool?.dist || ''} (${p.street || ''})`.trim(),
      segment: seg, tenure: p.transaction?.[0]?.tenure || '', type: p.propertyType || pool?.type || '', top: '',
      units: txs.length, avgPsf: avgP, medPsf: med(txs.map(t => t.psf)),
      totalTx: txs.length, avgRent: realAvgRent, rentPsf: realRentPsf,
      yield: realYield, distAvg,
      hasRealRental: realProjRentals.length > 0,
    },
    projPsfTrend, projRentTrend, projByBed, projFloor, floorPeriod, thinBands,
    projScatter: txs.slice(0, 80).map(t => ({ area: t.area, psf: t.psf, floor: t.floorMid, price: t.price })),
    projTx, projRentTx, hmYears, hmFloors, hmMatrix,
    rawTx: txs, projSizes, floorRanges: hmFloors, txs,
  };
}

export function getTokenInfo() {
  return {
    hasToken: !!token.value, fetchedAt: token.fetchedAt?.toISOString(),
    expiresAt: token.expiresAt?.toISOString(),
    hoursRemaining: token.expiresAt ? +((token.expiresAt - Date.now()) / 3600000).toFixed(1) : 0,
    isValid: token.value && Date.now() < token.expiresAt,
  };
}

export function getCacheInfo() {
  return {
    hasDashboard: !!dashboardCache, hasRealRental: dashboardCache?.hasRealRental || false,
    cacheAge: cacheTime ? Math.round((Date.now() - cacheTime) / 60000) + 'min' : null,
    totalTx: dashboardCache?.totalTx || 0,
    salesRecords: salesStore.length,
    rentalRecords: rentalStore.length,
    projectCacheSize: projectCache.size,
  };
}

// ═══ PAGINATED SEARCH ═══

/**
 * Search sales transactions
 * @param {Object} opts - { q, district, segment, type, page, limit, sort }
 */
export async function searchSales(opts = {}) {
  if (!dashboardCache) await buildDashboardData();
  const { q = '', district = '', segment = '', type = '', tenure = '',
          page = 1, limit = 50, sort = 'date_desc' } = opts;

  let results = salesStore;

  // Filter
  if (q) {
    const ql = q.toLowerCase();
    results = results.filter(r => r.p.toLowerCase().includes(ql) || r.st.toLowerCase().includes(ql));
  }
  if (district) results = results.filter(r => r.di === district);
  if (segment) results = results.filter(r => r.sg === segment);
  if (type) results = results.filter(r => r.tp === type);
  if (tenure) results = results.filter(r => r.tn === tenure);

  // Sort
  if (sort === 'price_desc') results = [...results].sort((a, b) => b.pr - a.pr);
  else if (sort === 'price_asc') results = [...results].sort((a, b) => a.pr - b.pr);
  else if (sort === 'psf_desc') results = [...results].sort((a, b) => b.ps - a.ps);
  else if (sort === 'psf_asc') results = [...results].sort((a, b) => a.ps - b.ps);
  else if (sort === 'area_desc') results = [...results].sort((a, b) => b.a - a.a);
  else if (sort === 'area_asc') results = [...results].sort((a, b) => a.a - b.a);
  else if (sort === 'date_asc') results = [...results].sort((a, b) => a.d.localeCompare(b.d));
  // default: date_desc (already sorted)

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

/**
 * Search rental transactions
 * @param {Object} opts - { q, district, segment, bed, page, limit, sort }
 */
export async function searchRental(opts = {}) {
  if (!dashboardCache) await buildDashboardData();
  const { q = '', district = '', segment = '', bed = '',
          page = 1, limit = 50, sort = 'date_desc' } = opts;

  let results = rentalStore;

  if (q) {
    const ql = q.toLowerCase();
    results = results.filter(r => r.p.toLowerCase().includes(ql) || r.st.toLowerCase().includes(ql));
  }
  if (district) results = results.filter(r => r.di === district);
  if (segment) results = results.filter(r => r.sg === segment);
  if (bed) results = results.filter(r => r.bd === bed);

  if (sort === 'rent_desc') results = [...results].sort((a, b) => b.rn - a.rn);
  else if (sort === 'rent_asc') results = [...results].sort((a, b) => a.rn - b.rn);
  else if (sort === 'psf_desc') results = [...results].sort((a, b) => b.rp - a.rp);
  else if (sort === 'psf_asc') results = [...results].sort((a, b) => a.rp - b.rp);
  else if (sort === 'area_desc') results = [...results].sort((a, b) => b.a - a.a);
  else if (sort === 'area_asc') results = [...results].sort((a, b) => a.a - b.a);
  else if (sort === 'date_asc') results = [...results].sort((a, b) => a.d.localeCompare(b.d));

  const total = results.length;
  const pages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const slice = results.slice(start, start + limit);

  return {
    total, page, pages, limit,
    results: slice.map(r => ({
      period: r.d, project: r.p, street: r.st, district: r.di, segment: r.sg,
      area: r.a, rent: r.rn, rentPsf: r.rp, bed: r.bd,
      contracts: r.nc, leaseDate: r.lc,
    })),
  };
}

/**
 * Get available filter options
 */
// ═══ FILTERED DASHBOARD — re-aggregates from salesStore/rentalStore with user filters ═══

/**
 * Build a filtered version of the dashboard data.
 * Runs on in-memory salesStore/rentalStore — no URA API calls needed.
 * Returns same shape as the unfiltered dashboard so frontend can swap seamlessly.
 *
 * @param {{ district?: string, year?: string, segment?: string, propertyType?: string, tenure?: string }} filters
 */
export function buildFilteredDashboard(filters = {}) {
  if (!dashboardCache) return null; // Not initialised yet

  // ── Filter sales ──
  let sales = salesStore;
  if (filters.district) sales = sales.filter(r => r.di === filters.district);
  if (filters.year)     sales = sales.filter(r => r.d.startsWith(filters.year));
  if (filters.segment)  sales = sales.filter(r => r.sg === filters.segment);
  if (filters.propertyType) sales = sales.filter(r => r.pt === filters.propertyType);
  if (filters.tenure)   sales = sales.filter(r => r.tn === filters.tenure);

  // ── Filter rentals ──
  let rentals = rentalStore;
  if (filters.district) rentals = rentals.filter(r => r.di === filters.district);
  if (filters.year) {
    const yy = filters.year.slice(2); // "2024" → "24"
    rentals = rentals.filter(r => r.d.startsWith(yy));
  }
  if (filters.segment) rentals = rentals.filter(r => r.sg === filters.segment);

  if (sales.length === 0) return null;

  // ── Single-pass aggregation ──
  const byYear = {}, byQtr = {}, bySeg = {}, byDist = {}, byType = {}, byTenure = {}, byProj = {};
  let totalVol = 0;
  const allPsf = [];
  const psfSample = []; // Reservoir sample for histogram/scatter

  for (const r of sales) {
    const year = r.d.slice(0, 4);
    const month = parseInt(r.d.slice(5, 7)) || 1;
    const qtr = `${year.slice(2)}Q${Math.ceil(month / 3)}`;

    totalVol += r.pr;

    // Reservoir sample (max 2000)
    if (psfSample.length < 2000) {
      psfSample.push({ psf: r.ps, area: r.a, seg: r.sg, dist: r.di });
    } else {
      const j = Math.floor(Math.random() * (allPsf.length + 1));
      if (j < 2000) psfSample[j] = { psf: r.ps, area: r.a, seg: r.sg, dist: r.di };
    }
    allPsf.push(r.ps);

    // By year
    if (!byYear[year]) byYear[year] = { s: 0, n: 0, v: 0, p: [] };
    byYear[year].s += r.ps; byYear[year].n++; byYear[year].v += r.pr;
    if (byYear[year].p.length < 500) byYear[year].p.push(r.ps);

    // By quarter
    if (!byQtr[qtr]) byQtr[qtr] = { s: 0, n: 0, v: 0, bySeg: {} };
    byQtr[qtr].s += r.ps; byQtr[qtr].n++; byQtr[qtr].v += r.pr;
    if (!byQtr[qtr].bySeg[r.sg]) byQtr[qtr].bySeg[r.sg] = { s: 0, n: 0 };
    byQtr[qtr].bySeg[r.sg].s += r.ps; byQtr[qtr].bySeg[r.sg].n++;

    // By segment
    if (!bySeg[r.sg]) bySeg[r.sg] = { s: 0, n: 0 };
    bySeg[r.sg].s += r.ps; bySeg[r.sg].n++;

    // By district
    if (!byDist[r.di]) byDist[r.di] = { s: 0, n: 0, v: 0, byY: {}, byQ: {}, segCounts: {} };
    const dd = byDist[r.di];
    dd.s += r.ps; dd.n++; dd.v += r.pr;
    dd.segCounts[r.sg] = (dd.segCounts[r.sg] || 0) + 1;
    if (!dd.byY[year]) dd.byY[year] = { s: 0, n: 0 }; dd.byY[year].s += r.ps; dd.byY[year].n++;
    if (!dd.byQ[qtr]) dd.byQ[qtr] = { s: 0, n: 0 }; dd.byQ[qtr].s += r.ps; dd.byQ[qtr].n++;

    // By property type
    if (!byType[r.pt]) byType[r.pt] = { s: 0, n: 0, segCounts: {} };
    byType[r.pt].s += r.ps; byType[r.pt].n++;
    byType[r.pt].segCounts[r.sg] = (byType[r.pt].segCounts[r.sg] || 0) + 1;

    // By tenure
    if (!byTenure[r.tn]) byTenure[r.tn] = { s: 0, n: 0 };
    byTenure[r.tn].s += r.ps; byTenure[r.tn].n++;

    // By project
    if (!byProj[r.p]) byProj[r.p] = { name: r.p, seg: r.sg, dist: r.di, pType: r.pt, s: 0, n: 0, areas: [], byY: {} };
    const bp = byProj[r.p];
    bp.s += r.ps; bp.n++;
    if (bp.areas.length < 50) bp.areas.push(r.a);
    if (!bp.byY[year]) bp.byY[year] = { s: 0, n: 0 }; bp.byY[year].s += r.ps; bp.byY[year].n++;
  }

  // ── Rental aggregation ──
  const rByQtr = {}, rBySeg = {}, rByDist = {}, rByBed = {}, rByProj = {};
  let rTotalRent = 0, rTotalPsf = 0, rCount = 0;
  const allRents = [];

  for (const r of rentals) {
    rTotalRent += r.rn; rTotalPsf += r.rp; rCount++;
    if (allRents.length < 5000) allRents.push(r.rn);

    if (!rByQtr[r.d]) rByQtr[r.d] = { total: 0, rents: [], n: 0 };
    rByQtr[r.d].total += r.rn; rByQtr[r.d].rents.push(r.rn); rByQtr[r.d].n++;

    if (!rBySeg[r.sg]) rBySeg[r.sg] = { total: 0, totalPsf: 0, n: 0 };
    rBySeg[r.sg].total += r.rn; rBySeg[r.sg].totalPsf += r.rp; rBySeg[r.sg].n++;

    if (!rByDist[r.di]) rByDist[r.di] = { total: 0, totalPsf: 0, n: 0, byQ: {} };
    rByDist[r.di].total += r.rn; rByDist[r.di].totalPsf += r.rp; rByDist[r.di].n++;
    if (!rByDist[r.di].byQ[r.d]) rByDist[r.di].byQ[r.d] = { totalPsf: 0, n: 0 };
    rByDist[r.di].byQ[r.d].totalPsf += r.rp; rByDist[r.di].byQ[r.d].n++;

    if (!rByBed[r.bd]) rByBed[r.bd] = { total: 0, totalPsf: 0, n: 0 };
    rByBed[r.bd].total += r.rn; rByBed[r.bd].totalPsf += r.rp; rByBed[r.bd].n++;

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

  const avgPsf = latY && byYear[latY] ? avg(byYear[latY].s, byYear[latY].n) : avg(allPsf.reduce((s, v) => s + v, 0), totalTx);
  const medPsf = med(allPsf);
  const avgArea = psfSample.length > 0 ? Math.round(psfSample.reduce((s, p) => s + p.area, 0) / psfSample.length) : 0;

  const latAvg = avgPsf;
  const prvAvg = prevY && byYear[prevY] ? avg(byYear[prevY].s, byYear[prevY].n) : 0;
  const yoyPct = prvAvg > 0 ? +((latAvg / prvAvg - 1) * 100).toFixed(1) : null;

  const sortedPsf = [...allPsf].sort((a, b) => a - b);
  const pctl = (p) => sortedPsf.length > 10 ? sortedPsf[Math.floor(sortedPsf.length * p)] : 0;

  // Compute overall yield early — needed by rental trend fallback
  const overallYield = (() => {
    let tw = 0, tn = 0;
    for (const [seg, { n }] of Object.entries(bySeg)) { tw += getYield(seg) * n; tn += n; }
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
    const rq = rByQtr[q];
    if (rq) {
      const a = Math.round(rq.total / rq.n);
      const m = med(rq.rents);
      const pq = i > 0 ? rByQtr[arr[i - 1]] : null;
      const pRent = pq ? Math.round(pq.total / pq.n) : null;
      return { q, avg: a, med: m, qoq: pRent ? +((a / pRent - 1) * 100).toFixed(1) : null };
    }
    // Estimated from sales
    const qb = byQtr[q];
    if (!qb) return { q, avg: 0, med: 0, qoq: null };
    const a = avg(qb.s, qb.n);
    // H1 FIX: Use computed yield, not hardcoded 0.028
    const rent = Math.round(a * overallYield / 12 * avgArea);
    return { q, avg: rent, med: rent, qoq: null };
  });

  // ── Segments ──
  const sSeg = ['CCR', 'RCR', 'OCR'].map(s => ({
    name: s, val: avg(bySeg[s]?.s || 0, bySeg[s]?.n || 0), count: bySeg[s]?.n || 0,
  })).filter(s => s.count > 0);

  const rSeg = sSeg.map(s => {
    if (hasRental && rBySeg[s.name]) {
      return { name: s.name, val: Math.round(rBySeg[s.name].total / rBySeg[s.name].n), count: rBySeg[s.name].n };
    }
    return { name: s.name, val: Math.round(s.val * getYield(s.name) / 12 * avgArea), count: s.count };
  });

  // ── Top projects ──
  const sTop = Object.values(byProj).sort((a, b) => b.n - a.n).slice(0, 8).map(p => ({ n: p.name, c: p.n }));
  const rTop = hasRental
    ? Object.entries(rByProj).map(([name, rp]) => ({ n: name, c: rp.n })).sort((a, b) => b.c - a.c).slice(0, 8)
    : sTop;

  // ── District data ──
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
      if (hasRental && rByDist[d]?.byQ?.[rqKey]) {
        r[d] = +(rByDist[d].byQ[rqKey].totalPsf / rByDist[d].byQ[rqKey].n).toFixed(2);
      } else if (hasRental && rByDist[d]) {
        r[d] = +(rByDist[d].totalPsf / rByDist[d].n).toFixed(2);
      } else {
        const dSeg = domSeg(byDist[d]?.segCounts);
        r[d] = row[d] ? +(row[d] * getYield(dSeg) / 12).toFixed(2) : null;
      }
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
    const dSeg = domSeg(byDist[d.d]?.segCounts);
    return { d: d.d, v: +(d.v * getYield(dSeg) / 12).toFixed(2) };
  });

  // ── Property type & tenure ──
  const sType = Object.entries(byType).map(([t, v]) => ({ t, v: avg(v.s, v.n) })).sort((a, b) => b.v - a.v).slice(0, 5);
  const rType = sType.map(t => {
    if (hasRental) {
      const projsOfType = Object.values(byProj).filter(p => p.pType === t.t);
      const rents = projsOfType.map(p => rByProj[p.name]).filter(Boolean);
      if (rents.length > 0) {
        const totalRent = rents.reduce((s, r) => s + r.total, 0);
        const totalCount = rents.reduce((s, r) => s + r.n, 0);
        return { t: t.t, v: Math.round(totalRent / totalCount) };
      }
    }
    const tSeg = domSeg(byType[t.t]?.segCounts);
    return { t: t.t, v: Math.round(t.v * getYield(tSeg) / 12 * avgArea) };
  });
  const sTenure = Object.entries(byTenure).map(([t, v]) => ({ t, v: avg(v.s, v.n) })).sort((a, b) => b.v - a.v);

  // ── Bedroom rent ──
  // H2 FIX: Properly average bedroom sizes instead of using single sample
  const bedSz = { '1 BR': 500, '2 BR': 750, '3 BR': 1050, '4 BR': 1300, '5 BR': 1800 };
  const bedAreas = {};
  psfSample.forEach(s => {
    const bed = getBed(s.area);
    if (!bedAreas[bed]) bedAreas[bed] = { sum: 0, n: 0 };
    bedAreas[bed].sum += s.area; bedAreas[bed].n++;
  });
  for (const t of ['1 BR','2 BR','3 BR','4 BR','5 BR']) {
    if (bedAreas[t]?.n > 0) bedSz[t] = Math.round(bedAreas[t].sum / bedAreas[t].n);
  }
  // overallYield already computed above (no duplicate)
  const rBed = ['1 BR', '2 BR', '3 BR', '4 BR', '5 BR'].map(t => {
    if (hasRental && rByBed[t]) {
      return { t, v: Math.round(rByBed[t].total / rByBed[t].n), psf: +(rByBed[t].totalPsf / rByBed[t].n).toFixed(2) };
    }
    const a = bedSz[t] || 800;
    return { t, v: Math.round(avgPsf * overallYield / 12 * a), psf: +(avgPsf * overallYield / 12).toFixed(2) };
  }).filter(t => t.v > 0);

  // ── Histograms ──
  const psfVals = psfSample.map(s => s.psf);
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
  } else {
    const rEsts = psfSample.map(s => Math.round(estRent(s.psf, s.seg) * s.area));
    const rMin = Math.floor(Math.min(...rEsts) / 500) * 500;
    const rMax = Math.ceil(Math.max(...rEsts) / 500) * 500;
    rHist = [];
    for (let r = rMin; r < rMax; r += 500) rHist.push({ r: `$${r}`, c: rEsts.filter(p => p >= r && p < r + 500).length });
  }

  // ── Scatter ──
  const shuffled = [...psfSample];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const sScat = shuffled.slice(0, 200).map(s => ({ a: s.area, p: s.psf, s: s.seg }));
  const rScat = rentals.length > 0
    ? rentals.slice(0, 200).map(r => ({ a: r.a, p: r.rp, s: r.sg }))
    : shuffled.slice(0, 200).map(s => ({ a: s.area, p: estRent(s.psf, s.seg), s: s.seg }));

  // ── Volume ──
  const sCum = qtrs.slice(-12).map(q => ({ d: q, v: byQtr[q]?.v || 0 }));
  const rCum = qtrs.slice(-12).map(q => {
    const rqKey = q.replace('Q', 'q');
    return { d: q, v: rByQtr[rqKey]?.n || 0 };
  });

  // ── Investment: yield & CAGR ──
  const yd = dNames.map(d => {
    const b = byDist[d];
    const latD = b.byY?.[latY];
    const bp = latD ? avg(latD.s, latD.n) : avg(b.s, b.n); // Latest year > all-time
    const dSeg = domSeg(b.segCounts);
    let yld, rp;
    if (hasRental && rByDist[d]) {
      rp = +(rByDist[d].totalPsf / rByDist[d].n).toFixed(2);
      yld = bp > 0 ? +((rp * 12 / bp) * 100).toFixed(2) : 0;
    } else {
      yld = +(getYield(dSeg) * 100).toFixed(2);
      rp = +(bp * getYield(dSeg) / 12).toFixed(2);
    }
    return { d, rp, bp, y: yld, seg: dSeg };
  }).filter(d => d.bp > 0).sort((a, b) => b.y - a.y).slice(0, 8);

  const cagrData = dNames.map(d => {
    const b = byDist[d];
    const sY = years[0], eY = years[years.length - 1];
    const sA = b.byY[sY] ? avg(b.byY[sY].s, b.byY[sY].n) : null;
    const eA = b.byY[eY] ? avg(b.byY[eY].s, b.byY[eY].n) : null;
    const n = parseInt(eY) - parseInt(sY);
    if (!sA || !eA || n <= 0) return null;
    const cagr = +((Math.pow(eA / sA, 1 / n) - 1) * 100).toFixed(1);
    const yRec = yd.find(y => y.d === d);
    const yld = yRec ? yRec.y : +(getYield(domSeg(b.segCounts)) * 100).toFixed(2);
    return { d, cagr, y: yld, seg: domSeg(b.segCounts), bp: eA, total: +(cagr + yld).toFixed(2) };
  }).filter(Boolean).sort((a, b) => b.total - a.total).slice(0, 8);

  // ── Transaction records ──
  const mktSaleTx = [...sales].sort((a, b) => b.d.localeCompare(a.d)).slice(0, 500).map(r => ({
    date: r.d, project: r.p, district: r.di, segment: r.sg, type: r.pt,
    unit: r.fl, area: r.a, floor: r.fm, psf: r.ps, price: r.pr,
  }));

  const mktRentTx = rentals.length > 0
    ? rentals.slice(0, 500).map(r => ({
        date: r.d, project: r.p, district: r.di, segment: r.sg, unit: '-',
        bed: r.bd, area: r.a, floor: 0, rent: r.rn, rentPsf: r.rp,
      }))
    : mktSaleTx.slice(0, 100).map(tx => {
        const rent = Math.round(estRent(tx.psf, tx.segment) * tx.area / 100) * 100;
        return { date: tx.date, project: tx.project, district: tx.district, segment: tx.segment, unit: tx.unit,
          bed: getBed(tx.area), area: tx.area, floor: tx.floor, rent, rentPsf: +(rent / tx.area).toFixed(2) };
      });

  // ── Comparison pool — reuse from unfiltered cache (project-level detail needs full data) ──
  const cmpPool = dashboardCache.cmpPool || [];
  const projList = dashboardCache.projList || [];

  // ── Overall rent ──
  const avgRent = hasRental ? Math.round(rTotalRent / rCount) : Math.round(avgPsf * overallYield / 12 * avgArea);
  const avgRentPsf = hasRental ? +(rTotalPsf / rCount).toFixed(2) : +(avgPsf * overallYield / 12).toFixed(2);

  return {
    totalTx, avgPsf, medPsf, yoyPct, latestYear: latY,
    totalVolume: totalVol,
    avgRent, avgRentPsf,
    bestYield: yd[0] || null, hasRealRental: hasRental,
    segCounts: { CCR: bySeg['CCR']?.n || 0, RCR: bySeg['RCR']?.n || 0, OCR: bySeg['OCR']?.n || 0 },
    rentalTotal: rCount,
    rentalSegCounts: { CCR: rSeg.find(s => s.name === 'CCR')?.count || 0, RCR: rSeg.find(s => s.name === 'RCR')?.count || 0, OCR: rSeg.find(s => s.name === 'OCR')?.count || 0 },
    medRent: hasRental ? med(allRents) : avgRent,
    psfP5: pctl(0.05), psfP95: pctl(0.95), psfP25: pctl(0.25), psfP75: pctl(0.75),
    years, quarters: qtrs, topDistricts: topDist, districtNames: dNames,
    yoy, rTrend, sSeg, rSeg, sTop, rTop,
    sDistLine, rDistLine, sDistBar, rDistBar,
    sType, rType, sTenure, rBed,
    sHist, rHist, sScat, rScat, sCum, rCum,
    yd, cagrData,
    avgCagr: cagrData.length > 0 ? +(cagrData.reduce((s, d) => s + d.cagr, 0) / cagrData.length).toFixed(1) : 0,
    avgYield: yd.length > 0 ? +(yd.reduce((s, d) => s + d.y, 0) / yd.length).toFixed(2) : 0,
    mktSaleTx, mktRentTx, cmpPool, projList,
    // Filter metadata
    appliedFilters: filters,
    filteredSalesCount: sales.length,
    filteredRentalCount: rentals.length,
    lastUpdated: dashboardCache.lastUpdated,
  };
}

export function getFilterOptions() {
  const districts = [...new Set(salesStore.map(r => r.di))].sort(distSort);
  const segments = [...new Set(salesStore.map(r => r.sg))].sort();
  const types = [...new Set(salesStore.map(r => r.tp))].sort();
  const tenures = [...new Set(salesStore.map(r => r.tn))].sort();
  const propertyTypes = [...new Set(salesStore.map(r => r.pt))].sort();
  const beds = [...new Set(rentalStore.map(r => r.bd))].sort();
  const years = [...new Set(salesStore.map(r => r.d.slice(0, 4)))].sort();
  return { districts, segments, types, tenures, propertyTypes, beds, years };
}
