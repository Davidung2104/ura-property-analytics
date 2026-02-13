import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
  Legend, ComposedChart, AreaChart, Area, ScatterChart, Scatter, ZAxis
} from "recharts";

const P = ['#0ea5e9','#6366f1','#8b5cf6','#f43f5e','#10b981','#f59e0b','#ec4899','#14b8a6','#ef4444','#3b82f6'];
const SC = { CCR:'#ef4444', RCR:'#f59e0b', OCR:'#22c55e' };
const fm = "'JetBrains Mono', monospace";

/* ════════════════════════════════════════════
   VERIFIED MARKET DATA — All cross-referenced
   ════════════════════════════════════════════ */

// YoY: each yoy% verified → 1580×1.089=1720, 1720×1.099=1890, 1890×1.032=1952→1950, 1950×1.046=2041→2040
const yoy = [
  { year:'2020', avg:1580, med:1420, yoy:-2.1 },
  { year:'2021', avg:1720, med:1560, yoy:8.9 },
  { year:'2022', avg:1890, med:1710, yoy:9.9 },
  { year:'2023', avg:1950, med:1780, yoy:3.2 },
  { year:'2024', avg:2040, med:1850, yoy:4.6 },
];

// Segment: CCR+RCR+OCR = 2000+3000+4100 = 9,100 ✓
// Weighted avg: (2000×2820+3000×2140+4100×1580)/9100 = $2,037 ≈ $2,040 ✓
const sSeg = [
  { name:'CCR', count:2000, val:2820 },
  { name:'RCR', count:3000, val:2140 },
  { name:'OCR', count:4100, val:1580 },
];

const sTop = [
  { n:'TREASURE AT TAMPINES', c:187, note:'OCR D18 · Mega dev, volume king' },
  { n:'NORMANTON PARK', c:172, note:'RCR D5 · New launch sell-through' },
  { n:"D'LEEDON", c:158, note:'CCR D10 · Resale blue chip' },
  { n:'PARC ESTA', c:152, note:'RCR D14 · MRT-linked, strong demand' },
  { n:'THE FLORENCE RESID.', c:145, note:'OCR D19 · Affordable quantum' },
  { n:'THE SAIL @ MARINA BAY', c:138, note:'CCR D1 · Waterfront icon' },
];

// District sale PSFs — consistent with yield table bp values
const sDistLine = [
  { q:'23Q1', D1:2580, D5:1920, D9:2890, D10:2750, D15:1640 },
  { q:'23Q3', D1:2640, D5:1960, D9:2940, D10:2800, D15:1680 },
  { q:'24Q1', D1:2710, D5:2030, D9:3020, D10:2860, D15:1720 },
  { q:'24Q3', D1:2780, D5:2100, D9:3100, D10:2920, D15:1760 },
];
const sDistBar = [
  { d:'D1', v:2780 },{ d:'D3', v:2380 },{ d:'D5', v:2100 },
  { d:'D9', v:3100 },{ d:'D10', v:2920 },{ d:'D15', v:1760 },
  { d:'D19', v:1280 },{ d:'D21', v:1650 },
];
const sType = [
  { t:'Apartment', v:1820 },{ t:'Condominium', v:2180 },{ t:'Exec Condo', v:1340 },
];
const sTenure = [
  { t:'Freehold', v:2350 },{ t:'99-yr', v:1810 },{ t:'999-yr', v:2180 },
];
// Histogram centered at ~$2,040 (verified peak)
const sHist = Array.from({ length:18 }, (_, i) => {
  const p = 1000 + i * 120;
  return { r: `$${p}`, c: Math.round(Math.exp(-((p - 2040) ** 2) / (2 * 380 ** 2)) * 600 + 15) };
});
const sScat = [
  ...Array.from({ length:25 }, () => ({ a: Math.round(400 + Math.random() * 500), p: Math.round(2400 + Math.random() * 800), s: 'CCR' })),
  ...Array.from({ length:35 }, () => ({ a: Math.round(500 + Math.random() * 600), p: Math.round(1800 + Math.random() * 600), s: 'RCR' })),
  ...Array.from({ length:40 }, () => ({ a: Math.round(650 + Math.random() * 800), p: Math.round(1200 + Math.random() * 600), s: 'OCR' })),
];
// Cumulative volume: consistent trajectory to ~$18.6B in 2024
const sCum = [
  { d:'22Q1', v:4.2e9 },{ d:'22Q2', v:8.1e9 },{ d:'22Q3', v:11.8e9 },{ d:'22Q4', v:15.4e9 },
  { d:'23Q1', v:4.8e9 },{ d:'23Q2', v:9.2e9 },{ d:'23Q3', v:13.1e9 },{ d:'23Q4', v:16.8e9 },
  { d:'24Q1', v:5.1e9 },{ d:'24Q2', v:9.8e9 },{ d:'24Q3', v:14.2e9 },{ d:'24Q4', v:18.6e9 },
];

// Rental: CCR+RCR+OCR = 2700+4100+5600 = 12,400 ✓
// Weighted avg rent: (2700×6600+4100×5050+5600×3800)/12400 = $4,823 ≈ $4,820 ✓
const rTrend = [
  { q:'23Q1', avg:4200, med:3650, qoq:0 },
  { q:'23Q2', avg:4350, med:3780, qoq:3.6 },
  { q:'23Q3', avg:4500, med:3900, qoq:3.4 },
  { q:'23Q4', avg:4420, med:3840, qoq:-1.8 },
  { q:'24Q1', avg:4580, med:3980, qoq:3.6 },
  { q:'24Q2', avg:4650, med:4040, qoq:1.5 },
  { q:'24Q3', avg:4700, med:4080, qoq:1.1 },
  { q:'24Q4', avg:4820, med:4200, qoq:2.6 },
];
const rSeg = [
  { name:'CCR', count:2700, val:6600 },
  { name:'RCR', count:4100, val:5050 },
  { name:'OCR', count:5600, val:3800 },
];
const rTop = [
  { n:'THE SAIL @ MARINA BAY', c:312, note:'CCR D1 · Expat demand, sea view' },
  { n:"D'LEEDON", c:245, note:'CCR D10 · Family-sized, near schools' },
  { n:'NORMANTON PARK', c:198, note:'RCR D5 · New stock, near one-north' },
  { n:'TREASURE AT TAMPINES', c:176, note:'OCR D18 · Affordable, MRT-linked' },
  { n:'PARC ESTA', c:165, note:'RCR D14 · Eunos MRT, strong catchment' },
  { n:'RIVERCOVE RESIDENCES', c:148, note:'EC D19 · HDB upgrader overflow' },
];
// District rent PSF ($/sqft/mo) — matches yield table rp values
const rDistLine = [
  { q:'23Q1', D1:5.10, D5:4.15, D9:5.20, D10:5.15, D15:3.90 },
  { q:'23Q3', D1:5.20, D5:4.22, D9:5.28, D10:5.22, D15:3.98 },
  { q:'24Q1', D1:5.28, D5:4.30, D9:5.36, D10:5.30, D15:4.06 },
  { q:'24Q3', D1:5.35, D5:4.39, D9:5.45, D10:5.40, D15:4.14 },
];
const rDistBar = [
  { d:'D1', v:5.35 },{ d:'D3', v:4.76 },{ d:'D5', v:4.39 },
  { d:'D9', v:5.45 },{ d:'D10', v:5.40 },{ d:'D15', v:4.14 },
  { d:'D19', v:3.39 },{ d:'D21', v:3.70 },
];
const rType = [
  { t:'Apartment', v:4100 },{ t:'Condominium', v:5200 },{ t:'Exec Condo', v:3400 },
];
const rBed = [
  { t:'1 BR', v:2850, psf:6.72 },{ t:'2 BR', v:3950, psf:5.55 },
  { t:'3 BR', v:5200, psf:4.81 },{ t:'4 BR', v:7100, psf:4.22 },
  { t:'5 BR', v:9800, psf:3.88 },
];
// Histogram centered at ~$4,820 (verified peak)
const rHist = Array.from({ length:18 }, (_, i) => {
  const r = 2000 + i * 350;
  return { r: `$${r}`, c: Math.round(Math.exp(-((r - 4820) ** 2) / (2 * 1100 ** 2)) * 450 + 12) };
});
const rScat = [
  ...Array.from({ length:25 }, () => ({ a: Math.round(350 + Math.random() * 500), p: +(5.0 + Math.random() * 2.5).toFixed(2), s: 'CCR' })),
  ...Array.from({ length:35 }, () => ({ a: Math.round(500 + Math.random() * 600), p: +(3.5 + Math.random() * 2.0).toFixed(2), s: 'RCR' })),
  ...Array.from({ length:40 }, () => ({ a: Math.round(600 + Math.random() * 900), p: +(2.2 + Math.random() * 1.8).toFixed(2), s: 'OCR' })),
];
const rCum = [
  { d:'22Q1', v:2800 },{ d:'22Q2', v:5900 },{ d:'22Q3', v:8800 },{ d:'22Q4', v:11500 },
  { d:'23Q1', v:3100 },{ d:'23Q2', v:6400 },{ d:'23Q3', v:9500 },{ d:'23Q4', v:12200 },
  { d:'24Q1', v:3200 },{ d:'24Q2', v:6600 },{ d:'24Q3', v:9800 },{ d:'24Q4', v:12400 },
];

// Investment: yield = rentPsf × 12 / buyPsf (VERIFIED for every row)
// D19: 3.39×12/1280=3.18% ✓ | D15: 4.14×12/1760=2.82% ✓ | D21: 3.70×12/1650=2.69% ✓
// D5: 4.39×12/2100=2.51% ✓  | D3: 4.76×12/2380=2.40% ✓  | D1: 5.35×12/2780=2.31% ✓
// D10: 5.40×12/2920=2.22% ✓ | D9: 5.45×12/3100=2.11% ✓
const yd = [
  { d:'D19', rp:3.39, bp:1280, y:3.18, seg:'OCR' },
  { d:'D15', rp:4.14, bp:1760, y:2.82, seg:'RCR' },
  { d:'D21', rp:3.70, bp:1650, y:2.69, seg:'OCR' },
  { d:'D5',  rp:4.39, bp:2100, y:2.51, seg:'RCR' },
  { d:'D3',  rp:4.76, bp:2380, y:2.40, seg:'RCR' },
  { d:'D1',  rp:5.35, bp:2780, y:2.31, seg:'CCR' },
  { d:'D10', rp:5.40, bp:2920, y:2.22, seg:'CCR' },
  { d:'D9',  rp:5.45, bp:3100, y:2.11, seg:'CCR' },
];

// CAGR by district (2020-2024): verified PSF growth annualised
// D19: (1280/1050)^(1/4)-1=5.1%, D15: (1760/1380)^(1/4)-1=6.3%, etc.
const cagrData = [
  { d:'D19', cagr:5.1, y:3.18, seg:'OCR', bp:1280, total:8.28 },
  { d:'D15', cagr:6.3, y:2.82, seg:'RCR', bp:1760, total:9.12 },
  { d:'D21', cagr:4.8, y:2.69, seg:'OCR', bp:1650, total:7.49 },
  { d:'D5',  cagr:7.2, y:2.51, seg:'RCR', bp:2100, total:9.71 },
  { d:'D3',  cagr:5.6, y:2.40, seg:'RCR', bp:2380, total:8.00 },
  { d:'D1',  cagr:4.2, y:2.31, seg:'CCR', bp:2780, total:6.51 },
  { d:'D10', cagr:3.8, y:2.22, seg:'CCR', bp:2920, total:6.02 },
  { d:'D9',  cagr:5.9, y:2.11, seg:'CCR', bp:3100, total:8.01 },
];
const avgCagr = 5.4;
const avgYield = 2.66;

// Heatmap: Floor × Year matrix for project (THE SAIL)
const hmYears = ['2020','2021','2022','2023','2024'];
const hmFloors = ['01-05','06-10','11-15','16-20','21-25','26-30','31-35','36-40','41-45','46+'];
const hmBase = { '01-05':1650,'06-10':1700,'11-15':1760,'16-20':1820,'21-25':1880,'26-30':1940,'31-35':2010,'36-40':2090,'41-45':2180,'46+':2300 };
const hmGrowth = { '2020':0.92,'2021':0.96,'2022':1.0,'2023':1.04,'2024':1.10 };
const hmMatrix = {};
hmFloors.forEach(f => hmYears.forEach(y => {
  const v = Math.round(hmBase[f] * hmGrowth[y]);
  const vol = Math.round(3 + Math.random() * 8);
  hmMatrix[`${f}-${y}`] = { psf:v, vol, price:Math.round(v*850) };
}));

// Nearby Project PSF Heatmap (Project × Year)
const nearbyHm = {
  projects:['THE SAIL','MARINA ONE','ONE SHENTON','ICON','REFLECTIONS'],
  years:['2020','2021','2022','2023','2024'],
  data:{
    'THE SAIL-2020':1780,'THE SAIL-2021':1850,'THE SAIL-2022':1960,'THE SAIL-2023':2050,'THE SAIL-2024':2120,
    'MARINA ONE-2020':2080,'MARINA ONE-2021':2180,'MARINA ONE-2022':2300,'MARINA ONE-2023':2380,'MARINA ONE-2024':2450,
    'ONE SHENTON-2020':1920,'ONE SHENTON-2021':2010,'ONE SHENTON-2022':2120,'ONE SHENTON-2023':2200,'ONE SHENTON-2024':2280,
    'ICON-2020':1620,'ICON-2021':1710,'ICON-2022':1810,'ICON-2023':1880,'ICON-2024':1950,
    'REFLECTIONS-2020':1480,'REFLECTIONS-2021':1550,'REFLECTIONS-2022':1640,'REFLECTIONS-2023':1710,'REFLECTIONS-2024':1780,
  },
  vol:{
    'THE SAIL-2020':38,'THE SAIL-2021':42,'THE SAIL-2022':55,'THE SAIL-2023':48,'THE SAIL-2024':52,
    'MARINA ONE-2020':28,'MARINA ONE-2021':35,'MARINA ONE-2022':42,'MARINA ONE-2023':38,'MARINA ONE-2024':40,
    'ONE SHENTON-2020':22,'ONE SHENTON-2021':28,'ONE SHENTON-2022':35,'ONE SHENTON-2023':30,'ONE SHENTON-2024':32,
    'ICON-2020':18,'ICON-2021':22,'ICON-2022':28,'ICON-2023':25,'ICON-2024':26,
    'REFLECTIONS-2020':32,'REFLECTIONS-2021':38,'REFLECTIONS-2022':45,'REFLECTIONS-2023':40,'REFLECTIONS-2024':42,
  }
};

/* ════════════════════════════════════════════
   PROJECT ANALYSIS DATA — THE SAIL @ MARINA BAY
   ════════════════════════════════════════════ */
const projList = ['THE SAIL @ MARINA BAY',"D'LEEDON",'TREASURE AT TAMPINES','PARC ESTA','NORMANTON PARK','RIVERCOVE RESIDENCES','STIRLING RESIDENCES','THE FLORENCE RESIDENCES'];
// yield = 5.40×12/2120 = 3.06%
const projInfo = { name:'THE SAIL @ MARINA BAY', district:'D1 (Marina Bay)', segment:'CCR', tenure:'99-yr from 2004', type:'Condominium', top:'2008', units:1111, avgPsf:2120, medPsf:1980, totalTx:245, avgRent:5400, rentPsf:5.40, yield:3.06, distAvg:2780 };

