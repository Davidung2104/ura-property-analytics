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

// ═══ CACHE ═══
let dashboardCache = null;
let cacheTime = null;
const CACHE_TTL = 3600000; // 1 hour

// ═══ HELPERS ═══
function parseDate(cd) {
  if (!cd || cd.length < 4) return null;
  const mm = parseInt(cd.slice(0, 2));
  const yy = parseInt(cd.slice(2, 4));
  const year = 2000 + yy;
  return { year, quarter: `${String(yy).padStart(2,'0')}Q${Math.ceil(mm / 3)}`, month: mm };
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

const avg = (sum, n) => n > 0 ? Math.round(sum / n) : 0;
const med = arr => { if (!arr.length) return 0; const s = [...arr].sort((a,b)=>a-b); const m = Math.floor(s.length/2); return s.length%2 ? s[m] : Math.round((s[m-1]+s[m])/2); };

// ═══ AGGREGATOR ═══
class Agg {
  constructor() {
    this.total = 0; this.vol = 0;
    this.samples = []; // capped at 2000
    this.byYear = {}; this.byQtr = {};
    this.bySeg = {}; this.byDist = {};
    this.byType = {}; this.byTenure = {};
    this.byProj = {}; this.byFloor = {};
    this.latestTx = [];
  }

  add(proj) {
    const txs = proj.transaction || [];
    const name = proj.project || 'Unknown';
    const street = proj.street || '';
    const seg = proj.marketSegment || 'OCR';

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
      if (tx.tenure) { const t = tx.tenure.toLowerCase(); if (t.includes('freehold')) tenure = 'Freehold'; else if (t.includes('999')) tenure = '999-yr'; }

      this.total++;
      this.vol += price;

      // Sample for histogram/scatter
      if (this.samples.length < 2000) this.samples.push({ psf, area, seg: seg, dist });

      // Year
      const y = String(d.year);
      if (!this.byYear[y]) this.byYear[y] = { s: 0, n: 0, v: 0, p: [] };
      this.byYear[y].s += psf; this.byYear[y].n++; this.byYear[y].v += price;
      if (this.byYear[y].p.length < 500) this.byYear[y].p.push(psf);

      // Quarter
      const q = d.quarter;
      if (!this.byQtr[q]) this.byQtr[q] = { s: 0, n: 0, v: 0 };
      this.byQtr[q].s += psf; this.byQtr[q].n++; this.byQtr[q].v += price;

      // Segment
      if (!this.bySeg[seg]) this.bySeg[seg] = { s: 0, n: 0 };
      this.bySeg[seg].s += psf; this.bySeg[seg].n++;

      // District
      if (!this.byDist[dist]) this.byDist[dist] = { s: 0, n: 0, seg, v: 0, byY: {}, byQ: {} };
      const dd = this.byDist[dist];
      dd.s += psf; dd.n++; dd.v += price;
      if (!dd.byY[y]) dd.byY[y] = { s: 0, n: 0 }; dd.byY[y].s += psf; dd.byY[y].n++;
      if (!dd.byQ[q]) dd.byQ[q] = { s: 0, n: 0 }; dd.byQ[q].s += psf; dd.byQ[q].n++;

      // Type & Tenure
      if (!this.byType[pType]) this.byType[pType] = { s: 0, n: 0 };
      this.byType[pType].s += psf; this.byType[pType].n++;
      if (!this.byTenure[tenure]) this.byTenure[tenure] = { s: 0, n: 0 };
      this.byTenure[tenure].s += psf; this.byTenure[tenure].n++;

      // Project (summary only)
      if (!this.byProj[name]) this.byProj[name] = { name, street, seg, dist, tenure: tx.tenure || '', pType, s: 0, n: 0, areas: [], prices: [], byY: {}, byFl: {}, latest: '' };
      const bp = this.byProj[name];
      bp.s += psf; bp.n++;
      if (bp.areas.length < 50) bp.areas.push(area);
      if (bp.prices.length < 50) bp.prices.push(psf);
      if (!bp.byY[y]) bp.byY[y] = { s: 0, n: 0 }; bp.byY[y].s += psf; bp.byY[y].n++;
      if (fl.band) { if (!bp.byFl[fl.band]) bp.byFl[fl.band] = { s: 0, n: 0 }; bp.byFl[fl.band].s += psf; bp.byFl[fl.band].n++; }
      const ds = `${d.year}-${String(d.month).padStart(2,'0')}`;
      if (ds > bp.latest) bp.latest = ds;

      // Floor
      if (fl.band) { if (!this.byFloor[fl.band]) this.byFloor[fl.band] = { s: 0, n: 0 }; this.byFloor[fl.band].s += psf; this.byFloor[fl.band].n++; }

      // Latest tx (keep 500)
      if (this.latestTx.length < 500) {
        this.latestTx.push({ date: `${d.year}-${String(d.month).padStart(2,'0')}-15`, project: name, district: dist, segment: seg, type: pType, unit: fl.band ? `#${fl.band.split('-')[0]}-${String(1+Math.floor(Math.random()*20)).padStart(2,'0')}` : '-', area, floor: fl.mid, psf, price });
      }
    }
  }

  build() {
    const yieldMap = { CCR: 0.025, RCR: 0.028, OCR: 0.032 };
    const estRent = (psf, seg) => +(psf * (yieldMap[seg] || 0.028) / 12).toFixed(2);
    const avgArea = this.samples.length > 0 ? Math.round(this.samples.reduce((s,p)=>s+p.area,0)/this.samples.length) : 800;

    const years = Object.keys(this.byYear).sort();
    const qtrs = Object.keys(this.byQtr).sort();
    const latY = years[years.length-1];
    const prevY = years.length > 1 ? years[years.length-2] : null;

    const avgPsf = avg(Object.values(this.byYear).reduce((s,y)=>s+y.s,0), this.total);
    const latAvg = this.byYear[latY] ? avg(this.byYear[latY].s, this.byYear[latY].n) : 0;
    const prvAvg = prevY && this.byYear[prevY] ? avg(this.byYear[prevY].s, this.byYear[prevY].n) : 0;
    const yoyPct = prvAvg > 0 ? +((latAvg/prvAvg-1)*100).toFixed(1) : null;
    const medPsf = med(this.samples.map(s=>s.psf));

    // YoY
    const yoy = years.map((y,i) => {
      const b = this.byYear[y];
      const a = avg(b.s, b.n);
      const m = med(b.p);
      const pa = i > 0 ? avg(this.byYear[years[i-1]].s, this.byYear[years[i-1]].n) : null;
      return { year: y, avg: a, med: m, yoy: pa ? +((a/pa-1)*100).toFixed(1) : null };
    });

    // Rental trend
    const rTrend = qtrs.slice(-8).map((q,i) => {
      const a = avg(this.byQtr[q].s, this.byQtr[q].n);
      const rent = Math.round(estRent(a,'RCR') * avgArea);
      const pq = i > 0 ? qtrs.slice(-8)[i-1] : null;
      const pRent = pq && this.byQtr[pq] ? Math.round(estRent(avg(this.byQtr[pq].s,this.byQtr[pq].n),'RCR') * avgArea) : null;
      return { q, avg: rent, med: Math.round(rent*0.92), qoq: pRent ? +((rent/pRent-1)*100).toFixed(1) : null };
    });

    // Segments
    const sSeg = ['CCR','RCR','OCR'].map(s => ({ name:s, val:avg(this.bySeg[s]?.s||0, this.bySeg[s]?.n||0), count:this.bySeg[s]?.n||0 })).filter(s=>s.count>0);
    const rSeg = sSeg.map(s => ({ name:s.name, val:Math.round(s.val*(yieldMap[s.name]||0.028)/12*avgArea), count:s.count }));

    // Top projects
    const sTop = Object.values(this.byProj).sort((a,b)=>b.n-a.n).slice(0,8).map(p=>({n:p.name,c:p.n}));
    const rTop = sTop.map(p=>({n:p.n,c:Math.round(p.c*0.7)}));

    // Districts
    const dNames = Object.keys(this.byDist).sort();
    const topDist = Object.entries(this.byDist).sort((a,b)=>b[1].n-a[1].n).slice(0,5).map(([d])=>d);

    const sDistLine = qtrs.slice(-8).map(q => {
      const row = { q };
      topDist.forEach(d => { const dq = this.byDist[d]?.byQ[q]; row[d] = dq ? avg(dq.s,dq.n) : null; });
      return row;
    });
    const rDistLine = sDistLine.map(row => {
      const r = { q: row.q };
      topDist.forEach(d => { r[d] = row[d] ? +(row[d]*0.028/12).toFixed(2) : null; });
      return r;
    });

    const sDistBar = dNames.map(d=>({d, v:avg(this.byDist[d].s, this.byDist[d].n)})).sort((a,b)=>b.v-a.v).slice(0,10);
    const rDistBar = sDistBar.map(d=>({d:d.d, v:+(d.v*0.028/12).toFixed(2)}));

    // Types & Tenure
    const sType = Object.entries(this.byType).map(([t,v])=>({t, v:avg(v.s,v.n)})).sort((a,b)=>b.v-a.v).slice(0,5);
    const rType = sType.map(t=>({t:t.t, v:Math.round(t.v*0.028/12*avgArea)}));
    const sTenure = Object.entries(this.byTenure).map(([t,v])=>({t, v:avg(v.s,v.n)})).sort((a,b)=>b.v-a.v);
    const bedSz = {'1 BR':500,'2 BR':750,'3 BR':1050,'4 BR':1300,'5 BR':1800};
    const rBed = Object.entries(bedSz).map(([t,a])=>({t, v:Math.round(estRent(avgPsf,'RCR')*a), psf:estRent(avgPsf,'RCR')}));

    // Histogram
    const psfVals = this.samples.map(s=>s.psf);
    const pMin = Math.floor(psfVals.reduce((a,b)=>a<b?a:b,Infinity)/200)*200;
    const pMax = Math.ceil(psfVals.reduce((a,b)=>a>b?a:b,0)/200)*200;
    const sHist = []; for(let r=pMin;r<pMax;r+=200) sHist.push({r:`$${r}`,c:psfVals.filter(p=>p>=r&&p<r+200).length});

    const rEsts = this.samples.map(s=>Math.round(estRent(s.psf,s.seg)*s.area));
    const rMin = Math.floor(rEsts.reduce((a,b)=>a<b?a:b,Infinity)/500)*500;
    const rMax = Math.ceil(rEsts.reduce((a,b)=>a>b?a:b,0)/500)*500;
    const rHist = []; for(let r=rMin;r<rMax;r+=500) rHist.push({r:`$${r}`,c:rEsts.filter(p=>p>=r&&p<r+500).length});

    // Scatter & Volume
    const sScat = this.samples.slice(0,200).map(s=>({a:s.area,p:s.psf,s:s.seg}));
    const rScat = this.samples.slice(0,200).map(s=>({a:s.area,p:estRent(s.psf,s.seg),s:s.seg}));
    const sCum = qtrs.slice(-12).map(q=>({d:q,v:this.byQtr[q]?.v||0}));
    const rCum = qtrs.slice(-12).map(q=>({d:q,v:this.byQtr[q]?.n||0}));

    // Investment
    const yd = dNames.map(d=>{const b=this.byDist[d];const bp=avg(b.s,b.n);const rp=estRent(bp,b.seg);return{d,rp,bp,y:+((rp*12/bp)*100).toFixed(2),seg:b.seg};}).filter(d=>d.bp>0).sort((a,b)=>b.y-a.y).slice(0,8);
    const cagrData = dNames.map(d=>{const b=this.byDist[d];const sY=years[0];const eY=years[years.length-1];const sA=b.byY[sY]?avg(b.byY[sY].s,b.byY[sY].n):null;const eA=b.byY[eY]?avg(b.byY[eY].s,b.byY[eY].n):null;const n=parseInt(eY)-parseInt(sY);const c=sA&&eA&&n>0?+((Math.pow(eA/sA,1/n)-1)*100).toFixed(1):null;const yy=yd.find(y=>y.d===d);const t=c!==null&&yy?+(c+yy.y).toFixed(2):null;return{d,cagr:c,y:yy?yy.y:2.5,seg:b.seg,bp:eA||avg(b.s,b.n),total:t};}).filter(d=>d.cagr!==null&&d.total!==null).sort((a,b)=>b.total-a.total).slice(0,8);

    // Tx tables
    this.latestTx.sort((a,b)=>b.date.localeCompare(a.date));
    const mktRentTx = this.latestTx.map(tx=>{const rent=Math.round(estRent(tx.psf,tx.segment)*tx.area/100)*100;return{date:tx.date,project:tx.project,district:tx.district,segment:tx.segment,unit:tx.unit,bed:tx.area<550?'1 BR':tx.area<800?'2 BR':tx.area<1100?'3 BR':tx.area<1500?'4 BR':'PH',area:tx.area,floor:tx.floor,rent,rentPsf:+(rent/tx.area).toFixed(2)};});

    // Comparison pool
    const cmpPool = Object.values(this.byProj).filter(p=>p.n>=5).sort((a,b)=>b.n-a.n).slice(0,30).map(p=>{
      const ap=avg(p.s,p.n);const aa=p.areas.length>0?Math.round(p.areas.reduce((s,a)=>s+a,0)/p.areas.length):avgArea;
      const rent=Math.round(estRent(ap,p.seg)*aa/100)*100;const yld=+((yieldMap[p.seg]||0.028)*100).toFixed(2);
      const dn=parseInt(p.dist.replace('D',''))||1;
      return{name:p.name,psf:ap,rent,yield:yld,dist:p.dist,age:Object.keys(p.byY).sort()[0]||'',
        lat:+(1.28+(dn-14)*0.004+Math.sin(dn*7)*0.01).toFixed(4),lng:+(103.85+(dn-14)*0.003+Math.cos(dn*7)*0.01).toFixed(4),
        type:p.pType,units:p.n,segment:p.seg};
    });

    const projList = Object.values(this.byProj).filter(p=>p.n>=3).sort((a,b)=>b.n-a.n).slice(0,100).map(p=>p.name);

    return {
      totalTx:this.total, avgPsf, medPsf, yoyPct, latestYear:latY,
      totalVolume:this.vol, avgRent:Math.round(estRent(avgPsf,'RCR')*avgArea), avgRentPsf:estRent(avgPsf,'RCR'),
      bestYield:yd[0]||null,
      years, quarters:qtrs, topDistricts:topDist, districtNames:dNames,
      yoy, rTrend, sSeg, rSeg, sTop, rTop,
      sDistLine, rDistLine, sDistBar, rDistBar,
      sType, rType, sTenure, rBed,
      sHist, rHist, sScat, rScat, sCum, rCum,
      yd, cagrData,
      avgCagr: cagrData.length>0?+(cagrData.reduce((s,d)=>s+d.cagr,0)/cagrData.length).toFixed(1):0,
      avgYield: yd.length>0?+(yd.reduce((s,d)=>s+d.y,0)/yd.length).toFixed(2):0,
      mktSaleTx:this.latestTx, mktRentTx, cmpPool, projList,
    };
  }
}

