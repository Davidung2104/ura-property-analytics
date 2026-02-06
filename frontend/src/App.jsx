import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { getTransactions, getDistrictSummary, searchProjects } from './services/api';

const COLORS = ['#0ea5e9', '#6366f1', '#8b5cf6', '#f43f5e', '#10b981', '#f59e0b', '#ec4899', '#14b8a6'];
const SEGMENT_COLORS = { CCR: '#ef4444', RCR: '#f59e0b', OCR: '#22c55e' };
const SQM_TO_SQFT = 10.764;

const formatCompact = (num) => {
  if (!num || !isFinite(num)) return '$0';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num}`;
};

const toPsf = (psm) => psm ? Math.round(psm / SQM_TO_SQFT) : 0;

export default function App() {
  const [transactions, setTransactions] = useState([]);
  const [districtData, setDistrictData] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [yearFilter, setYearFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [districtFilter, setDistrictFilter] = useState('');
  const [floorFilter, setFloorFilter] = useState('');
  const [priceMetric, setPriceMetric] = useState('average');
  const [comparisonProjects, setComparisonProjects] = useState([]);
  const [comparisonSearch, setComparisonSearch] = useState('');
  const [showComparisonDropdown, setShowComparisonDropdown] = useState(false);
  const [sortField, setSortField] = useState('contractDate');
  const [sortDirection, setSortDirection] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [txns, districts, projs] = await Promise.all([
          getTransactions(),
          getDistrictSummary(),
          searchProjects('', {})
        ]);
        setTransactions(txns);
        setDistrictData(districts);
        setProjects(projs);
        if (projs.length > 0) setComparisonProjects(projs.slice(0, 2).map(p => p.project));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const years = useMemo(() => {
    const unique = new Set();
    transactions.forEach(t => { if (t.contractDate) unique.add(t.contractDate.substring(0, 4)); });
    return Array.from(unique).sort((a, b) => b - a);
  }, [transactions]);

  const projectNames = useMemo(() => [...new Set(transactions.map(t => t.project).filter(Boolean))].sort(), [transactions]);
  const districts = useMemo(() => [...new Set(transactions.map(t => t.district).filter(Boolean))].sort((a, b) => Number(a) - Number(b)), [transactions]);
  const floors = useMemo(() => {
    const unique = [...new Set(transactions.map(t => t.floorRange).filter(f => f && f !== '-'))];
    return unique.sort((a, b) => (parseInt(a.split('-')[0]) || 0) - (parseInt(b.split('-')[0]) || 0));
  }, [transactions]);

  const filteredProjects = useMemo(() => {
    if (!projectSearch) return projectNames.slice(0, 50);
    return projectNames.filter(p => p.toLowerCase().includes(projectSearch.toLowerCase())).slice(0, 50);
  }, [projectNames, projectSearch]);

  const filteredComparisonProjects = useMemo(() => {
    const available = projectNames.filter(p => !comparisonProjects.includes(p));
    if (!comparisonSearch) return available.slice(0, 50);
    return available.filter(p => p.toLowerCase().includes(comparisonSearch.toLowerCase())).slice(0, 50);
  }, [projectNames, comparisonProjects, comparisonSearch]);

  const filteredData = useMemo(() => transactions.filter(t => {
    if (yearFilter && !t.contractDate?.startsWith(yearFilter)) return false;
    if (projectFilter && t.project !== projectFilter) return false;
    if (districtFilter && t.district !== districtFilter) return false;
    if (floorFilter && t.floorRange !== floorFilter) return false;
    return true;
  }), [transactions, yearFilter, projectFilter, districtFilter, floorFilter]);

  const metrics = useMemo(() => {
    const total = filteredData.length;
    const volume = filteredData.reduce((sum, t) => sum + (t.priceNum || 0), 0);
    const avgPrice = total > 0 ? volume / total : 0;
    const avgPsf = total > 0 ? toPsf(filteredData.reduce((sum, t) => sum + (t.psf || 0), 0) / total) : 0;
    return { total, volume, avgPrice, avgPsf };
  }, [filteredData]);

  const timeSeriesData = useMemo(() => {
    const grouped = {};
    filteredData.forEach(t => {
      if (!t.contractDate || !t.psf) return;
      const month = t.contractDate.substring(0, 7);
      if (!grouped[month]) grouped[month] = { psfValues: [], count: 0 };
      grouped[month].psfValues.push(toPsf(t.psf));
      grouped[month].count++;
    });
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).slice(-24).map(([date, data]) => {
      const sorted = [...data.psfValues].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return {
        name: date,
        avgPsf: Math.round(data.psfValues.reduce((a, b) => a + b, 0) / data.count),
        medianPsf: Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2),
        volume: data.count
      };
    });
  }, [filteredData]);

  const marketSegments = useMemo(() => {
    const grouped = {};
    filteredData.forEach(t => { grouped[t.marketSegment || 'Unknown'] = (grouped[t.marketSegment || 'Unknown'] || 0) + 1; });
    return Object.entries(grouped).map(([name, value]) => ({ name, value }));
  }, [filteredData]);

  const floorAnalysis = useMemo(() => {
    const grouped = {};
    filteredData.forEach(t => {
      if (!t.floorRange || t.floorRange === '-' || !t.psf) return;
      if (!grouped[t.floorRange]) grouped[t.floorRange] = [];
      grouped[t.floorRange].push(toPsf(t.psf));
    });
    const data = Object.entries(grouped).sort(([a], [b]) => (parseInt(a.split('-')[0]) || 0) - (parseInt(b.split('-')[0]) || 0))
      .map(([floor, vals]) => ({ floor, avgPsf: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), count: vals.length }));
    return data.map((item, idx) => {
      if (idx === 0) return { ...item, diff: 0, diffPerc: 0 };
      const prev = data[idx - 1];
      const diff = item.avgPsf - prev.avgPsf;
      return { ...item, diff, diffPerc: prev.avgPsf ? (diff / prev.avgPsf) * 100 : 0 };
    });
  }, [filteredData]);

  const comparisonData = useMemo(() => {
    if (!comparisonProjects.length) return [];
    const grouped = {};
    filteredData.filter(t => comparisonProjects.includes(t.project)).forEach(t => {
      if (!t.contractDate || !t.psf) return;
      const month = t.contractDate.substring(0, 7);
      if (!grouped[month]) grouped[month] = { name: month };
      if (!grouped[month][t.project]) grouped[month][t.project] = { sum: 0, count: 0 };
      grouped[month][t.project].sum += toPsf(t.psf);
      grouped[month][t.project].count++;
    });
    return Object.values(grouped).map(e => {
      const r = { name: e.name };
      comparisonProjects.forEach(p => { if (e[p]?.count) r[p] = Math.round(e[p].sum / e[p].count); });
      return r;
    }).sort((a, b) => a.name.localeCompare(b.name)).slice(-24);
  }, [filteredData, comparisonProjects]);

  const topProjects = useMemo(() => {
    const grouped = {};
    filteredData.forEach(t => { if (t.project) grouped[t.project] = (grouped[t.project] || 0) + 1; });
    return Object.entries(grouped).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filteredData]);

  const sortedData = useMemo(() => [...filteredData].sort((a, b) => {
    let aVal = a[sortField], bVal = b[sortField];
    if (['priceNum', 'psf', 'areaNum'].includes(sortField)) { aVal = Number(aVal) || 0; bVal = Number(bVal) || 0; }
    else if (typeof aVal === 'string') { aVal = aVal?.toLowerCase() || ''; bVal = bVal?.toLowerCase() || ''; }
    return sortDirection === 'asc' ? (aVal < bVal ? -1 : 1) : (aVal > bVal ? -1 : 1);
  }), [filteredData, sortField, sortDirection]);

  const paginatedData = useMemo(() => sortedData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage), [sortedData, currentPage, rowsPerPage]);
  const totalPages = Math.ceil(sortedData.length / rowsPerPage);
  const handleSort = (field) => { setSortField(field); setSortDirection(sortField === field && sortDirection === 'desc' ? 'asc' : 'desc'); setCurrentPage(1); };
  const hasFilters = yearFilter || projectFilter || districtFilter || floorFilter;
  const clearFilters = () => { setYearFilter(''); setProjectFilter(''); setProjectSearch(''); setDistrictFilter(''); setFloorFilter(''); setCurrentPage(1); };
  const toggleComparison = (p) => comparisonProjects.includes(p) ? setComparisonProjects(prev => prev.filter(x => x !== p)) : comparisonProjects.length < 5 && setComparisonProjects(prev => [...prev, p]);
  const selectProject = (p) => { setProjectFilter(p); setProjectSearch(p); setShowProjectDropdown(false); setCurrentPage(1); };
  const selectComparisonProject = (p) => { toggleComparison(p); setComparisonSearch(''); setShowComparisonDropdown(false); };
  const exportToCSV = () => {
    const csv = [['Project','Street','District','Floor','Area (sqm)','Area (sqft)','Price','PSF','Date','Segment'], ...sortedData.map(t => [t.project,t.street,t.district,t.floorRange,t.areaNum,Math.round(t.areaNum*SQM_TO_SQFT),t.priceNum,toPsf(t.psf),t.contractDate,t.marketSegment])].map(r => r.join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'ura_transactions.csv'; a.click();
  };
  const SortIcon = ({ field }) => sortField !== field ? <span className="text-slate-300 ml-1">↕</span> : <span className="text-sky-500 ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>;

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-center"><div className="w-16 h-16 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div><p className="text-slate-600">Loading URA data...</p></div></div>;
  if (error) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-center bg-white p-8 rounded-xl shadow-lg"><h2 className="text-xl font-bold text-red-600 mb-2">Error</h2><p className="text-slate-500 mb-4">{error}</p><button onClick={() => window.location.reload()} className="px-4 py-2 bg-sky-500 text-white rounded-lg">Retry</button></div></div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 bg-sky-500 rounded-lg flex items-center justify-center"><svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg></div>
          <div><h1 className="text-xl font-bold text-slate-900">URA Property Analytics</h1><p className="text-xs text-slate-500">Singapore Real Estate Dashboard</p></div>
        </div>
        <div className="bg-slate-50 border-t px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-slate-500">Filters:</span>
            <select value={yearFilter} onChange={e => { setYearFilter(e.target.value); setCurrentPage(1); }} className="px-3 py-1.5 text-sm border rounded-lg bg-white"><option value="">All Years</option>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
            
            <div className="relative">
              <input 
                type="text" 
                value={projectSearch} 
                onChange={e => { setProjectSearch(e.target.value); setShowProjectDropdown(true); if (!e.target.value) setProjectFilter(''); }}
                onFocus={() => setShowProjectDropdown(true)}
                placeholder="Search project..."
                className="px-3 py-1.5 text-sm border rounded-lg bg-white w-48"
              />
              {showProjectDropdown && filteredProjects.length > 0 && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto z-50">
                  {projectFilter && <div onClick={() => { setProjectFilter(''); setProjectSearch(''); setShowProjectDropdown(false); setCurrentPage(1); }} className="px-3 py-2 hover:bg-slate-100 cursor-pointer text-red-600 border-b">✕ Clear selection</div>}
                  {filteredProjects.map(p => <div key={p} onClick={() => selectProject(p)} className={`px-3 py-2 hover:bg-slate-100 cursor-pointer truncate ${projectFilter === p ? 'bg-sky-50 text-sky-700' : ''}`}>{p}</div>)}
                </div>
              )}
              {showProjectDropdown && <div className="fixed inset-0 z-40" onClick={() => setShowProjectDropdown(false)} />}
            </div>
            
            <select value={districtFilter} onChange={e => { setDistrictFilter(e.target.value); setCurrentPage(1); }} className="px-3 py-1.5 text-sm border rounded-lg bg-white"><option value="">All Districts</option>{districts.map(d => <option key={d} value={d}>D{d.toString().padStart(2, '0')}</option>)}</select>
            <select value={floorFilter} onChange={e => { setFloorFilter(e.target.value); setCurrentPage(1); }} className="px-3 py-1.5 text-sm border rounded-lg bg-white"><option value="">All Floors</option>{floors.map(f => <option key={f} value={f}>{f}</option>)}</select>
            {hasFilters && <button onClick={clearFilters} className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg">✕ Clear</button>}
            <span className="ml-auto text-sm text-slate-500">{filteredData.length.toLocaleString()} records</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl shadow-sm border"><div className="text-slate-500 text-sm mb-2">Total Volume</div><div className="text-2xl font-bold">{formatCompact(metrics.volume)}</div><div className="text-xs text-slate-400">{metrics.total.toLocaleString()} transactions</div></div>
          <div className="bg-white p-5 rounded-xl shadow-sm border"><div className="text-slate-500 text-sm mb-2">Average Price</div><div className="text-2xl font-bold">{formatCompact(metrics.avgPrice)}</div><div className="text-xs text-slate-400">Per transaction</div></div>
          <div className="bg-white p-5 rounded-xl shadow-sm border"><div className="text-slate-500 text-sm mb-2">Average PSF</div><div className="text-2xl font-bold">${metrics.avgPsf.toLocaleString()}</div><div className="text-xs text-slate-400">Per Square Foot</div></div>
          <div className="bg-white p-5 rounded-xl shadow-sm border"><div className="text-slate-500 text-sm mb-2">Active Projects</div><div className="text-2xl font-bold">{projectNames.length.toLocaleString()}</div><div className="text-xs text-slate-400">In dataset</div></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border">
            <div className="flex justify-between mb-4"><div><h3 className="text-lg font-semibold">Price Trend (PSF)</h3><p className="text-sm text-slate-500">{priceMetric === 'average' ? 'Average' : 'Median'} over time</p></div>
              <div className="bg-slate-100 p-1 rounded-lg flex"><button onClick={() => setPriceMetric('average')} className={`px-3 py-1 text-xs rounded ${priceMetric === 'average' ? 'bg-white shadow' : ''}`}>Average</button><button onClick={() => setPriceMetric('median')} className={`px-3 py-1 text-xs rounded ${priceMetric === 'median' ? 'bg-white shadow' : ''}`}>Median</button></div>
            </div>
            <div className="h-64">{timeSeriesData.length > 0 ? <ResponsiveContainer width="100%" height="100%"><LineChart data={timeSeriesData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} /><Tooltip formatter={(v) => [`$${v?.toLocaleString()}`, 'PSF']} /><Line type="monotone" dataKey={priceMetric === 'average' ? 'avgPsf' : 'medianPsf'} stroke="#0ea5e9" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer> : <div className="h-full flex items-center justify-center text-slate-400">No data</div>}</div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <h3 className="text-lg font-semibold mb-4">Market Segment</h3>
            <div className="h-64 relative"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={marketSegments} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value">{marketSegments.map((e, i) => <Cell key={i} fill={SEGMENT_COLORS[e.name] || COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer><div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{marginBottom:'40px'}}><span className="text-2xl font-bold">{filteredData.length.toLocaleString()}</span></div></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border">
          <h3 className="text-lg font-semibold mb-4">District Comparison (Avg PSF)</h3>
          <div className="h-64">{districtData.length > 0 ? <ResponsiveContainer width="100%" height="100%"><BarChart data={districtData.slice(0,20).map(d => ({...d, avgPsf: toPsf(d.avgPsf)}))}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="district" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickFormatter={v => `D${v}`} /><YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} /><Tooltip formatter={(v) => [`$${v?.toLocaleString()}`, 'Avg PSF']} /><Bar dataKey="avgPsf" fill="#6366f1" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="h-full flex items-center justify-center text-slate-400">No data</div>}</div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <h3 className="text-lg font-semibold mb-4">Floor Level Analysis (Avg PSF)</h3>
            <div className="h-64">{floorAnalysis.length > 0 ? <ResponsiveContainer width="100%" height="100%"><BarChart data={floorAnalysis}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="floor" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} interval={0} angle={-45} textAnchor="end" height={60} /><YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} /><Tooltip formatter={(v) => [`$${v?.toLocaleString()}`, 'Avg PSF']} /><Bar dataKey="avgPsf" fill="#0ea5e9" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="h-full flex items-center justify-center text-slate-400">No data</div>}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-6 border-b"><h3 className="text-lg font-semibold">Floor Premium (PSF)</h3></div>
            <div className="overflow-y-auto max-h-72"><table className="w-full text-sm"><thead className="bg-slate-50 sticky top-0"><tr><th className="px-4 py-2 text-left">Floor</th><th className="px-4 py-2 text-right">Avg PSF</th><th className="px-4 py-2 text-right">Count</th><th className="px-4 py-2 text-right">% Change</th></tr></thead><tbody className="divide-y">{floorAnalysis.map((r, i) => <tr key={r.floor} className="hover:bg-slate-50"><td className="px-4 py-2 font-medium">{r.floor}</td><td className="px-4 py-2 text-right font-mono">${r.avgPsf?.toLocaleString()}</td><td className="px-4 py-2 text-right text-slate-500">{r.count}</td><td className={`px-4 py-2 text-right font-medium ${r.diffPerc > 0 ? 'text-green-600' : r.diffPerc < 0 ? 'text-red-600' : 'text-slate-400'}`}>{i === 0 ? '-' : `${r.diffPerc > 0 ? '+' : ''}${r.diffPerc?.toFixed(1)}%`}</td></tr>)}</tbody></table></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border">
          <div className="flex flex-wrap justify-between gap-4 mb-4">
            <div><h3 className="text-lg font-semibold">Project Comparison (PSF)</h3><p className="text-sm text-slate-500">Select up to 5 projects</p></div>
            <div className="relative">
              <input 
                type="text" 
                value={comparisonSearch} 
                onChange={e => { setComparisonSearch(e.target.value); setShowComparisonDropdown(true); }}
                onFocus={() => setShowComparisonDropdown(true)}
                placeholder="+ Add project..."
                className="px-3 py-1.5 text-sm border rounded-lg bg-white w-48"
              />
              {showComparisonDropdown && filteredComparisonProjects.length > 0 && (
                <div className="absolute top-full right-0 mt-1 w-64 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto z-50">
                  {filteredComparisonProjects.map(p => <div key={p} onClick={() => selectComparisonProject(p)} className="px-3 py-2 hover:bg-slate-100 cursor-pointer truncate">{p}</div>)}
                </div>
              )}
              {showComparisonDropdown && <div className="fixed inset-0 z-40" onClick={() => setShowComparisonDropdown(false)} />}
            </div>
          </div>
          {comparisonProjects.length > 0 && <div className="flex flex-wrap gap-2 mb-4">{comparisonProjects.map((p, i) => <div key={p} className="flex items-center gap-2 px-3 py-1 rounded-full text-xs bg-slate-100 border-l-4" style={{ borderLeftColor: COLORS[i % COLORS.length] }}><span className="truncate max-w-[150px]">{p}</span><button onClick={() => toggleComparison(p)} className="text-slate-400 hover:text-slate-600">×</button></div>)}</div>}
          <div className="h-64">{comparisonProjects.length === 0 ? <div className="h-full flex items-center justify-center text-slate-400 border-2 border-dashed rounded-xl">Select projects to compare</div> : comparisonData.length === 0 ? <div className="h-full flex items-center justify-center text-slate-400">No data for selected projects</div> : <ResponsiveContainer width="100%" height="100%"><LineChart data={comparisonData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} /><Tooltip formatter={(v, name) => [`$${v?.toLocaleString() || '-'}`, name]} /><Legend />{comparisonProjects.map((p, i) => <Line key={p} type="monotone" dataKey={p} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} connectNulls />)}</LineChart></ResponsiveContainer>}</div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <h3 className="text-lg font-semibold mb-4">Top Projects</h3>
            <div className="h-64">{topProjects.length > 0 ? <ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={topProjects}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" /><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={120} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} /><Tooltip /><Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} /></BarChart></ResponsiveContainer> : <div className="h-full flex items-center justify-center text-slate-400">No data</div>}</div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <h3 className="text-lg font-semibold mb-4">Transaction Frequency</h3>
            <div className="h-64">{timeSeriesData.length > 0 ? <ResponsiveContainer width="100%" height="100%"><BarChart data={timeSeriesData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} /><Tooltip /><Bar dataKey="volume" fill="#ec4899" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="h-full flex items-center justify-center text-slate-400">No data</div>}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-6 border-b flex flex-wrap items-center justify-between gap-4">
            <div><h3 className="text-lg font-semibold">All Transactions</h3><p className="text-sm text-slate-500">{sortedData.length.toLocaleString()} records</p></div>
            <div className="flex items-center gap-3">
              <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="px-3 py-1.5 text-sm border rounded-lg"><option value={10}>10 per page</option><option value={25}>25 per page</option><option value={50}>50 per page</option></select>
              <button onClick={exportToCSV} className="px-3 py-1.5 text-sm bg-sky-500 text-white rounded-lg hover:bg-sky-600">Export CSV</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50"><tr>
                <th className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100" onClick={() => handleSort('project')}>Project <SortIcon field="project" /></th>
                <th className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100" onClick={() => handleSort('street')}>Street <SortIcon field="street" /></th>
                <th className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100" onClick={() => handleSort('district')}>District <SortIcon field="district" /></th>
                <th className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100" onClick={() => handleSort('floorRange')}>Floor <SortIcon field="floorRange" /></th>
                <th className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('areaNum')}>Area (sqft) <SortIcon field="areaNum" /></th>
                <th className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('priceNum')}>Price <SortIcon field="priceNum" /></th>
                <th className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('psf')}>PSF <SortIcon field="psf" /></th>
                <th className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100" onClick={() => handleSort('contractDate')}>Date <SortIcon field="contractDate" /></th>
                <th className="px-4 py-3 text-left">Segment</th>
              </tr></thead>
              <tbody className="divide-y">{paginatedData.map((t, i) => <tr key={i} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium max-w-[200px] truncate">{t.project}</td>
                <td className="px-4 py-3 text-slate-600 max-w-[150px] truncate">{t.street}</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">D{t.district?.toString().padStart(2, '0')}</span></td>
                <td className="px-4 py-3 text-slate-600">{t.floorRange}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-600">{Math.round(t.areaNum * SQM_TO_SQFT).toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-mono font-medium">{formatCompact(t.priceNum)}</td>
                <td className="px-4 py-3 text-right font-mono text-sky-600 font-medium">${toPsf(t.psf).toLocaleString()}</td>
                <td className="px-4 py-3 text-slate-600">{t.contractDate}</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs rounded" style={{ backgroundColor: (SEGMENT_COLORS[t.marketSegment] || '#64748b') + '20', color: SEGMENT_COLORS[t.marketSegment] || '#64748b' }}>{t.marketSegment}</span></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="p-4 border-t flex items-center justify-between bg-slate-50">
            <div className="text-sm text-slate-500">Showing {((currentPage - 1) * rowsPerPage) + 1} - {Math.min(currentPage * rowsPerPage, sortedData.length)} of {sortedData.length.toLocaleString()}</div>
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50">Previous</button>
              <span className="text-sm">Page {currentPage} of {totalPages || 1}</span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50">Next</button>
            </div>
          </div>
        </div>
      </main>
      <footer className="bg-white border-t mt-8"><div className="max-w-7xl mx-auto px-4 py-4 text-center text-sm text-slate-500">Data source: Urban Redevelopment Authority (URA) • {transactions.length.toLocaleString()} transactions loaded</div></footer>
    </div>
  );
}
