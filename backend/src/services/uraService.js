import axios from 'axios';

const URA_BASE = 'https://www.ura.gov.sg/uraDataService/invokeUraDS';
const TOKEN_URL = 'https://www.ura.gov.sg/uraDataService/insertNewToken.action';

// ═══ TOKEN ═══
let token = { value: null, fetchedAt: null, expiresAt: null };

export async function refreshToken() {
  console.log('🔑 Refreshing URA token...');
  const res = await axios.get(TOKEN_URL, {
    headers: { 'AccessKey': process.env.URA_ACCESS_KEY }
  });
  token.value = res.data.Result;
  token.fetchedAt = new Date();
  token.expiresAt = new Date(Date.now() + 23 * 3600000);
  console.log('✅ Token refreshed');
  return token;
}

async function ensureToken() {
  if (!token.value || Date.now() > token.expiresAt) await refreshToken();
  return token.value;
}

async function fetchBatch(service, batch) {
  const t = await ensureToken();
  const res = await axios.get(`${URA_BASE}/${service}`, {
    params: { batch },
    headers: { 'AccessKey': process.env.URA_ACCESS_KEY, 'Token': t },
  });
  return res.data?.Result || [];
}

async function fetchRental(refPeriod) {
  const t = await ensureToken();
  const res = await axios.get(`${URA_BASE}/PMI_Resi_Rental`, {
    params: { refPeriod },
    headers: { 'AccessKey': process.env.URA_ACCESS_KEY, 'Token': t },
  });
  return res.data?.Result || [];
}

// ═══ CACHE ═══
let dashboardCache = null;
let cacheTime = null;
const CACHE_TTL = 3600000;
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