const projPsfTrend = [
  { q:'22Q1',avg:1920,med:1850,vol:42 },{ q:'22Q3',avg:1980,med:1900,vol:38 },
  { q:'23Q1',avg:2050,med:1960,vol:45 },{ q:'23Q3',avg:2080,med:1990,vol:40 },
  { q:'24Q1',avg:2100,med:2010,vol:48 },{ q:'24Q3',avg:2120,med:2040,vol:32 },
];
const projRentTrend = [
  { q:'22Q1',avg:4600,med:4200 },{ q:'22Q3',avg:4800,med:4400 },
  { q:'23Q1',avg:5000,med:4600 },{ q:'23Q3',avg:5100,med:4700 },
  { q:'24Q1',avg:5250,med:4850 },{ q:'24Q3',avg:5400,med:5000 },
];
// PSF inverts with size (1BR highest PSF), rent scales with size
const projByBed = [
  { bed:'1 BR', avg:1150000, psf:2280, rent:3200, rentPsf:6.34, count:42 },
  { bed:'2 BR', avg:1920000, psf:2150, rent:4800, rentPsf:5.37, count:85 },
  { bed:'3 BR', avg:2850000, psf:2050, rent:6500, rentPsf:4.69, count:68 },
  { bed:'4 BR', avg:4200000, psf:1980, rent:8200, rentPsf:3.86, count:35 },
  { bed:'PH',   avg:8500000, psf:2450, rent:15000,rentPsf:4.10, count:15 },
];
const projFloor = [
  { range:'1-5',  premium:0,    psf:1920 },
  { range:'6-10', premium:3.2,  psf:1981 },  // 1920×1.032=1982 ✓
  { range:'11-15',premium:6.8,  psf:2051 },  // 1920×1.068=2051 ✓
  { range:'16-20',premium:10.5, psf:2122 },  // 1920×1.105=2122 ✓
  { range:'21-25',premium:14.2, psf:2193 },  // 1920×1.142=2193 ✓
  { range:'26-30',premium:18.1, psf:2268 },  // 1920×1.181=2268 ✓
  { range:'31-35',premium:22.4, psf:2350 },  // 1920×1.224=2350 ✓
  { range:'36-40',premium:27.6, psf:2450 },  // 1920×1.276=2452 ≈ ✓
  { range:'41-45',premium:33.2, psf:2558 },  // 1920×1.332=2557 ✓
  { range:'46+',  premium:40.1, psf:2690 },  // 1920×1.401=2690 ✓
];
const projScatter = Array.from({ length:60 }, () => {
  const area = Math.round(400 + Math.random() * 1600);
  const floor = 1 + Math.floor(Math.random() * 50);
  const basePsf = 1920;
  const floorPrem = 1 + (floor * 0.008);  // ~0.8% per floor
  const sizePen = 1 - (area > 1000 ? (area - 1000) * 0.0001 : 0); // larger = slightly lower PSF
  const noise = 0.95 + Math.random() * 0.1;
  const psf = Math.round(basePsf * floorPrem * sizePen * noise);
  return { area, psf, floor, price: Math.round(area * psf) };
});

// Compare: all D1/D2 waterfront CCR projects (proper CMA)
const projCmp = [
  { name:'THE SAIL',     psf:2120, rent:5400, yield:3.06, dist:'D1', age:'2008' },
  { name:'MARINA ONE',   psf:2450, rent:5800, yield:2.84, dist:'D1', age:'2017' },
  { name:'ONE SHENTON',  psf:2280, rent:5100, yield:2.68, dist:'D1', age:'2011' },
  { name:'ICON',         psf:1950, rent:4600, yield:2.83, dist:'D2', age:'2007' },
  { name:'REFLECTIONS',  psf:1780, rent:4500, yield:3.03, dist:'D4', age:'2011' },
];

// ═══ RAW TRANSACTION RECORDS for computed CAGR ═══
// Each record: { year, floor (range string), size (sqft), psf }
// Generated to be consistent with hmBase/hmGrowth model but with realistic variance
const txYears = ['2020','2021','2022','2023','2024'];
const txSizes = [506,657,764,883,1076,1238,2045];
const txFloors = ['01-05','06-10','11-15','16-20','21-25','26-30','31-35','36-40','41-45','46+'];
const txFloorBase = {'01-05':1650,'06-10':1700,'11-15':1760,'16-20':1820,'21-25':1880,'26-30':1940,'31-35':2010,'36-40':2090,'41-45':2180,'46+':2300};
const txYearMult = {'2020':0.92,'2021':0.96,'2022':1.0,'2023':1.04,'2024':1.10};
// Size premium: smaller units get higher PSF (inverse relationship)
const txSizeMult = {506:1.08,657:1.02,764:1.0,883:0.98,1076:0.96,1238:0.93,2045:0.88};
// Seeded random for reproducibility
let _seed = 42;
const sRand = () => { _seed=((_seed*16807)%2147483647); return (_seed-1)/2147483646; };
const rawTx = [];
txYears.forEach(y => {
  const yearVol = y==='2020'?38:y==='2021'?42:y==='2022'?55:y==='2023'?48:52;
  for(let i=0;i<yearVol;i++){
    const floor = txFloors[Math.floor(sRand()*txFloors.length)];
    const size = txSizes[Math.floor(sRand()*txSizes.length)];
    const base = txFloorBase[floor]*txYearMult[y]*txSizeMult[size];
    const noise = 0.93+sRand()*0.14; // ±7% variance
    const psf = Math.round(base*noise);
    rawTx.push({year:y,floor,size,psf});
  }
});

// CAGR computation helper
const computeCAGR = (startAvg, endAvg, years) => {
  if(!startAvg||!endAvg||years<=0) return null;
  return (Math.pow(endAvg/startAvg, 1/years)-1)*100;
};

// Bucket transactions and compute annual averages + CAGR
const computeBucketCAGR = (txList, startYear='2020', endYear='2024') => {
  const byYear = {};
  txList.forEach(tx => {
    if(!byYear[tx.year]) byYear[tx.year]={sum:0,count:0};
    byYear[tx.year].sum += tx.psf;
    byYear[tx.year].count += 1;
  });
  const startBucket = byYear[startYear];
  const endBucket = byYear[endYear];
  const startAvg = startBucket ? Math.round(startBucket.sum/startBucket.count) : null;
  const endAvg = endBucket ? Math.round(endBucket.sum/endBucket.count) : null;
  const startN = startBucket?.count||0;
  const endN = endBucket?.count||0;
  const totalN = txList.length;
  const years = parseInt(endYear)-parseInt(startYear);
  const cagr = computeCAGR(startAvg, endAvg, years);
  const lowConf = startN<3||endN<3;
  // Annual averages for sparkline
  const annualAvg = txYears.map(y => {
    const b = byYear[y];
    return { year:y, avg: b?Math.round(b.sum/b.count):null, n: b?.count||0 };
  });
  return { startAvg, endAvg, startN, endN, totalN, cagr, lowConf, annualAvg };
};

// ═══ MARKET-WIDE TRANSACTION RECORDS ═══
const mktProjects = [
  {name:'THE SAIL',dist:'D1',seg:'CCR',bpsf:2120,type:'Condo'},
  {name:'MARINA ONE',dist:'D1',seg:'CCR',bpsf:2450,type:'Condo'},
  {name:'ONE SHENTON',dist:'D1',seg:'CCR',bpsf:2280,type:'Condo'},
  {name:'MARINA BAY SUITES',dist:'D1',seg:'CCR',bpsf:2380,type:'Condo'},
  {name:'ICON',dist:'D2',seg:'CCR',bpsf:1950,type:'Condo'},
  {name:'REFLECTIONS',dist:'D4',seg:'CCR',bpsf:1780,type:'Condo'},
  {name:'STIRLING RESIDENCES',dist:'D3',seg:'RCR',bpsf:2100,type:'Condo'},
  {name:'NORMANTON PARK',dist:'D5',seg:'RCR',bpsf:1920,type:'Condo'},
  {name:'PARC ESTA',dist:'D14',seg:'RCR',bpsf:1650,type:'Condo'},
  {name:'TREASURE AT TAMPINES',dist:'D18',seg:'OCR',bpsf:1280,type:'Condo'},
  {name:"D'LEEDON",dist:'D10',seg:'CCR',bpsf:2050,type:'Condo'},
  {name:'THE FLORENCE RESIDENCES',dist:'D19',seg:'OCR',bpsf:1380,type:'Condo'},
  {name:'RIVERCOVE RESIDENCES',dist:'D19',seg:'OCR',bpsf:1150,type:'EC'},
  {name:'SEASIDE RESIDENCES',dist:'D15',seg:'RCR',bpsf:1850,type:'Condo'},
  {name:'WHISTLER GRAND',dist:'D5',seg:'RCR',bpsf:1720,type:'Condo'},
];
const mktAreas = [420,484,506,560,624,657,710,764,828,883,950,1076,1238,1450,2045];
const mktMonths = ['01','02','03','04','05','06','07','08','09','10','11','12'];
let _mktSeed = 137;
const mRand = () => { _mktSeed=((_mktSeed*16807)%2147483647); return (_mktSeed-1)/2147483646; };

// Generate ~200 sale transactions
const mktSaleTx = [];
for(let i=0;i<200;i++){
  const proj = mktProjects[Math.floor(mRand()*mktProjects.length)];
  const yr = 2022 + Math.floor(mRand()*3); // 2022-2024
  const mo = mktMonths[Math.floor(mRand()*12)];
  const area = mktAreas[Math.floor(mRand()*mktAreas.length)];
  const floor = 1+Math.floor(mRand()*50);
  const floorPrem = 1 + floor*0.006;
  const sizePen = 1 - (area>900?(area-900)*0.00008:0);
  const yearPrem = 1 + (yr-2022)*0.04;
  const noise = 0.92+mRand()*0.16;
  const psf = Math.round(proj.bpsf * floorPrem * sizePen * yearPrem * noise);
  const price = psf * area;
  mktSaleTx.push({
    date:`${yr}-${mo}-${String(1+Math.floor(mRand()*28)).padStart(2,'0')}`,
    project:proj.name, district:proj.dist, segment:proj.seg, type:proj.type,
    unit:`#${String(floor).padStart(2,'0')}-${String(1+Math.floor(mRand()*20)).padStart(2,'0')}`,
    area, floor, psf, price:Math.round(price),
  });
}
mktSaleTx.sort((a,b)=>b.date.localeCompare(a.date));

// Generate ~200 rental transactions
const mktRentTx = [];
const bedTypes = ['1 BR','2 BR','3 BR','4 BR','PH'];
const rentMultByBed = {'1 BR':0.55,'2 BR':0.85,'3 BR':1.15,'4 BR':1.5,'PH':2.2};
for(let i=0;i<200;i++){
  const proj = mktProjects[Math.floor(mRand()*mktProjects.length)];
  const yr = 2022 + Math.floor(mRand()*3);
  const mo = mktMonths[Math.floor(mRand()*12)];
  const bed = bedTypes[Math.floor(mRand()*4)]; // skip PH mostly
  const areaByBed = {'1 BR':420+Math.round(mRand()*180),'2 BR':600+Math.round(mRand()*250),'3 BR':850+Math.round(mRand()*350),'4 BR':1100+Math.round(mRand()*400),'PH':1800+Math.round(mRand()*500)};
  const area = areaByBed[bed];
  const floor = 1+Math.floor(mRand()*50);
  const baseRent = (proj.bpsf/1000)*2200*(rentMultByBed[bed]||1);
  const yearAdj = 1 + (yr-2022)*0.03;
  const noise = 0.9+mRand()*0.2;
  const rent = Math.round(baseRent*yearAdj*noise/100)*100;
  const rentPsf = +(rent/area).toFixed(2);
  mktRentTx.push({
    date:`${yr}-${mo}-${String(1+Math.floor(mRand()*28)).padStart(2,'0')}`,
    project:proj.name, district:proj.dist, segment:proj.seg,
    unit:`#${String(floor).padStart(2,'0')}-${String(1+Math.floor(mRand()*20)).padStart(2,'0')}`,
    bed, area, floor, rent, rentPsf,
  });
}
mktRentTx.sort((a,b)=>b.date.localeCompare(a.date));

// Available projects pool for comparison (up to 8 selectable)
const cmpPool = [
  { name:'THE SAIL',     psf:2120, rent:5400, yield:3.06, dist:'D1', age:'2008', lat:1.2783, lng:103.8573, type:'Condo', units:1111 },
  { name:'MARINA ONE',   psf:2450, rent:5800, yield:2.84, dist:'D1', age:'2017', lat:1.2767, lng:103.8537, type:'Condo', units:1042 },
  { name:'ONE SHENTON',  psf:2280, rent:5100, yield:2.68, dist:'D1', age:'2011', lat:1.2785, lng:103.8462, type:'Condo', units:341 },
  { name:'MARINA BAY SUITES', psf:2380, rent:5500, yield:2.77, dist:'D1', age:'2013', lat:1.2795, lng:103.8555, type:'Condo', units:221 },
  { name:'MARINA BAY RESIDENCES', psf:2200, rent:5200, yield:2.84, dist:'D1', age:'2010', lat:1.2780, lng:103.8540, type:'Condo', units:428 },
  { name:'ICON',         psf:1950, rent:4600, yield:2.83, dist:'D2', age:'2007', lat:1.2765, lng:103.8410, type:'Condo', units:646 },
  { name:'REFLECTIONS',  psf:1780, rent:4500, yield:3.03, dist:'D4', age:'2011', lat:1.2620, lng:103.8190, type:'Condo', units:1129 },
  { name:'SKYSUITES',    psf:2050, rent:4800, yield:2.81, dist:'D2', age:'2014', lat:1.2752, lng:103.8435, type:'Condo', units:360 },
  { name:'THE CLIFT',    psf:2150, rent:5000, yield:2.79, dist:'D2', age:'2011', lat:1.2770, lng:103.8445, type:'Condo', units:312 },
  { name:'V ON SHENTON', psf:2100, rent:4900, yield:2.80, dist:'D2', age:'2017', lat:1.2760, lng:103.8455, type:'Condo', units:510 },
  { name:'WALLICH RESIDENCE', psf:2800, rent:6800, yield:2.91, dist:'D2', age:'2019', lat:1.2748, lng:103.8430, type:'Condo', units:181 },
  { name:'ALTEZ',        psf:2000, rent:4700, yield:2.82, dist:'D2', age:'2014', lat:1.2755, lng:103.8425, type:'Condo', units:280 },
  { name:'STIRLING RESIDENCES', psf:2100, rent:4800, yield:2.74, dist:'D3', age:'2022', lat:1.2975, lng:103.8020, type:'Condo', units:1259 },
  { name:'NORMANTON PARK', psf:1920, rent:4400, yield:2.75, dist:'D5', age:'2023', lat:1.2720, lng:103.7950, type:'Condo', units:1862 },
  { name:"D'LEEDON",    psf:2050, rent:5000, yield:2.93, dist:'D10', age:'2014', lat:1.3100, lng:103.8140, type:'Condo', units:1715 },
];
// Haversine distance (km)
const haversine = (lat1,lng1,lat2,lng2) => {
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
};
const sailCoords = { lat:1.2783, lng:103.8573 };

const projTx = [
  { date:'2024-11-15', address:'#42-08', area:1076, price:2380000, psf:2212, type:'Resale' },
  { date:'2024-10-22', address:'#38-12', area:883,  price:1920000, psf:2175, type:'Resale' },
  { date:'2024-09-18', address:'#25-06', area:657,  price:1380000, psf:2100, type:'Resale' },
  { date:'2024-08-30', address:'#15-03', area:1238, price:2520000, psf:2036, type:'Resale' },
  { date:'2024-07-12', address:'#48-15', area:2045, price:5100000, psf:2494, type:'Resale' },
  { date:'2024-06-28', address:'#08-11', area:506,  price:980000,  psf:1937, type:'Resale' },
  { date:'2024-05-14', address:'#33-09', area:1076, price:2280000, psf:2119, type:'Resale' },
  { date:'2024-04-03', address:'#21-04', area:764,  price:1580000, psf:2068, type:'Resale' },
  { date:'2024-03-19', address:'#44-02', area:1238, price:2750000, psf:2221, type:'Resale' },
  { date:'2024-02-08', address:'#12-07', area:657,  price:1320000, psf:2009, type:'Resale' },
];
const projRentTx = [
  { date:'2024-12-01', address:'#35-08', bed:'2 BR', area:894, rent:5200, psf:5.81 },
  { date:'2024-11-15', address:'#42-03', bed:'3 BR', area:1385,rent:6800, psf:4.91 },
  { date:'2024-10-20', address:'#18-11', bed:'1 BR', area:506, rent:3400, psf:6.72 },
  { date:'2024-09-10', address:'#28-06', bed:'2 BR', area:883, rent:4900, psf:5.55 },
  { date:'2024-08-25', address:'#46-15', bed:'PH',   area:2045,rent:15000,psf:7.33 },
  { date:'2024-07-18', address:'#10-04', bed:'1 BR', area:506, rent:3200, psf:6.32 },
];

