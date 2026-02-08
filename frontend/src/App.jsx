import React, { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend, ScatterChart, Scatter, ZAxis, AreaChart, Area, ComposedChart, ReferenceLine } from 'recharts';
import { getTransactions } from './services/api';

const COLORS = ['#0ea5e9','#6366f1','#8b5cf6','#f43f5e','#10b981','#f59e0b','#ec4899','#14b8a6','#ef4444','#3b82f6','#a855f7','#d946ef','#06b6d4','#84cc16','#fb923c','#64748b','#e11d48','#0d9488','#7c3aed','#ca8a04','#dc2626','#2563eb','#9333ea','#c026d3','#0891b2','#65a30d','#ea580c','#475569','#be123c','#0f766e'];

const SEGMENT_COLORS_MAP = { CCR: '#ef4444', RCR: '#f59e0b', OCR: '#22c55e' };

const CustomTooltip = ({ active, payload, label, prefix = '$', suffix = '' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'rgba(15,23,42,0.95)', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
      <p style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || '#fff', fontSize: 12, margin: '2px 0' }}>
          {p.name}: {prefix}{typeof p.value === 'number' ? p.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : p.value}{suffix}
        </p>
      ))}
    </div>
  );
};

export default function App() {
  const [allTransactions, setAllTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [selectedDistricts, setSelectedDistricts] = useState([]);
  const [selectedYears, setSelectedYears] = useState([]);
  const [segmentFilter, setSegmentFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [tenureFilter, setTenureFilter] = useState('All');
  const [projectFilter, setProjectFilter] = useState('All');
  const [projectSearch, setProjectSearch] = useState('');
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showDistrictPanel, setShowDistrictPanel] = useState(false);
  const [showYearPanel, setShowYearPanel] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [heatmapMetric, setHeatmapMetric] = useState('psf');
  const [showDiff, setShowDiff] = useState(false);

  // Load data from API
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const txns = await getTransactions();
        setAllTransactions(txns);
      } catch (err) {
        console.error('Failed to load data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Derived filter options
  const allYears = useMemo(() => [...new Set(allTransactions.map(t => t.year))].sort(), [allTransactions]);
  const districts = useMemo(() => [...new Set(allTransactions.map(t => t.district))].sort(), [allTransactions]);
  const segments = ['All', 'CCR', 'RCR', 'OCR'];
  const types = useMemo(() => ['All', ...new Set(allTransactions.map(t => t.propertyType))], [allTransactions]);
  const tenures = useMemo(() => ['All', ...new Set(allTransactions.map(t => t.tenure))], [allTransactions]);
  const projects = useMemo(() => ['All', ...new Set(allTransactions.map(t => t.project))].sort(), [allTransactions]);

  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return projects;
    const q = projectSearch.toLowerCase();
    return projects.filter(p => p === 'All' || p.toLowerCase().includes(q));
  }, [projects, projectSearch]);

  const toggleDistrict = (d) => setSelectedDistricts(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  const toggleYear = (y) => setSelectedYears(prev => prev.includes(y) ? prev.filter(x => x !== y) : [...prev, y]);

  const normalizeTenure = (tenure) => {
    if (!tenure) return 'Leasehold';
    const t = tenure.toLowerCase();
    if (t === 'fh' || t === 'freehold' || t.includes('freehold')) return 'Freehold';
    return 'Leasehold';
  };

  const filtered = useMemo(() => {
    return allTransactions.filter(t =>
      (selectedDistricts.length === 0 || selectedDistricts.includes(t.district)) &&
      (selectedYears.length === 0 || selectedYears.includes(t.year)) &&
      (segmentFilter === 'All' || t.marketSegment === segmentFilter) &&
      (typeFilter === 'All' || t.propertyType === typeFilter) &&
      (tenureFilter === 'All' || t.tenure === tenureFilter) &&
      (projectFilter === 'All' || t.project === projectFilter)
    );
  }, [allTransactions, selectedDistricts, selectedYears, segmentFilter, typeFilter, tenureFilter, projectFilter]);

  const yearRangeLabel = useMemo(() => {
    if (selectedYears.length === 0 && allYears.length > 0) return `${allYears[0]}–${allYears[allYears.length - 1]}`;
    const sorted = [...selectedYears].sort();
    if (sorted.length === 1) return `${sorted[0]}`;
    return sorted.length > 0 ? `${sorted[0]}–${sorted[sorted.length - 1]}` : 'All';
  }, [selectedYears, allYears]);

  const latestFilteredYear = useMemo(() => {
    if (!filtered.length) return null;
    return Math.max(...filtered.map(t => t.year));
  }, [filtered]);

  // ===== COMPUTED DATA =====
  const stats = useMemo(() => {
    if (!filtered.length) return { count: 0, totalVol: 0, avgPrice: 0, avgPsf: 0, medianPsf: 0, minPsf: 0, maxPsf: 0 };
    const psfs = filtered.map(t => t.psf).sort((a, b) => a - b);
    return {
      count: filtered.length,
      totalVol: filtered.reduce((s, t) => s + t.priceNum, 0),
      avgPrice: filtered.reduce((s, t) => s + t.priceNum, 0) / filtered.length,
      avgPsf: filtered.reduce((s, t) => s + t.psf, 0) / filtered.length,
      medianPsf: psfs[Math.floor(psfs.length / 2)],
      minPsf: psfs[0],
      maxPsf: psfs[psfs.length - 1],
    };
  }, [filtered]);

  const districtTrendData = useMemo(() => {
    const map = {};
    filtered.forEach(t => {
      if (!map[t.contractDate]) map[t.contractDate] = {};
      if (!map[t.contractDate][t.district]) map[t.contractDate][t.district] = [];
      map[t.contractDate][t.district].push(t.psf);
    });
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([date, dists]) => {
      const row = { date };
      Object.entries(dists).forEach(([d, vals]) => { row[`D${d}`] = Math.round((vals.reduce((s,v) => s+v, 0) / vals.length) * 100) / 100; });
      return row;
    });
  }, [filtered]);

  const activeDistricts = useMemo(() => { const s = new Set(); filtered.forEach(t => s.add(t.district)); return [...s].sort(); }, [filtered]);

  const yoyData = useMemo(() => {
    const map = {};
    filtered.forEach(t => { if (!map[t.year]) map[t.year] = []; map[t.year].push(t.psf); });
    const years = Object.keys(map).sort();
    return years.map((y, i) => {
      const avg = map[y].reduce((s,v) => s+v, 0) / map[y].length;
      const prevAvg = i > 0 ? map[years[i-1]].reduce((s,v) => s+v, 0) / map[years[i-1]].length : null;
      return { year: y, avgPsf: Math.round(avg * 100) / 100, count: map[y].length, change: prevAvg ? Math.round(((avg - prevAvg) / prevAvg) * 10000) / 100 : null };
    });
  }, [filtered]);

  const segmentData = useMemo(() => {
    const map = {};
    filtered.forEach(t => { if (!map[t.marketSegment]) map[t.marketSegment] = { psfs: [], count: 0 }; map[t.marketSegment].psfs.push(t.psf); map[t.marketSegment].count++; });
    return Object.entries(map).map(([seg, d]) => ({ name: seg, avgPsf: Math.round((d.psfs.reduce((s,v) => s+v, 0) / d.psfs.length) * 100) / 100, count: d.count }));
  }, [filtered]);

  const scatterData = useMemo(() => {
    return ['CCR', 'RCR', 'OCR'].map(seg => ({ segment: seg, data: filtered.filter(t => t.marketSegment === seg).slice(0, 200).map(t => ({ area: Math.round(t.areaSqft), psf: t.psf, price: t.priceNum, project: t.project })) }));
  }, [filtered]);

  const psfDistribution = useMemo(() => {
    const buckets = {};
    filtered.forEach(t => { const bucket = Math.floor(t.psf / 500) * 500; buckets[bucket] = (buckets[bucket] || 0) + 1; });
    return Object.entries(buckets).sort(([a],[b]) => Number(a) - Number(b)).map(([b, c]) => ({ range: `$${Number(b).toLocaleString()}-${(Number(b)+499).toLocaleString()}`, count: c }));
  }, [filtered]);

  const cumulativeData = useMemo(() => {
    const map = {};
    filtered.forEach(t => { map[t.contractDate] = (map[t.contractDate] || 0) + t.priceNum; });
    let cum = 0;
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([date, vol]) => { cum += vol; return { date, volume: vol, cumulative: cum }; });
  }, [filtered]);

  const typeAnalysis = useMemo(() => {
    const map = {};
    filtered.forEach(t => { if (!map[t.propertyType]) map[t.propertyType] = { psfs: [], count: 0 }; map[t.propertyType].psfs.push(t.psf); map[t.propertyType].count++; });
    return Object.entries(map).map(([type, d]) => ({ name: type, avgPsf: Math.round((d.psfs.reduce((s,v) => s+v, 0) / d.psfs.length) * 100) / 100, count: d.count }));
  }, [filtered]);

  const tenureAnalysis = useMemo(() => {
    const map = {};
    filtered.forEach(t => { const ten = normalizeTenure(t.tenure); if (!map[ten]) map[ten] = { psfs: [], count: 0 }; map[ten].psfs.push(t.psf); map[ten].count++; });
    return Object.entries(map).map(([ten, d]) => ({ name: ten, avgPsf: Math.round((d.psfs.reduce((s,v) => s+v, 0) / d.psfs.length) * 100) / 100, count: d.count }));
  }, [filtered]);

  const floorPremium = useMemo(() => {
    const map = {};
    filtered.forEach(t => { if (!map[t.floorRange]) map[t.floorRange] = []; map[t.floorRange].push(t.psf); });
    const floors = ["01-05","06-10","11-15","16-20","21-25","26-30","31-35","36-40","41-45","46-50","51-55","56-60"];
    let prev = null;
    return floors.filter(f => map[f]).map(f => {
      const avg = map[f].reduce((s,v) => s+v, 0) / map[f].length;
      const premDollar = prev ? avg - prev : 0;
      const premPct = prev ? ((avg - prev) / prev) * 100 : 0;
      prev = avg;
      return { floor: f, avgPsf: Math.round(avg * 100) / 100, count: map[f].length, premiumDollar: Math.round(premDollar * 100) / 100, premiumPct: Math.round(premPct * 100) / 100 };
    });
  }, [filtered]);

  const topProjects = useMemo(() => {
    const map = {};
    filtered.forEach(t => { if (!map[t.project]) map[t.project] = { count: 0, totalVol: 0, psfs: [] }; map[t.project].count++; map[t.project].totalVol += t.priceNum; map[t.project].psfs.push(t.psf); });
    return Object.entries(map).map(([name, d]) => ({ name: name.length > 22 ? name.substring(0,22) + '…' : name, fullName: name, count: d.count, volume: d.totalVol, avgPsf: Math.round((d.psfs.reduce((s,v) => s+v, 0) / d.psfs.length) * 100) / 100 })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filtered]);

  const districtYoY = useMemo(() => {
    const map = {};
    filtered.forEach(t => { const key = `${t.district}-${t.year}`; if (!map[key]) map[key] = { district: t.district, year: t.year, psfs: [] }; map[key].psfs.push(t.psf); });
    const yearMap = {};
    Object.values(map).forEach(d => { if (!yearMap[d.year]) yearMap[d.year] = {}; yearMap[d.year][`D${d.district}`] = Math.round((d.psfs.reduce((s,v) => s+v, 0) / d.psfs.length) * 100) / 100; });
    return Object.entries(yearMap).sort(([a],[b]) => a.localeCompare(b)).map(([year, dists]) => ({ year, ...dists }));
  }, [filtered]);

  // ===== HELPERS =====
  const tabs = [{ id: 'overview', label: '📊 Overview' }, { id: 'districts', label: '📍 Districts' }, { id: 'advanced', label: '📈 Advanced' }, { id: 'floor', label: '🏢 Floor Analysis' }];
  const formatCurrency = (v) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const formatCompactNumber = (v) => { const abs = Math.abs(v); const sign = v < 0 ? '-' : ''; if (abs >= 1e6) return `${sign}${(abs/1e6).toFixed(2)}M`; if (abs >= 1e3) return `${sign}${(abs/1e3).toFixed(0)}K`; return `${sign}${Math.round(abs)}`; };
  
  const getHeatmapColor = (val, min, max) => { if (max === min) return 'rgba(14,165,233,0.3)'; const ratio = (val - min) / (max - min); return `rgba(14,165,233,${0.1 + ratio * 0.8})`; };
  const getHeatmapTextColor = (val, min, max) => { if (max === min) return '#e2e8f0'; return ((val - min) / (max - min)) > 0.6 ? '#ffffff' : '#cbd5e1'; };
  const getDiffColor = (diff, minD, maxD) => { if (diff === 0) return 'rgba(241,245,249,0.3)'; if (diff > 0) { const r = maxD === 0 ? 0.5 : Math.min(diff / maxD, 1); return `rgba(34,197,94,${0.1 + r * 0.6})`; } else { const r = minD === 0 ? 0.5 : Math.min(Math.abs(diff) / Math.abs(minD), 1); return `rgba(239,68,68,${0.1 + r * 0.6})`; } };
  const getDiffTextColor = (diff, minD, maxD) => { if (diff > 0) { return (maxD === 0 ? 0.5 : Math.min(diff / maxD, 1)) > 0.5 ? '#ffffff' : '#4ade80'; } else { return (minD === 0 ? 0.5 : Math.min(Math.abs(diff) / Math.abs(minD), 1)) > 0.5 ? '#ffffff' : '#f87171'; } };

  // Heatmap matrix
  const matrixData = useMemo(() => {
    const map = new Map();
    const floorOrder = ["01-05","06-10","11-15","16-20","21-25","26-30","31-35","36-40","41-45","46-50","51-55","56-60"];
    const yearSet = new Set(); const floorSet = new Set();
    filtered.forEach(t => { const key = `${t.floorRange}-${t.year}`; yearSet.add(t.year); floorSet.add(t.floorRange); if (!map.has(key)) map.set(key, { totalPsf: 0, totalPrice: 0, count: 0 }); const cell = map.get(key); cell.totalPsf += t.psf; cell.totalPrice += t.priceNum; cell.count++; });
    const cols = [...yearSet].sort(); const rows = floorOrder.filter(f => floorSet.has(f));
    let minPsf = Infinity, maxPsf = -Infinity, minPrice = Infinity, maxPrice = -Infinity, minVol = Infinity, maxVol = -Infinity;
    map.forEach(cell => { const ap = cell.totalPsf / cell.count; const apr = cell.totalPrice / cell.count; minPsf = Math.min(minPsf, ap); maxPsf = Math.max(maxPsf, ap); minPrice = Math.min(minPrice, apr); maxPrice = Math.max(maxPrice, apr); minVol = Math.min(minVol, cell.count); maxVol = Math.max(maxVol, cell.count); });
    const diffMap = new Map(); let minDiffPsf = 0, maxDiffPsf = 0, minDiffPrice = 0, maxDiffPrice = 0, minDiffVol = 0, maxDiffVol = 0;
    rows.forEach(floor => { cols.forEach((year, yi) => { const key = `${floor}-${year}`; if (yi === 0) { diffMap.set(key, { isBase: true }); } else { const cell = map.get(key); const prevCell = map.get(`${floor}-${cols[yi-1]}`); if (cell && prevCell) { const dp = (cell.totalPsf/cell.count) - (prevCell.totalPsf/prevCell.count); const dpr = (cell.totalPrice/cell.count) - (prevCell.totalPrice/prevCell.count); const dv = cell.count - prevCell.count; diffMap.set(key, { isBase: false, diffPsf: dp, diffPrice: dpr, diffVol: dv }); minDiffPsf = Math.min(minDiffPsf, dp); maxDiffPsf = Math.max(maxDiffPsf, dp); minDiffPrice = Math.min(minDiffPrice, dpr); maxDiffPrice = Math.max(maxDiffPrice, dpr); minDiffVol = Math.min(minDiffVol, dv); maxDiffVol = Math.max(maxDiffVol, dv); } else { diffMap.set(key, { isBase: false }); } } }); });
    const computeRowStats = (getValue) => { const sm = new Map(); rows.forEach(floor => { const vals = []; cols.forEach(yr => { const c = map.get(`${floor}-${yr}`); if (c) vals.push(getValue(c)); }); if (vals.length < 2) { sm.set(floor, { avgIncrement: 0, avgPercChange: 0, totalChangeVal: 0, totalChangePerc: 0 }); } else { const inc = []; const pc = []; for (let i = 1; i < vals.length; i++) { inc.push(vals[i]-vals[i-1]); if (vals[i-1] !== 0) pc.push(((vals[i]-vals[i-1])/vals[i-1])*100); } sm.set(floor, { avgIncrement: inc.length ? inc.reduce((s,v)=>s+v,0)/inc.length : 0, avgPercChange: pc.length ? pc.reduce((s,v)=>s+v,0)/pc.length : 0, totalChangeVal: vals[vals.length-1]-vals[0], totalChangePerc: vals[0] !== 0 ? ((vals[vals.length-1]-vals[0])/vals[0])*100 : 0 }); } }); return sm; };
    return { map, diffMap, cols, rows, minPsf, maxPsf, minPrice, maxPrice, minVol, maxVol, minDiffPsf, maxDiffPsf, minDiffPrice, maxDiffPrice, minDiffVol, maxDiffVol, rowStatsPsf: computeRowStats(c => c.totalPsf/c.count), rowStatsPrice: computeRowStats(c => c.totalPrice/c.count), rowStatsVol: computeRowStats(c => c.count) };
  }, [filtered]);

  // ===== LOADING / ERROR STATES =====
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ width: 48, height: 48, border: '3px solid rgba(56,189,248,0.2)', borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#94a3b8', fontSize: 14 }}>Loading URA transaction data...</p>
        <p style={{ color: '#475569', fontSize: 12 }}>Fetching from all batches</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h2 style={{ color: '#f87171', fontSize: 18, fontWeight: 600 }}>Failed to Load Data</h2>
        <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', maxWidth: 400 }}>{error}</p>
        <button onClick={() => window.location.reload()} style={{ background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, cursor: 'pointer' }}>Retry</button>
      </div>
    );
  }

  // ===== RENDER =====
  const bs = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 12px', color: '#e2e8f0', fontSize: 12, cursor: 'pointer', outline: 'none' };
  const cardStyle = { background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 20, border: '1px solid rgba(255,255,255,0.06)' };

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: '#f1f5f9', fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}><span style={{ color: '#38bdf8' }}>URA</span> Property Analytics</h1>
            <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>Singapore Private Residential Transactions • {allTransactions.length.toLocaleString()} records</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ background: '#22c55e', width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
            <span style={{ color: '#94a3b8', fontSize: 12 }}>Live Data</span>
          </div>
        </div>

        {/* Click-away overlay */}
        {(showDistrictPanel || showProjectDropdown || showYearPanel) && (
          <div onClick={() => { setShowDistrictPanel(false); setShowProjectDropdown(false); setShowYearPanel(false); }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} />
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'flex-start', position: 'relative', zIndex: 45 }}>
          {/* District Checkbox */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => { setShowDistrictPanel(!showDistrictPanel); setShowProjectDropdown(false); setShowYearPanel(false); }} style={{ ...bs, minWidth: 140, textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span>District: {selectedDistricts.length === 0 ? 'All' : selectedDistricts.length === 1 ? `D${selectedDistricts[0]}` : `${selectedDistricts.length} selected`}</span>
              <span style={{ fontSize: 10, opacity: 0.6 }}>▼</span>
            </button>
            {showDistrictPanel && (
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 12, zIndex: 50, width: 280, maxHeight: 320, overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Districts</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setSelectedDistricts([...districts])} style={{ background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 5, padding: '2px 8px', color: '#38bdf8', fontSize: 10, cursor: 'pointer', fontWeight: 500 }}>All</button>
                    <button onClick={() => setSelectedDistricts([])} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '2px 8px', color: '#94a3b8', fontSize: 10, cursor: 'pointer', fontWeight: 500 }}>Clear</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  {districts.map(d => (
                    <label key={d} onClick={() => toggleDistrict(d)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 6, cursor: 'pointer', background: selectedDistricts.includes(d) ? 'rgba(56,189,248,0.08)' : 'transparent' }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, border: selectedDistricts.includes(d) ? '2px solid #38bdf8' : '2px solid rgba(255,255,255,0.2)', background: selectedDistricts.includes(d) ? '#38bdf8' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {selectedDistricts.includes(d) && <span style={{ color: '#0f172a', fontSize: 10, fontWeight: 700 }}>✓</span>}
                      </div>
                      <span style={{ color: selectedDistricts.includes(d) ? '#e2e8f0' : '#94a3b8', fontSize: 12 }}>D{d}</span>
                    </label>
                  ))}
                </div>
                <button onClick={() => setShowDistrictPanel(false)} style={{ width: '100%', marginTop: 10, padding: '6px 0', background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 6, color: '#38bdf8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Done</button>
              </div>
            )}
          </div>

          {/* Year Checkbox */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => { setShowYearPanel(!showYearPanel); setShowDistrictPanel(false); setShowProjectDropdown(false); }} style={{ ...bs, minWidth: 130, textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span>Year: {selectedYears.length === 0 ? 'All' : selectedYears.length === 1 ? selectedYears[0] : `${selectedYears.length} selected`}</span>
              <span style={{ fontSize: 10, opacity: 0.6 }}>▼</span>
            </button>
            {showYearPanel && (
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 12, zIndex: 50, width: 200, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Years</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setSelectedYears([...allYears])} style={{ background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 5, padding: '2px 8px', color: '#38bdf8', fontSize: 10, cursor: 'pointer', fontWeight: 500 }}>All</button>
                    <button onClick={() => setSelectedYears([])} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '2px 8px', color: '#94a3b8', fontSize: 10, cursor: 'pointer', fontWeight: 500 }}>Clear</button>
                    <button onClick={() => setSelectedYears([allYears[allYears.length - 1]])} style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 5, padding: '2px 8px', color: '#34d399', fontSize: 10, cursor: 'pointer', fontWeight: 500 }}>Latest</button>
                  </div>
                </div>
                {allYears.map(y => (
                  <label key={y} onClick={() => toggleYear(y)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 6, cursor: 'pointer', background: selectedYears.includes(y) ? 'rgba(56,189,248,0.08)' : 'transparent' }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, border: selectedYears.includes(y) ? '2px solid #38bdf8' : '2px solid rgba(255,255,255,0.2)', background: selectedYears.includes(y) ? '#38bdf8' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {selectedYears.includes(y) && <span style={{ color: '#0f172a', fontSize: 10, fontWeight: 700 }}>✓</span>}
                    </div>
                    <span style={{ color: selectedYears.includes(y) ? '#e2e8f0' : '#94a3b8', fontSize: 12 }}>{y}</span>
                  </label>
                ))}
                <button onClick={() => setShowYearPanel(false)} style={{ width: '100%', marginTop: 10, padding: '6px 0', background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 6, color: '#38bdf8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Done</button>
              </div>
            )}
          </div>

          {/* Segment, Type, Tenure */}
          {[{ label: 'Segment', value: segmentFilter, set: setSegmentFilter, opts: segments }, { label: 'Type', value: typeFilter, set: setTypeFilter, opts: types }, { label: 'Tenure', value: tenureFilter, set: setTenureFilter, opts: tenures }].map(f => (
            <select key={f.label} value={f.value} onChange={e => f.set(e.target.value)} style={{ ...bs, minWidth: 100 }}>
              {f.opts.map(o => <option key={o} value={o}>{f.label}: {o}</option>)}
            </select>
          ))}

          {/* Searchable Project */}
          <div style={{ position: 'relative', minWidth: 240 }}>
            <div onClick={() => { setShowProjectDropdown(!showProjectDropdown); setShowDistrictPanel(false); setShowYearPanel(false); }} style={{ ...bs, padding: '0px 4px', display: 'flex', alignItems: 'center' }}>
              <span style={{ color: '#64748b', fontSize: 12, padding: '6px 8px', flexShrink: 0 }}>🔍</span>
              <input type="text" placeholder={projectFilter === 'All' ? `Project: All (${projects.length - 1})` : projectFilter} value={projectSearch}
                onChange={e => { setProjectSearch(e.target.value); setShowProjectDropdown(true); }}
                onFocus={() => { setShowProjectDropdown(true); setShowDistrictPanel(false); setShowYearPanel(false); }}
                style={{ background: 'transparent', border: 'none', outline: 'none', color: '#e2e8f0', fontSize: 12, padding: '6px 4px', flex: 1, width: '100%', minWidth: 0 }} />
              {projectFilter !== 'All' && <button onClick={(e) => { e.stopPropagation(); setProjectFilter('All'); setProjectSearch(''); }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 4, color: '#94a3b8', fontSize: 10, padding: '2px 6px', cursor: 'pointer', flexShrink: 0, marginRight: 4 }}>✕</button>}
            </div>
            {showProjectDropdown && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, zIndex: 50, maxHeight: 280, overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
                {filteredProjects.length === 0 ? <div style={{ padding: '16px 12px', color: '#64748b', fontSize: 12, textAlign: 'center' }}>No projects found</div> :
                  filteredProjects.slice(0, 50).map(p => (
                    <div key={p} onClick={() => { setProjectFilter(p); setProjectSearch(''); setShowProjectDropdown(false); }}
                      style={{ padding: '8px 14px', fontSize: 12, cursor: 'pointer', color: p === projectFilter ? '#38bdf8' : '#cbd5e1', background: p === projectFilter ? 'rgba(56,189,248,0.1)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'} onMouseLeave={e => e.currentTarget.style.background = p === projectFilter ? 'rgba(56,189,248,0.1)' : 'transparent'}>
                      {p === 'All' ? `All Projects (${projects.length - 1})` : p}
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        </div>

        {/* Chips */}
        {(selectedDistricts.length > 0 || selectedYears.length > 0) && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontSize: 11, marginRight: 4 }}>Filtered:</span>
            {selectedYears.sort((a,b)=>a-b).map(y => <span key={`y-${y}`} style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#34d399', display: 'flex', alignItems: 'center', gap: 4 }}>{y}<span onClick={() => toggleYear(y)} style={{ cursor: 'pointer', opacity: 0.7, fontSize: 10 }}>✕</span></span>)}
            {selectedDistricts.sort().map(d => <span key={`d-${d}`} style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.25)', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 4 }}>D{d}<span onClick={() => toggleDistrict(d)} style={{ cursor: 'pointer', opacity: 0.7, fontSize: 10 }}>✕</span></span>)}
            <button onClick={() => { setSelectedDistricts([]); setSelectedYears([]); }} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>Clear all</button>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 16 }}>
          {tabs.map(t => <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ background: activeTab === t.id ? 'rgba(56,189,248,0.15)' : 'transparent', border: activeTab === t.id ? '1px solid rgba(56,189,248,0.3)' : '1px solid transparent', borderRadius: 8, padding: '8px 16px', color: activeTab === t.id ? '#38bdf8' : '#64748b', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}>{t.label}</button>)}
        </div>
      </div>

      {/* Context bar */}
      <div style={{ padding: '20px 28px 4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ color: '#64748b', fontSize: 11 }}>
            Showing data for <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{yearRangeLabel}</span>
            {selectedDistricts.length > 0 && <> · <span style={{ color: '#38bdf8' }}>{selectedDistricts.length} district{selectedDistricts.length > 1 ? 's' : ''}</span></>}
            {projectFilter !== 'All' && <> · <span style={{ color: '#a78bfa' }}>{projectFilter}</span></>}
          </span>
          <span style={{ color: '#475569', fontSize: 11 }}>{filtered.length.toLocaleString()} transactions</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ padding: '0 28px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {[
          { label: 'Transactions', value: stats.count.toLocaleString(), color: '#38bdf8', icon: '📋' },
          { label: 'Total Volume', value: `$${(stats.totalVol / 1e9).toFixed(2)}B`, color: '#a78bfa', icon: '💰' },
          { label: 'Avg Price', value: formatCurrency(Math.round(stats.avgPrice)), color: '#34d399', icon: '🏷️' },
          { label: 'Avg PSF', value: formatCurrency(stats.avgPsf), color: '#fb923c', icon: '📐' },
          { label: 'Median PSF', value: formatCurrency(stats.medianPsf), color: '#f472b6', icon: '📊' },
          { label: 'PSF Range', value: `${formatCurrency(stats.minPsf)} – ${formatCurrency(stats.maxPsf)}`, color: '#94a3b8', icon: '↕️', small: true },
        ].map((s, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '16px 18px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</span>
              <span style={{ fontSize: 16 }}>{s.icon}</span>
            </div>
            <div style={{ color: s.color, fontSize: s.small ? 14 : 20, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ padding: '0 28px 28px' }}>
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>📈 Year-over-Year PSF Analysis</h3><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={yoyData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="year" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} /><YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} /><YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `${v}%`} /><Tooltip content={<CustomTooltip />} /><Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} /><Bar yAxisId="left" dataKey="avgPsf" name="Avg PSF" fill="#6366f1" radius={[4,4,0,0]} barSize={32} /><Line yAxisId="right" dataKey="change" name="YoY %" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4, fill: '#f59e0b' }} connectNulls /><ReferenceLine yAxisId="right" y={0} stroke="rgba(255,255,255,0.15)" /></ComposedChart></ResponsiveContainer></div></div>

            <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>🎯 Market Segment Breakdown</h3><div style={{ height: 280, display: 'flex', gap: 16 }}><div style={{ flex: 1 }}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={segmentData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={3}>{segmentData.map((e, i) => <Cell key={i} fill={SEGMENT_COLORS_MAP[e.name] || COLORS[i]} />)}</Pie><Tooltip content={<CustomTooltip prefix="" />} /><Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} /></PieChart></ResponsiveContainer></div><div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>{segmentData.map((s, i) => <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: SEGMENT_COLORS_MAP[s.name] || COLORS[i] }} /><div><div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>{s.name}</div><div style={{ color: '#64748b', fontSize: 11 }}>{formatCurrency(s.avgPsf)} psf • {s.count} txns</div></div></div>)}</div></div></div>

            <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>📊 PSF Distribution</h3><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={psfDistribution}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="range" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} angle={-30} textAnchor="end" height={60} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} /><Tooltip content={<CustomTooltip prefix="" />} /><Bar dataKey="count" name="Transactions" fill="#8b5cf6" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div></div>

            <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>📉 Cumulative Transaction Volume</h3><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={cumulativeData}><defs><linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} /><stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${(v/1e9).toFixed(1)}B`} /><Tooltip content={<CustomTooltip />} /><Area type="monotone" dataKey="cumulative" name="Cumulative" stroke="#0ea5e9" strokeWidth={2} fill="url(#cumGrad)" /></AreaChart></ResponsiveContainer></div></div>

            <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>🏢 Property Type Analysis</h3><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={typeAnalysis}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} /><Tooltip content={<CustomTooltip />} /><Bar dataKey="avgPsf" name="Avg PSF" fill="#14b8a6" radius={[6,6,0,0]} barSize={50} /></BarChart></ResponsiveContainer></div></div>

            <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>📋 Tenure Comparison</h3><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={tenureAnalysis}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} /><Tooltip content={<CustomTooltip />} /><Bar dataKey="avgPsf" name="Avg PSF" radius={[6,6,0,0]} barSize={50}>{tenureAnalysis.map((e, i) => <Cell key={i} fill={i === 0 ? '#f59e0b' : '#6366f1'} />)}</Bar></BarChart></ResponsiveContainer></div></div>

            <div style={{ gridColumn: '1 / -1', ...cardStyle }}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>🏆 Top 10 Projects by Volume</h3><div style={{ height: 320 }}><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={topProjects}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.06)" /><XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} /><YAxis dataKey="name" type="category" width={180} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} /><Tooltip content={<CustomTooltip prefix="" />} /><Bar dataKey="count" name="Transactions" fill="#6366f1" radius={[0,6,6,0]} barSize={18}>{topProjects.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div></div>
          </div>
        )}

        {activeTab === 'districts' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
            <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>📍 District Price Trend (All Districts)</h3><div style={{ height: 420 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={districtTrendData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} /><Tooltip content={<CustomTooltip />} /><Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />{activeDistricts.map((d, i) => <Line key={d} type="monotone" dataKey={`D${d}`} name={`D${d}`} stroke={COLORS[i % COLORS.length]} strokeWidth={1.5} dot={false} connectNulls />)}</LineChart></ResponsiveContainer></div></div>
            <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>📊 District YoY Analysis</h3><div style={{ height: 380 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={districtYoY}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="year" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} /><Tooltip content={<CustomTooltip />} /><Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />{activeDistricts.map((d, i) => <Bar key={d} dataKey={`D${d}`} name={`D${d}`} fill={COLORS[i % COLORS.length]} radius={[2,2,0,0]} />)}</BarChart></ResponsiveContainer></div></div>
          </div>
        )}

        {activeTab === 'advanced' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
            {/* Scatter */}
            <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>🔍 Price vs Area (by Segment)</h3><div style={{ height: 420 }}><ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="area" name="Area (sqft)" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => v.toLocaleString()} /><YAxis dataKey="psf" name="PSF" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} /><ZAxis dataKey="price" range={[30, 200]} /><Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => { if (!payload?.length) return null; const d = payload[0]?.payload; return (<div style={{ background: 'rgba(15,23,42,0.95)', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', fontSize: 11, color: '#e2e8f0' }}><p style={{ fontWeight: 600, marginBottom: 4 }}>{d?.project}</p><p>Area: {d?.area?.toLocaleString()} sqft</p><p>PSF: ${d?.psf?.toLocaleString()}</p><p>Price: ${d?.price?.toLocaleString()}</p></div>); }} /><Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />{scatterData.map(s => <Scatter key={s.segment} name={s.segment} data={s.data} fill={SEGMENT_COLORS_MAP[s.segment]} opacity={0.7} />)}</ScatterChart></ResponsiveContainer></div></div>

            {/* Heatmap */}
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div><div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><span style={{ fontSize: 16 }}>🗓️</span><h3 style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 600, margin: 0 }}>Historical Heatmap</h3></div><p style={{ color: '#64748b', fontSize: 12, margin: 0 }}>Floor Level × Year</p></div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => setShowDiff(!showDiff)} style={{ background: showDiff ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.06)', border: showDiff ? '1px solid rgba(56,189,248,0.4)' : '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 14px', fontSize: 11, fontWeight: 500, cursor: 'pointer', color: showDiff ? '#38bdf8' : '#94a3b8' }}>↔ Changes</button>
                  <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 2 }}>
                    {[{ key: 'psf', label: '$ PSF' }, { key: 'price', label: '💵 Price' }, { key: 'volume', label: '📊 Vol' }].map(m => (
                      <button key={m.key} onClick={() => setHeatmapMetric(m.key)} style={{ background: heatmapMetric === m.key ? 'rgba(255,255,255,0.12)' : 'transparent', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 500, color: heatmapMetric === m.key ? '#e2e8f0' : '#64748b', cursor: 'pointer' }}>{m.label}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ padding: 20, overflowX: 'auto' }}>
                {matrixData.cols.length === 0 ? <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>No data available</div> : (
                  <div style={{ minWidth: 800 }}>
                    <div style={{ display: 'flex' }}>
                      <div style={{ width: 80, flexShrink: 0 }} />
                      {matrixData.cols.map(year => <div key={year} style={{ flex: 1, minWidth: 80, textAlign: 'center', fontSize: 12, fontWeight: 500, color: '#94a3b8', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{year}</div>)}
                      {['Avg Incr.', '% Chg', 'Abs.', 'Total %'].map(h => <div key={h} style={{ width: 80, flexShrink: 0, textAlign: 'center', fontSize: 10, fontWeight: 600, color: '#cbd5e1', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>{h}</div>)}
                    </div>
                    {matrixData.rows.map(floor => {
                      const st = heatmapMetric === 'psf' ? matrixData.rowStatsPsf.get(floor) : heatmapMetric === 'price' ? matrixData.rowStatsPrice.get(floor) : matrixData.rowStatsVol.get(floor);
                      return (
                        <div key={floor} style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <div style={{ width: 80, flexShrink: 0, fontSize: 12, fontWeight: 600, color: '#cbd5e1', padding: '12px 8px', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', fontFamily: "'JetBrains Mono', monospace" }}>{floor}</div>
                          {matrixData.cols.map(year => {
                            const key = `${floor}-${year}`; const cell = matrixData.map.get(key); const dd = matrixData.diffMap.get(key);
                            let dv = '-', bg = 'transparent', tc = '#475569';
                            if (showDiff) { if (dd && !dd.isBase) { let diff = heatmapMetric === 'psf' ? dd.diffPsf : heatmapMetric === 'price' ? dd.diffPrice : dd.diffVol; if (diff != null) { dv = heatmapMetric === 'psf' ? (diff>0?'+':'')+Math.round(diff) : heatmapMetric === 'price' ? (diff>0?'+':'')+formatCompactNumber(diff) : (diff>0?'+':'')+diff; let mn=0,mx=0; if(heatmapMetric==='psf'){mn=matrixData.minDiffPsf;mx=matrixData.maxDiffPsf;}else if(heatmapMetric==='price'){mn=matrixData.minDiffPrice;mx=matrixData.maxDiffPrice;}else{mn=matrixData.minDiffVol;mx=matrixData.maxDiffVol;} bg=getDiffColor(diff,mn,mx); tc=getDiffTextColor(diff,mn,mx); } } } else if (cell) { let val=0,mn=0,mx=0; if(heatmapMetric==='psf'){val=Math.round(cell.totalPsf/cell.count);dv=`$${val.toLocaleString()}`;mn=matrixData.minPsf;mx=matrixData.maxPsf;}else if(heatmapMetric==='price'){val=cell.totalPrice/cell.count;dv=`$${formatCompactNumber(val)}`;mn=matrixData.minPrice;mx=matrixData.maxPrice;}else{val=cell.count;dv=val;mn=matrixData.minVol;mx=matrixData.maxVol;} bg=getHeatmapColor(val,mn,mx); tc=getHeatmapTextColor(val,mn,mx); }
                            return <div key={key} style={{ flex: 1, minWidth: 80, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, backgroundColor: bg, color: tc }} title={cell ? `${floor} ${year}: $${Math.round(cell.totalPsf/cell.count).toLocaleString()} PSF (${cell.count} txns)` : 'No data'}>{dv}</div>;
                          })}
                          {[{ v: st?.avgIncrement, f: v => heatmapMetric==='psf'?Math.round(v):heatmapMetric==='price'?formatCompactNumber(v):v.toFixed(1), s: true },{ v: st?.avgPercChange, f: v => `${Math.abs(v).toFixed(1)}%`, a: true },{ v: st?.totalChangeVal, f: v => heatmapMetric==='psf'?Math.round(v):heatmapMetric==='price'?formatCompactNumber(v):v.toFixed(1), s: true },{ v: st?.totalChangePerc, f: v => `${Math.abs(v).toFixed(1)}%`, a: true }].map((s,si) => { const z = !s.v || s.v===0; const p = (s.v??0)>0; return <div key={si} style={{ width: 80, flexShrink: 0, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", borderLeft: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', color: z ? '#475569' : p ? '#4ade80' : '#f87171' }}>{z ? '-' : <span>{s.a?(p?'↑ ':'↓ '):''}{s.s&&!s.a?(p?'+':''):''}{s.f(s.v)}</span>}</div>; })}
                        </div>
                      );
                    })}
                    <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, fontSize: 11, color: '#64748b' }}><span>{showDiff ? 'Negative' : 'Low'}</span><div style={{ width: 100, height: 8, borderRadius: 4, background: showDiff ? 'linear-gradient(to right, rgba(239,68,68,0.7), rgba(241,245,249,0.3), rgba(34,197,94,0.7))' : 'linear-gradient(to right, rgba(14,165,233,0.1), rgba(14,165,233,1))' }} /><span>{showDiff ? 'Positive' : 'High'}</span></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'floor' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={cardStyle}>
              <h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>🏢 Floor Premium Analysis</h3>
              <p style={{ color: '#64748b', fontSize: 11, marginBottom: 12 }}>Based on {yearRangeLabel} transactions{selectedYears.length === 0 && latestFilteredYear ? ` · Tip: filter by ${latestFilteredYear} for latest rates` : ''}</p>
              <div style={{ height: 340 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={floorPremium}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="floor" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} /><Tooltip content={<CustomTooltip />} /><Bar dataKey="avgPsf" name="Avg PSF" radius={[6,6,0,0]} barSize={28}>{floorPremium.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div>
            </div>
            <div style={cardStyle}>
              <h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>📋 Floor Premium Table</h3>
              <p style={{ color: '#64748b', fontSize: 11, marginBottom: 12 }}>Avg PSF per floor range · {yearRangeLabel}</p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{['Floor', 'Avg PSF', 'Count', 'Premium $', 'Premium %'].map(h => <th key={h} style={{ color: '#94a3b8', fontWeight: 500, padding: '10px 12px', textAlign: 'left' }}>{h}</th>)}</tr></thead>
                  <tbody>{floorPremium.map((f, i) => (
                    <tr key={f.floor} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                      <td style={{ color: '#e2e8f0', padding: '10px 12px', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{f.floor}</td>
                      <td style={{ color: '#38bdf8', padding: '10px 12px', fontFamily: "'JetBrains Mono', monospace" }}>{formatCurrency(f.avgPsf)}</td>
                      <td style={{ color: '#94a3b8', padding: '10px 12px' }}>{f.count}</td>
                      <td style={{ color: f.premiumDollar > 0 ? '#34d399' : f.premiumDollar < 0 ? '#f87171' : '#94a3b8', padding: '10px 12px', fontFamily: "'JetBrains Mono', monospace" }}>{f.premiumDollar > 0 ? '+' : ''}{formatCurrency(f.premiumDollar)}</td>
                      <td style={{ color: f.premiumPct > 0 ? '#34d399' : f.premiumPct < 0 ? '#f87171' : '#94a3b8', padding: '10px 12px', fontFamily: "'JetBrains Mono', monospace" }}>{f.premiumPct > 0 ? '+' : ''}{f.premiumPct}%</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', padding: '20px 28px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 11 }}>
        URA Property Analytics Dashboard • {filtered.length.toLocaleString()} filtered transactions • All values shown without rounding
      </div>
    </div>
  );
}
