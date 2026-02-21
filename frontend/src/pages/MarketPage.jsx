import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useAppStore from '../stores/useAppStore';
import { T, MARKET_TABS } from '../constants';
import { StatCard } from '../components/ui';
import { SectionBoundary } from '../components/ErrorBoundary';
import ProjectSearch from '../components/shared/ProjectSearch';

import MarketOverview from '../components/market/MarketOverview';
import MarketTab from '../components/market/MarketTab';
import InvestmentTab from '../components/market/InvestmentTab';
import PerformanceTab from '../components/market/PerformanceTab';

const FILTER_DEFS = [
  { key: 'district', label: 'District', optsKey: 'districts' },
  { key: 'year', label: 'Year', optsKey: 'years' },
  { key: 'segment', label: 'Segment', optsKey: 'segments' },
  { key: 'propertyType', label: 'Type', optsKey: 'propertyTypes' },
  { key: 'tenure', label: 'Tenure', optsKey: 'tenures' },
];

const MARKET_COMPONENTS = { overview: MarketOverview, sales: MarketTab, rental: MarketTab, invest: InvestmentTab, perform: PerformanceTab };

export default function MarketPage() {
  const navigate = useNavigate();
  const {
    mktData, filterOpts, filters, filtering,
    projList, projIndex, cmpPool, proj,
    savedSearches, updateFilter, resetFilters, saveSearch, applySavedSearch, deleteSavedSearch,
  } = useAppStore();
  const hasActiveFilters = Object.values(filters).some(v => v !== 'all');

  const [tab, setTab] = useState('overview');
  const [savingName, setSavingName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const handleProjectSelect = useCallback((name) => {
    useAppStore.getState().selectProject(name);
    navigate(`/project/${encodeURIComponent(name)}`);
  }, [navigate]);

  const saveCurrentSearch = useCallback(() => {
    if (!savingName.trim() || !hasActiveFilters) return;
    saveSearch(savingName, filters, tab);
    setSavingName(''); setShowSaveInput(false);
  }, [savingName, hasActiveFilters, filters, tab, saveSearch]);

  const handleApplySaved = useCallback(async (ss) => {
    const newTab = await applySavedSearch(ss);
    if (newTab) setTab(newTab);
  }, [applySavedSearch]);

  const accent = '#2563eb';
  const mktProps = { overview: { data: mktData }, sales: { mode: 'sales', data: mktData }, rental: { mode: 'rental', data: mktData }, invest: { data: mktData }, perform: { data: mktData } };

  return (
    <>
      {/* Hero search */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e5ee' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '44px 24px 36px' }}>
          <h1 id="market-heading" style={{ fontSize: 26, fontWeight: 700, color: T.text, marginBottom: 4, letterSpacing: '-0.03em' }}>Singapore Property Intelligence</h1>
          <p style={{ color: T.textSub, fontSize: 13, marginBottom: 22 }}>URA transaction data for every private residential project</p>
          <ProjectSearch value={proj} projList={projList} cmpPool={cmpPool} projIndex={projIndex} onChange={handleProjectSelect} hero />

          {/* Filter chips */}
          <div role="group" aria-label="Market filters" style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            {FILTER_DEFS.map(f => (
              <FilterChip key={f.key} label={`${f.label}${filters[f.key] !== 'all' ? `: ${filters[f.key]}` : ''}`} active={filters[f.key] !== 'all'}>
                <select aria-label={`Filter by ${f.label}`} value={filters[f.key]} onChange={e => updateFilter(f.key, e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}>
                  <option value="all">{f.label}: All</option>
                  {(filterOpts[f.optsKey] || []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </FilterChip>
            ))}
            {hasActiveFilters && <button onClick={resetFilters} aria-label="Clear all filters" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 20, padding: '6px 14px', color: '#dc2626', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>Clear filters</button>}
            {hasActiveFilters && !showSaveInput && <button onClick={() => setShowSaveInput(true)} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 20, padding: '6px 14px', color: T.textSub, fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>Save search</button>}
            {showSaveInput && <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input value={savingName} onChange={e => setSavingName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveCurrentSearch()} placeholder="Search name..." autoFocus aria-label="Name for saved search" style={{ background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, padding: '5px 10px', fontSize: 12, color: T.text, outline: 'none', width: 130, fontFamily: T.mono }} />
              <button onClick={saveCurrentSearch} disabled={!savingName.trim()} style={{ background: accent, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Save</button>
              <button onClick={() => { setShowSaveInput(false); setSavingName(''); }} aria-label="Cancel save" style={{ background: 'none', border: 'none', color: T.textMute, cursor: 'pointer', fontSize: 13 }}>×</button>
            </div>}
            {filtering && <span role="status" style={{ color: T.textMute, fontSize: 12 }}>Filtering...</span>}
            {hasActiveFilters && !filtering && <span aria-live="polite" style={{ color: accent, fontSize: 12, fontWeight: 600 }}>{mktData?.totalTx?.toLocaleString() || 0} results</span>}
          </div>

          {/* Saved searches */}
          {savedSearches.length > 0 && <div role="list" aria-label="Saved searches" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
            <span style={{ color: T.textMute, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Saved:</span>
            {savedSearches.map((ss, i) => {
              const af = Object.entries(ss.filters).filter(([, v]) => v !== 'all').map(([, v]) => v);
              return <div key={i} role="listitem" style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 20, padding: '3px 10px' }}>
                <button onClick={() => handleApplySaved(ss)} style={{ background: 'none', border: 'none', color: accent, cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 0 }}>{ss.name}</button>
                <span style={{ color: T.textMute, fontSize: 9 }}>({af.join(', ')})</span>
                <button onClick={() => deleteSavedSearch(i)} aria-label={`Remove saved search: ${ss.name}`} style={{ background: 'none', border: 'none', color: T.textMute, cursor: 'pointer', fontSize: 10, padding: 0, lineHeight: 1 }}>×</button>
              </div>;
            })}
          </div>}
        </div>
      </div>

      {/* Market stats */}
      {mktData && <section aria-labelledby="market-heading" style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px 0' }}><div className="s">
        <StatCard label="Transactions" value={mktData.totalTx?.toLocaleString() || '—'} sub={`CCR ${(mktData.segCounts?.CCR / 1000).toFixed(1)}k · RCR ${(mktData.segCounts?.RCR / 1000).toFixed(1)}k · OCR ${(mktData.segCounts?.OCR / 1000).toFixed(1)}k`} />
        <StatCard label="Total Volume" value={mktData.totalVolume ? `$${(mktData.totalVolume / 1e9).toFixed(1)}B` : '—'} sub={`${mktData.latestYear || '—'} latest year`} />
        <StatCard label={`Avg PSF (${mktData.psfPeriod || mktData.latestYear || '—'})`} value={`$${mktData.avgPsf?.toLocaleString() || '—'}`} sub={mktData.yoyPct != null ? `${mktData.yoyPct > 0 ? '+' : ''}${mktData.yoyPct}% YoY · Med $${mktData.medPsf?.toLocaleString() || '—'}` : `Median $${mktData.medPsf?.toLocaleString() || '—'}`} />
        <StatCard label={`PSF Range (${mktData.psfPeriod || mktData.latestYear || '—'})`} value={`$${mktData.psfP5?.toLocaleString() || '—'}–$${mktData.psfP95?.toLocaleString() || '—'}`} sub={`IQR $${mktData.psfP25?.toLocaleString() || '—'}–$${mktData.psfP75?.toLocaleString() || '—'}`} />
        <StatCard label={`Rental Contracts${mktData.rentalPeriod ? ` (${mktData.rentalPeriod})` : ''}`} value={mktData.rentalTotal?.toLocaleString() || '—'} sub={mktData.rentalSegCounts ? `CCR ${((mktData.rentalSegCounts.CCR || 0) / 1000).toFixed(1)}k · RCR ${((mktData.rentalSegCounts.RCR || 0) / 1000).toFixed(1)}k · OCR ${((mktData.rentalSegCounts.OCR || 0) / 1000).toFixed(1)}k` : '—'} />
        <StatCard label={`Avg Rent${mktData.rentalPeriod ? ` (${mktData.rentalPeriod})` : ''}`} value={`$${mktData.avgRent?.toLocaleString() || '—'}/mo`} sub={`Median $${mktData.medRent?.toLocaleString() || '—'}`} />
        <StatCard label={`Avg Rent PSF${mktData.rentalPeriod ? ` (${mktData.rentalPeriod})` : ''}`} value={`$${mktData.avgRentPsf || '—'}/sf/mo`} />
        <StatCard label="Best Yield" value={mktData.bestYield ? `${mktData.bestYield.y}%` : '—'} sub={mktData.bestYield ? `${mktData.bestYield.d} (${mktData.bestYield.seg})` : '—'} />
      </div></section>}

      {/* Market tabs */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px 40px' }}>
        <TabBar tabs={MARKET_TABS} active={tab} onSelect={setTab} />
        <div style={{ display: 'grid', gap: 16 }}>
          {MARKET_TABS.map(t => {
            if (tab !== t.id) return null;
            const Comp = MARKET_COMPONENTS[t.id];
            return <SectionBoundary key={t.id} name={t.label}><Comp {...mktProps[t.id]} /></SectionBoundary>;
          })}
        </div>
      </div>
    </>
  );
}

// ── Shared primitives ──
function FilterChip({ label, active, children }) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, background: active ? '#eff6ff' : '#fff', border: `1px solid ${active ? '#2563eb' : '#d1d5db'}`, borderRadius: 20, padding: '6px 14px', fontSize: 12, color: active ? '#2563eb' : T.textSub, fontWeight: 500, cursor: 'pointer' }}>
      {label}
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
      {children}
    </div>
  );
}

function TabBar({ tabs, active, onSelect }) {
  return (
    <div role="tablist" aria-label="Content tabs" style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e5ee', marginBottom: 16 }}>
      {tabs.map(t => (
        <button key={t.id} role="tab" aria-selected={active === t.id} aria-controls={`panel-${t.id}`} id={`tab-${t.id}`}
          onClick={() => onSelect(t.id)}
          style={{ background: 'none', border: 'none', color: active === t.id ? '#2563eb' : T.textMute, fontSize: 13, fontWeight: active === t.id ? 600 : 400, cursor: 'pointer', padding: '10px 14px', borderBottom: active === t.id ? '2px solid #2563eb' : '2px solid transparent', marginBottom: -1, transition: 'color 0.2s' }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export { TabBar, FilterChip };
