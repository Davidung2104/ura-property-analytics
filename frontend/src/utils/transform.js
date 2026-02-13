/**
 * Transform raw URA transaction data into chart-ready formats.
 * 
 * URA transaction fields:
 *   project, street, marketSegment (CCR/RCR/OCR), area (sqft string),
 *   floorRange ("01" to "05"), price (string), contractDate (MMYY),
 *   typeOfSale (1=New,2=Sub,3=Resale), propertyType, district ("01"-"28"),
 *   tenure, typeOfArea, noOfUnits, nettPrice
 */

// ═══ HELPERS ═══

/**
 * Flatten nested URA API response.
 * URA returns: { Result: [{ project, street, marketSegment, transaction: [{area, price, ...}] }] }
 * We need flat: [{ project, street, marketSegment, area, price, ... }]
 */
function flattenURA(raw) {
  // Handle different response shapes
  const records = Array.isArray(raw) ? raw : raw?.Result || raw?.result || [];
  const flat = [];
  records.forEach(proj => {
    const txs = proj.transaction || proj.transactions || [];
    txs.forEach(tx => {
      flat.push({
        ...tx,
        project: proj.project || tx.project || 'Unknown',
        street: proj.street || tx.street || '',
        marketSegment: proj.marketSegment || tx.marketSegment || '',
      });
    });
  });
  return flat;
}

/** Parse URA contractDate "MMYY" → { year: "2024", quarter: "24Q1", month: "01", fullYear: 2024 } */
function parseDate(cd) {
  if (!cd || cd.length < 4) return null;
  const mm = cd.slice(0, 2);
  const yy = cd.slice(2, 4);
  const fullYear = 2000 + parseInt(yy);
  const q = Math.ceil(parseInt(mm) / 3);
  return { year: String(fullYear), quarter: `${yy}Q${q}`, month: mm, fullYear };
}

