import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { fetchDashboard, refreshDashboard, fetchFilteredDashboard, fetchFilterOptions, fetchProject, loadUserData, saveUserData } from '../services/api';
import { T, S, SECTIONS, MARKET_TABS, PROJECT_TABS } from '../constants';
import { StatCard } from './ui';
import { SectionBoundary } from './ErrorBoundary';

import MarketOverview from './market/MarketOverview';
import MarketTab from './market/MarketTab';
import InvestmentTab from './market/InvestmentTab';
import PerformanceTab from './market/PerformanceTab';
import ProjectOverview from './project/ProjectOverview';
import ValuationTab from './project/ValuationTab';
import CompareTab from './project/CompareTab';
import RecordsTab from './project/RecordsTab';
import ClientReport from './project/ClientReport';
import Portfolio from './portfolio/Portfolio';

const INIT_FILTERS = { district: 'all', year: 'all', segment: 'all', propertyType: 'all', tenure: 'all' };
const FILTER_DEFS = [
  { key: 'district', label: 'District', optsKey: 'districts' },
  { key: 'year', label: 'Year', optsKey: 'years' },
  { key: 'segment', label: 'Segment', optsKey: 'segments' },
  { key: 'propertyType', label: 'Type', optsKey: 'propertyTypes' },
  { key: 'tenure', label: 'Tenure', optsKey: 'tenures' },
];

const MARKET_COMPONENTS = { overview: MarketOverview, sales: MarketTab, rental: MarketTab, invest: InvestmentTab, perform: PerformanceTab };
const PROJECT_COMPONENTS = { overview: ProjectOverview, valuation: ValuationTab, compare: CompareTab, records: RecordsTab, report: ClientReport };