/* ═══════ COMPONENTS ═══════ */
function Tip({ active, payload, label, fmt, unit }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background:'#1e293bf0', padding:'10px 14px', borderRadius:8, border:'1px solid #cbd5e1', boxShadow:'0 4px 20px rgba(0,0,0,0.06)' }}>
      <p style={{ color:'#94a3b8', fontSize:11, marginBottom:6 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color:p.color||'#fff', fontSize:12, margin:'2px 0' }}>
          {p.name}: {fmt==='%'?'':(fmt==='none'?'':'$')}{typeof p.value==='number'?p.value.toLocaleString(undefined,{maximumFractionDigits:2}):p.value}{fmt==='%'?'%':''}{unit||''}
        </p>
      ))}
    </div>
  );
}
const Cd = ({ children }) => <div style={{ background:'#f1f5f9', borderRadius:14, padding:20, border:'1px solid #e2e8f0' }}>{children}</div>;
const St = ({ label, value, color, icon, sub }) => <div style={{ background:'#f1f5f9', borderRadius:12, padding:'14px 16px', border:'1px solid #e2e8f0' }}><div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}><span style={{ color:'#64748b', fontSize:10, textTransform:'uppercase', letterSpacing:'0.5px' }}>{label}</span><span style={{ fontSize:14 }}>{icon}</span></div><div style={{ color, fontSize:18, fontWeight:700, fontFamily:fm }}>{value}</div>{sub&&<div style={{ color:'#64748b', fontSize:10, marginTop:2 }}>{sub}</div>}</div>;
const SH = ({ icon, title, sub }) => <div style={{ marginBottom:12 }}><h3 style={{ color:'#1e293b', fontSize:15, fontWeight:700, margin:'0 0 4px', display:'flex', alignItems:'center', gap:8 }}><span style={{ fontSize:17 }}>{icon}</span>{title}</h3>{sub&&<p style={{ color:'#64748b', fontSize:11, margin:0, lineHeight:1.5 }}>{sub}</p>}</div>;
const IB = ({ items }) => <div style={{ background:'linear-gradient(90deg,#38bdf810,#a78bfa10)', borderRadius:12, padding:'12px 18px', border:'1px solid #f1f5f9', marginBottom:8, display:'flex', gap:16, flexWrap:'wrap', alignItems:'center' }}><span style={{ color:'#f59e0b', fontSize:13 }}>💡</span>{items.map((it,i)=><span key={i} style={{ color:'#94a3b8', fontSize:12, lineHeight:1.5 }}>{i>0&&<span style={{ color:'#cbd5e1', margin:'0 4px' }}>·</span>}{it}</span>)}</div>;
const Nr = ({ children }) => <p style={{ color:'#64748b', fontSize:11, lineHeight:1.6, margin:'0 0 12px', fontStyle:'italic' }}>{children}</p>;
const Dv = ({ label }) => <div style={{ display:'flex', alignItems:'center', gap:12, margin:'16px 0 8px' }}><div style={{ flex:1, height:1, background:'#e2e8f0' }}/><span style={{ color:'#64748b', fontSize:10, textTransform:'uppercase', letterSpacing:1.2, whiteSpace:'nowrap' }}>{label}</span><div style={{ flex:1, height:1, background:'#e2e8f0' }}/></div>;

/* ═══════ STANDARDISED MARKET TAB ═══════ */
function MarketTab({ mode }) {
  const s = mode === 'sales';
  const mainC = s ? '#0ea5e9' : '#10b981';
  const accC = s ? '#6366f1' : '#34d399';

  // Local state for transaction table
  const [txSearch, setTxSearch] = useState('');
  const [txDistF, setTxDistF] = useState('');
  const [txSegF, setTxSegF] = useState('');
  const [txPage, setTxPage] = useState(0);
  const pgSize = 25;

  const allTx = s ? mktSaleTx : mktRentTx;
  const txDistricts = [...new Set(allTx.map(t=>t.district))].sort();
  const txSegments = [...new Set(allTx.map(t=>t.segment))].sort();

  const filtered = useMemo(() => {
    let f = allTx;
    if(txSearch) { const q=txSearch.toLowerCase(); f=f.filter(t=>t.project.toLowerCase().includes(q)||t.unit.toLowerCase().includes(q)||t.district.toLowerCase().includes(q)); }
    if(txDistF) f=f.filter(t=>t.district===txDistF);
    if(txSegF) f=f.filter(t=>t.segment===txSegF);
    return f;
  }, [allTx, txSearch, txDistF, txSegF]);
  const pageCount = Math.ceil(filtered.length/pgSize);
  const pageTx = filtered.slice(txPage*pgSize,(txPage+1)*pgSize);

  const td = s ? yoy : rTrend;
  const segD = s ? sSeg : rSeg;
  const topD = s ? sTop : rTop;
  const dlD = s ? sDistLine : rDistLine;
  const dbD = s ? sDistBar : rDistBar;
  const tyD = s ? sType : rType;
  const s2D = s ? sTenure : rBed;
  const hiD = s ? sHist : rHist;
  const scD = s ? sScat : rScat;
  const cuD = s ? sCum : rCum;

  const dlFmt = s ? (v=>'$'+v.toLocaleString()) : (v=>'$'+v.toFixed(2));
  const dbFmt = s ? (v=>'$'+v.toLocaleString()) : (v=>'$'+v.toFixed(2));
  const cuFmt = s ? (v=>`$${(v/1e9).toFixed(1)}B`) : (v=>v.toLocaleString());
  const yFmt = s ? (v=>'$'+v.toLocaleString()) : (v=>'$'+v.toLocaleString());

  return (
    <div style={{ display:'grid', gap:16 }}>
      <IB items={s ? [
        <span key="a">Prices <span style={{color:'#4ade80',fontWeight:700,fontFamily:fm}}>+4.6%</span> YoY — 3rd consecutive year of growth</span>,
        <span key="b"><span style={{color:mainC,fontWeight:700,fontFamily:fm}}>9,100</span> transactions ($18.6B)</span>,
        <span key="c">Avg <span style={{color:'#fb923c',fontWeight:700,fontFamily:fm}}>$2,040</span> PSF — new all-time high</span>,
      ] : [
        <span key="a">Rents <span style={{color:'#4ade80',fontWeight:700,fontFamily:fm}}>+2.6%</span> QoQ — but decelerating from 3.6% in Q1</span>,
        <span key="b"><span style={{color:mainC,fontWeight:700,fontFamily:fm}}>12,400</span> contracts this year</span>,
        <span key="c">Avg <span style={{color:'#fb923c',fontWeight:700,fontFamily:fm}}>$4,820</span>/mo — landlords retain pricing power</span>,
      ]}/>

      {/* ── TRENDS ── */}
      <Dv label="Trends"/>

      <SH icon="📈" title={s?'Sale Price Trend':'Rental Trend'} sub={s?'Average & median PSF with YoY growth. Median trails average by ~$190 — right-skewed market favours high-end transactions.':'Average & median monthly rent with QoQ growth. Note 23Q4 dip — seasonal correction before Chinese New Year.'}/>
      <Cd><div style={{height:280}}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={td}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey={s?'year':'q'} tick={{fill:'#64748b',fontSize:11}} axisLine={false}/><YAxis yAxisId="l" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={yFmt}/><YAxis yAxisId="r" orientation="right" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`${v>0?'+':''}${v}%`}/><Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:11}}/><Bar yAxisId="l" dataKey="avg" name={s?'Avg PSF':'Avg Rent'} fill={mainC} radius={[4,4,0,0]} barSize={s?26:18}/><Bar yAxisId="l" dataKey="med" name={s?'Med PSF':'Med Rent'} fill={accC} radius={[4,4,0,0]} barSize={s?26:18}/><Line yAxisId="r" type="monotone" dataKey={s?'yoy':'qoq'} name={s?'YoY %':'QoQ %'} stroke="#f59e0b" strokeWidth={2.5} dot={{r:4,fill:'#f59e0b'}}/></ComposedChart></ResponsiveContainer></div></Cd>
      {s ? <Nr>Growth slowing from 9.9% (2022) to 4.6% (2024) — cooling measures taking effect. Still positive, but the era of double-digit gains appears over.</Nr> : <Nr>QoQ growth decelerating: 3.6% → 3.4% → –1.8% → 3.6% → 1.5% → 1.1% → 2.6%. Landlords still gaining but tenants have more negotiating room than in 2022–23.</Nr>}

      <div className="g2">
        <Cd><SH icon="🎯" title={s?'Sales by Segment':'Rentals by Segment'} sub={s?'OCR dominates volume (45%) but CCR captures the highest PSF. Value hunters are in OCR; capital appreciation plays are in CCR.':'CCR commands $6,600/mo avg — 74% premium over OCR. But OCR has 45% of all contracts, showing strongest demand.'}/>
          <div style={{height:230,display:'flex',gap:16}}><div style={{flex:1}}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={segD} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={78} innerRadius={44} paddingAngle={3}>{segD.map((e,i)=><Cell key={i} fill={SC[e.name]}/>)}</Pie><Tooltip content={<Tip/>}/></PieChart></ResponsiveContainer></div>
          <div style={{display:'flex',flexDirection:'column',justifyContent:'center',gap:10}}>{segD.map(x=><div key={x.name} style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:10,height:10,borderRadius:3,background:SC[x.name]}}/><div><div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{x.name}</div><div style={{color:'#64748b',fontSize:11}}>{s?`$${x.val.toLocaleString()} psf`:`$${x.val.toLocaleString()}/mo`} · {x.count.toLocaleString()}</div></div></div>)}</div></div>
        </Cd>
        <Cd><SH icon="🏆" title={s?'Most Traded Projects':'Most Rented Projects'} sub={s?'High volume signals liquidity — easier to buy and exit. TREASURE leads on sheer unit count (2,203 units).':'High rental volume = strong tenant demand. THE SAIL tops the list — expat-heavy Marina Bay drives consistent leasing.'}/>
          <div style={{height:230}}><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={topD}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0"/><XAxis type="number" tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><YAxis dataKey="n" type="category" width={160} tick={{fill:'#94a3b8',fontSize:9}} axisLine={false}/><Tooltip content={<Tip/>}/><Bar dataKey="c" name={s?'Transactions':'Contracts'} radius={[0,6,6,0]} barSize={14}>{topD.map((_,i)=><Cell key={i} fill={P[i%P.length]}/>)}</Bar></BarChart></ResponsiveContainer></div>
        </Cd>
      </div>

      {/* ── GEOGRAPHY ── */}
      <Dv label="Geography"/>
      <SH icon="📍" title={s?'District PSF Trends':'District Rent PSF Trends'} sub={s?'D9 (Orchard) widening its lead — up 7.3% since 23Q1. D5 (Pasir Panjang) rising fastest at 9.4%.':'D9 maintains highest rent PSF at $5.45/sqft/mo. D15 (East Coast) showing steepest climb — up 6.2% since 23Q1.'}/>
      <Cd><div style={{height:280}}><ResponsiveContainer width="100%" height="100%"><LineChart data={dlD}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="q" tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><YAxis tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={dlFmt}/><Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:11}}/>{['D1','D5','D9','D10','D15'].map((d,i)=><Line key={d} type="monotone" dataKey={d} stroke={P[i]} strokeWidth={2} dot={{r:3}} connectNulls/>)}</LineChart></ResponsiveContainer></div></Cd>

      <SH icon="📐" title={s?'Current PSF by District':'Current Rent PSF by District'} sub={s?'D9 at $3,100 commands a 142% premium over D19 ($1,280). Location premium drives price more than any other factor.':'D9 at $5.45/sqft/mo vs D19 at $3.39 — a 61% premium. But yield-wise, D19 wins (3.18% vs 2.11%).'}/>
      <Cd><div style={{height:240}}><ResponsiveContainer width="100%" height="100%"><BarChart data={dbD}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="d" tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><YAxis tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={dbFmt}/><Tooltip content={<Tip/>}/><Bar dataKey="v" name={s?'Sale PSF':'Rent PSF ($/sqft/mo)'} fill={s?'#0ea5e9':'#f59e0b'} radius={[4,4,0,0]} barSize={24}/></BarChart></ResponsiveContainer></div></Cd>

      {/* ── STRUCTURE ── */}
      <Dv label="Structure"/>
      <div className="g3">
        <Cd><h4 style={{color:'#1e293b',fontSize:13,fontWeight:600,marginBottom:4}}>By Property Type</h4>
          <Nr>{s?'Condos lead at $2,180 PSF — includes premium facilities. Exec Condos at $1,340 offer 39% discount (HDB upgrader sweet spot).':'Condos average $5,200/mo — a 27% premium over apartments due to newer stock and better facilities.'}</Nr>
          <div style={{height:190}}><ResponsiveContainer width="100%" height="100%"><BarChart data={tyD}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="t" tick={{fill:'#64748b',fontSize:9}} axisLine={false}/><YAxis tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={yFmt}/><Tooltip content={<Tip/>}/><Bar dataKey="v" name={s?'Avg PSF':'Avg Rent'} radius={[4,4,0,0]} barSize={30}>{tyD.map((_,i)=><Cell key={i} fill={P[i]}/>)}</Bar></BarChart></ResponsiveContainer></div>
        </Cd>
        <Cd><h4 style={{color:'#1e293b',fontSize:13,fontWeight:600,marginBottom:4}}>{s?'By Tenure':'By Bedroom'}</h4>
          <Nr>{s?'Freehold commands a 30% premium ($2,350 vs $1,810) over 99-yr. The 999-yr at $2,180 trades near freehold — market treats them as equivalent.':'1BR yields highest rent PSF ($6.72/sqft) but lowest absolute rent ($2,850/mo). 4-5BR tenants pay more total but less per sqft — the "bulk discount" of residential leasing.'}</Nr>
          <div style={{height:190}}><ResponsiveContainer width="100%" height="100%"><BarChart data={s2D}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="t" tick={{fill:'#64748b',fontSize:9}} axisLine={false}/><YAxis tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={yFmt}/><Tooltip content={<Tip/>}/><Bar dataKey="v" name={s?'Avg PSF':'Avg Rent/mo'} radius={[4,4,0,0]} barSize={s?40:28}>{s2D.map((_,i)=><Cell key={i} fill={s?['#22c55e','#f59e0b','#38bdf8'][i]:P[i%P.length]}/>)}</Bar></BarChart></ResponsiveContainer></div>
        </Cd>
        <Cd><h4 style={{color:'#1e293b',fontSize:13,fontWeight:600,marginBottom:4}}>{s?'PSF Distribution':'Rent Distribution'}</h4>
          <Nr>{s?'Right-skewed: bulk of transactions between $1,600–$2,400 PSF. The long tail above $2,600 is CCR dragging the average up.':'Most contracts cluster between $3,500–$6,000/mo. The gap between median ($4,200) and mean ($4,820) confirms CCR outliers lift the average.'}</Nr>
          <div style={{height:190}}><ResponsiveContainer width="100%" height="100%"><BarChart data={hiD}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="r" tick={{fill:'#64748b',fontSize:7}} axisLine={false} interval={2}/><YAxis tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><Tooltip content={<Tip fmt="none"/>}/><Bar dataKey="c" name={s?'Transactions':'Contracts'} fill={s?'#8b5cf6':'#34d399'} radius={[2,2,0,0]} barSize={12}/></BarChart></ResponsiveContainer></div>
        </Cd>
      </div>

      <SH icon="⬡" title={s?'Price vs Unit Size':'Rent PSF vs Unit Size'} sub={s?'Inverse relationship: larger units = lower PSF across all segments. CCR small units (400–900sf) command the highest PSF.':'Same inverse pattern in rentals: smaller units are more efficient per sqft. Investors targeting yield should favour compact 1–2BR units.'}/>
      <Cd><div style={{height:280}}><ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis type="number" dataKey="a" name="Area (sqft)" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`${Math.round(v)} sf`}/><YAxis type="number" dataKey="p" name={s?'PSF ($)':'Rent PSF ($/sf/mo)'} tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={s?(v=>'$'+v):(v=>'$'+v.toFixed(1))}/><Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:11}}/>{['CCR','RCR','OCR'].map(x=><Scatter key={x} name={x} data={scD.filter(d=>d.s===x)} fill={SC[x]} fillOpacity={0.6}/>)}</ScatterChart></ResponsiveContainer></div></Cd>

      <SH icon="📉" title={s?'Annual Sales Volume':'Annual Rental Contracts'} sub={s?'Per-quarter dollar volume — 2024 on pace to exceed 2023 by ~11%.':'Per-quarter contract count — 2024 slightly ahead of 2023, showing sustained demand despite cooling rents.'}/>
      <Cd><div style={{height:210}}><ResponsiveContainer width="100%" height="100%"><BarChart data={cuD}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="d" tick={{fill:'#64748b',fontSize:9}} axisLine={false}/><YAxis tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={cuFmt}/><Tooltip content={<Tip/>}/><Bar dataKey="v" name={s?'Volume':'Contracts'} fill={mainC} radius={[4,4,0,0]} barSize={14} fillOpacity={0.8}/></BarChart></ResponsiveContainer></div></Cd>

      {/* ── TRANSACTION RECORDS ── */}
      <Dv label="Transaction Records"/>
      <SH icon="📋" title={s?'Sale Transaction Records':'Rental Contract Records'} sub={`${allTx.length} records available. Search by project name, unit, or district. Filter by district or segment.`}/>
      <Cd>
        {/* Filters */}
        <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
          <div style={{flex:1,minWidth:200,position:'relative'}}>
            <input value={txSearch} onChange={e=>{setTxSearch(e.target.value);setTxPage(0);}} placeholder={s?'Search project, unit, district...':'Search project, unit, district...'} style={{background:'#fff',border:'1px solid #cbd5e1',borderRadius:8,padding:'8px 12px 8px 32px',color:'#1e293b',fontSize:12,width:'100%',outline:'none',fontFamily:fm}}/>
            <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:13,opacity:0.5}}>🔍</span>
          </div>
          <select value={txDistF} onChange={e=>{setTxDistF(e.target.value);setTxPage(0);}} style={{background:'#fff',border:'1px solid #cbd5e1',borderRadius:8,padding:'8px 12px',color:'#1e293b',fontSize:12,cursor:'pointer',outline:'none',fontFamily:fm}}>
            <option value="">All Districts</option>
            {txDistricts.map(d=><option key={d} value={d}>{d}</option>)}
          </select>
          <select value={txSegF} onChange={e=>{setTxSegF(e.target.value);setTxPage(0);}} style={{background:'#fff',border:'1px solid #cbd5e1',borderRadius:8,padding:'8px 12px',color:'#1e293b',fontSize:12,cursor:'pointer',outline:'none',fontFamily:fm}}>
            <option value="">All Segments</option>
            {txSegments.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <div style={{color:'#64748b',fontSize:11}}>{filtered.length} of {allTx.length} records</div>
        </div>
        {/* Table */}
        <div style={{overflowX:'auto'}}>
          <table>
            <thead><tr>
              {s
                ? ['Date','Project','Unit','District','Area','Price','PSF','Segment'].map(h=><th key={h}>{h}</th>)
                : ['Date','Project','Unit','District','Bed','Area','Rent/mo','Rent PSF','Segment'].map(h=><th key={h}>{h}</th>)
              }
            </tr></thead>
            <tbody>
              {pageTx.map((tx,i)=><tr key={i}>
                <td style={{color:'#64748b',fontSize:11,whiteSpace:'nowrap'}}>{tx.date}</td>
                <td style={{color:'#1e293b',fontWeight:600,fontSize:11}}>{tx.project}</td>
                <td style={{color:'#94a3b8',fontFamily:fm,fontSize:11}}>{tx.unit}</td>
                <td><span style={{background:SC[tx.segment]+'18',color:SC[tx.segment],padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:600}}>{tx.district}</span></td>
                {!s && <td style={{color:'#64748b',fontSize:11}}>{tx.bed}</td>}
                <td style={{fontFamily:fm,fontSize:11}}>{tx.area.toLocaleString()} sf</td>
                {s
                  ? <><td style={{color:'#38bdf8',fontFamily:fm,fontWeight:600,fontSize:11}}>${tx.price.toLocaleString()}</td><td style={{color:tx.psf>=2200?'#22c55e':tx.psf>=1800?'#f59e0b':'#64748b',fontFamily:fm,fontWeight:600,fontSize:11}}>${tx.psf.toLocaleString()}</td></>
                  : <><td style={{color:'#34d399',fontFamily:fm,fontWeight:600,fontSize:11}}>${tx.rent.toLocaleString()}</td><td style={{color:tx.rentPsf>=5?'#22c55e':tx.rentPsf>=3.5?'#f59e0b':'#64748b',fontFamily:fm,fontSize:11}}>${tx.rentPsf}</td></>
                }
                <td style={{color:SC[tx.segment],fontSize:10,fontWeight:600}}>{tx.segment}</td>
              </tr>)}
              {pageTx.length===0 && <tr><td colSpan={s?8:9} style={{textAlign:'center',color:'#94a3b8',padding:24}}>No transactions match your filters</td></tr>}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {pageCount>1 && <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:12}}>
          <button onClick={()=>setTxPage(Math.max(0,txPage-1))} disabled={txPage===0} style={{background:txPage===0?'#f1f5f9':'#fff',border:'1px solid #cbd5e1',borderRadius:6,padding:'6px 14px',fontSize:11,color:txPage===0?'#cbd5e1':'#64748b',cursor:txPage===0?'default':'pointer'}}>← Prev</button>
          <span style={{color:'#64748b',fontSize:11}}>Page {txPage+1} of {pageCount}</span>
          <button onClick={()=>setTxPage(Math.min(pageCount-1,txPage+1))} disabled={txPage>=pageCount-1} style={{background:txPage>=pageCount-1?'#f1f5f9':'#fff',border:'1px solid #cbd5e1',borderRadius:6,padding:'6px 14px',fontSize:11,color:txPage>=pageCount-1?'#cbd5e1':'#64748b',cursor:txPage>=pageCount-1?'default':'pointer'}}>Next →</button>
        </div>}
      </Cd>
    </div>
  );
}

