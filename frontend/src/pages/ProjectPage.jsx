import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useAppStore from '../stores/useAppStore';
import { T, PROJECT_TABS } from '../constants';
import { Card } from '../components/ui';
import { SectionBoundary } from '../components/ErrorBoundary';
import { TabBar } from './MarketPage';

import ProjectOverview from '../components/project/ProjectOverview';
import ValuationTab from '../components/project/ValuationTab';
import PropertyAnalysisTab from '../components/project/PropertyAnalysisTab';
import InvestmentProjectTab from '../components/project/InvestmentProjectTab';
import CompareTab from '../components/project/CompareTab';
import RecordsTab from '../components/project/RecordsTab';
import ClientReport from '../components/project/ClientReport';

const PROJECT_COMPONENTS = { valuation: ValuationTab, analysis: PropertyAnalysisTab, investment: InvestmentProjectTab, context: ProjectOverview, compare: CompareTab, records: RecordsTab, report: ClientReport };

export default function ProjectPage() {
  const { name } = useParams();
  const navigate = useNavigate();
  const {
    proj, projData, projLoading, cmpPool, cmpSelected, setCmpSelected,
    projList, projIndex, mktData, clientReports, updateClientReports, selectProject,
  } = useAppStore();

  const [aTab, setATab] = useState('valuation');

  // Load project if URL param doesn't match store
  useEffect(() => {
    const decoded = decodeURIComponent(name || '');
    if (decoded && decoded !== proj) selectProject(decoded);
  }, [name, proj, selectProject]);

  // ── Master project filters (local to project view) ──
  const [bedsFilter, setBedsFilter] = useState('all');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [saleTypeFilter, setSaleTypeFilter] = useState('all');
  const [tenureFilter, setTenureFilter] = useState('all');
  const [floorFilter, setFloorFilter] = useState('all');

  const rawBedOptions = projData?.bedOptions || [];
  const bedOptions = useMemo(() => [...new Set(rawBedOptions.flatMap(b => b.split('/')))].sort((a, b) => parseInt(a) - parseInt(b)), [rawBedOptions]);

  const txYears = useMemo(() => [...new Set((projData?.txs || []).map(t => t.year))].sort(), [projData]);
  const saleTypes = useMemo(() => [...new Set((projData?.txs || []).map(t => t.saleType))].filter(Boolean).sort(), [projData]);
  const tenureTypes = useMemo(() => [...new Set((projData?.txs || []).map(t => t.tenure))].filter(Boolean).sort(), [projData]);
  const floorBands = useMemo(() => {
    const bands = new Set();
    (projData?.txs || []).forEach(t => {
      const fl = t.floorMid || 0;
      if (fl >= 1 && fl <= 5) bands.add('01-05');
      else if (fl <= 10) bands.add('06-10');
      else if (fl <= 15) bands.add('11-15');
      else if (fl <= 20) bands.add('16-20');
      else if (fl <= 30) bands.add('21-30');
      else if (fl >= 31) bands.add('31+');
    });
    return [...bands].sort();
  }, [projData]);

  const currentYear = String(new Date().getFullYear());
  const effectiveYearFrom = yearFrom || txYears[0] || '';
  const effectiveYearTo = yearTo || txYears[txYears.length - 1] || '';

  const masterFilters = useMemo(() => ({
    beds: bedsFilter, yearFrom: effectiveYearFrom, yearTo: effectiveYearTo,
    saleType: saleTypeFilter, tenure: tenureFilter, floor: floorFilter,
  }), [bedsFilter, effectiveYearFrom, effectiveYearTo, saleTypeFilter, tenureFilter, floorFilter]);

  const hasMasterFilters = bedsFilter !== 'all' || yearFrom || yearTo || saleTypeFilter !== 'all' || tenureFilter !== 'all' || floorFilter !== 'all';

  // Reset filters when project changes
  useEffect(() => { setBedsFilter('all'); setYearFrom(''); setYearTo(''); setSaleTypeFilter('all'); setTenureFilter('all'); setFloorFilter('all'); }, [proj]);

  // Filtered stats
  const matchFloor = (fl, band) => {
    if (band === '01-05') return fl >= 1 && fl <= 5;
    if (band === '06-10') return fl >= 6 && fl <= 10;
    if (band === '11-15') return fl >= 11 && fl <= 15;
    if (band === '16-20') return fl >= 16 && fl <= 20;
    if (band === '21-30') return fl >= 21 && fl <= 30;
    if (band === '31+') return fl >= 31;
    return true;
  };
  const filteredStats = useMemo(() => {
    if (!hasMasterFilters || !projData?.txs) return null;
    let txs = projData.txs;
    if (bedsFilter !== 'all') txs = txs.filter(t => t.beds && t.beds.split('/').includes(bedsFilter));
    if (yearFrom) txs = txs.filter(t => t.year >= yearFrom);
    if (yearTo) txs = txs.filter(t => t.year <= yearTo);
    if (saleTypeFilter !== 'all') txs = txs.filter(t => t.saleType === saleTypeFilter);
    if (tenureFilter !== 'all') txs = txs.filter(t => t.tenure === tenureFilter);
    if (floorFilter !== 'all') txs = txs.filter(t => matchFloor(t.floorMid || 0, floorFilter));
    if (!txs.length) return { avgPsf: 0, medPsf: 0, totalTx: 0 };
    const psfs = txs.map(t => t.psf).sort((a, b) => a - b);
    const m = Math.floor(psfs.length / 2);
    return { avgPsf: Math.round(psfs.reduce((s, v) => s + v, 0) / psfs.length), medPsf: psfs.length % 2 ? psfs[m] : Math.round((psfs[m - 1] + psfs[m]) / 2), totalTx: txs.length };
  }, [projData, hasMasterFilters, bedsFilter, yearFrom, yearTo, saleTypeFilter, tenureFilter, floorFilter]);

  const p = projData?.projInfo || { name: proj || 'Loading...', district: '', segment: '', tenure: '', type: '', units: 0, avgPsf: 0, psfPeriod: '', medPsf: 0, totalTx: 0, avgRent: 0, rentPsf: 0, yield: 0, distAvg: 0, hasRealRental: false, rentalPeriod: '', rentalCount: 0 };
  const segClr = (s) => s === 'CCR' ? '#dc2626' : s === 'RCR' ? '#d97706' : '#059669';
  const accent = '#2563eb';

  const projProps = {
    valuation: { projInfo: p, projData, masterFilters },
    analysis: { projInfo: p, projData, masterFilters },
    investment: { projInfo: p, projData, masterFilters },
    context: { projInfo: p, projData, masterFilters },
    compare: { proj, cmpPool, cmpSelected, setCmpSelected, mktData, nearbyProjects: projData?.nearbyProjects || [], selfYearPsf: projData?.yearPsf || {}, selfBedYearPsf: projData?.bedYearPsf || {}, selfYearPrice: projData?.yearPrice || {}, selfBedYearPrice: projData?.bedYearPrice || {}, bedOptions: rawBedOptions, masterFilters, projList, projIndex },
    records: { projInfo: p, projData, masterFilters },
    report: { projInfo: p, projData, clientReports, setClientReports: updateClientReports },
  };

  const filterSel = (active) => ({
    border: '1px solid #e5e5ee', borderRadius: 4, padding: '3px 8px', fontSize: 11,
    color: T.text, background: active ? '#eff6ff' : '#fff', fontFamily: T.mono, outline: 'none',
  });

  return (
    <>
      {/* Project header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e5ee', padding: '16px 0 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
          <button onClick={() => navigate('/')} aria-label="Back to market view" style={{ background: 'none', border: 'none', color: accent, fontSize: 12, cursor: 'pointer', padding: 0, fontWeight: 500, marginBottom: 6 }}>← Back to Market</button>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: 21, fontWeight: 700, color: T.text, letterSpacing: '-0.02em' }}>{p.name || proj}</h1>
            {p.segment && <span style={{ color: segClr(p.segment), fontSize: 10, fontWeight: 600, background: `${segClr(p.segment)}10`, padding: '2px 8px', borderRadius: 4 }}>{p.segment}</span>}
          </div>
          {p.district && <div style={{ color: T.textMute, fontSize: 12, marginBottom: 12 }}>{p.district} · {p.tenure || ''}{p.units > 0 ? ` · ${p.units} units` : ''}</div>}

          {/* Inline stats */}
          {projData && <div role="group" aria-label="Project statistics" style={{ display: 'flex', gap: 28, paddingTop: 12, borderTop: '1px solid #f0f0f5', flexWrap: 'wrap', marginBottom: 12 }}>
            <InlineStat label={`Avg PSF${filteredStats ? ' (filtered)' : ''}`} value={`$${(filteredStats?.avgPsf || p.avgPsf).toLocaleString()}`} sub={`Med $${(filteredStats?.medPsf || p.medPsf).toLocaleString()}`} />
            <InlineStat label="Transactions" value={(filteredStats?.totalTx ?? p.totalTx).toString()} sub={filteredStats ? `of ${p.totalTx} total` : 'All time'} />
            <InlineStat label="Avg Rent" value={p.hasRealRental ? `$${p.avgRent.toLocaleString()}/mo` : 'N/A'} sub={p.hasRealRental ? 'URA rental data' : ''} />
            <InlineStat label="Rent PSF" value={p.hasRealRental ? `$${p.rentPsf}/sf/mo` : 'N/A'} />
            <InlineStat label="Gross Yield" value={p.hasRealRental ? `${p.yield}%` : 'N/A'} sub={p.hasRealRental ? 'Rent ÷ Sale PSF' : ''} />
            <InlineStat label="Tenure" value={p.tenure || '—'} sub={p.units ? `${p.units} units` : ''} />
          </div>}

          <TabBar tabs={PROJECT_TABS} active={aTab} onSelect={setATab} />
        </div>
      </header>

      {/* Master project filters (sticky) */}
      {projData && (
        <div role="toolbar" aria-label="Project data filters" style={{ position: 'sticky', top: 50, zIndex: 20, padding: '8px 0', background: T.bg, borderBottom: '1px solid #e5e5ee' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#fff', border: '1px solid #e5e5ee', borderRadius: 8, padding: '8px 14px' }}>
              {bedOptions.length >= 2 && <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: T.textMute, fontSize: 10, fontWeight: 600 }}>Beds</span>
                <div role="radiogroup" aria-label="Bedrooms filter" style={{ display: 'flex', gap: 2 }}>
                  {['all', ...bedOptions].map(b => (
                    <button key={b} role="radio" aria-checked={bedsFilter === b} onClick={() => setBedsFilter(b)} style={{
                      background: bedsFilter === b ? accent : '#f8f9fb', color: bedsFilter === b ? '#fff' : '#6b7280',
                      border: `1px solid ${bedsFilter === b ? accent : '#e5e5ee'}`, borderRadius: 4, padding: '3px 9px',
                      fontSize: 11, cursor: 'pointer', fontWeight: 500, fontFamily: b === 'all' ? T.sans : T.mono,
                    }}>{b === 'all' ? 'All' : b}</button>
                  ))}
                </div>
              </div>}
              {bedOptions.length >= 2 && <Divider />}
              {txYears.length > 1 && <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: T.textMute, fontSize: 10, fontWeight: 600 }}>Year</span>
                <select aria-label="Year from" value={effectiveYearFrom} onChange={e => setYearFrom(e.target.value)} style={filterSel(yearFrom)}>
                  {txYears.filter(y => y <= effectiveYearTo).map(y => <option key={y} value={y}>{y}{y === currentYear ? '*' : ''}</option>)}
                </select>
                <span aria-hidden="true" style={{ color: T.textMute, fontSize: 10 }}>→</span>
                <select aria-label="Year to" value={effectiveYearTo} onChange={e => setYearTo(e.target.value)} style={filterSel(yearTo)}>
                  {txYears.filter(y => y >= effectiveYearFrom).map(y => <option key={y} value={y}>{y}{y === currentYear ? '*' : ''}</option>)}
                </select>
              </div>}
              {saleTypes.length > 1 && <><Divider /><div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: T.textMute, fontSize: 10, fontWeight: 600 }}>Type</span>
                <select aria-label="Sale type filter" value={saleTypeFilter} onChange={e => setSaleTypeFilter(e.target.value)} style={filterSel(saleTypeFilter !== 'all')}>
                  <option value="all">All</option>
                  {saleTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div></>}
              {tenureTypes.length > 1 && <><Divider /><div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: T.textMute, fontSize: 10, fontWeight: 600 }}>Tenure</span>
                <select aria-label="Tenure filter" value={tenureFilter} onChange={e => setTenureFilter(e.target.value)} style={filterSel(tenureFilter !== 'all')}>
                  <option value="all">All</option>
                  {tenureTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div></>}
              {floorBands.length > 1 && <><Divider /><div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: T.textMute, fontSize: 10, fontWeight: 600 }}>Floor</span>
                <select aria-label="Floor filter" value={floorFilter} onChange={e => setFloorFilter(e.target.value)} style={filterSel(floorFilter !== 'all')}>
                  <option value="all">All</option>
                  {floorBands.map(f => <option key={f} value={f}>{f === '31+' ? '31+' : f}</option>)}
                </select>
              </div></>}
              {hasMasterFilters && <><Divider /><button onClick={() => { setBedsFilter('all'); setYearFrom(''); setYearTo(''); setSaleTypeFilter('all'); setTenureFilter('all'); setFloorFilter('all'); }} aria-label="Reset all project filters" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '3px 10px', color: '#dc2626', fontSize: 11, cursor: 'pointer', fontWeight: 500 }}>Reset</button></>}
            </div>
          </div>
        </div>
      )}

      {/* Tab content */}
      <SectionBoundary name="Project"><div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px 40px', display: 'grid', gap: 16 }}>
        {projLoading && <Card><div role="status" style={{ textAlign: 'center', padding: 40 }}><Spinner /><div style={{ color: T.textMute, fontSize: T.lg }}>Loading {proj}...</div></div></Card>}
        {!projLoading && !projData && proj && <Card><div role="status" style={{ textAlign: 'center', padding: 40 }}><div style={{ color: T.textMute, fontSize: T.lg }}>No URA transaction data found for {proj}.</div><div style={{ color: T.textSub, fontSize: T.md, marginTop: 8 }}>This project may be pre-launch or have insufficient records.</div></div></Card>}
        {!projLoading && projData && PROJECT_TABS.map(t => {
          if (aTab !== t.id) return null;
          const Comp = PROJECT_COMPONENTS[t.id];
          return <div key={`${t.id}-${proj}`} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`}><Comp {...projProps[t.id]} /></div>;
        })}
      </div></SectionBoundary>
    </>
  );
}

function InlineStat({ label, value, sub }) {
  return (
    <div style={{ padding: '0 0 8px' }}>
      <div style={{ color: T.textMute, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
      <div style={{ color: T.text, fontSize: 17, fontWeight: 700, fontFamily: T.mono, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ color: T.textMute, fontSize: 10, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function Divider() { return <div aria-hidden="true" style={{ width: 1, height: 20, background: '#e5e5ee' }} />; }
function Spinner() { return <div style={{ width: 40, height: 40, border: '3px solid #e5e5ee', borderTop: '3px solid #2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />; }
