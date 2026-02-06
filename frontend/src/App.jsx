import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { getTransactions, getDistrictSummary, getPropertyTypeSummary, searchProjects, getFilterOptions } from './services/api';

const COLORS = ['#0ea5e9', '#6366f1', '#8b5cf6', '#f43f5e', '#10b981', '#f59e0b', '#ec4899', '#14b8a6'];
const SEGMENT_COLORS = { CCR: '#ef4444', RCR: '#f59e0b', OCR: '#22c55e' };

const formatCompact = (num) => {
  if (!num) return '$0';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num}`;
};

export default function App() {
  // Data states
  const [transactions, setTransactions] = useState([]);
  const [districtData, setDistrictData] = useState([]);
  const [propertyTypes, setPropertyTypes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [filterOptions, setFilterOptions] = useState({ districts: [], propertyTypes: [], years: [] });
  
  // UI states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filter states
  const [yearFilter, setYearFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const [floorFilter, setFloorFilter] = useState('');
  
  // Chart options
  const [priceMetric, setPriceMetric] = useState('average');
  const [heatmapMetric, setHeatmapMetric] = useState('psf');
  const [comparisonProjects, setComparisonProjects] = useState([]);
  
  // Table states
  const [sortField, setSortField] = useState('contractDate');
  const [sortDirection, setSortDirection] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Load data on mount
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        
        const [txns, districts, propTypes, projs, filters] = await Promise.all([
          getTransactions(),
          getDistrictSummary(),
          getPropertyTypeSummary(),
          searchProjects('', {}),
          getFilterOptions()
        ]);
        
        setTransactions(txns);
        setDistrictData(districts);
        setPropertyTypes(propTypes);
        setProjects(projs);
        setFilterOptions(filters);
        
        // Set initial comparison projects
        if (projs.length > 0) {
          setComparisonProjects(projs.slice(0, 2).map(p => p.project));
        }
      } catch (err) {
        console.error('Failed to load data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Extract unique values for filters
  const years = useMemo(() => {
    const unique = new Set();
    transactions.forEach(t => {
      if (t.contractDate) {
        const year = t.contractDate.substring(0, 4);
        if (year) unique.add(year);
      }
    });
    return Array.from(unique).sort((a, b) => b - a);
  }, [transactions]);

  const projectNames = useMemo(() => {
    return [...new Set(transactions.map(t => t.project).filter(Boolean))].sort();
  }, [transactions]);

  const districts = useMemo(() => {
    return [...new Set(transactions.map(t => t.district).filter(Boolean))].sort();
  }, [transactions]);

  const floors = useMemo(() => {
    const unique = [...new Set(transactions.map(t => t.floorRange).filter(Boolean))];
    return unique.sort((a, b) => {
      const getNum = (f) => parseInt(f.split('-')[0]) || 0;
      return getNum(a) - getNum(b);
    });
  }, [transactions]);

  // Apply filters
  const filteredData = useMemo(() => {
    return transactions.filter(t => {
      if (yearFilter && !t.contractDate?.startsWith(yearFilter)) return false;
      if (projectFilter && t.project !== projectFilter) return false;
      if (districtFilter && t.district !== districtFilter) return false;
      if (floorFilter && t.floorRange !== floorFilter) return false;
      return true;
    });
  }, [transactions, yearFilter, projectFilter, districtFilter, floorFilter]);

  // Calculate metrics
  const metrics = useMemo(() => {
    const total = filteredData.length;
    const volume = filteredData.reduce((sum, t) => sum + (t.price || 0), 0);
    const avgPrice = total > 0 ? volume / total : 0;
    const avgPsf = total > 0 ? filteredData.reduce((sum, t) => sum + (t.unitPrice || 0), 0) / total : 0;
    return { total, volume, avgPrice, avgPsf };
  }, [filteredData]);

  // Time series data (group by month)
  const timeSeriesData = useMemo(() => {
    const grouped = {};
    filteredData.forEach(t => {
      if (!t.contractDate) return;
      const month = t.contractDate.substring(0, 7); // YYYY-MM
      if (!grouped[month]) grouped[month] = { psfValues: [], count: 0 };
      grouped[month].psfValues.push(t.unitPrice || 0);
      grouped[month].count++;
    });
    
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-24) // Last 24 months
      .map(([date, data]) => {
        const sorted = [...data.psfValues].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const avg = data.psfValues.reduce((a, b) => a + b, 0) / data.count;
        const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        return {
          name: date,
          avgPsf: Math.round(avg),
          medianPsf: Math.round(median || 0),
          volume: data.count
        };
      });
  }, [filteredData]);

  // Market segments from filtered data
  const marketSegments = useMemo(() => {
    const grouped = {};
    filteredData.forEach(t => {
      const seg = t.marketSegment || 'Unknown';
      grouped[seg] = (grouped[seg] || 0) + 1;
    });
    return Object.entries(grouped).map(([name, value]) => ({ name, value }));
  }, [filteredData]);

  // Floor analysis
  const floorAnalysis = useMemo(() => {
    const grouped = {};
    filteredData.forEach(t => {
      const floor = t.floorRange || 'Unknown';
      if (!grouped[floor]) grouped[floor] = { psfValues: [] };
      grouped[floor].psfValues.push(t.unitPrice || 0);
    });
    
    const data = Object.entries(grouped)
      .sort(([a], [b]) => {
        const getNum = (f) => parseInt(f.split('-')[0]) || 0;
        return getNum(a) - getNum(b);
      })
      .map(([floor, d]) => ({
        floor,
        avgPsf: Math.round(d.psfValues.reduce((a, b) => a + b, 0) / d.psfValues.length),
        count: d.psfValues.length
      }));
    
    return data.map((item, idx) => {
      if (idx === 0) return { ...item, diff: 0, diffPerc: 0 };
      const prev = data[idx - 1];
      const diff = item.avgPsf - prev.avgPsf;
      const diffPerc = prev.avgPsf ? (diff / prev.avgPsf) * 100 : 0;
      return { ...item, diff, diffPerc };
    });
  }, [filteredData]);

  // Heatmap matrix (Floor x Year)
  const heatmapData = useMemo(() => {
    const uniqueYears = [...new Set(transactions.map(t => t.contractDate?.substring(0, 4)).filter(Boolean))].sort();
    const uniqueFloors = [...new Set(transactions.map(t => t.floorRange).filter(Boolean))].sort((a, b) => {
      const getNum = (f) => parseInt(f.split('-')[0]) || 0;
      return getNum(b) - getNum(a);
    });
    
    const map = new Map();
    transactions.forEach(t => {
      if (!t.contractDate || !t.floorRange) return;
      const year = t.contractDate.substring(0, 4);
      const key = `${t.floorRange}-${year}`;
      const curr = map.get(key) || { totalPsf: 0, totalPrice: 0, count: 0 };
      curr.totalPsf += t.unitPrice || 0;
      curr.totalPrice += t.price || 0;
      curr.count++;
      map.set(key, curr);
    });
    
    let minPsf = Infinity, maxPsf = 0;
    map.forEach(v => {
      const avg = v.totalPsf / v.count;
      if (avg < minPsf) minPsf = avg;
      if (avg > maxPsf) maxPsf = avg;
    });
    
    return { floors: uniqueFloors.slice(0, 10), years: uniqueYears.slice(-5), map, minPsf: minPsf === Infinity ? 0 : minPsf, maxPsf };
  }, [transactions]);

  // Project comparison data
  const comparisonData = useMemo(() => {
    if (comparisonProjects.length === 0) return [];
    const relevant = filteredData.filter(t => comparisonProjects.includes(t.project));
    
    const grouped = {};
    relevant.forEach(t => {
      if (!t.contractDate) return;
      const month = t.contractDate.substring(0, 7);
      if (!grouped[month]) grouped[month] = { name: month };
      if (!grouped[month][t.project]) grouped[month][t.project] = { sum: 0, count: 0 };
      grouped[month][t.project].sum += t.unitPrice || 0;
      grouped[month][t.project].count++;
    });
    
    return Object.values(grouped)
      .map(entry => {
        const result = { name: entry.name };
        comparisonProjects.forEach(p => {
          if (entry[p]) result[p] = Math.round(entry[p].sum / entry[p].count);
        });
        return result;
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(-24);
  }, [filteredData, comparisonProjects]);

  // Top projects by count
  const topProjects = useMemo(() => {
    const grouped = {};
    filteredData.forEach(t => {
      if (t.project) grouped[t.project] = (grouped[t.project] || 0) + 1;
    });
    return Object.entries(grouped)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filteredData]);

  // Sorted and paginated table data
  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (typeof aVal === 'string') {
        aVal = aVal?.toLowerCase() || '';
        bVal = bVal?.toLowerCase() || '';
      }
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortField, sortDirection]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return sortedData.slice(start, start + rowsPerPage);
  }, [sortedData, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(sortedData.length / rowsPerPage);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  const hasFilters = yearFilter || projectFilter || districtFilter || floorFilter;
  
  const clearFilters = () => {
    setYearFilter('');
    setProjectFilter('');
    setDistrictFilter('');
    setFloorFilter('');
    setCurrentPage(1);
  };

  const getHeatmapColor = (value, min, max) => {
    if (!value) return 'transparent';
    const pct = (value - min) / (max - min || 1);
    return `rgba(14, 165, 233, ${0.15 + pct * 0.85})`;
  };

  const getHeatmapTextColor = (value, min, max) => {
    const pct = (value - min) / (max - min || 1);
    return pct > 0.5 ? 'white' : '#1e293b';
  };

  const toggleComparison = (project) => {
    if (comparisonProjects.includes(project)) {
      setComparisonProjects(prev => prev.filter(p => p !== project));
    } else if (comparisonProjects.length < 5) {
      setComparisonProjects(prev => [...prev, project]);
    }
  };

  const exportToCSV = () => {
    const headers = ['Project', 'Street', 'District', 'Floor', 'Area', 'Price', 'PSF', 'Date', 'Segment', 'Type'];
    const rows = sortedData.map(t => [
      t.project, t.street, t.district, t.floorRange, t.area, t.price, t.unitPrice, t.contractDate, t.marketSegment, t.propertyType
    ]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ura_transactions.csv';
    a.click();
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span className="text-slate-300 ml-1">↕</span>;
    return <span className="text-sky-500 ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading URA data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-xl shadow-lg max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Error Loading Data</h2>
          <p className="text-slate-500 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-500 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">URA Property Analytics</h1>
              <p className="text-xs text-slate-500">Singapore Real Estate Dashboard</p>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-slate-50 border-t px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters:
            </span>
            
            <select value={yearFilter} onChange={e => { setYearFilter(e.target.value); setCurrentPage(1); }} className="px-3 py-1.5 text-sm border rounded-lg bg-white">
              <option value="">All Years</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            
            <select value={projectFilter} onChange={e => { setProjectFilter(e.target.value); setCurrentPage(1); }} className="px-3 py-1.5 text-sm border rounded-lg bg-white max-w-[200px]">
              <option value="">All Projects</option>
              {projectNames.slice(0, 100).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            
            <select value={districtFilter} onChange={e => { setDistrictFilter(e.target.value); setCurrentPage(1); }} className="px-3 py-1.5 text-sm border rounded-lg bg-white">
              <option value="">All Districts</option>
              {districts.map(d => <option key={d} value={d}>D{d.padStart(2, '0')}</option>)}
            </select>
            
            <select value={floorFilter} onChange={e => { setFloorFilter(e.target.value); setCurrentPage(1); }} className="px-3 py-1.5 text-sm border rounded-lg bg-white">
              <option value="">All Floors</option>
              {floors.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            
            {hasFilters && (
              <button onClick={clearFilters} className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear
              </button>
            )}
            
            <span className="ml-auto text-sm text-slate-500">
              {hasFilters ? `Found ${filteredData.length.toLocaleString()} records` : `${transactions.length.toLocaleString()} total records`}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl shadow-sm border">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              Total Volume
            </div>
            <div className="text-2xl font-bold text-slate-900">{formatCompact(metrics.volume)}</div>
            <div className="text-xs text-slate-400 mt-1">{metrics.total.toLocaleString()} transactions</div>
          </div>
          
          <div className="bg-white p-5 rounded-xl shadow-sm border">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Average Price
            </div>
            <div className="text-2xl font-bold text-slate-900">{formatCompact(metrics.avgPrice)}</div>
            <div className="text-xs text-slate-400 mt-1">Per transaction</div>
          </div>
          
          <div className="bg-white p-5 rounded-xl shadow-sm border">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
              Average PSF
            </div>
            <div className="text-2xl font-bold text-slate-900">${Math.round(metrics.avgPsf).toLocaleString()}</div>
            <div className="text-xs text-slate-400 mt-1">Per Square Foot</div>
          </div>
          
          <div className="bg-white p-5 rounded-xl shadow-sm border">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Active Projects
            </div>
            <div className="text-2xl font-bold text-slate-900">{projectNames.length.toLocaleString()}</div>
            <div className="text-xs text-slate-400 mt-1">In dataset</div>
          </div>
        </div>

        {/* Main Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Price Trend */}
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Price Trend (PSF)</h3>
                <p className="text-sm text-slate-500">{priceMetric === 'average' ? 'Average' : 'Median'} PSF over time</p>
              </div>
              <div className="bg-slate-100 p-1 rounded-lg flex">
                <button onClick={() => setPriceMetric('average')} className={`px-3 py-1 text-xs font-medium rounded ${priceMetric === 'average' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Average</button>
                <button onClick={() => setPriceMetric('median')} className={`px-3 py-1 text-xs font-medium rounded ${priceMetric === 'median' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Median</button>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                  <Tooltip formatter={(v) => [`$${v?.toLocaleString()}`, priceMetric === 'average' ? 'Avg PSF' : 'Median PSF']} />
                  <Line type="monotone" dataKey={priceMetric === 'average' ? 'avgPsf' : 'medianPsf'} stroke="#0ea5e9" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Market Segment Pie */}
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Market Segment</h3>
            <p className="text-sm text-slate-500 mb-4">Distribution by region</p>
            <div className="h-64 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={marketSegments} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value">
                    {marketSegments.map((entry, i) => (
                      <Cell key={i} fill={SEGMENT_COLORS[entry.name] || COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ marginBottom: '40px' }}>
                <span className="text-2xl font-bold text-slate-700">{filteredData.length.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* District Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border">
          <h3 className="text-lg font-semibold text-slate-900 mb-1">District Comparison</h3>
          <p className="text-sm text-slate-500 mb-4">Average PSF by district</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={districtData.slice(0, 20)}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="district" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => [`$${v?.toLocaleString()}`, 'Avg PSF']} />
                <Bar dataKey="avgPsf" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Floor Analysis Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Floor Level Analysis</h3>
            <p className="text-sm text-slate-500 mb-4">Average PSF by floor</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={floorAnalysis}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="floor" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} interval={0} angle={-45} textAnchor="end" height={60} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => [`$${v?.toLocaleString()}`, 'Avg PSF']} />
                  <Bar dataKey="avgPsf" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold text-slate-900">Floor Premium</h3>
              <p className="text-sm text-slate-500">Incremental PSF by floor</p>
            </div>
            <div className="overflow-y-auto max-h-72">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-slate-500 font-medium">Floor</th>
                    <th className="px-4 py-2 text-right text-slate-500 font-medium">Avg PSF</th>
                    <th className="px-4 py-2 text-right text-slate-500 font-medium">Count</th>
                    <th className="px-4 py-2 text-right text-slate-500 font-medium">% Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {floorAnalysis.map((row, i) => (
                    <tr key={row.floor} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-medium text-slate-700">{row.floor}</td>
                      <td className="px-4 py-2 text-right font-mono">${row.avgPsf?.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-slate-500">{row.count}</td>
                      <td className={`px-4 py-2 text-right font-medium ${row.diffPerc > 0 ? 'text-green-600' : row.diffPerc < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                        {i === 0 ? '-' : `${row.diffPerc > 0 ? '+' : ''}${row.diffPerc?.toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Project Comparison */}
        <div className="bg-white p-6 rounded-xl shadow-sm border">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Project Comparison</h3>
              <p className="text-sm text-slate-500">Compare PSF trends</p>
            </div>
            <select onChange={e => e.target.value && toggleComparison(e.target.value)} value="" className="px-3 py-1.5 text-sm border rounded-lg">
              <option value="">+ Add project...</option>
              {projectNames.filter(p => !comparisonProjects.includes(p)).slice(0, 50).map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          
          {comparisonProjects.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {comparisonProjects.map((p, i) => (
                <div key={p} className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 border-l-4" style={{ borderLeftColor: COLORS[i % COLORS.length] }}>
                  <span className="truncate max-w-[150px]">{p}</span>
                  <button onClick={() => toggleComparison(p)} className="text-slate-400 hover:text-slate-600">×</button>
                </div>
              ))}
            </div>
          )}
          
          <div className="h-64">
            {comparisonProjects.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 border-2 border-dashed rounded-xl">Select projects to compare</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={comparisonData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                  <Tooltip formatter={(v, name) => [`$${v?.toLocaleString() || '-'}`, name]} />
                  <Legend />
                  {comparisonProjects.map((p, i) => (
                    <Line key={p} type="monotone" dataKey={p} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top Projects & Volume */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Top Projects</h3>
            <p className="text-sm text-slate-500 mb-4">By transaction count</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={topProjects}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Transaction Frequency</h3>
            <p className="text-sm text-slate-500 mb-4">Monthly volume</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="volume" fill="#ec4899" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Transaction Table */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-6 border-b flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">All Transactions</h3>
              <p className="text-sm text-slate-500">{sortedData.length.toLocaleString()} records • Click headers to sort</p>
            </div>
            <div className="flex items-center gap-3">
              <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="px-3 py-1.5 text-sm border rounded-lg">
                <option value={10}>10 per page</option>
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
              </select>
              <button onClick={exportToCSV} className="px-3 py-1.5 text-sm bg-sky-500 text-white rounded-lg hover:bg-sky-600 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export CSV
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-100" onClick={() => handleSort('project')}>
                    Project <SortIcon field="project" />
                  </th>
                  <th className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-100" onClick={() => handleSort('street')}>
                    Street <SortIcon field="street" />
                  </th>
                  <th className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-100" onClick={() => handleSort('district')}>
                    District <SortIcon field="district" />
                  </th>
                  <th className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-100" onClick={() => handleSort('floorRange')}>
                    Floor <SortIcon field="floorRange" />
                  </th>
                  <th className="px-4 py-3 text-right font-medium cursor-pointer hover:bg-slate-100" onClick={() => handleSort('area')}>
                    Area <SortIcon field="area" />
                  </th>
                  <th className="px-4 py-3 text-right font-medium cursor-pointer hover:bg-slate-100" onClick={() => handleSort('price')}>
                    Price <SortIcon field="price" />
                  </th>
                  <th className="px-4 py-3 text-right font-medium cursor-pointer hover:bg-slate-100" onClick={() => handleSort('unitPrice')}>
                    PSF <SortIcon field="unitPrice" />
                  </th>
                  <th className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-100" onClick={() => handleSort('contractDate')}>
                    Date <SortIcon field="contractDate" />
                  </th>
                  <th className="px-4 py-3 text-left font-medium">Segment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedData.map((t, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900 max-w-[200px] truncate">{t.project}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[150px] truncate">{t.street}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">D{t.district?.padStart(2, '0')}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{t.floorRange}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">{t.area} sqft</td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-slate-900">{formatCompact(t.price)}</td>
                    <td className="px-4 py-3 text-right font-mono text-sky-600 font-medium">${t.unitPrice?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-600">{t.contractDate}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs font-medium rounded" style={{ backgroundColor: (SEGMENT_COLORS[t.marketSegment] || '#64748b') + '20', color: SEGMENT_COLORS[t.marketSegment] || '#64748b' }}>{t.marketSegment}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="p-4 border-t flex items-center justify-between bg-slate-50">
            <div className="text-sm text-slate-500">
              Showing {((currentPage - 1) * rowsPerPage) + 1} - {Math.min(currentPage * rowsPerPage, sortedData.length)} of {sortedData.length.toLocaleString()}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
              >
                Previous
              </button>
              <span className="text-sm text-slate-600">
                Page {currentPage} of {totalPages || 1}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t mt-8">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-sm text-slate-500">
          Data source: Urban Redevelopment Authority (URA) • Updated hourly
        </div>
      </footer>
    </div>
  );
}
