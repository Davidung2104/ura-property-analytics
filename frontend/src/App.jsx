import React, { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend, ScatterChart, Scatter, ZAxis, AreaChart, Area, ComposedChart, ReferenceLine } from 'recharts';
import { getTransactions, getRentals } from './services/api';

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

const $f = v => `$${v.toLocaleString(undefined,{maximumFractionDigits:2})}`;
const $c = v => `$${Math.round(v).toLocaleString()}`;
const fm = "'JetBrains Mono', monospace";
const cp = 'pointer';

export default function App() {
  const [allTransactions, setAllTransactions] = useState([]);
  const [allRentals, setAllRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rentalLoading, setRentalLoading] = useState(false);
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
  const [rentalBedroom, setRentalBedroom] = useState('All');

  // Analysis state
  const [analyzeProject, setAnalyzeProject] = useState('');
  const [analyzeSearch, setAnalyzeSearch] = useState('');
  const [showAnalyzeDD, setShowAnalyzeDD] = useState(false);
  const [analyzeTab, setAnalyzeTab] = useState('overview');
  const [pricingArea, setPricingArea] = useState('');
  const [pricingFloor, setPricingFloor] = useState('');

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

  // Load rental data when rental tab is first opened
  useEffect(() => {
    if (activeTab === 'rental' && allRentals.length === 0 && !rentalLoading) {
      async function loadRentals() {
        try {
          setRentalLoading(true);
          const rentals = await getRentals();
          setAllRentals(rentals);
          console.log(`Loaded ${rentals.length} rental records`);
        } catch (err) {
          console.error('Failed to load rentals:', err);
        } finally {
          setRentalLoading(false);
        }
      }
      loadRentals();
    }
  }, [activeTab]);

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
    return Object.entries(map).map(([name, d]) => ({ name: name.length > 22 ? name.substring(0,22) + '\u2026' : name, fullName: name, count: d.count, volume: d.totalVol, avgPsf: Math.round((d.psfs.reduce((s,v) => s+v, 0) / d.psfs.length) * 100) / 100 })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filtered]);

  const districtYoY = useMemo(() => {
    const map = {};
    filtered.forEach(t => { const key = `${t.district}-${t.year}`; if (!map[key]) map[key] = { district: t.district, year: t.year, psfs: [] }; map[key].psfs.push(t.psf); });
    const yearMap = {};
    Object.values(map).forEach(d => { if (!yearMap[d.year]) yearMap[d.year] = {}; yearMap[d.year][`D${d.district}`] = Math.round((d.psfs.reduce((s,v) => s+v, 0) / d.psfs.length) * 100) / 100; });
    return Object.entries(yearMap).sort(([a],[b]) => a.localeCompare(b)).map(([year, dists]) => ({ year, ...dists }));
  }, [filtered]);

  // ===== RENTAL COMPUTED DATA =====
  const filteredRentals = useMemo(() => {
    return allRentals.filter(r =>
      (selectedDistricts.length === 0 || selectedDistricts.includes(r.district)) &&
      (rentalBedroom === 'All' || r.noOfBedRoom === rentalBedroom)
    );
  }, [allRentals, selectedDistricts, rentalBedroom]);

  const rentalBedrooms = useMemo(() => ['All', ...new Set(allRentals.map(r => r.noOfBedRoom).filter(Boolean))].sort(), [allRentals]);

  const parseAreaMid = (areaSqft) => {
    if (!areaSqft) return 0;
    const parts = areaSqft.split('-').map(s => parseFloat(s.trim()));
    if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) return (parts[0] + parts[1]) / 2;
    return parts[0] || 0;
  };

  const parseLeaseQuarter = (ld) => {
    if (!ld || ld.length !== 4) return null;
    const mm = parseInt(ld.substring(0, 2));
    const yy = parseInt(ld.substring(2, 4));
    const year = yy > 50 ? 1900 + yy : 2000 + yy;
    const q = Math.ceil(mm / 3);
    return { label: `${year} Q${q}`, year, quarter: q, sortKey: year * 10 + q };
  };

  const rentalStats = useMemo(() => {
    if (!filteredRentals.length) return { count: 0, avgRent: 0, medianRent: 0, avgRentPsf: 0 };
    const rents = filteredRentals.map(r => r.rent).sort((a,b) => a-b);
    const rentPsfs = filteredRentals.map(r => { const mid = parseAreaMid(r.areaSqft); return mid > 0 ? r.rent / mid : 0; }).filter(v => v > 0);
    return {
      count: filteredRentals.length,
      avgRent: Math.round(rents.reduce((s,v) => s+v, 0) / rents.length),
      medianRent: rents[Math.floor(rents.length / 2)],
      avgRentPsf: rentPsfs.length ? Math.round((rentPsfs.reduce((s,v) => s+v, 0) / rentPsfs.length) * 100) / 100 : 0,
    };
  }, [filteredRentals]);

  const rentalTrend = useMemo(() => {
    const map = {};
    filteredRentals.forEach(r => {
      const q = parseLeaseQuarter(r.leaseDate);
      if (!q) return;
      if (!map[q.sortKey]) map[q.sortKey] = { label: q.label, rents: [], sortKey: q.sortKey };
      map[q.sortKey].rents.push(r.rent);
    });
    return Object.values(map).sort((a,b) => a.sortKey - b.sortKey).map(q => ({
      quarter: q.label,
      avgRent: Math.round(q.rents.reduce((s,v) => s+v, 0) / q.rents.length),
      count: q.rents.length,
    }));
  }, [filteredRentals]);

  const rentalByDistrict = useMemo(() => {
    const map = {};
    filteredRentals.forEach(r => {
      if (!map[r.district]) map[r.district] = { rents: [], count: 0 };
      map[r.district].rents.push(r.rent);
      map[r.district].count++;
    });
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([d, v]) => ({
      district: `D${d}`,
      avgRent: Math.round(v.rents.reduce((s,r) => s+r, 0) / v.rents.length),
      count: v.count,
    }));
  }, [filteredRentals]);

  const rentalByBedroom = useMemo(() => {
    const map = {};
    filteredRentals.forEach(r => {
      const bed = r.noOfBedRoom || 'N/A';
      if (!map[bed]) map[bed] = { rents: [], count: 0 };
      map[bed].rents.push(r.rent);
      map[bed].count++;
    });
    return Object.entries(map).sort(([a],[b]) => { if (a === 'N/A') return 1; if (b === 'N/A') return -1; return a.localeCompare(b); }).map(([bed, v]) => ({
      bedroom: bed === 'N/A' ? 'Unknown' : `${bed} BR`,
      avgRent: Math.round(v.rents.reduce((s,r) => s+r, 0) / v.rents.length),
      count: v.count,
    }));
  }, [filteredRentals]);

  const rentalPsfByDistrict = useMemo(() => {
    const map = {};
    filteredRentals.forEach(r => {
      const mid = parseAreaMid(r.areaSqft);
      if (mid <= 0) return;
      const rentPsf = r.rent / mid;
      if (!map[r.district]) map[r.district] = { psfs: [], count: 0 };
      map[r.district].psfs.push(rentPsf);
      map[r.district].count++;
    });
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([d, v]) => ({
      district: `D${d}`,
      rentPsf: Math.round((v.psfs.reduce((s,r) => s+r, 0) / v.psfs.length) * 100) / 100,
      count: v.count,
    }));
  }, [filteredRentals]);

  const rentalYield = useMemo(() => {
    if (!filteredRentals.length || !filtered.length) return [];
    const rentMap = {};
    filteredRentals.forEach(r => {
      const mid = parseAreaMid(r.areaSqft);
      if (mid <= 0) return;
      if (!rentMap[r.district]) rentMap[r.district] = [];
      rentMap[r.district].push(r.rent / mid);
    });
    const buyMap = {};
    filtered.forEach(t => {
      if (!buyMap[t.district]) buyMap[t.district] = [];
      buyMap[t.district].push(t.psf);
    });
    const results = [];
    Object.keys(rentMap).forEach(d => {
      if (!buyMap[d]) return;
      const avgRentPsf = rentMap[d].reduce((s,v) => s+v, 0) / rentMap[d].length;
      const avgBuyPsf = buyMap[d].reduce((s,v) => s+v, 0) / buyMap[d].length;
      if (avgBuyPsf <= 0) return;
      const annualYield = (avgRentPsf * 12 / avgBuyPsf) * 100;
      results.push({
        district: `D${d}`,
        rentPsf: Math.round(avgRentPsf * 100) / 100,
        buyPsf: Math.round(avgBuyPsf),
        yield: Math.round(annualYield * 100) / 100,
      });
    });
    return results.sort((a,b) => b.yield - a.yield);
  }, [filteredRentals, filtered]);

  const rentalDistrictTrend = useMemo(() => {
    const map = {};
    filteredRentals.forEach(r => {
      const q = parseLeaseQuarter(r.leaseDate);
      if (!q) return;
      const key = q.sortKey;
      if (!map[key]) map[key] = { label: q.label, sortKey: q.sortKey, districts: {} };
      if (!map[key].districts[r.district]) map[key].districts[r.district] = [];
      map[key].districts[r.district].push(r.rent);
    });
    return Object.values(map).sort((a,b) => a.sortKey - b.sortKey).map(q => {
      const row = { quarter: q.label };
      Object.entries(q.districts).forEach(([d, rents]) => { row[`D${d}`] = Math.round(rents.reduce((s,v) => s+v, 0) / rents.length); });
      return row;
    });
  }, [filteredRentals]);

  const activeRentalDistricts = useMemo(() => { const s = new Set(); filteredRentals.forEach(r => s.add(r.district)); return [...s].sort(); }, [filteredRentals]);

  // ===== ANALYSIS COMPUTED DATA =====
  const analyzeFilteredProjects = useMemo(() => {
    if (!analyzeSearch.trim()) return [];
    const q = analyzeSearch.toLowerCase();
    return [...new Set(allTransactions.map(t => t.project))].filter(p => p.toLowerCase().includes(q)).sort().slice(0, 30);
  }, [allTransactions, analyzeSearch]);

  const projTx = useMemo(() => allTransactions.filter(t => t.project === analyzeProject), [allTransactions, analyzeProject]);
  const projAreas = useMemo(() => [...new Set(projTx.map(t => t.areaSqft))].sort((a,b) => a - b), [projTx]);
  const projLatestSaleYear = useMemo(() => projTx.length ? Math.max(...projTx.map(t => t.year)) : null, [projTx]);

  const projInfo = useMemo(() => {
    if (!projTx.length) return null;
    const t = projTx[0];
    return { district: t.district, segment: t.marketSegment, type: t.propertyType, tenure: t.tenure, street: t.street || '' };
  }, [projTx]);

  const projSaleStats = useMemo(() => {
    if (!projTx.length) return null;
    const psfs = projTx.map(t => t.psf).sort((a,b) => a - b);
    return { count: projTx.length, avgPsf: Math.round((psfs.reduce((s,v) => s+v, 0) / psfs.length) * 100) / 100, medianPsf: psfs[Math.floor(psfs.length / 2)], minPsf: psfs[0], maxPsf: psfs[psfs.length - 1], totalVol: projTx.reduce((s,t) => s + t.priceNum, 0) };
  }, [projTx]);

  const projFloor = useMemo(() => {
    const map = {};
    projTx.forEach(t => { if (!map[t.floorRange]) map[t.floorRange] = []; map[t.floorRange].push(t.psf); });
    const floors = ["01-05","06-10","11-15","16-20","21-25","26-30","31-35","36-40","41-45","46-50"];
    const avgAll = projTx.length ? projTx.reduce((s,t) => s + t.psf, 0) / projTx.length : 0;
    return floors.filter(f => map[f]).map(f => { const avg = map[f].reduce((s,v) => s+v,0) / map[f].length; return { floor: f, avgPsf: Math.round(avg*100)/100, count: map[f].length, premDollar: Math.round((avg - avgAll)*100)/100, premPct: avgAll ? Math.round(((avg - avgAll)/avgAll)*10000)/100 : 0 }; });
  }, [projTx]);

  const projFloorDetail = useMemo(() => {
    const map = {};
    projTx.forEach(t => { if (!map[t.floorRange]) map[t.floorRange] = { allCount: 0, latCount: 0 }; map[t.floorRange].allCount++; if (t.year === projLatestSaleYear) map[t.floorRange].latCount++; });
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([f,d]) => ({ floor: f, ...d }));
  }, [projTx, projLatestSaleYear]);

  const projComparison = useMemo(() => {
    if (!projInfo) return [];
    const map = {};
    allTransactions.forEach(t => {
      if (!map[t.contractDate]) map[t.contractDate] = { project: [], district: [], segment: [] };
      if (t.project === analyzeProject) map[t.contractDate].project.push(t.psf);
      if (t.district === projInfo.district) map[t.contractDate].district.push(t.psf);
      if (t.marketSegment === projInfo.segment) map[t.contractDate].segment.push(t.psf);
    });
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([date, d]) => ({
      date,
      project: d.project.length ? Math.round((d.project.reduce((s,v) => s+v,0) / d.project.length)*100)/100 : null,
      district: d.district.length ? Math.round((d.district.reduce((s,v) => s+v,0) / d.district.length)*100)/100 : null,
      segment: d.segment.length ? Math.round((d.segment.reduce((s,v) => s+v,0) / d.segment.length)*100)/100 : null,
    }));
  }, [allTransactions, analyzeProject, projInfo]);

  const projScatter = useMemo(() => projTx.map(t => ({ area: Math.round(t.areaSqft), psf: t.psf, price: t.priceNum, floor: t.floorRange, date: t.contractDate })), [projTx]);

  const nearbyProjects = useMemo(() => {
    if (!projInfo) return [];
    const map = {};
    allTransactions.filter(t => t.district === projInfo.district && t.project !== analyzeProject).forEach(t => { if (!map[t.project]) map[t.project] = { count: 0, psfs: [] }; map[t.project].count++; map[t.project].psfs.push(t.psf); });
    return Object.entries(map).map(([n,d]) => ({ name: n, count: d.count, avgPsf: Math.round((d.psfs.reduce((s,v) => s+v,0) / d.psfs.length)*100)/100 })).sort((a,b) => b.count - a.count).slice(0, 8);
  }, [allTransactions, analyzeProject, projInfo]);

  // ===== HELPERS =====
  const tabs = [
    { id: 'overview', label: '\ud83d\udcca Overview' },
    { id: 'districts', label: '\ud83d\udccd Districts' },
    { id: 'advanced', label: '\ud83d\udcc8 Advanced' },
    { id: 'floor', label: '\ud83c\udfe2 Floor Analysis' },
    { id: 'rental', label: '\ud83c\udfe0 Rental' },
    { id: 'analyze', label: '\ud83d\udd0d Analysis' },
  ];
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
        <div style={{ fontSize: 48 }}>{'\u26a0\ufe0f'}</div>
        <h2 style={{ color: '#f87171', fontSize: 18, fontWeight: 600 }}>Failed to Load Data</h2>
        <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', maxWidth: 400 }}>{error}</p>
        <button onClick={() => window.location.reload()} style={{ background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, cursor: cp }}>Retry</button>
      </div>
    );
  }

  // ===== RENDER =====
  const bs = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 12px', color: '#e2e8f0', fontSize: 12, cursor: cp, outline: 'none' };
  const cardStyle = { background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 20, border: '1px solid rgba(255,255,255,0.06)' };
  const thStyle = { color: '#94a3b8', fontWeight: 500, padding: '10px 12px', textAlign: 'left', fontSize: 11 };
  const tdStyle = { padding: '10px 12px' };

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: '#f1f5f9', fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}><span style={{ color: '#38bdf8' }}>URA</span> Property Analytics</h1>
            <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>Singapore Private Residential Transactions {'\u2022'} {allTransactions.length.toLocaleString()} records</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ background: '#22c55e', width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
            <span style={{ color: '#94a3b8', fontSize: 12 }}>Live Data</span>
          </div>
        </div>

        {/* Click-away overlay */}
        {(showDistrictPanel || showProjectDropdown || showYearPanel || showAnalyzeDD) && (
          <div onClick={() => { setShowDistrictPanel(false); setShowProjectDropdown(false); setShowYearPanel(false); setShowAnalyzeDD(false); }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} />
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'flex-start', position: 'relative', zIndex: 45 }}>
          {/* District Checkbox */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => { setShowDistrictPanel(!showDistrictPanel); setShowProjectDropdown(false); setShowYearPanel(false); }} style={{ ...bs, minWidth: 140, textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span>District: {selectedDistricts.length === 0 ? 'All' : selectedDistricts.length === 1 ? `D${selectedDistricts[0]}` : `${selectedDistricts.length} selected`}</span>
              <span style={{ fontSize: 10, opacity: 0.6 }}>{'\u25bc'}</span>
            </button>
            {showDistrictPanel && (
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 12, zIndex: 50, width: 280, maxHeight: 320, overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Districts</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setSelectedDistricts([...districts])} style={{ background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 5, padding: '2px 8px', color: '#38bdf8', fontSize: 10, cursor: cp, fontWeight: 500 }}>All</button>
                    <button onClick={() => setSelectedDistricts([])} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '2px 8px', color: '#94a3b8', fontSize: 10, cursor: cp, fontWeight: 500 }}>Clear</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  {districts.map(d => (
                    <label key={d} onClick={() => toggleDistrict(d)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 6, cursor: cp, background: selectedDistricts.includes(d) ? 'rgba(56,189,248,0.08)' : 'transparent' }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, border: selectedDistricts.includes(d) ? '2px solid #38bdf8' : '2px solid rgba(255,255,255,0.2)', background: selectedDistricts.includes(d) ? '#38bdf8' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {selectedDistricts.includes(d) && <span style={{ color: '#0f172a', fontSize: 10, fontWeight: 700 }}>{'\u2713'}</span>}
                      </div>
                      <span style={{ color: selectedDistricts.includes(d) ? '#e2e8f0' : '#94a3b8', fontSize: 12 }}>D{d}</span>
                    </label>
                  ))}
                </div>
                <button onClick={() => setShowDistrictPanel(false)} style={{ width: '100%', marginTop: 10, padding: '6px 0', background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 6, color: '#38bdf8', fontSize: 11, fontWeight: 600, cursor: cp }}>Done</button>
              </div>
            )}
          </div>

          {/* Year Checkbox */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => { setShowYearPanel(!showYearPanel); setShowDistrictPanel(false); setShowProjectDropdown(false); }} style={{ ...bs, minWidth: 130, textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span>Year: {selectedYears.length === 0 ? 'All' : selectedYears.length === 1 ? selectedYears[0] : `${selectedYears.length} selected`}</span>
              <span style={{ fontSize: 10, opacity: 0.6 }}>{'\u25bc'}</span>
            </button>
            {showYearPanel && (
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 12, zIndex: 50, width: 200, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Years</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setSelectedYears([...allYears])} style={{ background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 5, padding: '2px 8px', color: '#38bdf8', fontSize: 10, cursor: cp, fontWeight: 500 }}>All</button>
                    <button onClick={() => setSelectedYears([])} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '2px 8px', color: '#94a3b8', fontSize: 10, cursor: cp, fontWeight: 500 }}>Clear</button>
                    <button onClick={() => setSelectedYears([allYears[allYears.length - 1]])} style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 5, padding: '2px 8px', color: '#34d399', fontSize: 10, cursor: cp, fontWeight: 500 }}>Latest</button>
                  </div>
                </div>
                {allYears.map(y => (
                  <label key={y} onClick={() => toggleYear(y)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 6, cursor: cp, background: selectedYears.includes(y) ? 'rgba(56,189,248,0.08)' : 'transparent' }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, border: selectedYears.includes(y) ? '2px solid #38bdf8' : '2px solid rgba(255,255,255,0.2)', background: selectedYears.includes(y) ? '#38bdf8' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {selectedYears.includes(y) && <span style={{ color: '#0f172a', fontSize: 10, fontWeight: 700 }}>{'\u2713'}</span>}
                    </div>
                    <span style={{ color: selectedYears.includes(y) ? '#e2e8f0' : '#94a3b8', fontSize: 12 }}>{y}</span>
                  </label>
                ))}
                <button onClick={() => setShowYearPanel(false)} style={{ width: '100%', marginTop: 10, padding: '6px 0', background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 6, color: '#38bdf8', fontSize: 11, fontWeight: 600, cursor: cp }}>Done</button>
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
              <span style={{ color: '#64748b', fontSize: 12, padding: '6px 8px', flexShrink: 0 }}>{'\ud83d\udd0d'}</span>
              <input type="text" placeholder={projectFilter === 'All' ? `Project: All (${projects.length - 1})` : projectFilter} value={projectSearch}
                onChange={e => { setProjectSearch(e.target.value); setShowProjectDropdown(true); }}
                onFocus={() => { setShowProjectDropdown(true); setShowDistrictPanel(false); setShowYearPanel(false); }}
                style={{ background: 'transparent', border: 'none', outline: 'none', color: '#e2e8f0', fontSize: 12, padding: '6px 4px', flex: 1, width: '100%', minWidth: 0 }} />
              {projectFilter !== 'All' && <button onClick={(e) => { e.stopPropagation(); setProjectFilter('All'); setProjectSearch(''); }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 4, color: '#94a3b8', fontSize: 10, padding: '2px 6px', cursor: cp, flexShrink: 0, marginRight: 4 }}>{'\u2715'}</button>}
            </div>
            {showProjectDropdown && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, zIndex: 50, maxHeight: 280, overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
                {filteredProjects.length === 0 ? <div style={{ padding: '16px 12px', color: '#64748b', fontSize: 12, textAlign: 'center' }}>No projects found</div> :
                  filteredProjects.slice(0, 50).map(p => (
                    <div key={p} onClick={() => { setProjectFilter(p); setProjectSearch(''); setShowProjectDropdown(false); }}
                      style={{ padding: '8px 14px', fontSize: 12, cursor: cp, color: p === projectFilter ? '#38bdf8' : '#cbd5e1', background: p === projectFilter ? 'rgba(56,189,248,0.1)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
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
            {selectedYears.sort((a,b)=>a-b).map(y => <span key={`y-${y}`} style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#34d399', display: 'flex', alignItems: 'center', gap: 4 }}>{y}<span onClick={() => toggleYear(y)} style={{ cursor: cp, opacity: 0.7, fontSize: 10 }}>{'\u2715'}</span></span>)}
            {selectedDistricts.sort().map(d => <span key={`d-${d}`} style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.25)', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 4 }}>D{d}<span onClick={() => toggleDistrict(d)} style={{ cursor: cp, opacity: 0.7, fontSize: 10 }}>{'\u2715'}</span></span>)}
            <button onClick={() => { setSelectedDistricts([]); setSelectedYears([]); }} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 11, cursor: cp, textDecoration: 'underline' }}>Clear all</button>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 16, flexWrap: 'wrap' }}>
          {tabs.map(t => <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ background: activeTab === t.id ? 'rgba(56,189,248,0.15)' : 'transparent', border: activeTab === t.id ? '1px solid rgba(56,189,248,0.3)' : '1px solid transparent', borderRadius: 8, padding: '8px 16px', color: activeTab === t.id ? '#38bdf8' : '#64748b', fontSize: 13, fontWeight: 500, cursor: cp, transition: 'all 0.2s' }}>{t.label}</button>)}
        </div>
      </div>

      {/* Context bar */}
      <div style={{ padding: '20px 28px 4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ color: '#64748b', fontSize: 11 }}>
            Showing data for <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{yearRangeLabel}</span>
            {selectedDistricts.length > 0 && <> {'\u00b7'} <span style={{ color: '#38bdf8' }}>{selectedDistricts.length} district{selectedDistricts.length > 1 ? 's' : ''}</span></>}
            {projectFilter !== 'All' && <> {'\u00b7'} <span style={{ color: '#a78bfa' }}>{projectFilter}</span></>}
          </span>
          <span style={{ color: '#475569', fontSize: 11 }}>{filtered.length.toLocaleString()} transactions</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ padding: '0 28px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {[
          { label: 'Transactions', value: stats.count.toLocaleString(), color: '#38bdf8', icon: '\ud83d\udccb' },
          { label: 'Total Volume', value: `$${(stats.totalVol / 1e9).toFixed(2)}B`, color: '#a78bfa', icon: '\ud83d\udcb0' },
          { label: 'Avg Price', value: formatCurrency(Math.round(stats.avgPrice)), color: '#34d399', icon: '\ud83c\udff7\ufe0f' },
          { label: 'Avg PSF', value: formatCurrency(stats.avgPsf), color: '#fb923c', icon: '\ud83d\udcd0' },
          { label: 'Median PSF', value: formatCurrency(stats.medianPsf), color: '#f472b6', icon: '\ud83d\udcca' },
          { label: 'PSF Range', value: `${formatCurrency(stats.minPsf)} \u2013 ${formatCurrency(stats.maxPsf)}`, color: '#94a3b8', icon: '\u2195\ufe0f', small: true },
        ].map((s, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '16px 18px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</span>
              <span style={{ fontSize: 16 }}>{s.icon}</span>
            </div>
            <div style={{ color: s.color, fontSize: s.small ? 14 : 20, fontWeight: 700, fontFamily: fm }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ padding: '0 28px 28px' }}>
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{'\ud83d\udcc8'} Year-over-Year PSF Analysis</h3><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={yoyData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="year" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} /><YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} /><YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `${v}%`} /><Tooltip content={<CustomTooltip />} /><Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} /><Bar yAxisId="left" dataKey="avgPsf" name="Avg PSF" fill="#6366f1" radius={[4,4,0,0]} barSize={32} /><Line yAxisId="right" dataKey="change" name="YoY %" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4, fill: '#f59e0b' }} connectNulls /><ReferenceLine yAxisId="right" y={0} stroke="rgba(255,255,255,0.15)" /></ComposedChart></ResponsiveContainer></div></div>

            <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{'\ud83c\udfaf'} Market Segment Breakdown</h3><div style={{ height: 280, display: 'flex', gap: 16 }}><div style={{ flex: 1 }}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={segmentData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={3}>{segmentData.map((e, i) => <Cell key={i} fill={SEGMENT_COLORS_MAP[e.name] || COLORS[i]} />)}</Pie><Tooltip content={<CustomTooltip prefix="" />} /><Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} /></PieChart></ResponsiveContainer></div><div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>{segmentData.map((s, i) => <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: SEGMENT_COLORS_MAP[s.name] || COLORS[i] }} /><div><div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>{s.name}</div><div style={{ color: '#64748b', fontSize: 11 }}>{formatCurrency(s.avgPsf)} psf {'\u2022'} {s.count} txns</div></div></div>)}</div></div></div>

            <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{'\ud83d\udcca'} PSF Distribution</h3><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={psfDistribution}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="range" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} angle={-30} textAnchor="end" height={60} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} /><Tooltip content={<CustomTooltip prefix="" />} /><Bar dataKey="count" name="Transactions" fill="#8b5cf6" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div></div>

            <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{'\ud83d\udcc9'} Cumulative Transaction Volume</h3><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={cumulativeData}><defs><linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} /><stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${(v/1e9).toFixed(1)}B`} /><Tooltip content={<CustomTooltip />} /><Area type="monotone" dataKey="cumulative" name="Cumulative" stroke="#0ea5e9" strokeWidth={2} fill="url(#cumGrad)" /></AreaChart></ResponsiveContainer></div></div>

            <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{'\ud83c\udfe2'} Property Type Analysis</h3><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={typeAnalysis}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} /><Tooltip content={<CustomTooltip />} /><Bar dataKey="avgPsf" name="Avg PSF" fill="#14b8a6" radius={[6,6,0,0]} barSize={50} /></BarChart></ResponsiveContainer></div></div>

            <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{'\ud83d\udccb'} Tenure Comparison</h3><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={tenureAnalysis}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} /><Tooltip content={<CustomTooltip />} /><Bar dataKey="avgPsf" name="Avg PSF" radius={[6,6,0,0]} barSize={50}>{tenureAnalysis.map((e, i) => <Cell key={i} fill={i === 0 ? '#f59e0b' : '#6366f1'} />)}</Bar></BarChart></ResponsiveContainer></div></div>

            <div style={{ gridColumn: '1 / -1', ...cardStyle }}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{'\ud83c\udfc6'} Top 10 Projects by Volume</h3><div style={{ height: 320 }}><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={topProjects}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.06)" /><XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} /><YAxis dataKey="name" type="category" width={180} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} /><Tooltip content={<CustomTooltip prefix="" />} /><Bar dataKey="count" name="Transactions" fill="#6366f1" radius={[0,6,6,0]} barSize={18}>{topProjects.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div></div>
          </div>
        )}

        {activeTab === 'districts' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
            <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{'\ud83d\udccd'} District Price Trend (All Districts)</h3><div style={{ height: 420 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={districtTrendData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} /><Tooltip content={<CustomTooltip />} /><Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />{activeDistricts.map((d, i) => <Line key={d} type="monotone" dataKey={`D${d}`} name={`D${d}`} stroke={COLORS[i % COLORS.length]} strokeWidth={1.5} dot={false} connectNulls />)}</LineChart></ResponsiveContainer></div></div>
            <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{'\ud83d\udcca'} District YoY Analysis</h3><div style={{ height: 380 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={districtYoY}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="year" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} /><Tooltip content={<CustomTooltip />} /><Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />{activeDistricts.map((d, i) => <Bar key={d} dataKey={`D${d}`} name={`D${d}`} fill={COLORS[i % COLORS.length]} radius={[2,2,0,0]} />)}</BarChart></ResponsiveContainer></div></div>
          </div>
        )}

        {activeTab === 'advanced' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
            <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{'\ud83d\udd0d'} Price vs Area (by Segment)</h3><div style={{ height: 420 }}><ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="area" name="Area (sqft)" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => v.toLocaleString()} /><YAxis dataKey="psf" name="PSF" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} /><ZAxis dataKey="price" range={[30, 200]} /><Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => { if (!payload?.length) return null; const d = payload[0]?.payload; return (<div style={{ background: 'rgba(15,23,42,0.95)', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', fontSize: 11, color: '#e2e8f0' }}><p style={{ fontWeight: 600, marginBottom: 4 }}>{d?.project}</p><p>Area: {d?.area?.toLocaleString()} sqft</p><p>PSF: ${d?.psf?.toLocaleString()}</p><p>Price: ${d?.price?.toLocaleString()}</p></div>); }} /><Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />{scatterData.map(s => <Scatter key={s.segment} name={s.segment} data={s.data} fill={SEGMENT_COLORS_MAP[s.segment]} opacity={0.7} />)}</ScatterChart></ResponsiveContainer></div></div>

            {/* Heatmap */}
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div><div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><span style={{ fontSize: 16 }}>{'\ud83d\udcc5\ufe0f'}</span><h3 style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 600, margin: 0 }}>Historical Heatmap</h3></div><p style={{ color: '#64748b', fontSize: 12, margin: 0 }}>Floor Level {'\u00d7'} Year</p></div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => setShowDiff(!showDiff)} style={{ background: showDiff ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.06)', border: showDiff ? '1px solid rgba(56,189,248,0.4)' : '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 14px', fontSize: 11, fontWeight: 500, cursor: cp, color: showDiff ? '#38bdf8' : '#94a3b8' }}>{'\u2194'} Changes</button>
                  <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 2 }}>
                    {[{ key: 'psf', label: '$ PSF' }, { key: 'price', label: '\ud83d\udcb5 Price' }, { key: 'volume', label: '\ud83d\udcca Vol' }].map(m => (
                      <button key={m.key} onClick={() => setHeatmapMetric(m.key)} style={{ background: heatmapMetric === m.key ? 'rgba(255,255,255,0.12)' : 'transparent', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 500, color: heatmapMetric === m.key ? '#e2e8f0' : '#64748b', cursor: cp }}>{m.label}</button>
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
                          <div style={{ width: 80, flexShrink: 0, fontSize: 12, fontWeight: 600, color: '#cbd5e1', padding: '12px 8px', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', fontFamily: fm }}>{floor}</div>
                          {matrixData.cols.map(year => {
                            const key = `${floor}-${year}`; const cell = matrixData.map.get(key); const dd = matrixData.diffMap.get(key);
                            let dv = '-', bg = 'transparent', tc = '#475569';
                            if (showDiff) { if (dd && !dd.isBase) { let diff = heatmapMetric === 'psf' ? dd.diffPsf : heatmapMetric === 'price' ? dd.diffPrice : dd.diffVol; if (diff != null) { dv = heatmapMetric === 'psf' ? (diff>0?'+':'')+Math.round(diff) : heatmapMetric === 'price' ? (diff>0?'+':'')+formatCompactNumber(diff) : (diff>0?'+':'')+diff; let mn=0,mx=0; if(heatmapMetric==='psf'){mn=matrixData.minDiffPsf;mx=matrixData.maxDiffPsf;}else if(heatmapMetric==='price'){mn=matrixData.minDiffPrice;mx=matrixData.maxDiffPrice;}else{mn=matrixData.minDiffVol;mx=matrixData.maxDiffVol;} bg=getDiffColor(diff,mn,mx); tc=getDiffTextColor(diff,mn,mx); } } } else if (cell) { let val=0,mn=0,mx=0; if(heatmapMetric==='psf'){val=Math.round(cell.totalPsf/cell.count);dv=`$${val.toLocaleString()}`;mn=matrixData.minPsf;mx=matrixData.maxPsf;}else if(heatmapMetric==='price'){val=cell.totalPrice/cell.count;dv=`$${formatCompactNumber(val)}`;mn=matrixData.minPrice;mx=matrixData.maxPrice;}else{val=cell.count;dv=val;mn=matrixData.minVol;mx=matrixData.maxVol;} bg=getHeatmapColor(val,mn,mx); tc=getHeatmapTextColor(val,mn,mx); }
                            return <div key={key} style={{ flex: 1, minWidth: 80, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontFamily: fm, fontWeight: 500, backgroundColor: bg, color: tc }} title={cell ? `${floor} ${year}: $${Math.round(cell.totalPsf/cell.count).toLocaleString()} PSF (${cell.count} txns)` : 'No data'}>{dv}</div>;
                          })}
                          {[{ v: st?.avgIncrement, f: v => heatmapMetric==='psf'?Math.round(v):heatmapMetric==='price'?formatCompactNumber(v):v.toFixed(1), s: true },{ v: st?.avgPercChange, f: v => `${Math.abs(v).toFixed(1)}%`, a: true },{ v: st?.totalChangeVal, f: v => heatmapMetric==='psf'?Math.round(v):heatmapMetric==='price'?formatCompactNumber(v):v.toFixed(1), s: true },{ v: st?.totalChangePerc, f: v => `${Math.abs(v).toFixed(1)}%`, a: true }].map((s,si) => { const z = !s.v || s.v===0; const p = (s.v??0)>0; return <div key={si} style={{ width: 80, flexShrink: 0, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontFamily: fm, borderLeft: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', color: z ? '#475569' : p ? '#4ade80' : '#f87171' }}>{z ? '-' : <span>{s.a?(p?'\u2191 ':'\u2193 '):''}{s.s&&!s.a?(p?'+':''):''}{s.f(s.v)}</span>}</div>; })}
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
              <h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{'\ud83c\udfe2'} Floor Premium Analysis</h3>
              <p style={{ color: '#64748b', fontSize: 11, marginBottom: 12 }}>Based on {yearRangeLabel} transactions{selectedYears.length === 0 && latestFilteredYear ? ` \u00b7 Tip: filter by ${latestFilteredYear} for latest rates` : ''}</p>
              <div style={{ height: 340 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={floorPremium}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="floor" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} /><Tooltip content={<CustomTooltip />} /><Bar dataKey="avgPsf" name="Avg PSF" radius={[6,6,0,0]} barSize={28}>{floorPremium.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div>
            </div>
            <div style={cardStyle}>
              <h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{'\ud83d\udccb'} Floor Premium Table</h3>
              <p style={{ color: '#64748b', fontSize: 11, marginBottom: 12 }}>Avg PSF per floor range {'\u00b7'} {yearRangeLabel}</p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{['Floor', 'Avg PSF', 'Count', 'Premium $', 'Premium %'].map(h => <th key={h} style={{ color: '#94a3b8', fontWeight: 500, padding: '10px 12px', textAlign: 'left' }}>{h}</th>)}</tr></thead>
                  <tbody>{floorPremium.map((f, i) => (
                    <tr key={f.floor} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                      <td style={{ color: '#e2e8f0', padding: '10px 12px', fontWeight: 600, fontFamily: fm }}>{f.floor}</td>
                      <td style={{ color: '#38bdf8', padding: '10px 12px', fontFamily: fm }}>{formatCurrency(f.avgPsf)}</td>
                      <td style={{ color: '#94a3b8', padding: '10px 12px' }}>{f.count}</td>
                      <td style={{ color: f.premiumDollar > 0 ? '#34d399' : f.premiumDollar < 0 ? '#f87171' : '#94a3b8', padding: '10px 12px', fontFamily: fm }}>{f.premiumDollar > 0 ? '+' : ''}{formatCurrency(f.premiumDollar)}</td>
                      <td style={{ color: f.premiumPct > 0 ? '#34d399' : f.premiumPct < 0 ? '#f87171' : '#94a3b8', padding: '10px 12px', fontFamily: fm }}>{f.premiumPct > 0 ? '+' : ''}{f.premiumPct}%</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'rental' && (
          <div>
            {rentalLoading ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{ width: 40, height: 40, border: '3px solid rgba(56,189,248,0.2)', borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading rental data...</p>
                <p style={{ color: '#475569', fontSize: 11, marginTop: 4 }}>Fetching quarterly data (this may take a moment)</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : filteredRentals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>{'\ud83c\udfe0'}</div>
                <p style={{ fontSize: 14 }}>No rental data available</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>Rental data may not be available for all periods</p>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
                  <select value={rentalBedroom} onChange={e => setRentalBedroom(e.target.value)} style={{ ...bs, minWidth: 120 }}>
                    {rentalBedrooms.map(b => <option key={b} value={b}>Bedrooms: {b}</option>)}
                  </select>
                  <span style={{ color: '#475569', fontSize: 11 }}>{filteredRentals.length.toLocaleString()} rental contracts</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
                  {[
                    { label: 'Rental Contracts', value: rentalStats.count.toLocaleString(), color: '#38bdf8', icon: '\ud83d\udccb' },
                    { label: 'Avg Monthly Rent', value: `$${rentalStats.avgRent.toLocaleString()}`, color: '#34d399', icon: '\ud83d\udcb5' },
                    { label: 'Median Rent', value: `$${rentalStats.medianRent.toLocaleString()}`, color: '#f472b6', icon: '\ud83d\udcca' },
                    { label: 'Avg Rent PSF', value: `$${rentalStats.avgRentPsf}`, color: '#fb923c', icon: '\ud83d\udcd0' },
                  ].map((s, i) => (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</span>
                        <span style={{ fontSize: 14 }}>{s.icon}</span>
                      </div>
                      <div style={{ color: s.color, fontSize: 18, fontWeight: 700, fontFamily: fm }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{'\ud83d\udcc8'} Rental Trend (Quarterly)</h3><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={rentalTrend}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="quarter" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} angle={-30} textAnchor="end" height={50} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} /><Tooltip content={<CustomTooltip />} /><Bar dataKey="avgRent" name="Avg Rent" fill="#6366f1" radius={[4,4,0,0]} barSize={16} /><Line dataKey="avgRent" name="Trend" stroke="#38bdf8" strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer></div></div>

                  <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{'\ud83d\udecf\ufe0f'} Rent by Bedroom Count</h3><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={rentalByBedroom}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="bedroom" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} /><Tooltip content={<CustomTooltip />} /><Bar dataKey="avgRent" name="Avg Rent" radius={[6,6,0,0]} barSize={40}>{rentalByBedroom.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div></div>

                  <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{'\ud83d\udccd'} Avg Rent by District</h3><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={rentalByDistrict}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="district" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} /><Tooltip content={<CustomTooltip />} /><Bar dataKey="avgRent" name="Avg Rent" fill="#14b8a6" radius={[4,4,0,0]} barSize={16} /></BarChart></ResponsiveContainer></div></div>

                  <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{'\ud83d\udcd0'} Rent PSF by District</h3><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={rentalPsfByDistrict}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="district" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v.toFixed(1)}`} /><Tooltip content={<CustomTooltip />} /><Bar dataKey="rentPsf" name="Rent PSF" fill="#f59e0b" radius={[4,4,0,0]} barSize={16} /></BarChart></ResponsiveContainer></div></div>

                  <div style={{ gridColumn: '1 / -1', ...cardStyle }}>
                    <h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{'\ud83d\udcb0'} Estimated Gross Rental Yield by District</h3>
                    <p style={{ color: '#64748b', fontSize: 11, marginBottom: 16 }}>Annual Rent {'\u00f7'} Purchase Price PSF {'\u2022'} based on {yearRangeLabel} data</p>
                    {rentalYield.length === 0 ? (
                      <p style={{ color: '#475569', fontSize: 12, textAlign: 'center', padding: 20 }}>Need both rental and transaction data to calculate yield</p>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div style={{ height: 320 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={rentalYield} layout="vertical">
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.06)" />
                              <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `${v}%`} />
                              <YAxis dataKey="district" type="category" width={50} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} />
                              <Tooltip content={({ payload }) => { if (!payload?.length) return null; const d = payload[0]?.payload; return (<div style={{ background: 'rgba(15,23,42,0.95)', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', fontSize: 11, color: '#e2e8f0' }}><p style={{ fontWeight: 600, marginBottom: 6 }}>{d?.district}</p><p>Yield: <span style={{ color: '#34d399' }}>{d?.yield}%</span></p><p>Rent PSF: ${d?.rentPsf}/mo</p><p>Buy PSF: ${d?.buyPsf?.toLocaleString()}</p></div>); }} />
                              <Bar dataKey="yield" name="Yield %" radius={[0,6,6,0]} barSize={16}>
                                {rentalYield.map((e, i) => <Cell key={i} fill={e.yield >= 3 ? '#22c55e' : e.yield >= 2.5 ? '#f59e0b' : '#ef4444'} />)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{['District', 'Rent PSF/mo', 'Buy PSF', 'Gross Yield'].map(h => <th key={h} style={{ color: '#94a3b8', fontWeight: 500, padding: '10px 12px', textAlign: 'left' }}>{h}</th>)}</tr></thead>
                            <tbody>{rentalYield.map((r, i) => (
                              <tr key={r.district} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                                <td style={{ color: '#e2e8f0', padding: '10px 12px', fontWeight: 600, fontFamily: fm }}>{r.district}</td>
                                <td style={{ color: '#f59e0b', padding: '10px 12px', fontFamily: fm }}>${r.rentPsf}</td>
                                <td style={{ color: '#38bdf8', padding: '10px 12px', fontFamily: fm }}>${r.buyPsf.toLocaleString()}</td>
                                <td style={{ color: r.yield >= 3 ? '#22c55e' : r.yield >= 2.5 ? '#f59e0b' : '#ef4444', padding: '10px 12px', fontWeight: 700, fontFamily: fm }}>{r.yield}%</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ gridColumn: '1 / -1', ...cardStyle }}>
                    <h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{'\ud83d\udccd'} Rental Trend by District (Quarterly)</h3>
                    <div style={{ height: 380 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={rentalDistrictTrend}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                          <XAxis dataKey="quarter" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} />
                          <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                          {activeRentalDistricts.slice(0, 15).map((d, i) => <Line key={d} type="monotone" dataKey={`D${d}`} name={`D${d}`} stroke={COLORS[i % COLORS.length]} strokeWidth={1.5} dot={false} connectNulls />)}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== ANALYSIS TAB ===== */}
        {activeTab === 'analyze' && <div>
          {/* Project search */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ position: 'relative', maxWidth: 400 }}>
              <input type="text" placeholder="Search project name..." value={analyzeSearch} onChange={e => { setAnalyzeSearch(e.target.value); setShowAnalyzeDD(true); }} onFocus={() => setShowAnalyzeDD(true)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '12px 16px', color: '#e2e8f0', fontSize: 14, outline: 'none', fontFamily: fm }} />
              {showAnalyzeDD && analyzeSearch.trim() && <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, zIndex: 50, maxHeight: 320, overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
                {analyzeFilteredProjects.length === 0 ? <div style={{ padding: 16, color: '#64748b', fontSize: 12, textAlign: 'center' }}>No projects found</div> : analyzeFilteredProjects.map(p => <div key={p} onClick={() => { setAnalyzeProject(p); setAnalyzeSearch(p); setShowAnalyzeDD(false); setAnalyzeTab('overview'); setPricingArea(''); setPricingFloor(''); }} style={{ padding: '10px 16px', fontSize: 13, cursor: cp, color: p === analyzeProject ? '#a78bfa' : '#cbd5e1', borderBottom: '1px solid rgba(255,255,255,0.04)' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{p}</div>)}
              </div>}
            </div>
          </div>

          {analyzeProject && projSaleStats ? <div>
            {/* Project info bar */}
            <div style={{ ...cardStyle, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 700, margin: 0 }}>{analyzeProject}</h2>
                <p style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>D{projInfo?.district} {'\u2022'} {projInfo?.segment} {'\u2022'} {projInfo?.tenure} {'\u2022'} {projSaleStats.count} transactions</p>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                {[{ label: 'Avg PSF', value: $f(projSaleStats.avgPsf), color: '#38bdf8' }, { label: 'Volume', value: `$${(projSaleStats.totalVol / 1e6).toFixed(1)}M`, color: '#a78bfa' }, { label: 'Range', value: `${$f(projSaleStats.minPsf)}\u2013${$f(projSaleStats.maxPsf)}`, color: '#94a3b8' }].map((s,i) => <div key={i} style={{ textAlign: 'right' }}><div style={{ color: '#64748b', fontSize: 10 }}>{s.label}</div><div style={{ color: s.color, fontSize: 16, fontWeight: 700, fontFamily: fm }}>{s.value}</div></div>)}
              </div>
            </div>

            {/* Subtabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
              {[{id:'overview',label:'Overview'},{id:'pricing',label:'Pricing'},{id:'floor',label:'Floor'},{id:'compare',label:'Compare'}].map(t => <button key={t.id} onClick={() => setAnalyzeTab(t.id)} style={{ background: analyzeTab === t.id ? 'rgba(167,139,250,0.15)' : 'transparent', border: analyzeTab === t.id ? '1px solid rgba(167,139,250,0.3)' : '1px solid transparent', borderRadius: 8, padding: '8px 16px', color: analyzeTab === t.id ? '#a78bfa' : '#64748b', fontSize: 12, fontWeight: 500, cursor: cp }}>{t.label}</button>)}
            </div>

            {/* Overview subtab */}
            {analyzeTab === 'overview' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Area vs PSF</h3><div style={{ height: 280 }}>{projScatter.length ? <ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="area" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} /><YAxis dataKey="psf" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v}`} /><Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => { if (!payload?.length) return null; const d = payload[0]?.payload; return <div style={{ background: 'rgba(15,23,42,0.95)', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', fontSize: 11, color: '#e2e8f0' }}><p>Fl {d?.floor} {'\u2022'} {d?.date}</p><p>{d?.area?.toLocaleString()} sqft {'\u2022'} ${d?.psf} PSF {'\u2022'} ${d?.price?.toLocaleString()}</p></div>; }} /><Scatter data={projScatter} fill="#a78bfa" opacity={0.8} /></ScatterChart></ResponsiveContainer> : <p style={{ color: '#64748b' }}>No data</p>}</div></div>
              <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Nearby Projects (D{projInfo?.district})</h3><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{['Project', 'Avg PSF', 'Txns'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead><tbody>{nearbyProjects.map((p, i) => <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}><td style={{ ...tdStyle, color: '#e2e8f0', fontSize: 11 }}>{p.name.length > 30 ? p.name.substring(0,30)+'\u2026' : p.name}</td><td style={{ ...tdStyle, color: '#38bdf8', fontFamily: fm }}>{$f(p.avgPsf)}</td><td style={{ ...tdStyle, color: '#94a3b8' }}>{p.count}</td></tr>)}</tbody></table></div></div>
            </div>}

            {/* Pricing subtab */}
            {analyzeTab === 'pricing' && (() => {
              const defArea = projAreas.length ? projAreas[Math.floor(projAreas.length / 2)] : 0;
              const rawArea = parseFloat(pricingArea) || defArea;
              const area = projAreas.length ? projAreas.reduce((p,c) => Math.abs(c-rawArea) < Math.abs(p-rawArea) ? c : p) : rawArea;
              const sf = pricingFloor; const yr = projLatestSaleYear;
              const latAll = projTx.filter(t => t.year === yr);
              const latPsf = latAll.length ? Math.round((latAll.reduce((s,t) => s+t.psf, 0) / latAll.length) * 100) / 100 : projSaleStats ? projSaleStats.avgPsf : 0;
              const sizeTx = area > 0 ? latAll.filter(t => t.areaSqft === area) : [];
              const sizePsf = sizeTx.length ? Math.round((sizeTx.reduce((s,t) => s+t.psf, 0) / sizeTx.length) * 100) / 100 : 0;
              const matchTx = sf && area > 0 ? sizeTx.filter(t => t.floorRange === sf) : [];
              const matchPsf = matchTx.length ? Math.round((matchTx.reduce((s,t) => s+t.psf, 0) / matchTx.length) * 100) / 100 : 0;
              const bestPsf = matchPsf || sizePsf || latPsf;
              const bestLabel = matchPsf ? 'Exact Match' : sizePsf ? 'Size Match' : 'Project Avg';
              const bestTx = matchPsf ? matchTx : sizePsf ? sizeTx : latAll;
              const iS = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 13, fontFamily: fm, outline: 'none', width: '100%' };
              const srt = a => [...a].sort((a,b) => b.contractDate.localeCompare(a.contractDate));

              return <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ ...cardStyle, background: 'linear-gradient(135deg,#1e293b,#0f172a)', border: '1px solid rgba(167,139,250,0.2)', padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '24px 24px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                      <div>
                        <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>ESTIMATED PRICE{yr && <span style={{ background: 'rgba(34,197,94,0.15)', borderRadius: 4, padding: '2px 8px', fontSize: 9, fontWeight: 700, color: '#4ade80', marginLeft: 8 }}>{yr}</span>}</div>
                        <div style={{ color: '#e2e8f0', fontSize: 36, fontWeight: 800, fontFamily: fm, lineHeight: 1 }}>{$c(bestPsf * area)}</div>
                        <div style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>{$f(bestPsf)} PSF {'\u00d7'} {area.toLocaleString()} sqft</div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 14px', textAlign: 'right' }}>
                        <div style={{ color: '#64748b', fontSize: 9, marginBottom: 2 }}>BASED ON</div>
                        <div style={{ color: '#a78bfa', fontSize: 13, fontWeight: 700 }}>{bestLabel}</div>
                        <div style={{ color: '#475569', fontSize: 10 }}>{bestTx.length} transaction{bestTx.length !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div><label style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600, marginBottom: 6, display: 'block' }}>UNIT TYPE</label>
                        {projAreas.length > 0 ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{projAreas.map(a => <button key={a} onClick={() => setPricingArea(String(a))} style={{ background: area === a ? '#a78bfa' : 'rgba(255,255,255,0.06)', border: area === a ? '1px solid #a78bfa' : '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '6px 12px', fontSize: 12, color: area === a ? '#fff' : '#94a3b8', cursor: cp, fontFamily: fm, fontWeight: area === a ? 700 : 400 }}>{a.toLocaleString()}</button>)}</div> : <input type="number" value={pricingArea} onChange={e => setPricingArea(e.target.value)} placeholder="sqft" style={iS} />}
                      </div>
                      <div><label style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600, marginBottom: 6, display: 'block' }}>FLOOR LEVEL</label>
                        <select value={pricingFloor} onChange={e => setPricingFloor(e.target.value)} style={{ ...iS, cursor: cp }}><option value="">All floors</option>{projFloorDetail.map(f => <option key={f.floor} value={f.floor}>{f.floor} ({f.allCount} tx)</option>)}</select>
                      </div>
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', display: 'grid', background: 'rgba(255,255,255,0.02)' }}>
                    {(() => { const cols = [{ psf: latPsf, label: 'Project Avg', sub: `All sizes \u2022 All floors \u2022 ${latAll.length}tx`, c: '#94a3b8', active: !sizePsf && !matchPsf }]; if (sizePsf) cols.push({ psf: sizePsf, label: `${area.toLocaleString()} sqft`, sub: `Exact size \u2022 All floors \u2022 ${sizeTx.length}tx`, c: '#38bdf8', active: !matchPsf }); if (sf) cols.push(matchPsf ? { psf: matchPsf, label: `${area.toLocaleString()} \u2022 Fl ${sf}`, sub: `Exact size & floor \u2022 ${matchTx.length}tx`, c: '#22c55e', active: true } : { psf: 0, label: `Fl ${sf}`, sub: 'No matching tx', c: '#475569', active: false }); return <div style={{ display: 'grid', gridTemplateColumns: cols.map(() => '1fr').join(' ') }}>{cols.map((t,i) => <div key={i} style={{ padding: '14px 16px', borderRight: i < cols.length-1 ? '1px solid rgba(255,255,255,0.06)' : 'none', background: t.active ? 'rgba(167,139,250,0.04)' : 'transparent' }}><div style={{ color: t.c, fontSize: 18, fontWeight: 800, fontFamily: fm }}>{t.psf ? $c(t.psf * area) : '\u2014'}</div><div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600, marginTop: 2 }}>{t.label}</div><div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{t.sub}</div>{t.psf > 0 && latPsf > 0 && t.psf !== latPsf && <div style={{ color: t.psf < latPsf ? '#4ade80' : '#f87171', fontSize: 10, fontWeight: 600, fontFamily: fm, marginTop: 4 }}>{t.psf < latPsf ? '' : '+'}{Math.round((t.psf - latPsf) / latPsf * 1000) / 10}% vs avg</div>}</div>)}</div>; })()}
                  </div>
                </div>
                {bestTx.length > 0 && <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>Transactions Used</span><span style={{ color: '#64748b', fontSize: 11 }}>{bestLabel} {'\u2022'} {bestTx.length} records</span></div>
                  <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{['Date','Size','Floor','PSF','Price'].map(h => <th key={h} style={{ ...thStyle, fontSize: 10, padding: '8px 10px' }}>{h}</th>)}</tr></thead><tbody>{srt(bestTx).slice(0,8).map((t,i) => <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}><td style={{ ...tdStyle, color: '#94a3b8', fontSize: 11, padding: '8px 10px' }}>{t.contractDate}</td><td style={{ ...tdStyle, color: '#e2e8f0', fontFamily: fm, fontSize: 11, padding: '8px 10px' }}>{t.areaSqft.toLocaleString()}</td><td style={{ ...tdStyle, color: '#e2e8f0', fontFamily: fm, fontSize: 11, padding: '8px 10px' }}>{t.floorRange}</td><td style={{ ...tdStyle, color: '#38bdf8', fontFamily: fm, fontWeight: 600, fontSize: 11, padding: '8px 10px' }}>{$f(t.psf)}</td><td style={{ ...tdStyle, color: '#e2e8f0', fontFamily: fm, fontWeight: 600, fontSize: 11, padding: '8px 10px' }}>{$c(t.priceNum)}</td></tr>)}</tbody></table>
                  {bestTx.length > 8 && <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: 8 }}>+{bestTx.length - 8} more</div>}
                  </div>
                </div>}
              </div>;
            })()}

            {/* Floor subtab */}
            {analyzeTab === 'floor' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Floor Premium</h3><div style={{ height: 340 }}>{projFloor.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={projFloor}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="floor" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} /><Tooltip content={<CustomTooltip />} /><Bar dataKey="avgPsf" name="Avg PSF" radius={[6,6,0,0]} barSize={28}>{projFloor.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer> : <p style={{ color: '#64748b' }}>No data</p>}</div></div>
              <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Floor Table</h3><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{['Floor','Avg PSF','Count','vs Avg $','vs Avg %'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead><tbody>{projFloor.map((f,i) => <tr key={f.floor} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}><td style={{ ...tdStyle, color: '#e2e8f0', fontWeight: 600, fontFamily: fm }}>{f.floor}</td><td style={{ ...tdStyle, color: '#38bdf8', fontFamily: fm }}>{$f(f.avgPsf)}</td><td style={{ ...tdStyle, color: '#94a3b8' }}>{f.count}</td><td style={{ ...tdStyle, color: f.premDollar > 0 ? '#34d399' : f.premDollar < 0 ? '#f87171' : '#94a3b8', fontFamily: fm }}>{f.premDollar > 0 ? '+' : ''}{$f(f.premDollar)}</td><td style={{ ...tdStyle, color: f.premPct > 0 ? '#34d399' : f.premPct < 0 ? '#f87171' : '#94a3b8', fontFamily: fm }}>{f.premPct > 0 ? '+' : ''}{f.premPct}%</td></tr>)}</tbody></table></div></div>
            </div>}

            {/* Compare subtab */}
            {analyzeTab === 'compare' && <div style={{ display: 'grid', gap: 16 }}>
              <div style={cardStyle}><h3 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Project vs District vs Segment</h3><p style={{ color: '#64748b', fontSize: 11, marginBottom: 16 }}>{analyzeProject} vs D{projInfo?.district} vs {projInfo?.segment}</p><div style={{ height: 380 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={projComparison}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" /><XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} /><Tooltip content={<CustomTooltip />} /><Legend wrapperStyle={{ fontSize: 11 }} /><Line type="monotone" dataKey="project" name={analyzeProject.length > 20 ? analyzeProject.substring(0,20)+'\u2026' : analyzeProject} stroke="#a78bfa" strokeWidth={2.5} dot={{ r: 3, fill: '#a78bfa' }} connectNulls /><Line type="monotone" dataKey="district" name={`D${projInfo?.district} Avg`} stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="5 5" dot={false} connectNulls /><Line type="monotone" dataKey="segment" name={`${projInfo?.segment} Avg`} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls /></LineChart></ResponsiveContainer></div></div>
            </div>}
          </div> : <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}><div style={{ fontSize: 40, marginBottom: 12 }}>{'\ud83d\udd0d'}</div><p style={{ fontSize: 14 }}>Search for a project above to analyze</p><p style={{ fontSize: 12, marginTop: 4 }}>Get pricing estimates, floor premium analysis, and market comparison</p></div>}
        </div>}
      </div>

      <div style={{ textAlign: 'center', padding: '20px 28px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 11 }}>
        URA Property Analytics Dashboard {'\u2022'} {filtered.length.toLocaleString()} transactions{allRentals.length > 0 ? ` \u2022 ${allRentals.length.toLocaleString()} rental contracts` : ''} {'\u2022'} All values shown without rounding
      </div>
    </div>
  );
}