const YIELD_MAP = { CCR: 0.025, RCR: 0.028, OCR: 0.032 };
function getYield(seg) { return YIELD_MAP[seg] || 0.028; }
function estRent(psf, seg) { return +(psf * getYield(seg) / 12).toFixed(2); }

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
      const txDate = `${d.year}-${String(d.month).padStart(2,'0')}-15`;
      this.topTx.add({ date: txDate, project: name, district: dist, segment: seg, type: pType, unit: fl.band ? `#${fl.band.split('-')[0]}-${String(1+Math.floor(Math.random()*20)).padStart(2,'0')}` : '-', area, floor: fl.mid, psf, price });

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
    const avgArea = this.samples.length > 0 ? Math.round(this.samples.reduce((s,p) => s + p.area, 0) / this.samples.length) : 800;
    const years = Object.keys(this.byYear).sort();
    const qtrs = Object.keys(this.byQtr).sort();
    const latY = years[years.length - 1];
    const prevY = years.length > 1 ? years[years.length - 2] : null;

    const avgPsf = avg(Object.values(this.byYear).reduce((s,y) => s + y.s, 0), this.total);
    const latAvg = this.byYear[latY] ? avg(this.byYear[latY].s, this.byYear[latY].n) : 0;
    const prvAvg = prevY && this.byYear[prevY] ? avg(this.byYear[prevY].s, this.byYear[prevY].n) : 0;
    const yoyPct = prvAvg > 0 ? +((latAvg / prvAvg - 1) * 100).toFixed(1) : null;
    const medPsf = med(this.samples.map(s => s.psf));
    const overallYield = this._overallYield();

    // FIX #2: Use real rental data if available
    const hasRental = rentalData && rentalData.byProject && Object.keys(rentalData.byProject).length > 0;
    const realAvgRent = hasRental ? rentalData.overallAvgRent : null;
    const realAvgRentPsf = hasRental ? rentalData.overallAvgRentPsf : null;

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
      const rentMed = realQ ? realQ.medRent : Math.round(rent * 0.95);
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
    // FIX #5: Real rental counts if available
    const rTop = sTop.map(p => {
      const rp = hasRental ? rentalData.byProject[p.n] : null;
      return { n: p.n, c: rp ? rp.count : p.c };
    });

    const dNames = Object.keys(this.byDist).sort(distSort);
    const topDist = Object.entries(this.byDist).sort((a,b) => b[1].n - a[1].n).slice(0, 5).map(([d]) => d);

    const sDistLine = qtrs.slice(-8).map(q => {
      const row = { q };
      topDist.forEach(d => { const dq = this.byDist[d]?.byQ[q]; row[d] = dq ? avg(dq.s, dq.n) : null; });
      return row;
    });
    const rDistLine = sDistLine.map(row => {
      const r = { q: row.q };
      topDist.forEach(d => {
        if (hasRental && rentalData.byDist[d]) {
          r[d] = rentalData.byDist[d].avgRentPsf || null;
        } else {
          const dSeg = domSeg(this.byDist[d]?.segCounts);
          r[d] = row[d] ? +(row[d] * getYield(dSeg) / 12).toFixed(2) : null;
        }
      });
      return r;
    });

    const sDistBar = dNames.map(d => ({ d, v: avg(this.byDist[d].s, this.byDist[d].n) })).sort((a,b) => b.v - a.v).slice(0, 10);
    const rDistBar = sDistBar.map(d => {
      if (hasRental && rentalData.byDist[d.d]) return { d: d.d, v: rentalData.byDist[d.d].avgRentPsf };
      const dSeg = domSeg(this.byDist[d.d]?.segCounts);
      return { d: d.d, v: +(d.v * getYield(dSeg) / 12).toFixed(2) };
    });

    const sType = Object.entries(this.byType).map(([t, v]) => ({ t, v: avg(v.s, v.n) })).sort((a,b) => b.v - a.v).slice(0, 5);
    const rType = sType.map(t => {
      const tSeg = domSeg(this.byType[t.t]?.segCounts);
      return { t: t.t, v: Math.round(t.v * getYield(tSeg) / 12 * avgArea) };
    });
    const sTenure = Object.entries(this.byTenure).map(([t, v]) => ({ t, v: avg(v.s, v.n) })).sort((a,b) => b.v - a.v);

    const bedSz = { '1 BR': 500, '2 BR': 750, '3 BR': 1050, '4 BR': 1300, '5 BR': 1800 };
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

    const rEsts = this.samples.map(s => Math.round(estRent(s.psf, s.seg) * s.area));
    const rMin = Math.floor(rEsts.reduce((a,b) => a < b ? a : b, Infinity) / 500) * 500;
    const rMax = Math.ceil(rEsts.reduce((a,b) => a > b ? a : b, 0) / 500) * 500;
    const rHist = [];
    for (let r = rMin; r < rMax; r += 500) rHist.push({ r: `$${r}`, c: rEsts.filter(p => p >= r && p < r + 500).length });

    const sScat = this.samples.slice(0, 200).map(s => ({ a: s.area, p: s.psf, s: s.seg }));
    const rScat = this.samples.slice(0, 200).map(s => ({ a: s.area, p: estRent(s.psf, s.seg), s: s.seg }));
    const sCum = qtrs.slice(-12).map(q => ({ d: q, v: this.byQtr[q]?.v || 0 }));
    const rCum = qtrs.slice(-12).map(q => ({ d: q, v: this.byQtr[q]?.n || 0 }));

    // Investment: Yield uses real rental if available
    const yd = dNames.map(d => {
      const b = this.byDist[d];
      const bp = avg(b.s, b.n);
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
    const mktRentTx = mktSaleTx.map(tx => {
      // FIX #2: Use real project rental if available
      const rp = hasRental ? rentalData.byProject[tx.project] : null;
      const rent = rp ? Math.round(rp.avgRent / 100) * 100 : Math.round(estRent(tx.psf, tx.segment) * tx.area / 100) * 100;
      return {
        date: tx.date, project: tx.project, district: tx.district, segment: tx.segment, unit: tx.unit,
        bed: tx.area < 550 ? '1 BR' : tx.area < 800 ? '2 BR' : tx.area < 1100 ? '3 BR' : tx.area < 1500 ? '4 BR' : 'PH',
        area: tx.area, floor: tx.floor, rent, rentPsf: +(rent / tx.area).toFixed(2),
      };
    });

    // FIX #4: Comparison pool includes per-year PSF for heatmap
    const cmpPool = Object.values(this.byProj).filter(p => p.n >= 5).sort((a,b) => b.n - a.n).slice(0, 30).map(p => {
      const ap = avg(p.s, p.n);
      const aa = p.areas.length > 0 ? Math.round(p.areas.reduce((s,a) => s + a, 0) / p.areas.length) : avgArea;
      const rp = hasRental ? rentalData.byProject[p.name] : null;
      const pYld = getYield(p.seg);
      const rent = rp ? Math.round(rp.avgRent / 100) * 100 : Math.round(ap * pYld / 12 * aa / 100) * 100;
      const yld = rp && ap > 0 ? +((rp.avgRentPsf * 12 / ap) * 100).toFixed(2) : +(pYld * 100).toFixed(2);
      const dn = parseInt(p.dist.replace('D','')) || 1;
      // FIX #4: Include per-year avg PSF for comparison heatmap
      const yearPsf = {};
      for (const [y, yData] of Object.entries(p.byY)) {
        yearPsf[y] = avg(yData.s, yData.n);
      }
      return {
        name: p.name, psf: ap, rent, yield: yld, dist: p.dist,
        age: Object.keys(p.byY).sort()[0] || '',
        lat: +(1.28 + (dn - 14) * 0.004 + Math.sin(dn * 7) * 0.01).toFixed(4),
        lng: +(103.85 + (dn - 14) * 0.003 + Math.cos(dn * 7) * 0.01).toFixed(4),
        type: p.pType, units: p.n, segment: p.seg,
        yearPsf,  // FIX #4: real per-year data
      };
    });
    const projList = Object.values(this.byProj).filter(p => p.n >= 3).sort((a,b) => b.n - a.n).slice(0, 100).map(p => p.name);

    return {
      totalTx: this.total, avgPsf, medPsf, yoyPct, latestYear: latY,
      totalVolume: this.vol,
      avgRent: realAvgRent || Math.round(avgPsf * overallYield / 12 * avgArea),
      avgRentPsf: realAvgRentPsf || +(avgPsf * overallYield / 12).toFixed(2),
      bestYield: yd[0] || null, hasRealRental: hasRental,
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
          const bed = areaSqf < 550 ? '1 BR' : areaSqf < 800 ? '2 BR' : areaSqf < 1100 ? '3 BR' : areaSqf < 1500 ? '4 BR' : '5 BR';

          totalRent += monthlyRent;
          totalRentPsf += rentPsf;
          totalCount++;

          if (!byProject[name]) byProject[name] = { totalRent: 0, totalPsf: 0, count: 0, seg, dist };
          byProject[name].totalRent += monthlyRent;
          byProject[name].totalPsf += rentPsf;
          byProject[name].count++;

          if (!byDist[dist]) byDist[dist] = { totalRent: 0, totalPsf: 0, count: 0 };
          byDist[dist].totalRent += monthlyRent;
          byDist[dist].totalPsf += rentPsf;
          byDist[dist].count++;

          if (!bySeg[seg]) bySeg[seg] = { totalRent: 0, count: 0 };
          bySeg[seg].totalRent += monthlyRent;
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
  for (const d of Object.values(byDist)) { d.avgRent = Math.round(d.totalRent / d.count); d.avgRentPsf = +(d.totalPsf / d.count).toFixed(2); }
  for (const s of Object.values(bySeg)) { s.avgRent = Math.round(s.totalRent / s.count); }
  for (const q of Object.values(byQtr)) { q.avgRent = Math.round(q.totalRent / q.count); q.medRent = med(q.totalMed); delete q.totalMed; }
  for (const b of Object.values(byBed)) { b.avgRent = Math.round(b.totalRent / b.count); b.avgRentPsf = +(b.totalPsf / b.count).toFixed(2); }

  console.log(`✅ Rental: ${totalCount} records from ${Object.keys(byProject).length} projects`);
  return {
    byProject, byDist, bySeg, byQtr, byBed,
    overallAvgRent: Math.round(totalRent / totalCount),
    overallAvgRentPsf: +(totalRentPsf / totalCount).toFixed(2),
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
  cacheTime = Date.now();
  projectCache.clear();
  console.log(`✅ Dashboard ready (${Math.round(JSON.stringify(dashboardCache).length / 1024)}KB, rental: ${dashboardCache.hasRealRental ? 'REAL' : 'ESTIMATED'})`);
  return dashboardCache;
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

  const txs = (p.transaction || []).map(tx => {
    const d = parseDate(tx.contractDate); if (!d) return null;
    const area = Math.round((parseFloat(tx.area) || 0) * 10.7639);
    const price = parseFloat(tx.price) || 0;
    if (area <= 0 || price <= 0) return null;
    const psf = Math.round(price / area);
    const fl = parseFloor(tx.floorRange);
    return { year: String(d.year), quarter: d.quarter, month: d.month, area, price, psf, floorRange: fl.band, floorMid: fl.mid, saleType: tx.typeOfSale === '1' ? 'New Sale' : tx.typeOfSale === '2' ? 'Sub Sale' : 'Resale', size: area, floor: fl.band };
  }).filter(Boolean);

  txs.sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month));

  const avgP = txs.length > 0 ? Math.round(txs.reduce((s,t) => s + t.psf, 0) / txs.length) : 0;
  const avgA = txs.length > 0 ? Math.round(txs.reduce((s,t) => s + t.area, 0) / txs.length) : 800;
  const rentPsf = +(avgP * yRate / 12).toFixed(2);
  const years = [...new Set(txs.map(t => t.year))].sort();
  const quarters = [...new Set(txs.map(t => t.quarter))].sort();

  const bands = ['01-05','06-10','11-15','16-20','21-25','26-30','31-35','36-40','41-45','46-50'];
  const loFloor = txs.filter(t => t.floorMid <= 5);
  const bpsf = loFloor.length > 0 ? Math.round(loFloor.reduce((s,t) => s + t.psf, 0) / loFloor.length) : avgP * 0.9;
  const projFloor = bands.map(r => {
    const [lo, hi] = r.split('-').map(Number);
    const ft = txs.filter(t => t.floorMid >= lo && t.floorMid <= hi);
    if (!ft.length) return null;
    const fp = Math.round(ft.reduce((s,t) => s + t.psf, 0) / ft.length);
    return { range: r, premium: +((fp / bpsf - 1) * 100).toFixed(1), psf: fp };
  }).filter(Boolean);

  const byQ = {};
  txs.forEach(t => { if (!byQ[t.quarter]) byQ[t.quarter] = []; byQ[t.quarter].push(t.psf); });
  const projPsfTrend = quarters.slice(-8).map(q => {
    const v = byQ[q] || [];
    return { q, avg: v.length > 0 ? Math.round(v.reduce((s,x) => s + x, 0) / v.length) : 0, med: med(v), vol: v.length };
  });
  const projRentTrend = projPsfTrend.map(q => ({
    q: q.q, avg: Math.round(q.avg * yRate / 12 * avgA), med: Math.round(q.med * yRate / 12 * avgA),
  }));

  const bedR = [{bed:'1 BR',min:0,max:600},{bed:'2 BR',min:600,max:900},{bed:'3 BR',min:900,max:1200},{bed:'4 BR',min:1200,max:1800},{bed:'PH',min:1800,max:99999}];
  const projByBed = bedR.map(b => {
    const bt = txs.filter(t => t.area >= b.min && t.area < b.max);
    if (!bt.length) return null;
    const ba = Math.round(bt.reduce((s,t) => s + t.psf, 0) / bt.length);
    const bAr = Math.round(bt.reduce((s,t) => s + t.area, 0) / bt.length);
    return { bed: b.bed, avg: Math.round(ba * bAr), psf: ba, rent: Math.round(ba * yRate / 12 * bAr), rentPsf: +(ba * yRate / 12).toFixed(2), count: bt.length };
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
  const std = [500, 650, 750, 900, 1100, 1250, 2000];
  const best = allSz.length > 0 ? std.map(s => allSz.reduce((p,c) => Math.abs(c-s) < Math.abs(p-s) ? c : p, allSz[0])) : std;
  const projSizes = [...new Set(best)].sort((a,b) => a - b);
  const distAvg = dashboardCache?.sDistBar?.find(d => d.d === (pool?.dist || ''))?.v || avgP;

  const projTx = txs.slice(0, 15).map(t => ({
    date: `${t.year}-${String(t.month).padStart(2,'0')}-15`,
    address: `#${(t.floorRange || '').split('-')[0] || '??'}-${String(1 + Math.floor(Math.random() * 15)).padStart(2,'0')}`,
    area: t.area, price: t.price, psf: t.psf, type: t.saleType,
  }));
  const projRentTx = txs.slice(0, 10).map(t => {
    const rent = Math.round(t.psf * yRate / 12 * t.area / 100) * 100;
    return {
      date: `${t.year}-${String(t.month).padStart(2,'0')}-15`,
      address: `#${(t.floorRange || '').split('-')[0] || '??'}-${String(1 + Math.floor(Math.random() * 15)).padStart(2,'0')}`,
      bed: t.area < 600 ? '1 BR' : t.area < 900 ? '2 BR' : t.area < 1200 ? '3 BR' : '4 BR',
      area: t.area, rent, psf: +(rent / t.area).toFixed(2),
    };
  });

  return {
    projInfo: {
      name: projectName, district: `${pool?.dist || ''} (${p.street || ''})`.trim(),
      segment: seg, tenure: pool?.type || '', type: pool?.type || '', top: '',
      units: txs.length, avgPsf: avgP, medPsf: med(txs.map(t => t.psf)),
      totalTx: txs.length, avgRent: Math.round(rentPsf * avgA), rentPsf,
      yield: +(yRate * 100).toFixed(2), distAvg,
    },
    projPsfTrend, projRentTrend, projByBed, projFloor,
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
export function getFilterOptions() {
  const districts = [...new Set(salesStore.map(r => r.di))].sort(distSort);
  const segments = [...new Set(salesStore.map(r => r.sg))].sort();
  const types = [...new Set(salesStore.map(r => r.tp))].sort();
  const tenures = [...new Set(salesStore.map(r => r.tn))].sort();
  const propertyTypes = [...new Set(salesStore.map(r => r.pt))].sort();
  const beds = [...new Set(rentalStore.map(r => r.bd))].sort();
  return { districts, segments, types, tenures, propertyTypes, beds };
}