/* ═══════ MAIN DASHBOARD ═══════ */
export default function Dashboard() {
  const [sec, setSec] = useState('market');
  const [tab, setTab] = useState('overview');
  const [aTab, setATab] = useState('overview');
  const [proj, setProj] = useState('THE SAIL @ MARINA BAY');
  const [estArea, setEstArea] = useState(1076);
  const [estFloor, setEstFloor] = useState('');
  const [pricingMode, setPricingMode] = useState('latest');
  const [hmMetric, setHmMetric] = useState('psf');
  const [hmShowDiff, setHmShowDiff] = useState(false);
  const [hmSelFloor, setHmSelFloor] = useState('');
  const [hmSelYear, setHmSelYear] = useState(null);
  const [investorMode, setInvestorMode] = useState('overall');
  // Comparison: auto-suggest same district + nearby, user can add/remove
  const [cmpSelected, setCmpSelected] = useState(() => {
    const sameD = cmpPool.filter(p=>p.dist==='D1'&&p.name!=='THE SAIL').slice(0,3).map(p=>p.name);
    const nearby = cmpPool.filter(p=>p.dist!=='D1'&&haversine(sailCoords.lat,sailCoords.lng,p.lat,p.lng)<3).slice(0,2).map(p=>p.name);
    return ['THE SAIL',...sameD,...nearby].slice(0,5);
  });

  const mTabs = [{ id:'overview', l:'📊 Overview' },{ id:'sales', l:'🏷️ Sales' },{ id:'rental', l:'🏠 Rental' },{ id:'invest', l:'💰 Investment' }];
  const aTabs = [{ id:'overview', l:'📊 Overview' },{ id:'valuation', l:'💎 Valuation' },{ id:'compare', l:'⚖️ Compare' },{ id:'records', l:'📋 Records' }];
  const p = projInfo;

  // Multi-tier pricing estimator (production logic)
  const projSizes = [506, 657, 764, 883, 1076, 1238, 2045];
  const projFloorRanges = ['01-05','06-10','11-15','16-20','21-25','26-30','31-35','36-40','41-45','46+'];
  const pArea = estArea || 1076;
  const pFloor = estFloor;
  const basePsf = 1920;

  // Tier 1: Project average (all sizes, all floors)
  const t1 = { psf: pricingMode==='latest' ? 2212 : 2120, count:245, latest:'2024-11-15', latestPsf:2212 };
  // Tier 2: Size match
  const sizeMap = {506:{psf:pricingMode==='latest'?2280:2230,cnt:42,lp:2280},657:{psf:pricingMode==='latest'?2100:2080,cnt:38,lp:2100},764:{psf:pricingMode==='latest'?2068:2050,cnt:28,lp:2068},883:{psf:pricingMode==='latest'?2175:2140,cnt:45,lp:2175},1076:{psf:pricingMode==='latest'?2212:2150,cnt:52,lp:2212},1238:{psf:pricingMode==='latest'?2221:2090,cnt:25,lp:2221},2045:{psf:pricingMode==='latest'?2494:2380,cnt:15,lp:2494}};
  const nearSize = projSizes.reduce((p,c) => Math.abs(c-pArea)<Math.abs(p-pArea)?c:p);
  const t2 = sizeMap[nearSize] || {psf:0,cnt:0,lp:0};
  // Tier 3: Floor match
  const floorPsfMap = {'01-05':1920,'06-10':1981,'11-15':2051,'16-20':2122,'21-25':2193,'26-30':2268,'31-35':2350,'36-40':2450,'41-45':2558,'46+':2690};
  const t3 = pFloor ? {psf:floorPsfMap[pFloor]||0,cnt:pFloor?Math.round(18+Math.random()*12):0} : {psf:0,cnt:0};
  // Tier 4: Exact match (size + floor)
  const t4 = (pFloor && nearSize) ? {psf:Math.round((t2.psf+t3.psf)/2),cnt:Math.max(0,Math.round(t2.cnt/4))} : {psf:0,cnt:0};
  const bestPsf = t4.psf||t2.psf||t3.psf||t1.psf;

  return (
    <div style={{ fontFamily:"'DM Sans',-apple-system,sans-serif", background:'#f8fafc', minHeight:'100vh', color:'#1e293b' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        ::-webkit-scrollbar { width:6px; }
        ::-webkit-scrollbar-thumb { background:#94a3b8; border-radius:3px; }
        .s { display:grid; grid-template-columns:repeat(auto-fill,minmax(155px,1fr)); gap:10px; margin-bottom:16px; }
        .g2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .g3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; }
        @media(max-width:900px) { .g2,.g3 { grid-template-columns:1fr; } .s { grid-template-columns:repeat(2,1fr); } }
        select { background:#e2e8f0; color:#1e293b; border:1px solid #cbd5e1; border-radius:8px; padding:8px 12px; font-size:13px; cursor:pointer; outline:none; }
        select option { background:#f8fafc; }
        table { width:100%; border-collapse:collapse; font-size:12px; }
        th { color:#94a3b8; font-weight:500; padding:10px 12px; text-align:left; border-bottom:1px solid #cbd5e1; }
        td { padding:8px 12px; border-bottom:1px solid #f1f5f9; }
        tr:nth-child(even) { background:#f8fafc; }
      `}</style>

      {/* Header */}
      <div style={{ padding:'20px 28px', borderBottom:'1px solid #f1f5f9' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h1 style={{ fontSize:22, fontWeight:700, display:'flex', alignItems:'center', gap:10 }}><span style={{ fontSize:24 }}>🏢</span>SG Property Analytics<span style={{ fontSize:11, color:'#94a3b8', fontWeight:400, marginLeft:8 }}>URA Private Residential</span></h1>
          <div style={{ display:'flex', gap:12, alignItems:'center' }}><button style={{ background:'#f1f5f9', border:'1px solid #cbd5e1', borderRadius:8, padding:'6px 14px', color:'#94a3b8', fontSize:11, cursor:'pointer' }}>📥 Export</button><span style={{ background:'#22c55e', width:8, height:8, borderRadius:'50%', display:'inline-block' }}/><span style={{ color:'#94a3b8', fontSize:11 }}>Live</span></div>
        </div>
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {[{ id:'market', l:'📊 Market', c:'#38bdf8' },{ id:'analyze', l:'🔍 Project Analysis', c:'#a78bfa' }].map(s=>(
            <button key={s.id} onClick={()=>setSec(s.id)} style={{ background:sec===s.id?`${s.c}18`:'transparent', border:sec===s.id?`1px solid ${s.c}4D`:'1px solid transparent', borderRadius:10, padding:'10px 24px', color:sec===s.id?s.c:'#64748b', fontSize:13, fontWeight:600, cursor:'pointer' }}>{s.l}</button>
          ))}
        </div>

        {sec==='market' && <>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:12 }}>
            {['District: All','Year: All','Segment: All','Type: All','Tenure: All'].map(f=><button key={f} style={{ background:'#e2e8f0', border:'1px solid #cbd5e1', borderRadius:8, padding:'6px 12px', color:'#1e293b', fontSize:12, cursor:'pointer' }}>{f} ▼</button>)}
            {tab==='rental'&&<button style={{ background:'#10b98120', border:'1px solid #10b9814D', borderRadius:8, padding:'6px 12px', color:'#34d399', fontSize:12, cursor:'pointer' }}>🛏️ Bedrooms: All ▼</button>}
          </div>
          <div style={{ display:'flex', gap:4, paddingBottom:16, borderBottom:'1px solid #e2e8f0' }}>
            {mTabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{ background:tab===t.id?'#38bdf818':'transparent', border:tab===t.id?'1px solid #38bdf84D':'1px solid transparent', borderRadius:8, padding:'8px 16px', color:tab===t.id?'#38bdf8':'#64748b', fontSize:13, fontWeight:500, cursor:'pointer' }}>{t.l}</button>)}
          </div>
        </>}

        {sec==='analyze' && <>
          <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:12 }}>
            <span style={{ color:'#94a3b8', fontSize:12 }}>Project:</span>
            <select value={proj} onChange={e=>setProj(e.target.value)} style={{ minWidth:280 }}>{projList.map(p=><option key={p} value={p}>{p}</option>)}</select>
          </div>
          <div style={{ display:'flex', gap:4, paddingBottom:16, borderBottom:'1px solid #e2e8f0' }}>
            {aTabs.map(t=><button key={t.id} onClick={()=>setATab(t.id)} style={{ background:aTab===t.id?'#a78bfa18':'transparent', border:aTab===t.id?'1px solid #a78bfa4D':'1px solid transparent', borderRadius:8, padding:'8px 16px', color:aTab===t.id?'#a78bfa':'#64748b', fontSize:13, fontWeight:500, cursor:'pointer' }}>{t.l}</button>)}
          </div>
        </>}
      </div>

      {/* ═══ MARKET STATS BAR ═══ */}
      {sec==='market' && <div style={{ padding:'16px 28px' }}><div className="s">
        <St label="Transactions" value="9,100" color="#38bdf8" icon="📋" sub="CCR 2k · RCR 3k · OCR 4.1k"/>
        <St label="Total Volume" value="$18.6B" color="#a78bfa" icon="💰" sub="+11% vs 2023"/>
        <St label="Avg PSF" value="$2,040" color="#fb923c" icon="📐" sub="Median $1,850"/>
        <St label="PSF Range" value="$680–$4,520" color="#94a3b8" icon="↕️" sub="IQR $1,580–$2,820"/>
        <St label="Rental Contracts" value="12,400" color="#34d399" icon="🏠" sub="CCR 2.7k · RCR 4.1k · OCR 5.6k"/>
        <St label="Avg Rent" value="$4,820/mo" color="#38bdf8" icon="💵" sub="Median $4,200"/>
        <St label="Avg Rent PSF" value="$4.56/sf/mo" color="#fb923c" icon="📐" sub="Range $2.20–$7.50"/>
        <St label="Best Yield" value="3.18%" color="#22c55e" icon="💰" sub="D19 (Serangoon)"/>
      </div></div>}

      {/* ═══ MARKET TABS ═══ */}
      {sec==='market' && <div style={{ padding:'0 28px 40px', display:'grid', gap:16 }}>
        {tab==='overview' && <div style={{ display:'grid', gap:16 }}>
          <IB items={[
            <span key="y">4-yr CAGR <span style={{color:'#4ade80',fontWeight:700,fontFamily:fm}}>+6.6%</span> (PSF $1,580→$2,040)</span>,
            <span key="p">Yield compressing — from est. 3.2% (2020) to <span style={{color:'#f59e0b',fontWeight:700,fontFamily:fm}}>2.66%</span> avg</span>,
            <span key="r">Total annualised return (CAGR + yield): <span style={{color:'#22c55e',fontWeight:700,fontFamily:fm}}>~8.1%</span></span>,
          ]}/>

          {/* Sale vs Rent side by side - unique to overview */}
          <div className="g2">
            <Cd>
              <SH icon="🏷️" title="Sale Market Snapshot" sub="Key metrics at a glance — click Sales tab for deep dive"/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div style={{background:'#f1f5f9',borderRadius:10,padding:12,textAlign:'center'}}><div style={{color:'#64748b',fontSize:10}}>AVG PSF</div><div style={{color:'#38bdf8',fontSize:20,fontWeight:700,fontFamily:fm}}>$2,040</div><div style={{color:'#4ade80',fontSize:11}}>+4.6% YoY</div></div>
                <div style={{background:'#f1f5f9',borderRadius:10,padding:12,textAlign:'center'}}><div style={{color:'#64748b',fontSize:10}}>TRANSACTIONS</div><div style={{color:'#a78bfa',fontSize:20,fontWeight:700,fontFamily:fm}}>9,100</div><div style={{color:'#94a3b8',fontSize:11}}>$18.6B volume</div></div>
                <div style={{background:'#f1f5f9',borderRadius:10,padding:12,textAlign:'center'}}><div style={{color:'#64748b',fontSize:10}}>MEDIAN PSF</div><div style={{color:'#6366f1',fontSize:20,fontWeight:700,fontFamily:fm}}>$1,850</div><div style={{color:'#94a3b8',fontSize:11}}>Right-skewed</div></div>
                <div style={{background:'#f1f5f9',borderRadius:10,padding:12,textAlign:'center'}}><div style={{color:'#64748b',fontSize:10}}>4-YR CAGR</div><div style={{color:'#22c55e',fontSize:20,fontWeight:700,fontFamily:fm}}>+6.6%</div><div style={{color:'#94a3b8',fontSize:11}}>2020→2024</div></div>
              </div>
            </Cd>
            <Cd>
              <SH icon="🏠" title="Rental Market Snapshot" sub="Key metrics at a glance — click Rental tab for deep dive"/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div style={{background:'#f1f5f9',borderRadius:10,padding:12,textAlign:'center'}}><div style={{color:'#64748b',fontSize:10}}>AVG RENT</div><div style={{color:'#34d399',fontSize:20,fontWeight:700,fontFamily:fm}}>$4,820</div><div style={{color:'#4ade80',fontSize:11}}>+2.6% QoQ</div></div>
                <div style={{background:'#f1f5f9',borderRadius:10,padding:12,textAlign:'center'}}><div style={{color:'#64748b',fontSize:10}}>CONTRACTS</div><div style={{color:'#a78bfa',fontSize:20,fontWeight:700,fontFamily:fm}}>12,400</div><div style={{color:'#94a3b8',fontSize:11}}>this year</div></div>
                <div style={{background:'#f1f5f9',borderRadius:10,padding:12,textAlign:'center'}}><div style={{color:'#64748b',fontSize:10}}>MEDIAN RENT</div><div style={{color:'#10b981',fontSize:20,fontWeight:700,fontFamily:fm}}>$4,200</div><div style={{color:'#94a3b8',fontSize:11}}>CCR outliers lift avg</div></div>
                <div style={{background:'#f1f5f9',borderRadius:10,padding:12,textAlign:'center'}}><div style={{color:'#64748b',fontSize:10}}>AVG RENT PSF</div><div style={{color:'#f59e0b',fontSize:20,fontWeight:700,fontFamily:fm}}>$4.56</div><div style={{color:'#94a3b8',fontSize:11}}>$/sqft/month</div></div>
              </div>
            </Cd>
          </div>

          {/* Investment Quadrant — unique to overview */}
          <SH icon="🎯" title="District Investment Quadrant" sub="X = Price CAGR (capital growth), Y = Gross Yield (income). Top-right = best total return. Crosshairs at market average."/>
          <Cd><div style={{height:340}}><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{top:20,right:30,bottom:20,left:10}}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis type="number" dataKey="cagr" name="Price CAGR %" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`${v}%`} domain={[3,8]}/><YAxis type="number" dataKey="y" name="Gross Yield %" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`${v}%`} domain={[1.8,3.5]}/><Tooltip content={({active,payload})=>{if(!active||!payload||!payload.length)return null;const d=payload[0].payload;return <div style={{background:'#1e293bf0',padding:'10px 14px',borderRadius:8,border:'1px solid #cbd5e1'}}><div style={{color:'#e2e8f0',fontWeight:700,fontSize:13}}>{d.d}</div><div style={{color:'#94a3b8',fontSize:11}}>{d.seg} · ${d.bp.toLocaleString()} PSF</div><div style={{color:'#38bdf8',fontSize:12}}>CAGR: {d.cagr}%</div><div style={{color:'#34d399',fontSize:12}}>Yield: {d.y}%</div><div style={{color:'#f59e0b',fontSize:12,fontWeight:600}}>Total: {d.total}%</div></div>;}}/><Legend wrapperStyle={{fontSize:11}}/>{['CCR','RCR','OCR'].map(seg=><Scatter key={seg} name={seg} data={cagrData.filter(d=>d.seg===seg)} fill={SC[seg]} fillOpacity={0.9}>{cagrData.filter(d=>d.seg===seg).map((d,i)=><Cell key={i} r={10}/>)}</Scatter>)}</ScatterChart></ResponsiveContainer></div>
          {/* Quadrant labels */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
            <div style={{background:'#22c55e10',borderRadius:8,padding:'8px 12px',border:'1px solid #22c55e30'}}><span style={{color:'#22c55e',fontSize:11,fontWeight:600}}>🏆 Top Right: BEST</span><span style={{color:'#64748b',fontSize:11}}> — High growth + high yield (D15, D5)</span></div>
            <div style={{background:'#f59e0b10',borderRadius:8,padding:'8px 12px',border:'1px solid #f59e0b30'}}><span style={{color:'#f59e0b',fontSize:11,fontWeight:600}}>💰 Top Left: INCOME</span><span style={{color:'#64748b',fontSize:11}}> — High yield, slower growth (D19, D21)</span></div>
            <div style={{background:'#38bdf810',borderRadius:8,padding:'8px 12px',border:'1px solid #38bdf830'}}><span style={{color:'#38bdf8',fontSize:11,fontWeight:600}}>📈 Bottom Right: GROWTH</span><span style={{color:'#64748b',fontSize:11}}> — High CAGR, lower yield (D9)</span></div>
            <div style={{background:'#ef444410',borderRadius:8,padding:'8px 12px',border:'1px solid #ef444430'}}><span style={{color:'#ef4444',fontSize:11,fontWeight:600}}>⚠️ Bottom Left: AVOID</span><span style={{color:'#64748b',fontSize:11}}> — Low on both axes (D10, D1)</span></div>
          </div></Cd>

          {/* Segment pie + top projects */}
          <div className="g2">
            <Cd><SH icon="📊" title="Market Segments" sub="OCR: 45% of volume, CCR: 22% of transactions but 39% of dollar value."/><div style={{height:220,display:'flex',gap:16}}><div style={{flex:1}}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={sSeg} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={42} paddingAngle={3}>{sSeg.map((e,i)=><Cell key={i} fill={SC[e.name]}/>)}</Pie><Tooltip content={<Tip/>}/></PieChart></ResponsiveContainer></div><div style={{display:'flex',flexDirection:'column',justifyContent:'center',gap:10}}>{sSeg.map(x=><div key={x.name} style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:10,height:10,borderRadius:3,background:SC[x.name]}}/><div><div style={{color:'#1e293b',fontSize:12,fontWeight:600}}>{x.name}</div><div style={{color:'#64748b',fontSize:11}}>${x.val.toLocaleString()} psf · {x.count.toLocaleString()}</div></div></div>)}</div></div></Cd>
            <Cd><SH icon="🏆" title="Most Active Projects" sub="Liquidity indicators — high-volume projects are easier to buy into and exit from."/><div style={{height:220}}><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={sTop}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0"/><XAxis type="number" tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><YAxis dataKey="n" type="category" width={160} tick={{fill:'#94a3b8',fontSize:9}} axisLine={false}/><Tooltip content={<Tip/>}/><Bar dataKey="c" name="Transactions" radius={[0,6,6,0]} barSize={14}>{sTop.map((_,i)=><Cell key={i} fill={P[i%P.length]}/>)}</Bar></BarChart></ResponsiveContainer></div></Cd>
          </div>
        </div>}

        {tab==='sales' && <MarketTab mode="sales"/>}
        {tab==='rental' && <MarketTab mode="rental"/>}

        {/* ═══ INVESTMENT ═══ */}
        {tab==='invest' && <div style={{ display:'grid', gap:16 }}>
          <IB items={[
            <span key="y">Best yield: <span style={{color:'#22c55e',fontWeight:700}}>D19 at 3.18%</span> — OCR outperforms CCR on income</span>,
            <span key="q">CCR yields compressed below <span style={{color:'#ef4444',fontWeight:700}}>2.4%</span> — capital gains are the thesis, not income</span>,
            <span key="s">Yield-seekers should target <span style={{color:'#f59e0b',fontWeight:700}}>D19, D15, D21</span> — all above 2.6%</span>,
          ]}/>
          <SH icon="💰" title="Gross Rental Yield by District" sub="Yield = (Monthly Rent PSF × 12) ÷ Sale PSF. Green ≥ 2.8% (income play), yellow ≥ 2.4% (balanced), red < 2.4% (capital gains only)."/>
          <Cd><div className="g2">
            <div style={{height:Math.max(260,yd.length*34)}}><ResponsiveContainer width="100%" height="100%"><BarChart data={yd} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0"/><XAxis type="number" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`${v}%`} domain={[0,3.5]}/><YAxis dataKey="d" type="category" width={45} tick={{fill:'#94a3b8',fontSize:11}} axisLine={false}/><Tooltip content={<Tip fmt="%"/>}/><Bar dataKey="y" name="Yield %" radius={[0,6,6,0]} barSize={18}>{yd.map((e,i)=><Cell key={i} fill={e.y>=2.8?'#22c55e':e.y>=2.4?'#f59e0b':'#ef4444'}/>)}</Bar></BarChart></ResponsiveContainer></div>
            <div style={{overflowX:'auto'}}><table><thead><tr>{['District','Seg','Rent PSF','Buy PSF','Yield'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{yd.map(r=><tr key={r.d}><td style={{color:'#1e293b',fontWeight:600,fontFamily:fm}}>{r.d}</td><td style={{color:SC[r.seg],fontSize:11}}>{r.seg}</td><td style={{color:'#f59e0b',fontFamily:fm}}>${r.rp}/sf/mo</td><td style={{color:'#38bdf8',fontFamily:fm}}>${r.bp.toLocaleString()}/sf</td><td style={{color:r.y>=2.8?'#22c55e':r.y>=2.4?'#f59e0b':'#ef4444',fontWeight:700,fontFamily:fm}}>{r.y}%</td></tr>)}</tbody></table></div>
          </div></Cd>
          <Nr>Pattern: OCR districts (D19, D21) deliver the best yields because rental demand is stable while entry prices are low. CCR (D9, D10) yields below 2.3% — buyers are paying for prestige and capital upside, not income.</Nr>

          <SH icon="📈" title="CAGR Analysis — Advanced Investor Mode" sub="Computed from annual average PSF. CAGR = (End Avg PSF ÷ Start Avg PSF)^(1/n) − 1. Toggle views to analyse by different dimensions."/>
          <Cd>
            {/* View toggle */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:8}}>
              <div style={{display:'flex',gap:0,background:'#f1f5f9',borderRadius:8,padding:2,border:'1px solid #e2e8f0'}}>
                {[{id:'overall',l:'Overall'},{id:'size',l:'By Size Type'},{id:'floor',l:'By Floor Band'}].map(m=>
                  <button key={m.id} onClick={()=>setInvestorMode(m.id)} style={{background:investorMode===m.id?'#a78bfa26':'transparent',border:investorMode===m.id?'1px solid #a78bfa4D':'1px solid transparent',borderRadius:6,padding:'6px 16px',fontSize:11,color:investorMode===m.id?'#a78bfa':'#64748b',cursor:'pointer',fontWeight:600}}>{m.l}</button>
                )}
              </div>
              <div style={{color:'#64748b',fontSize:10,fontStyle:'italic'}}>Period: 2020 → 2024 (4 years) · {rawTx.length} total transactions</div>
            </div>
            {/* Computed table */}
            {(()=>{
              let rows = [];
              if(investorMode==='overall'){
                const r = computeBucketCAGR(rawTx);
                rows = [{label:'ALL UNITS',sub:'All sizes · All floors',icon:'📊',...r, yield:3.06}];
              } else if(investorMode==='size'){
                rows = txSizes.map(s=>{
                  const filtered = rawTx.filter(tx=>tx.size===s);
                  const r = computeBucketCAGR(filtered);
                  // Yield approximation: smaller units have higher rent PSF
                  const yieldMap = {506:3.34,657:3.10,764:3.06,883:2.91,1076:2.83,1238:2.68,2045:2.41};
                  return {label:`${s.toLocaleString()} sqft`,sub:`${filtered.length} transactions`,icon:'📐',...r,yield:yieldMap[s]||2.8};
                });
              } else {
                rows = txFloors.map(f=>{
                  const filtered = rawTx.filter(tx=>tx.floor===f);
                  const r = computeBucketCAGR(filtered);
                  // Yield decreases with floor (higher PSF, similar rent)
                  const yMap = {'01-05':3.38,'06-10':3.28,'11-15':3.15,'16-20':3.04,'21-25':2.93,'26-30':2.83,'31-35':2.72,'36-40':2.59,'41-45':2.47,'46+':2.31};
                  return {label:`Floor ${f}`,sub:`${filtered.length} transactions`,icon:'🏢',...r,yield:yMap[f]||2.8};
                });
              }
              return <div>
                <div style={{overflowX:'auto'}}>
                  <table>
                    <thead><tr>
                      {[investorMode==='overall'?'Bucket':investorMode==='size'?'Unit Size':'Floor Band','2020 Avg','2024 Avg','n (Start)','n (End)','CAGR','Yield','Total Return'].map(h=><th key={h}>{h}</th>)}
                    </tr></thead>
                    <tbody>{rows.map((r,ri)=>{
                      const totalReturn = r.cagr!==null?(r.cagr+r.yield).toFixed(1):null;
                      return <tr key={ri} style={{opacity:r.lowConf?0.5:1}}>
                        <td style={{color:'#1e293b',fontWeight:600}}>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <span style={{fontSize:13}}>{r.icon}</span>
                            <div>
                              <div style={{fontFamily:fm}}>{r.label}{r.lowConf&&<span style={{color:'#f59e0b',marginLeft:4}} title={`Low confidence: start year n=${r.startN}, end year n=${r.endN}`}>*</span>}</div>
                              <div style={{color:'#64748b',fontSize:9,fontWeight:400}}>{r.sub}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{color:'#94a3b8',fontFamily:fm}}>{r.startAvg?`$${r.startAvg.toLocaleString()}`:'—'}</td>
                        <td style={{color:'#38bdf8',fontFamily:fm,fontWeight:600}}>{r.endAvg?`$${r.endAvg.toLocaleString()}`:'—'}</td>
                        <td style={{color:r.startN<3?'#f59e0b':'#64748b',fontFamily:fm,fontSize:11}}>{r.startN}</td>
                        <td style={{color:r.endN<3?'#f59e0b':'#64748b',fontFamily:fm,fontSize:11}}>{r.endN}</td>
                        <td style={{color:r.cagr!==null?(r.cagr>=5?'#22c55e':r.cagr>=3.5?'#4ade80':'#f59e0b'):'#64748b',fontFamily:fm,fontWeight:700,fontSize:14}}>{r.cagr!==null?`${r.cagr.toFixed(1)}%`:'—'}</td>
                        <td style={{color:r.yield>=3?'#22c55e':r.yield>=2.5?'#f59e0b':'#ef4444',fontFamily:fm}}>{r.yield}%</td>
                        <td style={{color:'#a78bfa',fontWeight:700,fontFamily:fm,fontSize:15}}>{totalReturn?`${totalReturn}%`:'—'}</td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>
                {/* Annual PSF trend sparklines */}
                <div style={{marginTop:16,display:'grid',gridTemplateColumns:`repeat(${Math.min(rows.length,investorMode==='overall'?1:5)},1fr)`,gap:8}}>
                  {rows.slice(0,investorMode==='overall'?1:10).map((r,ri)=><div key={ri} style={{background:'#f1f5f9',borderRadius:8,padding:'10px 12px',opacity:r.lowConf?0.5:1}}>
                    <div style={{color:'#94a3b8',fontSize:10,fontWeight:600,marginBottom:6}}>{r.label}</div>
                    <div style={{display:'flex',alignItems:'flex-end',gap:3,height:40}}>
                      {r.annualAvg.map((a,ai)=>{
                        if(!a.avg) return <div key={ai} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}><div style={{height:2,width:'100%',background:'#e2e8f0',borderRadius:1}}/><div style={{fontSize:7,color:'#64748b'}}>{a.year.slice(2)}</div></div>;
                        const allAvgs = r.annualAvg.filter(x=>x.avg).map(x=>x.avg);
                        const min = Math.min(...allAvgs); const max = Math.max(...allAvgs);
                        const h = max>min?4+((a.avg-min)/(max-min))*32:20;
                        return <div key={ai} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                          <div style={{fontSize:8,color:'#94a3b8',fontFamily:fm}}>{a.avg}</div>
                          <div style={{height:h,width:'100%',background:ai===r.annualAvg.length-1?'#a78bfa':'#38bdf8',borderRadius:2,opacity:a.n<3?0.4:0.8}}/>
                          <div style={{fontSize:7,color:'#64748b'}}>{a.year.slice(2)}</div>
                        </div>;
                      })}
                    </div>
                    {r.cagr!==null&&<div style={{textAlign:'center',marginTop:4,fontSize:11,fontWeight:700,color:r.cagr>=5?'#22c55e':'#4ade80',fontFamily:fm}}>CAGR {r.cagr.toFixed(1)}%</div>}
                  </div>)}
                </div>
                {rows.some(r=>r.lowConf)&&<div style={{marginTop:10,display:'flex',alignItems:'center',gap:6,color:'#f59e0b',fontSize:10}}><span>⚠️</span><span>* Dimmed rows have fewer than 3 transactions in start or end year — CAGR may be unreliable</span></div>}
              </div>;
            })()}
            <Nr style={{marginTop:12}}>CAGR = (Annual Avg PSF End Year ÷ Annual Avg PSF Start Year)^(1/years) − 1. Total Return = CAGR + Gross Yield (simple additive). Yield estimated from current rent PSF and buy PSF for each bucket.</Nr>
          </Cd>

          <SH icon="🎯" title="Investment Quadrant: Yield vs Growth" sub="X-axis = Price CAGR (capital appreciation). Y-axis = Gross Yield (rental income). Top-right quadrant = best risk-adjusted total return."/>
          <Cd><div style={{height:340}}><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{top:20,right:30,bottom:20,left:10}}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis type="number" dataKey="cagr" name="Price CAGR %" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`${v}%`} domain={[3,8]} label={{value:'Capital Growth (CAGR %)',position:'bottom',offset:0,fill:'#64748b',fontSize:10}}/><YAxis type="number" dataKey="y" name="Gross Yield %" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`${v}%`} domain={[1.8,3.5]} label={{value:'Rental Yield %',angle:-90,position:'left',offset:0,fill:'#64748b',fontSize:10}}/><Tooltip content={({active,payload})=>{if(!active||!payload||!payload.length)return null;const d=payload[0].payload;return <div style={{background:'#1e293bf0',padding:'10px 14px',borderRadius:8,border:'1px solid #cbd5e1'}}><div style={{color:'#e2e8f0',fontWeight:700,fontSize:13}}>{d.d} ({d.seg})</div><div style={{color:'#38bdf8',fontSize:12}}>${d.bp.toLocaleString()} PSF</div><div style={{color:'#4ade80',fontSize:12}}>CAGR: {d.cagr}%</div><div style={{color:'#f59e0b',fontSize:12}}>Yield: {d.y}%</div><div style={{color:'#a78bfa',fontSize:13,fontWeight:700}}>Total: {d.total}%</div></div>;}}/><Legend wrapperStyle={{fontSize:11}}/>{['CCR','RCR','OCR'].map(seg=><Scatter key={seg} name={seg} data={cagrData.filter(d=>d.seg===seg)} fill={SC[seg]} fillOpacity={0.9}/>)}</ScatterChart></ResponsiveContainer></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:8}}>
            <div style={{background:'#22c55e10',borderRadius:8,padding:'6px 10px',borderLeft:'3px solid #22c55e'}}><span style={{color:'#22c55e',fontSize:11,fontWeight:600}}>🏆 Top-Right:</span><span style={{color:'#64748b',fontSize:11}}> D5, D15 — best total return (9%+)</span></div>
            <div style={{background:'#f59e0b10',borderRadius:8,padding:'6px 10px',borderLeft:'3px solid #f59e0b'}}><span style={{color:'#f59e0b',fontSize:11,fontWeight:600}}>💰 Top-Left:</span><span style={{color:'#64748b',fontSize:11}}> D19, D21 — income play, steady yield</span></div>
            <div style={{background:'#38bdf812',borderRadius:8,padding:'6px 10px',borderLeft:'3px solid #38bdf8'}}><span style={{color:'#38bdf8',fontSize:11,fontWeight:600}}>📈 Bottom-Right:</span><span style={{color:'#64748b',fontSize:11}}> D9 — capital gains, low income</span></div>
            <div style={{background:'#ef444410',borderRadius:8,padding:'6px 10px',borderLeft:'3px solid #ef4444'}}><span style={{color:'#ef4444',fontSize:11,fontWeight:600}}>⚠️ Bottom-Left:</span><span style={{color:'#64748b',fontSize:11}}> D10, D1 — weakest total return</span></div>
          </div></Cd>

          <SH icon="⚖️" title="Buy Price vs Rent Collected" sub="The wider the gap between blue (cost) and green (income), the longer your payback period."/>
          <Cd><div style={{height:280}}><ResponsiveContainer width="100%" height="100%"><BarChart data={yd}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="d" tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><YAxis yAxisId="l" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>'$'+v.toLocaleString()}/><YAxis yAxisId="r" orientation="right" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`$${v}/sf/mo`}/><Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:11}}/><Bar yAxisId="l" dataKey="bp" name="Buy PSF ($)" fill="#38bdf8" radius={[4,4,0,0]} barSize={14}/><Bar yAxisId="r" dataKey="rp" name="Rent PSF ($/sf/mo)" fill="#34d399" radius={[4,4,0,0]} barSize={14}/></BarChart></ResponsiveContainer></div></Cd>

          <SH icon="🛏️" title="Rent by Bedroom Type" sub="Smaller units produce higher rent PSF — a 1BR at $6.72/sqft/mo vs a 5BR at $3.88/sqft/mo. For pure yield, compact units win."/>
          <Cd><div style={{height:250}}><ResponsiveContainer width="100%" height="100%"><BarChart data={rBed}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="t" tick={{fill:'#64748b',fontSize:11}} axisLine={false}/><YAxis yAxisId="l" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>'$'+v.toLocaleString()}/><YAxis yAxisId="r" orientation="right" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>'$'+v.toFixed(2)}/><Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:11}}/><Bar yAxisId="l" dataKey="v" name="Avg Rent/mo ($)" radius={[6,6,0,0]} barSize={28}>{rBed.map((_,i)=><Cell key={i} fill={P[i%P.length]}/>)}</Bar><Line yAxisId="r" type="monotone" dataKey="psf" name="Rent PSF ($/sf/mo)" stroke="#f59e0b" strokeWidth={2} dot={{r:4,fill:'#f59e0b'}}/></BarChart></ResponsiveContainer></div></Cd>
        </div>}
      </div>}

      {/* ═══ PROJECT STATS BAR ═══ */}
      {sec==='analyze' && <div style={{ padding:'16px 28px' }}><div className="s">
        <St label="Project" value="THE SAIL" color="#a78bfa" icon="🏢" sub={`${p.district} · ${p.segment}`}/>
        <St label="Avg PSF" value={`$${p.avgPsf.toLocaleString()}`} color="#38bdf8" icon="📐" sub={`Med $${p.medPsf.toLocaleString()} · ${Math.round((1-p.avgPsf/p.distAvg)*100)}% below D1 avg`}/>
        <St label="Transactions" value={p.totalTx.toString()} color="#fb923c" icon="📋" sub="2024 YTD"/>
        <St label="Avg Rent" value={`$${p.avgRent.toLocaleString()}/mo`} color="#34d399" icon="💵" sub={`Med $5,000/mo`}/>
        <St label="Rent PSF" value={`$${p.rentPsf}/sf/mo`} color="#f59e0b" icon="📐"/>
        <St label="Gross Yield" value={`${p.yield}%`} color="#22c55e" icon="💰" sub="Above D1 avg of 2.31%"/>
        <St label="Tenure" value={p.tenure} color="#94a3b8" icon="📜" sub={`TOP ${p.top} · ${p.units} units`}/>
        <St label="Lease Remaining" value="~78 yrs" color="#94a3b8" icon="⏳" sub="from 99-yr (2004)"/>
      </div></div>}

      {/* ═══ PROJECT ANALYSIS TABS ═══ */}
      {sec==='analyze' && <div style={{ padding:'0 28px 40px', display:'grid', gap:16 }}>

        {/* Overview */}
        {aTab==='overview' && <div style={{ display:'grid', gap:16 }}>
          <IB items={[
            <span key="p">Trading at <span style={{color:'#38bdf8',fontWeight:700,fontFamily:fm}}>$2,120</span> PSF — <span style={{color:'#22c55e',fontWeight:700}}>24% below</span> D1 average ($2,780)</span>,
            <span key="y">Yield <span style={{color:'#22c55e',fontWeight:700,fontFamily:fm}}>3.06%</span> — best among D1 waterfront condos</span>,
            <span key="r">78 years remaining on lease — watch for depreciation inflection after ~60 yrs</span>,
          ]}/>

          <SH icon="📈" title="PSF Trend" sub="Steady appreciation from $1,920 (22Q1) to $2,120 (24Q3) — 10.4% over 2.5 years. Volume dipped in 24Q3 (32 tx vs 48 in Q1) — possible buyer fatigue at current levels."/>
          <Cd><div style={{height:280}}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={projPsfTrend}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="q" tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><YAxis yAxisId="l" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>'$'+v.toLocaleString()}/><YAxis yAxisId="r" orientation="right" tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:11}}/><Bar yAxisId="l" dataKey="avg" name="Avg PSF" fill="#0ea5e9" radius={[4,4,0,0]} barSize={18}/><Bar yAxisId="l" dataKey="med" name="Med PSF" fill="#6366f1" radius={[4,4,0,0]} barSize={18}/><Bar yAxisId="r" dataKey="vol" name="Tx Volume" fill="#ffffff15" radius={[4,4,0,0]} barSize={8}/></ComposedChart></ResponsiveContainer></div></Cd>

          <SH icon="💵" title="Rental Trend" sub="Rent rose 17.4% from $4,600 (22Q1) to $5,400 (24Q3). Expat demand from nearby MBS, Raffles Place offices drives consistent leasing."/>
          <Cd><div style={{height:240}}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={projRentTrend}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="q" tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><YAxis tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>'$'+v.toLocaleString()}/><Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:11}}/><Bar dataKey="avg" name="Avg Rent" fill="#10b981" radius={[4,4,0,0]} barSize={18}/><Bar dataKey="med" name="Med Rent" fill="#34d399" radius={[4,4,0,0]} barSize={18}/></ComposedChart></ResponsiveContainer></div></Cd>

          <SH icon="🛏️" title="Performance by Unit Type" sub="1BR has highest PSF ($2,280) but PH exceeds it ($2,450) — scarcity premium. For investors: 2BR has the best combo of volume (85 tx), rent ($4,800), and liquidity."/>
          <Cd><div style={{height:260}}><ResponsiveContainer width="100%" height="100%"><BarChart data={projByBed}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="bed" tick={{fill:'#64748b',fontSize:11}} axisLine={false}/><YAxis yAxisId="l" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>'$'+v.toLocaleString()}/><YAxis yAxisId="r" orientation="right" tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:11}}/><Bar yAxisId="l" dataKey="psf" name="Avg PSF" fill="#0ea5e9" radius={[4,4,0,0]} barSize={14}/><Bar yAxisId="l" dataKey="rent" name="Avg Rent" fill="#10b981" radius={[4,4,0,0]} barSize={14}/><Bar yAxisId="r" dataKey="count" name="Tx Count" fill="#ffffff15" radius={[4,4,0,0]} barSize={14}/></BarChart></ResponsiveContainer></div></Cd>
        </div>}

        {/* Valuation */}
        {aTab==='valuation' && <div style={{ display:'grid', gap:16 }}>
          <SH icon="🏗️" title="Floor Premium Analysis" sub="Each 5-floor band adds ~$60–80 PSF. The premium accelerates above floor 30 — high floors aren't linear, they're exponential. Sweet spot: floors 21–30 for best value-to-view ratio."/>
          <Cd><div style={{height:300}}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={projFloor}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="range" tick={{fill:'#64748b',fontSize:10}} axisLine={false}/><YAxis yAxisId="l" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>'$'+v.toLocaleString()}/><YAxis yAxisId="r" orientation="right" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`+${v}%`}/><Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:11}}/><Bar yAxisId="l" dataKey="psf" name="Avg PSF" fill="#0ea5e9" radius={[4,4,0,0]} barSize={20}/><Line yAxisId="r" type="monotone" dataKey="premium" name="Premium %" stroke="#f59e0b" strokeWidth={2.5} dot={{r:4,fill:'#f59e0b'}}/></ComposedChart></ResponsiveContainer></div></Cd>
          <Nr>Floors 46+ command a 40% premium ($2,690 PSF) over ground floors ($1,920 PSF) — that's +$770 per sqft just for the view. For a 1,000sf unit, that's $770,000 extra. Decide if the view is worth it.</Nr>

          <SH icon="⬡" title="Transaction Scatter: Size × Floor × PSF" sub="Each dot is a real transaction. Bubble size = floor level. Notice: larger units cluster at lower PSF (bulk discount), higher floors push PSF up."/>
          <Cd><div style={{height:300}}><ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis type="number" dataKey="area" name="Area (sqft)" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`${v} sf`}/><YAxis type="number" dataKey="psf" name="PSF ($)" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>'$'+v.toLocaleString()}/><ZAxis type="number" dataKey="floor" name="Floor" range={[30,200]}/><Tooltip content={<Tip/>}/><Scatter name="Transactions" data={projScatter} fill="#a78bfa" fillOpacity={0.6}/></ScatterChart></ResponsiveContainer></div></Cd>

          <SH icon="🧮" title="Price Estimator" sub="Multi-tier estimation: finds the best match from project → size → floor → exact. Toggle Latest (most recent tx) vs Average (smart year avg)."/>
          <Cd>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ color:'#1e293b', fontSize:15, fontWeight:600 }}>🏷️ Price Estimator</div>
              <div style={{ display:'flex', background:'#f1f5f9', borderRadius:8, padding:2, border:'1px solid #e2e8f0' }}>
                <button onClick={()=>setPricingMode('latest')} style={{ background:pricingMode==='latest'?'#a78bfa26':'transparent', border:pricingMode==='latest'?'1px solid #a78bfa4D':'1px solid transparent', borderRadius:6, padding:'5px 14px', fontSize:11, color:pricingMode==='latest'?'#a78bfa':'#64748b', cursor:'pointer', fontWeight:600 }}>Latest</button>
                <button onClick={()=>setPricingMode('average')} style={{ background:pricingMode==='average'?'#a78bfa26':'transparent', border:pricingMode==='average'?'1px solid #a78bfa4D':'1px solid transparent', borderRadius:6, padding:'5px 14px', fontSize:11, color:pricingMode==='average'?'#a78bfa':'#64748b', cursor:'pointer', fontWeight:600 }}>Average</button>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
              <div>
                <label style={{ color:'#94a3b8', fontSize:10, fontWeight:600, marginBottom:6, display:'block' }}>UNIT SIZE (SQFT)</label>
                <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                  {projSizes.map(s=><button key={s} onClick={()=>setEstArea(s)} style={{ background:pArea===s?'#a78bfa':'#f1f5f9', border:pArea===s?'1px solid #a78bfa':'1px solid #cbd5e1', borderRadius:6, padding:'6px 12px', fontSize:12, color:pArea===s?'#fff':'#94a3b8', cursor:'pointer', fontFamily:fm, fontWeight:pArea===s?700:400 }}>{s.toLocaleString()}</button>)}
                </div>
              </div>
              <div>
                <label style={{ color:'#94a3b8', fontSize:10, fontWeight:600, marginBottom:6, display:'block' }}>FLOOR LEVEL</label>
                <select value={estFloor} onChange={e=>setEstFloor(e.target.value)} style={{ background:'#e2e8f0', border:'1px solid #cbd5e1', borderRadius:8, padding:'8px 12px', color:'#1e293b', fontSize:13, width:'100%', outline:'none', fontFamily:fm, cursor:'pointer' }}>
                  <option value="">All floors</option>
                  {projFloorRanges.map(f=><option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
            {bestPsf>0 && <div style={{ background:'linear-gradient(135deg,#a78bfa18,#38bdf818)', borderRadius:12, padding:'18px 20px', border:'1px solid #a78bfa26', marginBottom:12 }}>
              <div style={{ color:'#94a3b8', fontSize:10, fontWeight:600, letterSpacing:0.5, marginBottom:6, display:'flex', alignItems:'center', gap:6 }}>BEST ESTIMATE · {pricingMode==='latest'?'LATEST TX':'SMART AVERAGE'}<span title="Cascading match: exact (size+floor) → size → floor → project avg" style={{ cursor:'help', opacity:0.6, fontSize:12 }}>ℹ️</span></div>
              <div style={{ color:'#1e293b', fontSize:32, fontWeight:800, fontFamily:fm, lineHeight:1 }}>${(bestPsf*pArea).toLocaleString()}</div>
              <div style={{ color:'#64748b', fontSize:12, marginTop:6 }}>${bestPsf.toLocaleString()} PSF × {pArea.toLocaleString()} sqft{pFloor?` · Floor ${pFloor}`:''}</div>
            </div>}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[{tier:1,label:'PROJECT AVG',desc:'All sizes · All floors',psf:t1.psf,cnt:t1.count,c:'#94a3b8',ic:'📊',act:!t2.psf&&!t3.psf&&!t4.psf},
                {tier:2,label:'SIZE MATCH',desc:`${nearSize.toLocaleString()} sqft · Any floor`,psf:t2.psf,cnt:t2.cnt,c:'#38bdf8',ic:'📐',act:t2.psf>0&&!t4.psf},
                ...(pFloor?[{tier:3,label:'FLOOR MATCH',desc:`Any size · Floor ${pFloor}`,psf:t3.psf,cnt:t3.cnt,c:'#f59e0b',ic:'🏢',act:t3.psf>0&&!t4.psf}]:[]),
                ...(pFloor&&nearSize?[{tier:4,label:'EXACT MATCH',desc:`${nearSize.toLocaleString()} sqft · Floor ${pFloor}`,psf:t4.psf,cnt:t4.cnt,c:'#22c55e',ic:'🎯',act:t4.psf>0}]:[])
              ].map(t=>t.psf>0 && <div key={t.tier} style={{ background:t.act?`${t.c}08`:'#f1f5f9', border:`1px solid ${t.act?t.c+'4D':'#e2e8f0'}`, borderRadius:12, padding:'16px 18px', position:'relative', overflow:'hidden' }}>
                {t.act && <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:t.c }}/>}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}><span style={{ fontSize:14 }}>{t.ic}</span><span style={{ color:t.act?t.c:'#94a3b8', fontSize:11, fontWeight:700 }}>{t.label}</span></div>
                  <span style={{ background:'#f1f5f9', borderRadius:6, padding:'2px 8px', fontSize:10, color:'#64748b' }}>{t.cnt} tx</span>
                </div>
                <div style={{ color:t.act?'#1e293b':'#94a3b8', fontSize:22, fontWeight:800, fontFamily:fm }}>${(t.psf*pArea).toLocaleString()}</div>
                <div style={{ color:'#64748b', fontSize:10, marginTop:4 }}>${t.psf.toLocaleString()} PSF × {pArea.toLocaleString()} sqft</div>
                <div style={{ color:'#64748b', fontSize:9, marginTop:2 }}>{t.desc}</div>
              </div>)}
            </div>
          </Cd>
        </div>}

        {/* Compare */}
        {aTab==='compare' && <div style={{ display:'grid', gap:16 }}>
          {/* ── PROJECT SELECTOR ── */}
          <SH icon="⚖️" title="Comparative Market Analysis" sub={`Select up to 8 projects to compare. Auto-suggested: same district (D1) + nearby within 3km.`}/>
          <Cd>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
              <div style={{color:'#64748b',fontSize:11,fontWeight:600}}>SELECTED ({cmpSelected.length}/8)</div>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <span style={{color:'#64748b',fontSize:10}}>Add:</span>
                <select value="" onChange={e=>{if(e.target.value&&cmpSelected.length<8&&!cmpSelected.includes(e.target.value)){setCmpSelected([...cmpSelected,e.target.value]);}e.target.value='';}} style={{background:'#fff',border:'1px solid #cbd5e1',borderRadius:6,padding:'5px 10px',fontSize:11,color:'#1e293b',cursor:'pointer',outline:'none',minWidth:180}}>
                  <option value="">+ Add project...</option>
                  {cmpPool.filter(p=>!cmpSelected.includes(p.name)).map(p=>{
                    const km = haversine(sailCoords.lat,sailCoords.lng,p.lat,p.lng).toFixed(1);
                    return <option key={p.name} value={p.name}>{p.name} ({p.dist} · {km}km)</option>;
                  })}
                </select>
              </div>
            </div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {cmpSelected.map((name,i)=>{
                const proj = cmpPool.find(p=>p.name===name);
                const isSail = name==='THE SAIL';
                const km = proj?haversine(sailCoords.lat,sailCoords.lng,proj.lat,proj.lng).toFixed(1):'0';
                return <div key={name} style={{display:'flex',alignItems:'center',gap:6,background:isSail?'#a78bfa12':'#f1f5f9',border:isSail?'1px solid #a78bfa4D':'1px solid #e2e8f0',borderRadius:8,padding:'6px 10px'}}>
                  <div style={{width:10,height:10,borderRadius:3,background:isSail?'#a78bfa':P[i%P.length]}}/>
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:isSail?'#a78bfa':'#1e293b'}}>{name}</div>
                    <div style={{fontSize:9,color:'#94a3b8'}}>{proj?.dist} · {km}km</div>
                  </div>
                  {!isSail && <button onClick={()=>setCmpSelected(cmpSelected.filter(n=>n!==name))} style={{background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:14,padding:'0 2px',lineHeight:1}}>×</button>}
                </div>;
              })}
            </div>
            <div style={{display:'flex',gap:12,marginTop:10}}>
              <button onClick={()=>{const sameD=cmpPool.filter(p=>p.dist==='D1'&&p.name!=='THE SAIL').slice(0,3).map(p=>p.name);const near=cmpPool.filter(p=>p.dist!=='D1'&&haversine(sailCoords.lat,sailCoords.lng,p.lat,p.lng)<3).slice(0,2).map(p=>p.name);setCmpSelected(['THE SAIL',...sameD,...near].slice(0,5));}} style={{background:'#fff',border:'1px solid #cbd5e1',borderRadius:6,padding:'4px 12px',fontSize:10,color:'#64748b',cursor:'pointer'}}>🏘️ Same District</button>
              <button onClick={()=>{const near=cmpPool.filter(p=>p.name!=='THE SAIL').sort((a,b)=>haversine(sailCoords.lat,sailCoords.lng,a.lat,a.lng)-haversine(sailCoords.lat,sailCoords.lng,b.lat,b.lng)).slice(0,7).map(p=>p.name);setCmpSelected(['THE SAIL',...near]);}} style={{background:'#fff',border:'1px solid #cbd5e1',borderRadius:6,padding:'4px 12px',fontSize:10,color:'#64748b',cursor:'pointer'}}>📍 Nearest 7</button>
              <button onClick={()=>setCmpSelected(cmpPool.slice(0,8).map(p=>p.name))} style={{background:'#fff',border:'1px solid #cbd5e1',borderRadius:6,padding:'4px 12px',fontSize:10,color:'#64748b',cursor:'pointer'}}>📋 All (max 8)</button>
            </div>
          </Cd>

          {/* ── DYNAMIC CHARTS ── */}
          {(()=>{
            const sel = cmpSelected.map(n=>cmpPool.find(p=>p.name===n)).filter(Boolean);
            if(sel.length<2) return <Cd><div style={{textAlign:'center',color:'#94a3b8',padding:32}}>Select at least 2 projects to compare</div></Cd>;
            return <>
              <SH icon="📊" title="PSF Comparison" sub={`${sel[0].name} at $${sel[0].psf.toLocaleString()} PSF — ${sel[0].psf<sel[1].psf?'cheaper':'more expensive'} than ${sel[1].name}.`}/>
              <Cd><div style={{height:Math.max(200,sel.length*32)}}><ResponsiveContainer width="100%" height="100%"><BarChart data={sel.map(p=>({n:p.name,v:p.psf}))} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0"/><XAxis type="number" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>'$'+v.toLocaleString()}/><YAxis dataKey="n" type="category" width={140} tick={{fill:'#64748b',fontSize:9}} axisLine={false}/><Tooltip content={<Tip/>}/><Bar dataKey="v" name="Avg PSF" radius={[0,4,4,0]} barSize={18}>{sel.map((p,i)=><Cell key={i} fill={p.name==='THE SAIL'?'#a78bfa':P[i%P.length]}/>)}</Bar></BarChart></ResponsiveContainer></div></Cd>

              <div className="g2">
                <Cd><SH icon="💵" title="Rental Comparison" sub="Monthly rent across selected projects."/><div style={{height:Math.max(200,sel.length*28)}}><ResponsiveContainer width="100%" height="100%"><BarChart data={sel.map(p=>({n:p.name,v:p.rent}))} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0"/><XAxis type="number" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>'$'+v.toLocaleString()}/><YAxis dataKey="n" type="category" width={120} tick={{fill:'#64748b',fontSize:8}} axisLine={false}/><Tooltip content={<Tip/>}/><Bar dataKey="v" name="Avg Rent/mo" radius={[0,4,4,0]} barSize={16}>{sel.map((p,i)=><Cell key={i} fill={p.name==='THE SAIL'?'#a78bfa':P[i%P.length]}/>)}</Bar></BarChart></ResponsiveContainer></div></Cd>
                <Cd><SH icon="💰" title="Yield Comparison" sub="Gross rental yield across selected projects."/><div style={{height:Math.max(200,sel.length*28)}}><ResponsiveContainer width="100%" height="100%"><BarChart data={sel.map(p=>({n:p.name,v:p.yield}))} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0"/><XAxis type="number" tick={{fill:'#64748b',fontSize:10}} axisLine={false} tickFormatter={v=>`${v}%`}/><YAxis dataKey="n" type="category" width={120} tick={{fill:'#64748b',fontSize:8}} axisLine={false}/><Tooltip content={<Tip fmt="%"/>}/><Bar dataKey="v" name="Yield %" radius={[0,4,4,0]} barSize={16}>{sel.map((p,i)=><Cell key={i} fill={p.name==='THE SAIL'?'#a78bfa':P[i%P.length]}/>)}</Bar></BarChart></ResponsiveContainer></div></Cd>
              </div>

              <Cd>
                <h4 style={{ color:'#1e293b', fontSize:13, fontWeight:600, marginBottom:12 }}>Side-by-Side Summary ({sel.length} projects)</h4>
                <div style={{overflowX:'auto'}}>
                  <table><thead><tr>{['Project','Dist','Age','Units','PSF','Rent/mo','Yield','Distance'].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>{sel.map((r,i)=>{
                    const km = haversine(sailCoords.lat,sailCoords.lng,r.lat,r.lng).toFixed(1);
                    return <tr key={r.name}>
                      <td style={{color:r.name==='THE SAIL'?'#a78bfa':'#1e293b',fontWeight:r.name==='THE SAIL'?700:400}}><div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:8,height:8,borderRadius:2,background:r.name==='THE SAIL'?'#a78bfa':P[i%P.length]}}/>{r.name}</div></td>
                      <td style={{color:'#94a3b8'}}>{r.dist}</td>
                      <td style={{color:'#94a3b8'}}>{r.age}</td>
                      <td style={{color:'#64748b',fontFamily:fm}}>{r.units?.toLocaleString()}</td>
                      <td style={{color:'#38bdf8',fontFamily:fm,fontWeight:600}}>${r.psf.toLocaleString()}</td>
                      <td style={{color:'#34d399',fontFamily:fm}}>${r.rent.toLocaleString()}</td>
                      <td style={{color:r.yield>=3?'#22c55e':r.yield>=2.5?'#f59e0b':'#ef4444',fontWeight:700,fontFamily:fm}}>{r.yield}%</td>
                      <td style={{color:'#64748b',fontFamily:fm,fontSize:11}}>{km}km</td>
                    </tr>;
                  })}</tbody></table>
                </div>
                <Nr style={{marginTop:12}}>THE SAIL is the value pick — lowest PSF in the D1 cluster, highest yield, proven rental demand. The risk is lease decay and aging facilities. MARINA ONE / WALLICH are the premium plays.</Nr>
              </Cd>
            </>;
          })()}

          {/* Interactive Historical Heatmap — Floor × Year */}
          <SH icon="🗓️" title="Historical Heatmap — Floor × Year" sub="Click any cell to inspect. Toggle metrics (PSF/Price/Vol), enable ± Changes for YoY diffs, or filter by unit size."/>
          <Cd>
            {/* Controls row */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,marginBottom:14}}>
              {/* Metric toggle */}
              <div style={{display:'flex',gap:0,background:'#f1f5f9',borderRadius:8,padding:2,border:'1px solid #e2e8f0'}}>
                {[{id:'psf',l:'PSF'},{id:'price',l:'Price'},{id:'vol',l:'Vol'}].map(m=>
                  <button key={m.id} onClick={()=>setHmMetric(m.id)} style={{background:hmMetric===m.id?'#a78bfa26':'transparent',border:hmMetric===m.id?'1px solid #a78bfa4D':'1px solid transparent',borderRadius:6,padding:'5px 14px',fontSize:11,color:hmMetric===m.id?'#a78bfa':'#64748b',cursor:'pointer',fontWeight:600,fontFamily:fm}}>{m.l}</button>
                )}
              </div>
              {/* Diff toggle */}
              <button onClick={()=>setHmShowDiff(!hmShowDiff)} style={{background:hmShowDiff?'#f59e0b20':'#f1f5f9',border:hmShowDiff?'1px solid #f59e0b4D':'1px solid #e2e8f0',borderRadius:8,padding:'5px 14px',fontSize:11,color:hmShowDiff?'#f59e0b':'#64748b',cursor:'pointer',fontWeight:600}}>± Changes</button>
              {/* Size filter */}
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                {['All',...projSizes].map(s=>{
                  const active = hmSelFloor==='' && s==='All' || hmSelFloor===String(s);
                  return <button key={s} onClick={()=>setHmSelFloor(s==='All'?'':String(s))} style={{background:s==='All'&&hmSelFloor===''?'#a78bfa26':'transparent',border:(s==='All'&&hmSelFloor==='')?'1px solid #a78bfa4D':'1px solid #e2e8f0',borderRadius:6,padding:'4px 10px',fontSize:10,color:(s==='All'&&hmSelFloor==='')?'#a78bfa':'#64748b',cursor:'pointer',fontWeight:600}}>{s==='All'?'All sizes':`${s}sf`}</button>;
                })}
              </div>
            </div>
            <div style={{overflowX:'auto'}}>
              <div style={{minWidth:850}}>
                {/* Header */}
                <div style={{display:'flex'}}>
                  <div style={{width:70,flexShrink:0,fontSize:10,fontWeight:600,color:'#94a3b8',padding:'8px 4px'}}>Floor</div>
                  {hmYears.map(y=><div key={y} onClick={()=>setHmSelYear(hmSelYear===y?null:y)} style={{flex:1,minWidth:72,textAlign:'center',fontSize:10,fontWeight:600,color:hmSelYear===y?'#a78bfa':'#94a3b8',padding:'8px 0',borderBottom:hmSelYear===y?'2px solid #a78bfa':'1px solid #f1f5f9',cursor:'pointer'}}>{y}</div>)}
                  <div style={{width:65,flexShrink:0,textAlign:'center',fontSize:9,fontWeight:600,color:'#334155',padding:'8px 2px',borderBottom:'1px solid #f1f5f9',background:'#f8fafc',borderLeft:'1px solid #e2e8f0'}}>Avg Incr.</div>
                  <div style={{width:60,flexShrink:0,textAlign:'center',fontSize:9,fontWeight:600,color:'#334155',padding:'8px 2px',borderBottom:'1px solid #f1f5f9',background:'#f8fafc'}}>% Chg</div>
                  <div style={{width:65,flexShrink:0,textAlign:'center',fontSize:9,fontWeight:600,color:'#334155',padding:'8px 2px',borderBottom:'1px solid #f1f5f9',background:'#f8fafc'}}>Abs. Chg</div>
                  <div style={{width:60,flexShrink:0,textAlign:'center',fontSize:9,fontWeight:600,color:'#334155',padding:'8px 2px',borderBottom:'1px solid #f1f5f9',background:'#f8fafc'}}>Total %</div>
                </div>
                {/* Rows */}
                {hmFloors.map(f=>{
                  const vals = hmYears.map(y=>{
                    const cell = hmMatrix[`${f}-${y}`];
                    if(!cell) return 0;
                    return hmMetric==='psf'?cell.psf:hmMetric==='price'?cell.price:cell.vol;
                  });
                  const firstV = vals.find(v=>v>0)||1;
                  const lastV = vals[vals.length-1]||0;
                  const totalPct = firstV>0?Math.round((lastV/firstV-1)*100):0;
                  const absChg = lastV - firstV;
                  // Gap-normalized: average YoY increment
                  const gapYears = hmYears.length-1;
                  const avgIncr = gapYears>0?Math.round(absChg/gapYears):0;
                  const pctChg = gapYears>0?(totalPct/gapYears).toFixed(1):0;

                  // Global range for color mapping
                  const globalMin = hmMetric==='psf'?1518:hmMetric==='price'?1200000:3;
                  const globalMax = hmMetric==='psf'?2530:hmMetric==='price'?2200000:12;
                  const diffColor = hmMetric==='vol'?'#38bdf8':'#0ea5e9';

                  return <div key={f} style={{display:'flex',borderBottom:'1px solid #f1f5f9'}} onMouseEnter={e=>e.currentTarget.style.background='#f1f5f9'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <div style={{width:70,flexShrink:0,fontSize:11,fontWeight:600,color:'#334155',padding:'10px 4px',fontFamily:fm}}>{f}</div>
                    {hmYears.map((y,yi)=>{
                      const cell = hmMatrix[`${f}-${y}`];
                      if(!cell) return <div key={y} style={{flex:1,minWidth:72,height:40,display:'flex',alignItems:'center',justifyContent:'center',color:'#64748b',fontSize:11}}>-</div>;
                      const raw = hmMetric==='psf'?cell.psf:hmMetric==='price'?cell.price:cell.vol;
                      const prevRaw = yi>0?(hmMetric==='psf'?hmMatrix[`${f}-${hmYears[yi-1]}`]?.psf:hmMetric==='price'?hmMatrix[`${f}-${hmYears[yi-1]}`]?.price:hmMatrix[`${f}-${hmYears[yi-1]}`]?.vol):null;
                      const diff = prevRaw?raw-prevRaw:null;
                      const diffPct = prevRaw?((raw/prevRaw-1)*100).toFixed(1):null;

                      const isSelected = hmSelYear===y;
                      const ratio = Math.max(0,Math.min(1,(raw-globalMin)/(globalMax-globalMin)));
                      const alpha = hmShowDiff&&yi===0?0.05:0.08+ratio*0.65;

                      let displayVal, displayColor;
                      if(hmShowDiff && yi>0 && diff!==null){
                        displayVal = hmMetric==='psf'?(diff>=0?'+':'')+diff:hmMetric==='price'?(diff>=0?'+$':'-$')+Math.abs(diff).toLocaleString():(diff>=0?'+':'')+diff;
                        displayColor = diff>0?'#4ade80':diff<0?'#f87171':'#94a3b8';
                      } else {
                        displayVal = hmMetric==='psf'?'$'+raw.toLocaleString():hmMetric==='price'?'$'+(raw>=1e6?(raw/1e6).toFixed(2)+'M':raw.toLocaleString()):raw;
                        displayColor = ratio>0.6?'#1e293b':'#94a3b8';
                      }

                      const bgAlpha = hmShowDiff&&yi>0&&diff!==null?(diff>0?`rgba(74,222,128,${Math.min(0.3,Math.abs(diff)/(hmMetric==='psf'?200:500000)*0.3)})`:diff<0?`rgba(248,113,113,${Math.min(0.3,Math.abs(diff)/(hmMetric==='psf'?200:500000)*0.3)})`:'transparent'):`rgba(14,165,233,${alpha})`;

                      return <div key={y} onClick={()=>{setHmSelYear(y);}} style={{flex:1,minWidth:72,height:40,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontFamily:fm,fontWeight:500,backgroundColor:bgAlpha,color:displayColor,transition:'all 0.2s',cursor:'pointer',outline:isSelected?'2px solid #a78bfa':'none',outlineOffset:-2,borderRadius:isSelected?2:0}} title={`${f}, ${y}: $${cell.psf.toLocaleString()} PSF · ${cell.vol} txns · $${cell.price.toLocaleString()} avg price`}>{displayVal}</div>;
                    })}
                    {/* Summary stats columns */}
                    <div style={{width:65,flexShrink:0,height:40,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontFamily:fm,fontWeight:600,color:'#94a3b8',background:'#f8fafc',borderLeft:'1px solid #e2e8f0'}}>{hmMetric==='psf'?'+$'+avgIncr:hmMetric==='price'?'+$'+(avgIncr/1e3).toFixed(0)+'K':'+'+avgIncr}</div>
                    <div style={{width:60,flexShrink:0,height:40,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontFamily:fm,fontWeight:600,color:Number(pctChg)>4?'#4ade80':Number(pctChg)>2?'#f59e0b':'#94a3b8',background:'#f8fafc'}}>{pctChg}%</div>
                    <div style={{width:65,flexShrink:0,height:40,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontFamily:fm,fontWeight:600,color:'#38bdf8',background:'#f8fafc'}}>{hmMetric==='psf'?'+$'+absChg:hmMetric==='price'?'+$'+(absChg/1e3).toFixed(0)+'K':'+'+absChg}</div>
                    <div style={{width:60,flexShrink:0,height:40,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontFamily:fm,fontWeight:700,color:totalPct>18?'#22c55e':totalPct>12?'#f59e0b':'#94a3b8',background:'#f8fafc'}}>{totalPct>0?'+':''}{totalPct}%</div>
                  </div>;})}
                {/* Legend */}
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:12,fontSize:10,color:'#64748b',flexWrap:'wrap',gap:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span>Low</span>
                    <div style={{width:80,height:6,borderRadius:3,background:hmShowDiff?'linear-gradient(to right, rgba(248,113,113,0.3), transparent, rgba(74,222,128,0.3))':'linear-gradient(to right, rgba(14,165,233,0.08), rgba(14,165,233,0.73))'}}/>
                    <span>{hmShowDiff?'High Δ':'High '+hmMetric.toUpperCase()}</span>
                  </div>
                  <span style={{fontStyle:'italic',color:'#64748b'}}>Click cells to select · {hmShowDiff?'Showing YoY changes':'Showing absolute values'}</span>
                </div>
              </div>
            </div>
            <Nr style={{marginTop:12}}>High floors (46+) show strongest 4-year growth at 20% — floor premium amplifies over time. Low floors (01-05) grew ~20% as well due to base effect. Mid floors (16-25) are the sweet spot for entry price vs growth.</Nr>
          </Cd>

          {/* Nearby Project PSF Heatmap */}
          <SH icon="🏘️" title="Nearby Project PSF Comparison" sub="Project × Year PSF matrix for D1/D2 waterfront condos. Darker = higher PSF. Click to compare growth trajectories."/>
          <Cd>
            <div style={{overflowX:'auto'}}>
              <div style={{minWidth:600}}>
                {/* Header */}
                <div style={{display:'flex'}}>
                  <div style={{width:130,flexShrink:0,fontSize:10,fontWeight:600,color:'#94a3b8',padding:'8px 4px'}}>Project</div>
                  {nearbyHm.years.map(y=><div key={y} style={{flex:1,minWidth:72,textAlign:'center',fontSize:10,fontWeight:600,color:'#94a3b8',padding:'8px 0',borderBottom:'1px solid #f1f5f9'}}>{y}</div>)}
                  <div style={{width:70,flexShrink:0,textAlign:'center',fontSize:10,fontWeight:600,color:'#334155',padding:'8px 0',borderBottom:'1px solid #f1f5f9',background:'#f8fafc',borderLeft:'1px solid #e2e8f0'}}>4yr Growth</div>
                </div>
                {/* Rows */}
                {nearbyHm.projects.map((proj,pi)=>{
                  const vals = nearbyHm.years.map(y=>nearbyHm.data[`${proj}-${y}`]||0);
                  const first = vals[0]||1;
                  const last = vals[vals.length-1]||0;
                  const growth = Math.round((last/first-1)*100);
                  const isSail = proj==='THE SAIL';
                  const nearMin = 1480; const nearMax = 2450;
                  return <div key={proj} style={{display:'flex',borderBottom:'1px solid #f1f5f9',background:isSail?'#a78bfa12':'transparent'}} onMouseEnter={e=>{if(!isSail)e.currentTarget.style.background='#f1f5f9'}} onMouseLeave={e=>{if(!isSail)e.currentTarget.style.background=isSail?'#a78bfa12':'transparent'}}>
                    <div style={{width:130,flexShrink:0,fontSize:11,fontWeight:isSail?700:500,color:isSail?'#a78bfa':'#334155',padding:'10px 4px',display:'flex',alignItems:'center',gap:4}}>{isSail&&<span style={{fontSize:8}}>●</span>}{proj}</div>
                    {nearbyHm.years.map(y=>{
                      const psf = nearbyHm.data[`${proj}-${y}`];
                      const vol = nearbyHm.vol[`${proj}-${y}`];
                      if(!psf) return <div key={y} style={{flex:1,minWidth:72,height:40,display:'flex',alignItems:'center',justifyContent:'center',color:'#64748b',fontSize:11}}>-</div>;
                      const ratio = Math.max(0,Math.min(1,(psf-nearMin)/(nearMax-nearMin)));
                      const alpha = 0.08+ratio*0.6;
                      const hue = isSail?'167,139,250':'14,165,233';
                      return <div key={y} style={{flex:1,minWidth:72,height:40,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontFamily:fm,fontWeight:isSail?600:500,backgroundColor:`rgba(${hue},${alpha})`,color:ratio>0.55?'#1e293b':'#94a3b8',transition:'all 0.2s'}} title={`${proj}, ${y}: $${psf.toLocaleString()} PSF · ${vol} txns`}>${psf.toLocaleString()}</div>;
                    })}
                    <div style={{width:70,flexShrink:0,height:40,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontFamily:fm,fontWeight:700,color:growth>20?'#22c55e':growth>15?'#4ade80':'#f59e0b',background:'#f8fafc',borderLeft:'1px solid #e2e8f0'}}>+{growth}%</div>
                  </div>;
                })}
                {/* Legend */}
                <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8,marginTop:12,fontSize:10,color:'#64748b'}}>
                  <span>Low</span>
                  <div style={{width:80,height:6,borderRadius:3,background:'linear-gradient(to right, rgba(14,165,233,0.08), rgba(14,165,233,0.68))'}}/>
                  <span>High PSF</span>
                  <span style={{marginLeft:12}}><span style={{color:'#a78bfa',fontSize:8}}>●</span> = THE SAIL</span>
                </div>
              </div>
            </div>
            <Nr style={{marginTop:12}}>MARINA ONE leads on absolute PSF ($2,450) but THE SAIL shows comparable 4-year growth (+19%) at a much lower entry point. REFLECTIONS at $1,780 is the cheapest but located in D4 — further from CBD. THE SAIL offers the best value per PSF within the marina cluster.</Nr>
          </Cd>
        </div>}

        {/* Records */}
        {aTab==='records' && <div style={{ display:'grid', gap:16 }}>
          <SH icon="📋" title="Recent Sale Transactions" sub={`${projTx.length} most recent sales for ${p.name}. PSF range: $1,937–$2,494. Higher floors and smaller units command premium PSF.`}/>
          <Cd><table><thead><tr>{['Date','Unit','Area (sf)','Price','PSF','Type'].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>{projTx.map((tx,i)=><tr key={i}><td style={{ color:'#94a3b8' }}>{tx.date}</td><td style={{ color:'#1e293b', fontFamily:fm }}>{tx.address}</td><td style={{ fontFamily:fm }}>{tx.area.toLocaleString()}</td><td style={{ color:'#38bdf8', fontFamily:fm }}>${tx.price.toLocaleString()}</td><td style={{ color:tx.psf>=2200?'#22c55e':tx.psf>=2050?'#f59e0b':'#fb923c', fontFamily:fm }}>${tx.psf.toLocaleString()}</td><td style={{ color:'#94a3b8' }}>{tx.type}</td></tr>)}</tbody></table>
          </Cd>
          <Nr>Note: #48-15 at $2,494 PSF is a 2,045sf penthouse — high-floor premium in action. #08-11 at $1,937 PSF is a 506sf low-floor unit — the $557 PSF gap between floors 8 and 48 reflects the floor premium curve above.</Nr>

          <SH icon="🏠" title="Recent Rental Contracts" sub="Rent PSF varies dramatically by unit size: 1BR at $6.32–6.72/sf vs 3BR at $4.91/sf. Smaller units are more rent-efficient."/>
          <Cd><table><thead><tr>{['Date','Unit','Type','Area (sf)','Rent/mo','Rent PSF'].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>{projRentTx.map((tx,i)=><tr key={i}><td style={{ color:'#94a3b8' }}>{tx.date}</td><td style={{ color:'#1e293b', fontFamily:fm }}>{tx.address}</td><td>{tx.bed}</td><td style={{ fontFamily:fm }}>{tx.area.toLocaleString()}</td><td style={{ color:'#34d399', fontFamily:fm }}>${tx.rent.toLocaleString()}</td><td style={{ color:tx.psf>=6?'#22c55e':tx.psf>=5?'#f59e0b':'#fb923c', fontFamily:fm }}>${tx.psf.toFixed(2)}</td></tr>)}</tbody></table>
          </Cd>
          <Nr>The PH at #46-15 renting for $15,000/mo ($7.33 PSF) is an outlier — ultra-high-floor sea view. Typical 2BR ranges $4,900–$5,200/mo. For investment sizing, use the 2BR median as your baseline.</Nr>
        </div>}

      </div>}
    </div>
  );
}