/** Parse a single transaction into a normalized object */
function normalizeTx(tx) {
  const d = parseDate(tx.contractDate);
  if (!d) return null;
  const areaSqm = parseFloat(tx.area) || 0;
  const area = Math.round(areaSqm * 10.7639); // sqm → sqft
  const price = parseFloat(tx.price) || 0;
  const psf = area > 0 ? Math.round(price / area) : 0;
  const fr = (tx.floorRange || '').replace(/\s/g, '');
  // URA uses "01-05" or "01 to 05" or just "-" for landed
  let floorBand = fr;
  let floorMid = 0;
  if (fr === '-' || fr === '') {
    floorBand = '01-05';
    floorMid = 1;
  } else if (fr.includes('to')) {
    const parts = fr.split('to');
    floorBand = `${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
    floorMid = (parseInt(parts[0]) + parseInt(parts[1])) / 2;
  } else if (fr.includes('-')) {
    const parts = fr.split('-');
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      floorBand = `${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
      floorMid = (parseInt(parts[0]) + parseInt(parts[1])) / 2;
    }
  } else if (!isNaN(fr)) {
    floorMid = parseInt(fr);
    floorBand = fr;
  }
  // Tenure category
  let tenureCat = 'Leasehold';
  if (tx.tenure) {
    const t = tx.tenure.toLowerCase();
    if (t.includes('freehold')) tenureCat = 'Freehold';
    else if (t.includes('999')) tenureCat = '999-yr';
  }

  return {
    project: tx.project || 'Unknown',
    street: tx.street || '',
    segment: tx.marketSegment || 'OCR',
    area, price, psf,
    floorRange: floorBand,
    floorMid,
    district: `D${(tx.district || '').replace(/^0/, '')}`,
    districtNum: tx.district || '',
    year: d.year,
    quarter: d.quarter,
    month: d.month,
    fullYear: d.fullYear,
    date: `${d.fullYear}-${d.month}`,
    saleType: tx.typeOfSale === '1' ? 'New Sale' : tx.typeOfSale === '2' ? 'Sub Sale' : 'Resale',
    propertyType: tx.propertyType || 'Condominium',
    tenure: tenureCat,
    rawTenure: tx.tenure || '',
    unit: tx.noOfUnits || '1',
  };
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function avg(arr) {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function groupBy(arr, keyFn) {
  const map = {};
  arr.forEach(item => {
    const k = keyFn(item);
    if (!map[k]) map[k] = [];
    map[k].push(item);
  });
  return map;
}

// ═══ MAIN TRANSFORM ═══

export function transformAll(rawTransactions) {
  // Step 1: Flatten nested URA format (project → transaction[])
  const flatTx = flattenURA(rawTransactions);
  // Step 2: Normalize each transaction
  const txs = flatTx.map(normalizeTx).filter(Boolean).filter(t => t.psf > 0 && t.area > 0);

  if (txs.length === 0) return null;

  // Sort by date desc
  txs.sort((a, b) => b.date.localeCompare(a.date));

  // Get year range
  const years = [...new Set(txs.map(t => t.year))].sort();
  const quarters = [...new Set(txs.map(t => t.quarter))].sort();
  const latestYear = years[years.length - 1];
  const prevYear = years.length > 1 ? years[years.length - 2] : null;

  // ═══ SALES: YoY Trend ═══
  const byYear = groupBy(txs, t => t.year);
  const yoy = years.map((y, i) => {
    const yTx = byYear[y] || [];
    const avgPsf = avg(yTx.map(t => t.psf));
    const medPsf = median(yTx.map(t => t.psf));
    const prevAvg = i > 0 ? avg((byYear[years[i - 1]] || []).map(t => t.psf)) : null;
    const yoyPct = prevAvg ? +((avgPsf / prevAvg - 1) * 100).toFixed(1) : null;
    return { year: y, avg: avgPsf, med: medPsf, yoy: yoyPct };
  });

  // ═══ SALES: Segment Breakdown ═══
  const bySeg = groupBy(txs, t => t.segment);
  const sSeg = ['CCR', 'RCR', 'OCR'].map(s => ({
    name: s,
    val: avg((bySeg[s] || []).map(t => t.psf)),
    count: (bySeg[s] || []).length,
  })).filter(s => s.count > 0);

  // ═══ SALES: Top Projects ═══
  const byProj = groupBy(txs, t => t.project);
  const sTop = Object.entries(byProj)
    .map(([n, arr]) => ({ n, c: arr.length }))
    .sort((a, b) => b.c - a.c)
    .slice(0, 8);

  // ═══ SALES: District PSF Trends (line chart) ═══
  const districtNames = [...new Set(txs.map(t => t.district))].sort();
  const topDistricts = Object.entries(groupBy(txs, t => t.district))
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5)
    .map(([d]) => d);
  const byQuarter = groupBy(txs, t => t.quarter);
  const sDistLine = quarters.slice(-8).map(q => {
    const row = { q };
    topDistricts.forEach(d => {
      const dq = (byQuarter[q] || []).filter(t => t.district === d);
      row[d] = dq.length > 0 ? avg(dq.map(t => t.psf)) : null;
    });
    return row;
  });

  // ═══ SALES: District Avg PSF Bar ═══
  const sDistBar = districtNames.map(d => ({
    d,
    v: avg((groupBy(txs, t => t.district)[d] || []).map(t => t.psf)),
  })).sort((a, b) => b.v - a.v).slice(0, 10);

  // ═══ SALES: Property Type ═══
  const byType = groupBy(txs, t => t.propertyType);
  const sType = Object.entries(byType)
    .map(([t, arr]) => ({ t, v: avg(arr.map(x => x.psf)) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 5);

  // ═══ SALES: Tenure ═══
  const byTenure = groupBy(txs, t => t.tenure);
  const sTenure = Object.entries(byTenure)
    .map(([t, arr]) => ({ t, v: avg(arr.map(x => x.psf)) }))
    .sort((a, b) => b.v - a.v);

  // ═══ SALES: PSF Histogram ═══
  const allPsf = txs.map(t => t.psf);
  const psfMin = Math.floor(allPsf.reduce((a,b)=>a<b?a:b, Infinity) / 200) * 200;
  const psfMax = Math.ceil(allPsf.reduce((a,b)=>a>b?a:b, 0) / 200) * 200;
  const sHist = [];
  for (let r = psfMin; r < psfMax; r += 200) {
    sHist.push({ r: `$${r}`, c: allPsf.filter(p => p >= r && p < r + 200).length });
  }

  // ═══ SALES: Scatter (area vs PSF) ═══
  const sScat = txs.slice(0, 200).map(t => ({ a: t.area, p: t.psf, s: t.segment }));

  // ═══ SALES: Volume by Quarter ═══
  const sCum = quarters.slice(-12).map(q => ({
    d: q,
    v: (byQuarter[q] || []).reduce((s, t) => s + t.price, 0),
  }));

  // ═══ RENTAL: Estimated from sales (if no rental API) ═══
  // Yield assumptions by segment
  const yieldBySeg = { CCR: 0.025, RCR: 0.028, OCR: 0.032 };
  const estimateRent = (psf, seg) => +(psf * (yieldBySeg[seg] || 0.028) / 12).toFixed(2);

  const rTrend = quarters.slice(-8).map((q, i) => {
    const qTx = (byQuarter[q] || []);
    const avgRent = avg(qTx.map(t => Math.round(estimateRent(t.psf, t.segment) * t.area)));
    const medRent = median(qTx.map(t => Math.round(estimateRent(t.psf, t.segment) * t.area)));
    const prevQ = i > 0 ? quarters.slice(-8)[i - 1] : null;
    const prevAvg = prevQ ? avg((byQuarter[prevQ] || []).map(t => Math.round(estimateRent(t.psf, t.segment) * t.area))) : null;
    const qoq = prevAvg ? +((avgRent / prevAvg - 1) * 100).toFixed(1) : null;
    return { q, avg: avgRent, med: medRent, qoq };
  });

  const rSeg = sSeg.map(s => ({
    name: s.name,
    val: Math.round(s.val * (yieldBySeg[s.name] || 0.028) / 12 * 800), // est avg rent for ~800sf
    count: s.count,
  }));

  const rTop = sTop.map(p => ({ n: p.n, c: Math.round(p.c * 0.7) })); // ~70% rental rate

  const rDistLine = sDistLine.map(row => {
    const newRow = { q: row.q };
    topDistricts.forEach(d => {
      newRow[d] = row[d] ? +(row[d] * 0.028 / 12).toFixed(2) : null; // PSF → rent PSF
    });
    return newRow;
  });

  const rDistBar = sDistBar.map(d => ({
    d: d.d,
    v: +(d.v * 0.028 / 12).toFixed(2),
  }));

  const rType = sType.map(t => ({
    t: t.t,
    v: Math.round(t.v * 0.028 / 12 * 800),
  }));

  // Bedroom estimates
  const bedSizes = { '1 BR': 500, '2 BR': 750, '3 BR': 1050, '4 BR': 1300, '5 BR': 1800 };
  const rBed = Object.entries(bedSizes).map(([t, area]) => ({
    t,
    v: Math.round(avg(txs.map(t2 => estimateRent(t2.psf, t2.segment))) * area),
    psf: +(avg(txs.map(t2 => estimateRent(t2.psf, t2.segment)))).toFixed(2),
  }));

  const rHist = [];
  const rentEsts = txs.map(t => Math.round(estimateRent(t.psf, t.segment) * t.area));
  const rMin = Math.floor(rentEsts.reduce((a,b)=>a<b?a:b, Infinity) / 500) * 500;
  const rMax = Math.ceil(rentEsts.reduce((a,b)=>a>b?a:b, 0) / 500) * 500;
  for (let r = rMin; r < rMax; r += 500) {
    rHist.push({ r: `$${r}`, c: rentEsts.filter(p => p >= r && p < r + 500).length });
  }

  const rScat = txs.slice(0, 200).map(t => ({
    a: t.area,
    p: +estimateRent(t.psf, t.segment).toFixed(2),
    s: t.segment,
  }));

  const rCum = quarters.slice(-12).map(q => ({
    d: q,
    v: (byQuarter[q] || []).length,
  }));

  // ═══ INVESTMENT: Yield by District ═══
  const yd = districtNames.map(d => {
    const dTx = groupBy(txs, t => t.district)[d] || [];
    const bp = avg(dTx.map(t => t.psf));
    const seg = dTx.length > 0 ? dTx[0].segment : 'OCR';
    const rp = estimateRent(bp, seg);
    const y = +((rp * 12 / bp) * 100).toFixed(2);
    return { d, rp, bp, y, seg };
  }).filter(d => d.bp > 0).sort((a, b) => b.y - a.y).slice(0, 8);

  // ═══ INVESTMENT: CAGR by District ═══
  const cagrData = districtNames.map(d => {
    const dTx = groupBy(txs, t => t.district)[d] || [];
    const byY = groupBy(dTx, t => t.year);
    const startYear = years[0];
    const endYear = years[years.length - 1];
    const startAvg = byY[startYear] ? avg(byY[startYear].map(t => t.psf)) : null;
    const endAvg = byY[endYear] ? avg(byY[endYear].map(t => t.psf)) : null;
    const n = parseInt(endYear) - parseInt(startYear);
    const cagr = startAvg && endAvg && n > 0 ? +((Math.pow(endAvg / startAvg, 1 / n) - 1) * 100).toFixed(1) : null;
    const seg = dTx.length > 0 ? dTx[0].segment : 'OCR';
    const bp = endAvg || avg(dTx.map(t => t.psf));
    const yld = yd.find(y => y.d === d);
    const total = cagr !== null && yld ? +(cagr + yld.y).toFixed(2) : null;
    return { d, cagr, y: yld ? yld.y : 2.5, seg, bp, total };
  }).filter(d => d.cagr !== null && d.total !== null).sort((a, b) => b.total - a.total).slice(0, 8);

  const avgCagr = cagrData.length > 0 ? +(cagrData.reduce((s, d) => s + d.cagr, 0) / cagrData.length).toFixed(1) : 0;
  const avgYield = yd.length > 0 ? +(yd.reduce((s, d) => s + d.y, 0) / yd.length).toFixed(2) : 0;

  // ═══ MARKET TRANSACTION TABLE ═══
  const mktSaleTx = txs.slice(0, 500).map(t => ({
    date: `${t.year}-${t.month}-15`,
    project: t.project, district: t.district, segment: t.segment,
    type: t.propertyType,
    unit: `#${t.floorRange.split('-')[0] || '??'}-${String(1 + Math.floor(Math.random() * 20)).padStart(2, '0')}`,
    area: t.area, floor: t.floorMid, psf: t.psf, price: t.price,
  }));

  const mktRentTx = txs.slice(0, 500).map(t => {
    const rent = Math.round(estimateRent(t.psf, t.segment) * t.area / 100) * 100;
    return {
      date: `${t.year}-${t.month}-15`,
      project: t.project, district: t.district, segment: t.segment,
      unit: `#${t.floorRange.split('-')[0] || '??'}-${String(1 + Math.floor(Math.random() * 20)).padStart(2, '0')}`,
      bed: t.area < 550 ? '1 BR' : t.area < 800 ? '2 BR' : t.area < 1100 ? '3 BR' : t.area < 1500 ? '4 BR' : 'PH',
      area: t.area, floor: t.floorMid, rent, rentPsf: +(rent / t.area).toFixed(2),
    };
  });

  // ═══ SUMMARY STATS ═══
  const totalTx = txs.length;
  const latestTx = txs[0];
  const avgPsf = avg(txs.map(t => t.psf));
  const medPsf = median(txs.map(t => t.psf));
  const latestYearTx = txs.filter(t => t.year === latestYear);
  const prevYearTx = prevYear ? txs.filter(t => t.year === prevYear) : [];
  const yoyPct = prevYearTx.length > 0
    ? +((avg(latestYearTx.map(t => t.psf)) / avg(prevYearTx.map(t => t.psf)) - 1) * 100).toFixed(1)
    : null;

  return {
    // Raw for custom computations
    txs, years, quarters, topDistricts,

    // Summary
    totalTx, avgPsf, medPsf, yoyPct, latestYear,
    totalVolume: txs.reduce((s, t) => s + t.price, 0),
    avgRent: Math.round(avg(txs.map(t => estimateRent(t.psf, t.segment) * t.area))),
    avgRentPsf: +(avg(txs.map(t => estimateRent(t.psf, t.segment)))).toFixed(2),
    bestYield: yd.length > 0 ? yd[0] : null,

    // Sales charts
    yoy, sSeg, sTop, sDistLine, sDistBar, sType, sTenure, sHist, sScat, sCum,

    // Rental charts (estimated)
    rTrend, rSeg, rTop, rDistLine, rDistBar, rType, rBed, rHist, rScat, rCum,

    // Investment
    yd, cagrData, avgCagr, avgYield,

    // Transaction tables
    mktSaleTx, mktRentTx,

    // District list
    districtNames,

    // Yield helper
    estimateRent,
    yieldBySeg,
  };
}

// ═══ PROJECT-LEVEL TRANSFORMS ═══

export function transformProject(allTxs, projectName) {
  const txs = allTxs.filter(t => t.project === projectName);
  if (txs.length === 0) return null;

  const years = [...new Set(txs.map(t => t.year))].sort();
  const quarters = [...new Set(txs.map(t => t.quarter))].sort();
  const p = txs[0]; // sample for segment/district info
  const avgPsf = avg(txs.map(t => t.psf));
  const medPsf = median(txs.map(t => t.psf));
  const segment = p.segment;
  const district = p.district;
  const yieldRate = { CCR: 0.025, RCR: 0.028, OCR: 0.032 }[segment] || 0.028;
  const rentPsf = +(avgPsf * yieldRate / 12).toFixed(2);
  const avgRent = Math.round(rentPsf * avg(txs.map(t => t.area)));
  const grossYield = +((rentPsf * 12 / avgPsf) * 100).toFixed(2);

  // District average for comparison
  const distAvg = avg(allTxs.filter(t => t.district === district).map(t => t.psf));

  const projInfo = {
    name: projectName,
    district: `${district} (${p.street || ''})`.trim(),
    segment,
    tenure: p.rawTenure || 'Unknown',
    type: p.propertyType,
    top: '', // TOP year not in URA data
    units: txs.length, // approximate from tx count
    avgPsf, medPsf,
    totalTx: txs.length,
    avgRent, rentPsf, yield: grossYield,
    distAvg,
  };

  // PSF trend by quarter
  const byQ = groupBy(txs, t => t.quarter);
  const projPsfTrend = quarters.slice(-8).map(q => {
    const qTx = byQ[q] || [];
    return { q, avg: avg(qTx.map(t => t.psf)), med: median(qTx.map(t => t.psf)), vol: qTx.length };
  });

  // Rental trend (estimated)
  const projRentTrend = projPsfTrend.map(q => ({
    q: q.q,
    avg: Math.round(q.avg * yieldRate / 12 * avg(txs.map(t => t.area))),
    med: Math.round(q.med * yieldRate / 12 * median(txs.map(t => t.area))),
  }));

  // By bedroom (estimated from area)
  const bedRanges = [
    { bed: '1 BR', min: 0, max: 600 },
    { bed: '2 BR', min: 600, max: 900 },
    { bed: '3 BR', min: 900, max: 1200 },
    { bed: '4 BR', min: 1200, max: 1800 },
    { bed: 'PH', min: 1800, max: 99999 },
  ];
  const projByBed = bedRanges.map(b => {
    const bTx = txs.filter(t => t.area >= b.min && t.area < b.max);
    if (bTx.length === 0) return null;
    const bAvg = avg(bTx.map(t => t.psf));
    const bArea = avg(bTx.map(t => t.area));
    const bRentPsf = +(bAvg * yieldRate / 12).toFixed(2);
    return {
      bed: b.bed,
      avg: Math.round(bAvg * bArea),
      psf: bAvg,
      rent: Math.round(bRentPsf * bArea),
      rentPsf: bRentPsf,
      count: bTx.length,
    };
  }).filter(Boolean);

  // Floor analysis
  const floorBands = ['01-05', '06-10', '11-15', '16-20', '21-25', '26-30', '31-35', '36-40', '41-45', '46-50'];
  const basePsf = avg(txs.filter(t => t.floorRange === '01-05' || t.floorMid <= 5).map(t => t.psf)) || avgPsf * 0.9;
  const projFloor = floorBands.map(range => {
    const [lo, hi] = range.split('-').map(Number);
    const fTx = txs.filter(t => t.floorMid >= lo && t.floorMid <= hi);
    if (fTx.length === 0) return null;
    const fPsf = avg(fTx.map(t => t.psf));
    const premium = +((fPsf / basePsf - 1) * 100).toFixed(1);
    return { range, premium, psf: fPsf };
  }).filter(Boolean);

  // Scatter
  const projScatter = txs.slice(0, 80).map(t => ({
    area: t.area, psf: t.psf, floor: t.floorMid, price: t.price,
  }));

  // Transaction tables
  const projTx = txs.slice(0, 15).map(t => ({
    date: `${t.year}-${t.month}-15`,
    address: `#${t.floorRange.split('-')[0] || '??'}-${String(1 + Math.floor(Math.random() * 15)).padStart(2, '0')}`,
    area: t.area, price: t.price, psf: t.psf, type: t.saleType,
  }));

  const projRentTx = txs.slice(0, 10).map(t => {
    const rent = Math.round(t.psf * yieldRate / 12 * t.area / 100) * 100;
    return {
      date: `${t.year}-${t.month}-15`,
      address: `#${t.floorRange.split('-')[0] || '??'}-${String(1 + Math.floor(Math.random() * 15)).padStart(2, '0')}`,
      bed: t.area < 600 ? '1 BR' : t.area < 900 ? '2 BR' : t.area < 1200 ? '3 BR' : t.area < 1800 ? '4 BR' : 'PH',
      area: t.area, rent, psf: +(rent / t.area).toFixed(2),
    };
  });

  // Heatmap: Floor × Year
  const hmYears = years.slice(-5);
  const hmFloors = projFloor.map(f => f.range);
  const hmMatrix = {};
  hmFloors.forEach(f => {
    const [lo, hi] = f.split('-').map(Number);
    hmYears.forEach(y => {
      const cell = txs.filter(t => t.floorMid >= lo && t.floorMid <= hi && t.year === y);
      if (cell.length > 0) {
        hmMatrix[`${f}-${y}`] = {
          psf: avg(cell.map(t => t.psf)),
          vol: cell.length,
          price: avg(cell.map(t => t.price)),
        };
      }
    });
  });

  // Raw tx for CAGR computation
  const rawTx = txs.map(t => ({ year: t.year, floor: t.floorRange, size: t.area, psf: t.psf }));

  // Sizes available
  const projSizes = [...new Set(txs.map(t => t.area))].sort((a, b) => a - b);
  // Pick representative sizes (closest to standard sizes)
  const stdSizes = [500, 650, 750, 900, 1100, 1250, 2000];
  const bestSizes = stdSizes.map(s => projSizes.reduce((p, c) => Math.abs(c - s) < Math.abs(p - s) ? c : p, projSizes[0]));
  const uniqueSizes = [...new Set(bestSizes)].sort((a, b) => a - b);

  return {
    projInfo, projPsfTrend, projRentTrend, projByBed, projFloor, projScatter,
    projTx, projRentTx,
    hmYears, hmFloors, hmMatrix, rawTx,
    projSizes: uniqueSizes,
    floorRanges: hmFloors,
    txs, // all project txs for CAGR
  };
}

// ═══ COMPARISON TRANSFORMS ═══

export function buildComparisonPool(allTxs) {
  const byProj = groupBy(allTxs, t => t.project);
  return Object.entries(byProj)
    .filter(([, arr]) => arr.length >= 5) // minimum 5 transactions
    .map(([name, arr]) => {
      const avgPsf = avg(arr.map(t => t.psf));
      const seg = arr[0].segment;
      const dist = arr[0].district;
      const yieldRate = { CCR: 0.025, RCR: 0.028, OCR: 0.032 }[seg] || 0.028;
      const avgArea = avg(arr.map(t => t.area));
      const rent = Math.round(avgPsf * yieldRate / 12 * avgArea / 100) * 100;
      const yld = +((yieldRate) * 100).toFixed(2);
      // Try to extract TOP year from earliest transaction
      const years = arr.map(t => t.fullYear).sort();
      const age = String(years[0] || '');
      return {
        name, psf: avgPsf, rent, yield: yld, dist, age,
        lat: 1.28 + (Math.random() - 0.5) * 0.05, // placeholder coords
        lng: 103.85 + (Math.random() - 0.5) * 0.05,
        type: arr[0].propertyType,
        units: arr.length,
        segment: seg,
      };
    })
    .sort((a, b) => b.units - a.units);
}

// ═══ NEARBY PROJECT HEATMAP ═══

export function buildNearbyHeatmap(allTxs, projectNames, years) {
  const data = {};
  const vol = {};
  projectNames.forEach(proj => {
    const pTx = allTxs.filter(t => t.project === proj);
    years.forEach(y => {
      const yTx = pTx.filter(t => t.year === y);
      if (yTx.length > 0) {
        data[`${proj}-${y}`] = avg(yTx.map(t => t.psf));
        vol[`${proj}-${y}`] = yTx.length;
      }
    });
  });
  return { projects: projectNames, years, data, vol };
}