// ═══ BUILD ═══

export async function buildDashboardData(force = false) {
  if (!force && dashboardCache && cacheTime && (Date.now() - cacheTime < CACHE_TTL)) {
    return dashboardCache;
  }

  console.log('🔄 Building dashboard from URA API...');
  const agg = new Agg();

  for (let batch = 1; batch <= 4; batch++) {
    try {
      console.log(`📥 Batch ${batch}...`);
      const projects = await fetchBatch('PMI_Resi_Transaction', batch);
      console.log(`✅ Batch ${batch}: ${projects.length} projects`);
      for (const p of projects) agg.add(p);
      // projects array gets GC'd here
    } catch (err) {
      console.error(`❌ Batch ${batch}:`, err.message);
    }
  }

  console.log(`📊 ${agg.total} transactions processed`);
  dashboardCache = agg.build();
  cacheTime = Date.now();
  console.log(`✅ Dashboard ready (${Math.round(JSON.stringify(dashboardCache).length/1024)}KB)`);
  return dashboardCache;
}

// ═══ PROJECT DETAIL ═══

export async function getProjectData(projectName) {
  if (!dashboardCache) await buildDashboardData();
  const pool = dashboardCache?.cmpPool?.find(p => p.name === projectName);
  const proj = dashboardCache ? Object.values(new Agg().byProj) : [];

  // Fetch just the relevant batch
  const dNum = parseInt((pool?.dist || 'D1').replace('D','')) || 1;
  const batch = dNum <= 7 ? 1 : dNum <= 14 ? 2 : dNum <= 21 ? 3 : 4;

  try {
    const projects = await fetchBatch('PMI_Resi_Transaction', batch);
    const p = projects.find(pr => pr.project === projectName);
    if (!p) return null;

    const txs = (p.transaction || []).map(tx => {
      const d = parseDate(tx.contractDate); if (!d) return null;
      const area = Math.round((parseFloat(tx.area)||0) * 10.7639);
      const price = parseFloat(tx.price) || 0;
      if (area<=0||price<=0) return null;
      const psf = Math.round(price/area);
      const fl = parseFloor(tx.floorRange);
      return { year:String(d.year), quarter:d.quarter, month:d.month, area, price, psf, floorRange:fl.band, floorMid:fl.mid, saleType:tx.typeOfSale==='1'?'New Sale':tx.typeOfSale==='2'?'Sub Sale':'Resale' };
    }).filter(Boolean);

    const seg = p.marketSegment || 'RCR';
    const yRate = {CCR:0.025,RCR:0.028,OCR:0.032}[seg]||0.028;
    const avgP = txs.length>0 ? Math.round(txs.reduce((s,t)=>s+t.psf,0)/txs.length) : 0;
    const avgA = txs.length>0 ? Math.round(txs.reduce((s,t)=>s+t.area,0)/txs.length) : 800;
    const rentPsf = +(avgP*yRate/12).toFixed(2);
    const years = [...new Set(txs.map(t=>t.year))].sort();
    const quarters = [...new Set(txs.map(t=>t.quarter))].sort();

    // Floor analysis
    const bands = ['01-05','06-10','11-15','16-20','21-25','26-30','31-35','36-40','41-45','46-50'];
    const bpsf = (()=>{const lo=txs.filter(t=>t.floorMid<=5);return lo.length>0?Math.round(lo.reduce((s,t)=>s+t.psf,0)/lo.length):avgP*0.9;})();
    const projFloor = bands.map(r=>{const[lo,hi]=r.split('-').map(Number);const ft=txs.filter(t=>t.floorMid>=lo&&t.floorMid<=hi);if(!ft.length)return null;const fp=Math.round(ft.reduce((s,t)=>s+t.psf,0)/ft.length);return{range:r,premium:+((fp/bpsf-1)*100).toFixed(1),psf:fp};}).filter(Boolean);

    // Quarterly trend
    const byQ = {};
    txs.forEach(t=>{if(!byQ[t.quarter])byQ[t.quarter]=[];byQ[t.quarter].push(t.psf);});
    const projPsfTrend = quarters.slice(-8).map(q=>{const v=byQ[q]||[];const a=v.length>0?Math.round(v.reduce((s,x)=>s+x,0)/v.length):0;return{q,avg:a,med:med(v),vol:v.length};});
    const projRentTrend = projPsfTrend.map(q=>({q:q.q,avg:Math.round(q.avg*yRate/12*avgA),med:Math.round(q.med*yRate/12*avgA)}));

    // Bedrooms
    const bedR = [{bed:'1 BR',min:0,max:600},{bed:'2 BR',min:600,max:900},{bed:'3 BR',min:900,max:1200},{bed:'4 BR',min:1200,max:1800},{bed:'PH',min:1800,max:99999}];
    const projByBed = bedR.map(b=>{const bt=txs.filter(t=>t.area>=b.min&&t.area<b.max);if(!bt.length)return null;const ba=Math.round(bt.reduce((s,t)=>s+t.psf,0)/bt.length);const bAr=Math.round(bt.reduce((s,t)=>s+t.area,0)/bt.length);return{bed:b.bed,avg:Math.round(ba*bAr),psf:ba,rent:Math.round(ba*yRate/12*bAr),rentPsf:+(ba*yRate/12).toFixed(2),count:bt.length};}).filter(Boolean);

    // Heatmap
    const hmYears = years.slice(-5);
    const hmFloors = projFloor.map(f=>f.range);
    const hmMatrix = {};
    hmFloors.forEach(f=>{const[lo,hi]=f.split('-').map(Number);hmYears.forEach(y=>{const c=txs.filter(t=>t.floorMid>=lo&&t.floorMid<=hi&&t.year===y);if(c.length>0)hmMatrix[`${f}-${y}`]={psf:Math.round(c.reduce((s,t)=>s+t.psf,0)/c.length),vol:c.length,price:Math.round(c.reduce((s,t)=>s+t.price,0)/c.length)};});});

    // Sizes
    const allSz = [...new Set(txs.map(t=>t.area))].sort((a,b)=>a-b);
    const std = [500,650,750,900,1100,1250,2000];
    const best = std.map(s=>allSz.reduce((p,c)=>Math.abs(c-s)<Math.abs(p-s)?c:p,allSz[0]||800));
    const projSizes = [...new Set(best)].sort((a,b)=>a-b);

    const distAvg = dashboardCache?.sDistBar?.find(d=>d.d===(pool?.dist||''))?.v || avgP;

    return {
      projInfo: { name:projectName, district:`${pool?.dist||''} (${p.street||''})`.trim(), segment:seg, tenure:pool?.type||'', type:pool?.type||'', top:'', units:txs.length, avgPsf:avgP, medPsf:med(txs.map(t=>t.psf)), totalTx:txs.length, avgRent:Math.round(rentPsf*avgA), rentPsf, yield:+((yRate)*100).toFixed(2), distAvg },
      projPsfTrend, projRentTrend, projByBed, projFloor,
      projScatter: txs.slice(0,80).map(t=>({area:t.area,psf:t.psf,floor:t.floorMid,price:t.price})),
      projTx: txs.slice(0,15).map(t=>({date:`${t.year}-${String(t.month).padStart(2,'0')}-15`,address:`#${(t.floorRange||'').split('-')[0]||'??'}-${String(1+Math.floor(Math.random()*15)).padStart(2,'0')}`,area:t.area,price:t.price,psf:t.psf,type:t.saleType})),
      projRentTx: txs.slice(0,10).map(t=>{const rent=Math.round(t.psf*yRate/12*t.area/100)*100;return{date:`${t.year}-${String(t.month).padStart(2,'0')}-15`,address:`#${(t.floorRange||'').split('-')[0]||'??'}-${String(1+Math.floor(Math.random()*15)).padStart(2,'0')}`,bed:t.area<600?'1 BR':t.area<900?'2 BR':t.area<1200?'3 BR':'4 BR',area:t.area,rent,psf:+(rent/t.area).toFixed(2)};}),
      hmYears, hmFloors, hmMatrix, rawTx:txs, projSizes, floorRanges:hmFloors, txs,
    };
  } catch(err) { console.error('Project error:', err.message); return null; }
}

export function getTokenInfo() {
  return {
    hasToken: !!token.value,
    fetchedAt: token.fetchedAt?.toISOString(),
    expiresAt: token.expiresAt?.toISOString(),
    hoursRemaining: token.expiresAt ? +((token.expiresAt - Date.now()) / 3600000).toFixed(1) : 0,
    isValid: token.value && Date.now() < token.expiresAt,
  };
}

export function getCacheInfo() {
  return { hasDashboard: !!dashboardCache, cacheAge: cacheTime ? Math.round((Date.now()-cacheTime)/60000)+'min' : null, totalTx: dashboardCache?.totalTx || 0 };
}