export default function Dashboard() {
  const [sec, setSec] = useState('market');
  const [tab, setTab] = useState('overview');
  const [aTab, setATab] = useState('overview');

  const [proj, setProj] = useState('');
  const [projData, setProjData] = useState(null);
  const [cmpSelected, setCmpSelected] = useState([]);
  const [cmpPool, setCmpPool] = useState([]);
  const [projList, setProjList] = useState([]);
  const [projIndex, setProjIndex] = useState({});
  const [projFilters, setProjFilters] = useState({ district: 'all', segment: 'all', type: 'all' });

  const [filters, setFilters] = useState(INIT_FILTERS);
  const [filterOpts, setFilterOpts] = useState({});
  const [filtering, setFiltering] = useState(false);
  const hasActiveFilters = Object.values(filters).some(v => v !== 'all');

  // Saved searches + portfolio (synced to server, localStorage as fallback)
  const [savedSearches, setSavedSearches] = useState(() => { try { return JSON.parse(localStorage.getItem('sg_saved_searches') || '[]'); } catch { return []; } });
  const [portfolio, setPortfolio] = useState(() => { try { return JSON.parse(localStorage.getItem('sg_portfolio') || '[]'); } catch { return []; } });
  const [clientReports, setClientReports] = useState(() => { try { return JSON.parse(localStorage.getItem('sg_client_reports') || '[]'); } catch { return []; } });
  const [savingName, setSavingName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | saving | saved | error

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [mktData, setMktData] = useState(null);
  const [unfilteredData, setUnfilteredData] = useState(null);

  // Project filter options derived from projIndex
  const projFilterOpts = useMemo(() => {
    const entries = Object.values(projIndex);
    return {
      districts: [...new Set(entries.map(p => p.dist))].sort((a, b) => (parseInt(a.replace('D','')) || 0) - (parseInt(b.replace('D','')) || 0)),
      segments: [...new Set(entries.map(p => p.seg))].filter(Boolean).sort(),
      types: [...new Set(entries.map(p => p.type))].filter(Boolean).sort(),
    };
  }, [projIndex]);

  // Filtered project list based on projFilters
  const filteredProjList = useMemo(() => {
    const { district, segment, type } = projFilters;
    if (district === 'all' && segment === 'all' && type === 'all') return projList;
    return projList.filter(name => {
      const p = projIndex[name];
      if (!p) return false;
      if (district !== 'all' && p.dist !== district) return false;
      if (segment !== 'all' && p.seg !== segment) return false;
      if (type !== 'all' && p.type !== type) return false;
      return true;
    });
  }, [projList, projIndex, projFilters]);

  const hasProjFilters = Object.values(projFilters).some(v => v !== 'all');

  const applyDashboard = useCallback((data) => {
    setMktData(data); setCmpPool(data.cmpPool || []); setProjList(data.projList || []); setProjIndex(data.projIndex || {});
  }, []);

  const updateFilter = useCallback(async (key, value) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    if (!Object.values(next).some(v => v !== 'all')) { if (unfilteredData) applyDashboard(unfilteredData); return; }
    setFiltering(true);
    try { const data = await fetchFilteredDashboard(next); if (data?.totalTx) applyDashboard(data); }
    catch (err) { console.warn('Filter failed:', err.message); }
    setFiltering(false);
  }, [filters, unfilteredData, applyDashboard]);

  const resetFilters = useCallback(() => {
    setFilters(INIT_FILTERS); if (unfilteredData) applyDashboard(unfilteredData);
  }, [unfilteredData, applyDashboard]);

  // ── Server sync: debounced save to backend ──
  const syncRef = useRef(null);
  const syncToServer = useCallback((p, ss, cr) => {
    // Immediate localStorage
    localStorage.setItem('sg_portfolio', JSON.stringify(p));
    localStorage.setItem('sg_saved_searches', JSON.stringify(ss));
    if (cr !== undefined) localStorage.setItem('sg_client_reports', JSON.stringify(cr));
    // Debounced server save
    if (syncRef.current) clearTimeout(syncRef.current);
    setSyncStatus('saving');
    syncRef.current = setTimeout(async () => {
      try {
        await saveUserData({ portfolio: p, savedSearches: ss, clientReports: cr || [] });
        setSyncStatus('saved');
        setTimeout(() => setSyncStatus('idle'), 2000);
      } catch (err) {
        console.warn('Sync failed:', err.message);
        setSyncStatus('error');
      }
    }, 1000);
  }, []);

  // Load user data from server on mount
  useEffect(() => {
    loadUserData().then(data => {
      if (data?.portfolio?.length) { setPortfolio(data.portfolio); localStorage.setItem('sg_portfolio', JSON.stringify(data.portfolio)); }
      if (data?.savedSearches?.length) { setSavedSearches(data.savedSearches); localStorage.setItem('sg_saved_searches', JSON.stringify(data.savedSearches)); }
      if (data?.clientReports?.length) { setClientReports(data.clientReports); localStorage.setItem('sg_client_reports', JSON.stringify(data.clientReports)); }
    }).catch(() => {});
  }, []);

  // Saved search handlers
  const saveCurrentSearch = useCallback(() => {
    if (!savingName.trim() || !hasActiveFilters) return;
    const next = [...savedSearches, { name: savingName.trim(), filters: { ...filters }, tab, createdAt: new Date().toISOString() }];
    setSavedSearches(next); syncToServer(portfolio, next, clientReports);
    setSavingName(''); setShowSaveInput(false);
  }, [savingName, hasActiveFilters, filters, tab, savedSearches, portfolio, clientReports, syncToServer]);

  const applySavedSearch = useCallback(async (saved) => {
    setFilters(saved.filters);
    if (saved.tab) setTab(saved.tab);
    if (!Object.values(saved.filters).some(v => v !== 'all')) { if (unfilteredData) applyDashboard(unfilteredData); return; }
    setFiltering(true);
    try { const data = await fetchFilteredDashboard(saved.filters); if (data?.totalTx) applyDashboard(data); }
    catch (err) { console.warn('Filter failed:', err.message); }
    setFiltering(false);
  }, [unfilteredData, applyDashboard]);

  const deleteSavedSearch = useCallback((idx) => {
    const next = savedSearches.filter((_, i) => i !== idx);
    setSavedSearches(next); syncToServer(portfolio, next, clientReports);
  }, [savedSearches, portfolio, clientReports, syncToServer]);

  const updatePortfolio = useCallback((newPortfolio) => {
    setPortfolio(newPortfolio);
    syncToServer(newPortfolio, savedSearches, clientReports);
  }, [savedSearches, clientReports, syncToServer]);

  const updateClientReports = useCallback((newReports) => {
    setClientReports(newReports);
    syncToServer(portfolio, savedSearches, newReports);
  }, [portfolio, savedSearches, syncToServer]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true); setError(null);
        const data = await fetchDashboard();
        if (cancelled) return;
        if (!data?.totalTx) { setError('No data received'); setLoading(false); return; }
        applyDashboard(data); setUnfilteredData(data);
        fetchFilterOptions().then(opts => { if (!cancelled && opts) setFilterOpts(opts); }).catch(() => {});
        if (data.cmpPool?.length > 0) {
          const first = data.cmpPool[0].name;
          setProj(first);
          try {
            if (!cancelled) {
              const pd = await fetchProject(first);
              setProjData(pd);
              // Auto-select from backend nearbyProjects (same as handleProjChange)
              if (pd?.nearbyProjects?.length > 0) {
                const streetProjs = pd.nearbyProjects.filter(p => p.rel === 'street').slice(0, 3).map(p => p.name);
                const distProjs = pd.nearbyProjects.filter(p => p.rel === 'district').slice(0, 4 - streetProjs.length).map(p => p.name);
                setCmpSelected([first, ...streetProjs, ...distProjs].slice(0, 5));
              } else {
                // Fallback to cmpPool if nearbyProjects empty
                const dist = data.cmpPool[0].dist;
                const street = data.cmpPool[0].street;
                const sameStreet = data.cmpPool.filter(p => p.street === street && p.name !== first).slice(0, 2).map(p => p.name);
                const sameDist = data.cmpPool.filter(p => p.dist === dist && p.name !== first && !sameStreet.includes(p.name)).slice(0, 3 - sameStreet.length).map(p => p.name);
                const other = data.cmpPool.filter(p => p.dist !== dist && p.name !== first).slice(0, 2).map(p => p.name);
                setCmpSelected([first, ...sameStreet, ...sameDist, ...other].slice(0, 5));
              }
            }
          } catch {}
        }
        setLoading(false);
      } catch (err) { if (!cancelled) { setError(err.message); setLoading(false); } }
    }
    load(); return () => { cancelled = true; };
  }, [applyDashboard]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true); setError(null);
    try {
      const data = await refreshDashboard();
      if (!data?.totalTx) { setError('No data received'); setRefreshing(false); return; }
      applyDashboard(data); setUnfilteredData(data); setFilters(INIT_FILTERS);
      if (proj) try { setProjData(await fetchProject(proj)); } catch {}
    } catch (err) { setError(err.message); }
    setRefreshing(false);
  }, [proj, applyDashboard]);

  const handleProjChange = useCallback(async (newProj) => {
    setProj(newProj);
    try {
      const data = await fetchProject(newProj);
      setProjData(data);
      // Auto-select: self + nearby (street first, then district)
      if (data?.nearbyProjects?.length > 0) {
        const streetProjs = data.nearbyProjects.filter(p => p.rel === 'street').slice(0, 3).map(p => p.name);
        const distProjs = data.nearbyProjects.filter(p => p.rel === 'district').slice(0, 4 - streetProjs.length).map(p => p.name);
        setCmpSelected([newProj, ...streetProjs, ...distProjs].slice(0, 5));
      } else {
        setCmpSelected(prev => [newProj, ...prev.filter(n => n !== newProj)].slice(0, 8));
      }
    } catch { setCmpSelected(prev => [newProj, ...prev.filter(n => n !== newProj)].slice(0, 8)); }
  }, []);

  const handlePortfolioView = useCallback(async (newProj) => {
    setSec('analyze'); setATab('overview');
    setProj(newProj);
    try {
      const data = await fetchProject(newProj);
      setProjData(data);
      if (data?.nearbyProjects?.length > 0) {
        const streetProjs = data.nearbyProjects.filter(p => p.rel === 'street').slice(0, 3).map(p => p.name);
        const distProjs = data.nearbyProjects.filter(p => p.rel === 'district').slice(0, 4 - streetProjs.length).map(p => p.name);
        setCmpSelected([newProj, ...streetProjs, ...distProjs].slice(0, 5));
      } else {
        setCmpSelected(prev => [newProj, ...prev.filter(n => n !== newProj)].slice(0, 8));
      }
    } catch { setCmpSelected(prev => [newProj, ...prev.filter(n => n !== newProj)].slice(0, 8)); }
  }, []);

  const p = projData?.projInfo || { name: 'Loading...', district: '', segment: '', tenure: '', type: '', units: 0, avgPsf: 0, psfPeriod: '', medPsf: 0, totalTx: 0, avgRent: 0, rentPsf: 0, yield: 0, distAvg: 0, hasRealRental: false, rentalPeriod: '', rentalCount: 0 };

  // ── Tab content props (data-driven routing) ──
  const mktProps = { overview: { data: mktData }, sales: { mode: 'sales', data: mktData }, rental: { mode: 'rental', data: mktData }, invest: { data: mktData }, perform: { data: mktData } };
  const projProps = {
    overview: { projInfo: p, projData },
    valuation: { projInfo: p, projData },
    compare: { proj, cmpPool, cmpSelected, setCmpSelected, mktData, nearbyProjects: projData?.nearbyProjects || [], selfYearPsf: projData?.yearPsf || {}, projList, projIndex },
    records: { projInfo: p, projData },
    report: { projInfo: p, projData, clientReports, setClientReports: updateClientReports },
  };

  // ═══ RENDER ═══
  if (loading) return <Shell><Center><Spinner /><div style={{ fontSize: T.lg, fontWeight: 600, marginBottom: 8 }}>Loading Dashboard...</div><div style={{ ...S.sub }}>Preparing your analytics</div></Center></Shell>;
  if (error) return <Shell><Center><div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div><div style={{ fontSize: T.lg, fontWeight: 600, marginBottom: 8, color: T.red }}>Failed to Load Data</div><div style={{ ...S.sub, marginBottom: 16 }}>{error}</div><button onClick={() => window.location.reload()} style={{ background: T.blue, color: '#fff', border: 'none', borderRadius: T.r, padding: '10px 24px', fontSize: T.lg, fontWeight: 600, cursor: 'pointer' }}>Retry</button></Center></Shell>;

  return (
    <Shell>
      <div style={{ padding: '20px 28px', borderBottom: `1px solid ${T.borderLt}` }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ fontSize: T['3xl'], fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10, letterSpacing: '-0.02em' }}>
            <span style={{ fontSize: 24 }}>🏢</span>SG Property Analytics
            <span style={{ ...S.sub, marginLeft: 8, fontWeight: 500, letterSpacing: '0.01em' }}>URA Private Residential</span>
          </h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {mktData?.lastUpdated && <span style={{ color: T.textMute, fontSize: T.sm }}>Data: {new Date(mktData.lastUpdated).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
            <button onClick={() => handleRefresh()} disabled={refreshing} style={hdrBtn(refreshing)}>{refreshing ? '⏳' : '🔄'} Refresh</button>
            <span style={{ background: mktData ? T.green : T.amber, width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
            <span style={{ color: T.textMute, fontSize: T.md }}>{mktData ? 'Cached' : 'Loading'}</span>
          </div>
        </div>

        {/* Section toggles */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {SECTIONS.map(s => <button key={s.id} onClick={() => setSec(s.id)} style={S.secBtn(sec === s.id, s.color)}>{s.label}</button>)}
        </div>

        {/* Market filters + tabs */}
        {sec === 'market' && <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            {FILTER_DEFS.map(f => (
              <select key={f.key} value={filters[f.key]} onChange={e => updateFilter(f.key, e.target.value)} style={S.filterSel(filters[f.key] !== 'all')}>
                <option value="all">{f.label}: All</option>
                {(filterOpts[f.optsKey] || []).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ))}
            {hasActiveFilters && <button onClick={resetFilters} style={{ background: `${T.red}18`, border: `1px solid ${T.red}4D`, borderRadius: T.r, padding: '6px 12px', color: T.red, fontSize: T.md, cursor: 'pointer', fontWeight: 600 }}>✕ Clear</button>}
            {hasActiveFilters && !showSaveInput && <button onClick={() => setShowSaveInput(true)} style={{ background: `${T.green}18`, border: `1px solid ${T.green}4D`, borderRadius: T.r, padding: '6px 12px', color: T.green, fontSize: T.md, cursor: 'pointer', fontWeight: 600 }}>💾 Save</button>}
            {showSaveInput && <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input value={savingName} onChange={e => setSavingName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveCurrentSearch()} placeholder="Search name..." autoFocus style={{ background: T.card, border: `1px solid ${T.green}`, borderRadius: 6, padding: '5px 10px', fontSize: T.md, color: T.text, outline: 'none', width: 140, fontFamily: T.mono }} />
              <button onClick={saveCurrentSearch} disabled={!savingName.trim()} style={{ background: T.green, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: T.md, cursor: 'pointer', fontWeight: 600 }}>✓</button>
              <button onClick={() => { setShowSaveInput(false); setSavingName(''); }} style={{ background: 'none', border: 'none', color: T.textMute, cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>}
            {filtering && <span style={{ color: T.textMute, fontSize: T.md }}>⏳ Filtering...</span>}
            {hasActiveFilters && !filtering && <span style={{ color: T.sky, fontSize: T.md, fontWeight: 600 }}>{mktData?.totalTx?.toLocaleString() || 0} results</span>}
          </div>
          {savedSearches.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            <span style={{ color: T.textMute, fontSize: T.sm, fontWeight: 600 }}>SAVED:</span>
            {savedSearches.map((ss, i) => {
              const activeFilters = Object.entries(ss.filters).filter(([, v]) => v !== 'all').map(([k, v]) => v);
              return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: `${T.sky}12`, border: `1px solid ${T.sky}30`, borderRadius: 6, padding: '4px 8px 4px 10px' }}>
                <button onClick={() => applySavedSearch(ss)} style={{ background: 'none', border: 'none', color: T.sky, cursor: 'pointer', fontSize: T.md, fontWeight: 600, padding: 0 }}>{ss.name}</button>
                <span style={{ color: T.textMute, fontSize: T.xs }}>({activeFilters.join(', ')})</span>
                <button onClick={() => deleteSavedSearch(i)} style={{ background: 'none', border: 'none', color: T.textMute, cursor: 'pointer', fontSize: 11, padding: '0 2px', lineHeight: 1 }}>✕</button>
              </div>;
            })}
          </div>}
          <TabBar tabs={MARKET_TABS} active={tab} onSelect={setTab} color={T.blue} />
        </>}

        {/* Project selector + filters + tabs */}
        {sec === 'analyze' && <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
            <select value={projFilters.district} onChange={e => setProjFilters(f => ({ ...f, district: e.target.value }))} style={S.filterSel(projFilters.district !== 'all')}>
              <option value="all">District: All</option>
              {projFilterOpts.districts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={projFilters.segment} onChange={e => setProjFilters(f => ({ ...f, segment: e.target.value }))} style={S.filterSel(projFilters.segment !== 'all')}>
              <option value="all">Segment: All</option>
              {projFilterOpts.segments.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={projFilters.type} onChange={e => setProjFilters(f => ({ ...f, type: e.target.value }))} style={S.filterSel(projFilters.type !== 'all')}>
              <option value="all">Type: All</option>
              {projFilterOpts.types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {hasProjFilters && <button onClick={() => setProjFilters({ district: 'all', segment: 'all', type: 'all' })} style={{ background: `${T.red}18`, border: `1px solid ${T.red}4D`, borderRadius: T.r, padding: '6px 12px', color: T.red, fontSize: T.md, cursor: 'pointer', fontWeight: 600 }}>✕ Clear</button>}
            {hasProjFilters && <span style={{ color: T.purple, fontSize: T.md, fontWeight: 600 }}>{filteredProjList.length} projects</span>}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <span style={{ color: T.textMute, fontSize: T.base }}>Project:</span>
            <ProjectSearch value={proj} projList={filteredProjList} cmpPool={cmpPool} projIndex={projIndex} onChange={handleProjChange} />
          </div>
          <TabBar tabs={PROJECT_TABS} active={aTab} onSelect={setATab} color={T.purple} />
        </>}
      </div>

      {/* ══ Market Stats ══ */}
      {sec === 'market' && mktData && <div style={{ padding: '16px 28px' }}><div className="s">
        <StatCard label="Transactions" value={mktData.totalTx?.toLocaleString() || '—'} color={T.blue} icon="📋" sub={`CCR ${(mktData.segCounts?.CCR / 1000).toFixed(1)}k · RCR ${(mktData.segCounts?.RCR / 1000).toFixed(1)}k · OCR ${(mktData.segCounts?.OCR / 1000).toFixed(1)}k`} />
        <StatCard label="Total Volume" value={mktData.totalVolume ? `$${(mktData.totalVolume / 1e9).toFixed(1)}B` : '—'} color={T.purple} icon="💰" sub={`${mktData.latestYear || '—'} latest year`} />
        <StatCard label={`Avg PSF (${mktData.psfPeriod || mktData.latestYear || '—'})`} value={`$${mktData.avgPsf?.toLocaleString() || '—'}`} color={T.orange} icon="📐" sub={mktData.yoyPct != null ? `${mktData.yoyPct > 0 ? '+' : ''}${mktData.yoyPct}% YoY · Med $${mktData.medPsf?.toLocaleString() || '—'}` : `Median $${mktData.medPsf?.toLocaleString() || '—'}`} />
        <StatCard label={`PSF Range (${mktData.psfPeriod || mktData.latestYear || '—'})`} value={`$${mktData.psfP5?.toLocaleString() || '—'}–$${mktData.psfP95?.toLocaleString() || '—'}`} color={T.textMute} icon="↕️" sub={`IQR $${mktData.psfP25?.toLocaleString() || '—'}–$${mktData.psfP75?.toLocaleString() || '—'}`} />
        <StatCard label={`Rental Contracts${mktData.rentalPeriod ? ` (${mktData.rentalPeriod})` : ''}`} value={mktData.rentalTotal?.toLocaleString() || '—'} color={T.teal} icon="🏠" sub={`CCR ${(mktData.rentalSegCounts?.CCR / 1000).toFixed(1)}k · RCR ${(mktData.rentalSegCounts?.RCR / 1000).toFixed(1)}k · OCR ${(mktData.rentalSegCounts?.OCR / 1000).toFixed(1)}k`} />
        <StatCard label={`Avg Rent${mktData.rentalPeriod ? ` (${mktData.rentalPeriod})` : ''}`} value={`$${mktData.avgRent?.toLocaleString() || '—'}/mo`} color={T.blue} icon="💵" sub={`Median $${mktData.medRent?.toLocaleString() || '—'}`} />
        <StatCard label={`Avg Rent PSF${mktData.rentalPeriod ? ` (${mktData.rentalPeriod})` : ''}`} value={`$${mktData.avgRentPsf || '—'}/sf/mo`} color={T.orange} icon="📐" />
        <StatCard label="Best Yield" value={mktData.bestYield ? `${mktData.bestYield.y}%` : '—'} color={T.green} icon="💰" sub={mktData.bestYield ? `${mktData.bestYield.d} (${mktData.bestYield.seg})` : '—'} />
      </div></div>}

      {/* ══ Market Tabs (data-driven) ══ */}
      {sec === 'market' && <div style={{ padding: '0 28px 40px', display: 'grid', gap: 16 }}>
        {MARKET_TABS.map(t => {
          if (tab !== t.id) return null;
          const Comp = MARKET_COMPONENTS[t.id];
          return <SectionBoundary key={t.id} name={t.label}><Comp {...mktProps[t.id]} /></SectionBoundary>;
        })}
      </div>}

      {/* ══ Project Stats ══ */}
      {sec === 'analyze' && <div style={{ padding: '16px 28px' }}><div className="s">
        <StatCard label="Project" value={p.name} color={T.purple} icon="🏢" sub={`${p.district} · ${p.segment}`} />
        <StatCard label={`Avg PSF (${p.psfPeriod || '—'})`} value={`$${p.avgPsf.toLocaleString()}`} color={T.blue} icon="📐" sub={`Med $${p.medPsf.toLocaleString()}`} />
        <StatCard label="Transactions" value={p.totalTx.toString()} color={T.orange} icon="📋" sub="All time" />
        <StatCard label={`Avg Rent${p.rentalPeriod ? ` (${p.rentalPeriod})` : ''}`} value={`$${p.avgRent.toLocaleString()}/mo`} color={T.teal} icon="💵" sub={p.hasRealRental ? `${p.rentalCount || ''} URA records` : `Est. from ${p.segment} yield`} />
        <StatCard label={`Rent PSF${p.rentalPeriod ? ` (${p.rentalPeriod})` : ''}`} value={`$${p.rentPsf}/sf/mo`} color={T.amber} icon="📐" sub={p.hasRealRental ? 'URA rental data' : 'Estimated'} />
        <StatCard label="Gross Yield" value={`${p.yield}%`} color={T.green} icon="💰" sub={p.hasRealRental ? 'Rent PSF×12 ÷ Sale PSF' : `${p.segment} avg (4Q)`} />
        <StatCard label="Tenure" value={p.tenure || '—'} color={T.textMute} icon="📜" sub={p.units ? `${p.units} units` : undefined} />
      </div></div>}

      {/* ══ Project Tabs (data-driven) ══ */}
      {sec === 'analyze' && <SectionBoundary name="Project"><div style={{ padding: '0 28px 40px', display: 'grid', gap: 16 }}>
        {PROJECT_TABS.map(t => {
          if (aTab !== t.id) return null;
          const Comp = PROJECT_COMPONENTS[t.id];
          return <Comp key={`${t.id}-${proj}`} {...projProps[t.id]} />;
        })}
      </div></SectionBoundary>}

      {/* ══ Portfolio ══ */}
      {sec === 'portfolio' && <SectionBoundary name="Portfolio"><div style={{ padding: '16px 28px 40px' }}>
        <Portfolio cmpPool={cmpPool} projList={projList} projIndex={projIndex} onViewProject={handlePortfolioView} holdings={portfolio} setHoldings={updatePortfolio} syncStatus={syncStatus} />
      </div></SectionBoundary>}
    </Shell>
  );
}

// ── Shared layout primitives ──
function Shell({ children }) {
  return (
    <div style={{ fontFamily: T.sans, background: T.bg, minHeight: '100vh', color: T.text }}>
      <style>{`
        * { margin:0; padding:0; box-sizing:border-box; }
        html { -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; text-rendering:optimizeLegibility; }
        ::-webkit-scrollbar { width:6px; }
        ::-webkit-scrollbar-thumb { background:${T.textMute}; border-radius:3px; }
        .s { display:grid; grid-template-columns:repeat(auto-fill,minmax(155px,1fr)); gap:10px; margin-bottom:16px; }
        .g2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .g3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; }
        @media(max-width:900px) { .g2,.g3 { grid-template-columns:1fr; } .s { grid-template-columns:repeat(2,1fr); } }
        select { background:#e2e8f0; color:${T.text}; border:1px solid ${T.textFaint}; border-radius:${T.r}px; padding:8px 12px; font-size:${T.lg}px; cursor:pointer; outline:none; font-family:${T.sans}; }
        select option { background:${T.bg}; }
        table { width:100%; border-collapse:collapse; font-size:${T.base}px; font-family:${T.sans}; }
        th { color:${T.textMute}; font-weight:600; padding:10px 12px; text-align:left; border-bottom:1px solid ${T.textFaint}; letter-spacing:0.02em; text-transform:uppercase; font-size:${T.sm}px; }
        td { padding:8px 12px; border-bottom:1px solid ${T.borderLt}; }
        tr:nth-child(even) { background:${T.bg}; }
        button { font-family:${T.sans}; }
        input { font-family:${T.sans}; }
        svg text { font-family:${T.sans}; }
        @keyframes spin { to { transform:rotate(360deg) } }
      `}</style>
      {children}
    </div>
  );
}

function Center({ children }) {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}><div style={{ textAlign: 'center' }}>{children}</div></div>;
}

function Spinner() {
  return <div style={{ width: 48, height: 48, border: `4px solid ${T.border}`, borderTop: `4px solid ${T.blue}`, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />;
}

function TabBar({ tabs, active, onSelect, color }) {
  return (
    <div style={{ display: 'flex', gap: 4, paddingBottom: 16, borderBottom: `1px solid ${T.border}` }}>
      {tabs.map(t => <button key={t.id} onClick={() => onSelect(t.id)} style={S.togBtn(active === t.id, color)}>{t.label}</button>)}
    </div>
  );
}

const hdrBtn = (disabled) => ({
  background: T.card, border: `1px solid ${T.textFaint}`, borderRadius: T.r,
  padding: '6px 12px', color: disabled ? T.textFaint : T.textSub,
  fontSize: T.md, cursor: disabled ? 'wait' : 'pointer',
  display: 'flex', alignItems: 'center', gap: 4,
});

function ProjectSearch({ value, projList, cmpPool, projIndex, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return projList.slice(0, 20);
    const q = query.toLowerCase();
    return projList.filter(n => n.toLowerCase().includes(q)).slice(0, 20);
  }, [query, projList]);

  const handleSelect = (name) => {
    onChange(name);
    setQuery('');
    setOpen(false);
  };

  // Lookup: prefer projIndex (covers ALL projects), fallback to cmpPool
  const cp = (name) => {
    const idx = projIndex?.[name];
    if (idx) return { psf: idx.psf, dist: idx.dist, segment: idx.seg, units: idx.n, yield: idx.yield };
    const pool = cmpPool.find(p => p.name === name);
    return pool ? { psf: pool.psf, dist: pool.dist, segment: pool.segment, units: pool.units, yield: pool.yield } : null;
  };

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, maxWidth: 480 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        <input
          value={open ? query : value}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          placeholder="Search project name..."
          style={{ flex: 1, background: '#fff', border: `1px solid ${open ? T.purple : T.textFaint}`, borderRadius: `${T.r}px 0 0 ${T.r}px`, padding: '9px 14px 9px 36px', color: T.text, fontSize: T.lg, outline: 'none', fontFamily: T.mono, transition: 'border-color 0.2s' }}
        />
        <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: T.lg, opacity: 0.4, pointerEvents: 'none' }}>🔍</div>
        <div style={{ background: open ? `${T.purple}18` : T.card, border: `1px solid ${open ? T.purple : T.textFaint}`, borderLeft: 'none', borderRadius: `0 ${T.r}px ${T.r}px 0`, padding: '9px 14px', color: T.textSub, fontSize: T.sm, whiteSpace: 'nowrap' }}>
          {projList.length} projects
        </div>
      </div>
      {open && <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: `1px solid ${T.purple}40`, borderRadius: T.r, boxShadow: '0 8px 24px rgba(0,0,0,0.08)', maxHeight: 340, overflowY: 'auto', zIndex: 100 }}>
        {filtered.length === 0 && <div style={{ padding: '16px 14px', color: T.textMute, fontSize: T.md, textAlign: 'center' }}>No projects match "{query}"</div>}
        {filtered.map((name, i) => {
          const p = cp(name);
          const isSel = name === value;
          return <div key={name} onClick={() => handleSelect(name)} style={{ padding: '10px 14px', cursor: 'pointer', background: isSel ? `${T.purple}10` : i % 2 === 0 ? '#fff' : T.bg, borderLeft: isSel ? `3px solid ${T.purple}` : '3px solid transparent', transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background = `${T.purple}08`} onMouseLeave={e => e.currentTarget.style.background = isSel ? `${T.purple}10` : i % 2 === 0 ? '#fff' : T.bg}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: isSel ? T.purple : T.text, fontWeight: isSel ? 700 : 500, fontSize: T.base }}>{name}</span>
              {p && <span style={{ color: T.blue, fontFamily: T.mono, fontSize: T.sm, fontWeight: 600 }}>${p.psf?.toLocaleString()} PSF</span>}
            </div>
            {p && <div style={{ color: T.textMute, fontSize: T.sm, marginTop: 2 }}>
              {p.dist} · {p.segment} · {p.units} tx{p.yield ? ` · ${p.yield}% yield` : ''}
            </div>}
          </div>;
        })}
        {filtered.length === 20 && query.trim() && <div style={{ padding: '8px 14px', color: T.textMute, fontSize: T.sm, textAlign: 'center', borderTop: `1px solid ${T.borderLt}` }}>Type more to narrow results...</div>}
      </div>}
    </div>
  );
}
