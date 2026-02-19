import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
  Legend, ComposedChart, ScatterChart, Scatter,
} from 'recharts';
import { fetchFilterOptions, searchSales, searchRental } from '../../services/api';
import { COLORS as P, SEG_COLORS as SC, T, yieldColor } from '../../constants';
import Tip from '../ui/Tip';
import { Card, SectionHeader, InsightBar, NoteText, Divider } from '../ui';

export default function MarketTab({ mode, data }) {
  const s = mode === 'sales';
  const mainC = s ? T.sky : T.emerald;
  const accC = s ? T.indigo : T.teal;

  const psfHi = data?.psfP75 || 2000;
  const psfLo = data?.psfP25 || 1400;
  const rpHi = (data?.avgRentPsf || 4) * 1.2;
  const rpLo = (data?.avgRentPsf || 4) * 0.8;
  const psfColor = (v) => v >= psfHi ? T.green : v >= psfLo ? T.amber : T.textSub;
  const rpColor = (v) => v >= rpHi ? T.green : v >= rpLo ? T.amber : T.textSub;

  // ── Server-side transaction search ──
  const [txSearch, setTxSearch] = useState('');
  const [txDistF, setTxDistF] = useState('');
  const [txSegF, setTxSegF] = useState('');
  const [txTypeF, setTxTypeF] = useState('');
  const [txBedF, setTxBedF] = useState('');
  const [txAreaF, setTxAreaF] = useState('');
  const [txSort, setTxSort] = useState('date_desc');
  const [txPage, setTxPage] = useState(1);
  const [txData, setTxData] = useState({ results: [], total: 0, pages: 0 });
  const [txLoading, setTxLoading] = useState(false);
  const [txFilters, setTxFilters] = useState({ districts: [], segments: [], types: [], bedrooms: [], areaSqftRanges: [] });
  const pgSize = 50;
  const debounceRef = useRef(null);
  const [expandedDist, setExpandedDist] = useState(null);

  useEffect(() => {
    fetchFilterOptions().then(f => setTxFilters(f)).catch(() => {});
  }, []);

  const doSearch = useCallback(async (pg) => {
    setTxLoading(true);
    try {
      const opts = { page: pg || txPage, limit: pgSize, sort: txSort };
      if (txSearch) opts.q = txSearch;
      if (txDistF) opts.district = txDistF;
      if (txSegF) opts.segment = txSegF;
      const result = s
        ? await searchSales({ ...opts, type: txTypeF || undefined })
        : await searchRental({ ...opts, bedrooms: txBedF || undefined, areaSqft: txAreaF || undefined });
      setTxData(result);
    } catch (err) {
      console.error('Search error:', err);
      setTxData({ results: [], total: 0, pages: 0 });
    }
    setTxLoading(false);
  }, [s, txSearch, txDistF, txSegF, txTypeF, txBedF, txAreaF, txSort, txPage]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setTxPage(1); doSearch(1); }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [txSearch, txDistF, txSegF, txTypeF, txBedF, txAreaF, txSort, s]);

  const goPage = useCallback((pg) => { setTxPage(pg); doSearch(pg); }, [doSearch]);
  const toggleSort = (col) => setTxSort(prev => prev === `${col}_desc` ? `${col}_asc` : `${col}_desc`);
  const sortIcon = (col) => txSort === `${col}_desc` ? ' ↓' : txSort === `${col}_asc` ? ' ↑' : '';

  // ── Data aliases ──
  const td = s ? (data?.yoy || []) : (data?.rTrend || []);
  const segD = s ? (data?.sSeg || []) : (data?.rSeg || []);
  const topD = s ? (data?.sTop || []) : (data?.rTop || []);
  const dlD = s ? (data?.sDistLine || []) : (data?.rDistLine || []);
  const dbD = s ? (data?.sDistBar || []) : (data?.rDistBar || []);
  const tyD = s ? (data?.sType || []) : (data?.rType || []);
  const s2D = s ? (data?.sTenure || []) : [];
  const hiD = s ? (data?.sHist || []) : (data?.rHist || []);
  const scD = s ? (data?.sScat || []) : (data?.rScat || []);
  const cuD = s ? (data?.sCum || []) : (data?.rCum || []);

  const dlFmt = s ? (v => '$' + v.toLocaleString()) : (v => '$' + v.toFixed(2));
  const dbFmt = s ? (v => '$' + v.toLocaleString()) : (v => '$' + v.toFixed(2));
  const cuFmt = s ? (v => `$${(v / 1e9).toFixed(1)}B`) : (v => v.toLocaleString());
  const yFmt = s ? (v => '$' + v.toLocaleString()) : (v => '$' + v.toLocaleString());

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <InsightBar items={s ? [
        <span key="a">Prices <span style={{ color: T.lime, fontWeight: 700, fontFamily: T.mono }}>{data?.yoyPct != null ? `${data.yoyPct > 0 ? '+' : ''}${data.yoyPct}%` : '+—%'}</span> YoY</span>,
        <span key="b"><span style={{ color: mainC, fontWeight: 700, fontFamily: T.mono }}>{data?.totalTx?.toLocaleString() || '—'}</span> transactions ({data?.totalVolume ? `$${(data.totalVolume / 1e9).toFixed(1)}B` : '—'})</span>,
        <span key="c">Avg <span style={{ color: T.orange, fontWeight: 700, fontFamily: T.mono }}>${data?.avgPsf?.toLocaleString() || '—'}</span> PSF</span>,
      ] : [
        <span key="a">Avg rent <span style={{ color: T.lime, fontWeight: 700, fontFamily: T.mono }}>${data?.avgRent?.toLocaleString() || '—'}</span>/mo {data?.hasRealRental ? '(real data)' : '(estimated)'}</span>,
        <span key="b"><span style={{ color: mainC, fontWeight: 700, fontFamily: T.mono }}>{data?.rentalTotal?.toLocaleString() || '—'}</span> rental contracts</span>,
        <span key="c">Avg <span style={{ color: T.orange, fontWeight: 700, fontFamily: T.mono }}>${data?.avgRentPsf || '—'}</span>/sf/mo</span>,
      ]} />

      {/* ── TRENDS ── */}
      <Divider label="Trends" />
      <SectionHeader icon="📈" title={s ? 'Sale Price Trend' : 'Rental Trend'} sub={s ? 'Average & median PSF with YoY growth rate.' : 'Average & median monthly rent with QoQ growth rate.'} />
      <Card><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={td}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border} /><XAxis dataKey={s ? 'year' : 'q'} tick={{ fill: T.textSub, fontSize: T.md }} axisLine={false} /><YAxis yAxisId="l" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={yFmt} /><YAxis yAxisId="r" orientation="right" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => `${v > 0 ? '+' : ''}${v}%`} /><Tooltip content={<Tip />} /><Legend wrapperStyle={{ fontSize: T.md }} /><Bar yAxisId="l" dataKey="avg" name={s ? 'Avg PSF' : 'Avg Rent'} fill={mainC} radius={[4, 4, 0, 0]} barSize={s ? 26 : 18}>{!s && td.map((e, i) => <Cell key={i} fill={mainC} fillOpacity={e.real === false ? 0.3 : 1} />)}</Bar><Bar yAxisId="l" dataKey="med" name={s ? 'Med PSF' : 'Med Rent'} fill={accC} radius={[4, 4, 0, 0]} barSize={s ? 26 : 18}>{!s && td.map((e, i) => <Cell key={i} fill={accC} fillOpacity={e.real === false ? 0.3 : 1} />)}</Bar><Line yAxisId="r" type="monotone" dataKey={s ? 'yoy' : 'qoq'} name={s ? 'YoY %' : 'QoQ %'} stroke={T.amber} strokeWidth={2.5} dot={{ r: 4, fill: T.amber }} /></ComposedChart></ResponsiveContainer></div>{!s && td.some(e => e.real === false) && <div style={{ color: T.textMute, fontSize: T.sm, marginTop: 6, fontStyle: 'italic' }}>Faded bars = estimated from sale PSF × yield (no URA rental data for that quarter)</div>}</Card>

      <div className="g2">
        <Card><SectionHeader icon="🎯" title={s ? 'Sales by Segment' : 'Rentals by Segment'} sub={s ? 'Transaction volume and average PSF by market segment.' : 'Rental volume and average rent by market segment.'} />
          <div style={{ height: 230, display: 'flex', gap: 16 }}><div style={{ flex: 1 }}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={segD} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={78} innerRadius={44} paddingAngle={3}>{segD.map((e, i) => <Cell key={i} fill={SC[e.name]} />)}</Pie><Tooltip content={<Tip fmt="none" />} /></PieChart></ResponsiveContainer></div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>{segD.map(x => <div key={x.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: SC[x.name] }} /><div><div style={{ color: T.text, fontSize: T.base, fontWeight: 600 }}>{x.name}</div><div style={{ color: T.textSub, fontSize: T.md }}>{s ? `$${x.val.toLocaleString()} psf` : `$${x.val.toLocaleString()}/mo`} · {x.count.toLocaleString()}</div></div></div>)}</div></div>
        </Card>
        <Card><SectionHeader icon="🏆" title={s ? 'Most Traded Projects' : 'Most Rented Projects'} sub={s ? 'Highest transaction volume projects.' : 'Highest rental contract volume.'} />
          <div style={{ height: 230 }}><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={topD}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={T.border} /><XAxis type="number" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} /><YAxis dataKey="n" type="category" width={160} tick={{ fill: T.textMute, fontSize: T.xs }} axisLine={false} /><Tooltip content={<Tip />} /><Bar dataKey="c" name={s ? 'Transactions' : 'Contracts'} radius={[0, 6, 6, 0]} barSize={14}>{topD.map((_, i) => <Cell key={i} fill={P[i % P.length]} />)}</Bar></BarChart></ResponsiveContainer></div>
        </Card>
      </div>

      {/* ── GEOGRAPHY ── */}
      <Divider label="Geography" />
      <SectionHeader icon="📍" title={s ? 'District PSF Trends' : 'District Rent PSF Trends'} sub={s ? 'Quarterly average PSF for top 5 districts.' : 'Quarterly average rent PSF for top 5 districts.'} />
      <Card><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={dlD}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border} /><XAxis dataKey="q" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} /><YAxis tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={dlFmt} /><Tooltip content={<Tip />} /><Legend wrapperStyle={{ fontSize: T.md }} />{(data?.topDistricts || []).map((d, i) => <Line key={d} type="monotone" dataKey={d} stroke={P[i]} strokeWidth={2} dot={{ r: 3 }} connectNulls />)}</LineChart></ResponsiveContainer></div></Card>

      <SectionHeader icon="📐" title={s ? 'Current PSF by District' : 'Current Rent PSF by District'} sub={s ? 'Average PSF across all districts.' : 'Average rent PSF by district.'} />
      <Card><div style={{ height: 240 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={dbD}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border} /><XAxis dataKey="d" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} /><YAxis tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={dbFmt} /><Tooltip content={<Tip />} /><Bar dataKey="v" name={s ? 'Sale PSF' : 'Rent PSF ($/sqft/mo)'} fill={s ? T.sky : T.amber} radius={[4, 4, 0, 0]} barSize={24} /></BarChart></ResponsiveContainer></div></Card>

      {/* ── DISTRICT TOP PSF (Sales only) ── */}
      {s && data?.distTopPsf?.length > 0 && <>
        <SectionHeader icon="🏆" title="Highest PSF by District" sub="Click any district to see top projects ranked by PSF. Uses latest year average." />
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr>
                {['District', 'Segment', 'Highest PSF', 'Top Project', 'Avg PSF', 'Projects'].map(h => <th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {(data.distTopPsf || []).map(d => {
                  const isOpen = expandedDist === d.dist;
                  return [
                    <tr key={d.dist} onClick={() => setExpandedDist(isOpen ? null : d.dist)} style={{ cursor: 'pointer', background: isOpen ? `${T.blue}08` : 'transparent', transition: 'background 0.15s' }} onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = T.borderLt; }} onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent'; }}>
                      <td style={{ color: T.text, fontWeight: 700, fontFamily: T.mono }}>
                        <span style={{ color: isOpen ? T.blue : T.textMute, marginRight: 6, fontSize: T.sm, display: 'inline-block', transition: 'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                        {d.dist}
                      </td>
                      <td><span style={{ background: SC[d.seg] + '18', color: SC[d.seg], padding: '2px 8px', borderRadius: 4, fontSize: T.sm, fontWeight: 600 }}>{d.seg}</span></td>
                      <td style={{ color: T.blue, fontFamily: T.mono, fontWeight: 700, fontSize: T.lg }}>${d.topPsf.toLocaleString()}</td>
                      <td style={{ color: T.text, fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.topProject}</td>
                      <td style={{ color: T.textSub, fontFamily: T.mono }}>${d.avgPsf.toLocaleString()}</td>
                      <td style={{ color: T.textMute, fontFamily: T.mono }}>{d.count}</td>
                    </tr>,
                    isOpen && <tr key={d.dist + '-detail'}>
                      <td colSpan={6} style={{ padding: 0, background: `${T.blue}04` }}>
                        <div style={{ padding: '12px 16px 12px 36px' }}>
                          <div style={{ color: T.textSub, fontSize: T.sm, fontWeight: 600, marginBottom: 8 }}>TOP PROJECTS IN {d.dist} — ranked by PSF</div>
                          <table style={{ margin: 0 }}>
                            <thead><tr>
                              {['#', 'Project', 'Street', 'Segment', 'PSF', 'Transactions', 'Yield', 'Tenure'].map(h => <th key={h} style={{ fontSize: T.sm, padding: '6px 10px' }}>{h}</th>)}
                            </tr></thead>
                            <tbody>
                              {d.projects.map((p, i) => <tr key={p.name}>
                                <td style={{ color: i < 3 ? T.amber : T.textMute, fontWeight: i < 3 ? 700 : 400, fontFamily: T.mono, fontSize: T.md }}>{i + 1}</td>
                                <td style={{ color: T.text, fontWeight: 600, fontSize: T.md, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                                <td style={{ color: T.textMute, fontSize: T.sm, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.street}</td>
                                <td><span style={{ background: SC[p.seg] + '18', color: SC[p.seg], padding: '1px 6px', borderRadius: 3, fontSize: T.xs, fontWeight: 600 }}>{p.seg}</span></td>
                                <td style={{ color: T.blue, fontFamily: T.mono, fontWeight: 600, fontSize: T.md }}>${p.psf.toLocaleString()}</td>
                                <td style={{ color: T.textSub, fontFamily: T.mono, fontSize: T.md }}>{p.n}</td>
                                <td style={{ color: yieldColor(p.yield), fontFamily: T.mono, fontSize: T.md }}>{p.yield}%</td>
                                <td style={{ color: T.textMute, fontSize: T.sm, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.tenure || '—'}</td>
                              </tr>)}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </>}

      {/* ── STRUCTURE ── */}
      <Divider label="Structure" />
      <div className="g3">
        <Card><h4 style={{ color: T.text, fontSize: T.lg, fontWeight: 600, marginBottom: 4 }}>By Property Type</h4>
          <NoteText>{s ? 'Average PSF by property type.' : 'Average monthly rent by property type.'}</NoteText>
          <div style={{ height: 190 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={tyD}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border} /><XAxis dataKey="t" tick={{ fill: T.textSub, fontSize: T.xs }} axisLine={false} /><YAxis tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={yFmt} /><Tooltip content={<Tip />} /><Bar dataKey="v" name={s ? 'Avg PSF' : 'Avg Rent'} radius={[4, 4, 0, 0]} barSize={30}>{tyD.map((_, i) => <Cell key={i} fill={P[i]} />)}</Bar></BarChart></ResponsiveContainer></div>
        </Card>
        {s && <Card><h4 style={{ color: T.text, fontSize: T.lg, fontWeight: 600, marginBottom: 4 }}>By Tenure</h4>
          <NoteText>Freehold typically commands a premium over leasehold.</NoteText>
          <div style={{ height: 190 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={s2D}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border} /><XAxis dataKey="t" tick={{ fill: T.textSub, fontSize: T.xs }} axisLine={false} /><YAxis tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={yFmt} /><Tooltip content={<Tip />} /><Bar dataKey="v" name="Avg PSF" radius={[4, 4, 0, 0]} barSize={40}>{s2D.map((_, i) => <Cell key={i} fill={[T.green, T.amber, T.blue][i]} />)}</Bar></BarChart></ResponsiveContainer></div>
        </Card>}
        <Card><h4 style={{ color: T.text, fontSize: T.lg, fontWeight: 600, marginBottom: 4 }}>{s ? 'PSF Distribution' : 'Rent Distribution'}</h4>
          <NoteText>{s ? 'Distribution is right-skewed — CCR transactions pull the average above the median.' : 'Distribution shows where most contracts fall.'}</NoteText>
          <div style={{ height: 190 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={hiD}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border} /><XAxis dataKey="r" tick={{ fill: T.textSub, fontSize: 7 }} axisLine={false} interval={2} /><YAxis tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} /><Tooltip content={<Tip fmt="none" />} /><Bar dataKey="c" name={s ? 'Transactions' : 'Contracts'} fill={s ? T.violet : T.teal} radius={[2, 2, 0, 0]} barSize={12} /></BarChart></ResponsiveContainer></div>
        </Card>
      </div>

      <SectionHeader icon="⬡" title={s ? 'Price vs Unit Size' : 'Rent PSF vs Unit Size'} sub={s ? 'Inverse relationship: larger units tend to have lower PSF.' : 'Same inverse pattern in rentals.'} />
      <Card><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid strokeDasharray="3 3" stroke={T.border} /><XAxis type="number" dataKey="a" name="Area (sqft)" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => `${Math.round(v)} sf`} /><YAxis type="number" dataKey="p" name={s ? 'PSF ($)' : 'Rent PSF ($/sf/mo)'} tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={s ? (v => '$' + v) : (v => '$' + v.toFixed(1))} /><Tooltip content={<Tip />} /><Legend wrapperStyle={{ fontSize: T.md }} />{['CCR', 'RCR', 'OCR'].map(x => <Scatter key={x} name={x} data={scD.filter(d => d.s === x)} fill={SC[x]} fillOpacity={0.6} />)}</ScatterChart></ResponsiveContainer></div></Card>

      <SectionHeader icon="📉" title={s ? 'Quarterly Sales Volume' : 'Quarterly Rental Contracts'} sub={s ? 'Per-quarter dollar volume (last 12 quarters).' : 'Per-quarter contract count (last 12 quarters).'} />
      <Card><div style={{ height: 210 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={cuD}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border} /><XAxis dataKey="d" tick={{ fill: T.textSub, fontSize: T.xs }} axisLine={false} /><YAxis tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={cuFmt} /><Tooltip content={<Tip />} /><Bar dataKey="v" name={s ? 'Volume' : 'Contracts'} fill={mainC} radius={[4, 4, 0, 0]} barSize={14} fillOpacity={0.8} /></BarChart></ResponsiveContainer></div></Card>

      {/* ── TRANSACTION RECORDS ── */}
      <Divider label="Transaction Records" />
      <SectionHeader icon="📋" title={s ? 'Sale Transaction Records' : 'Rental Contract Records'} sub={`${txData.total.toLocaleString()} total records. Server-side search across ALL transactions.`} />
      <Card>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
            <input value={txSearch} onChange={e => setTxSearch(e.target.value)} placeholder='Search project name or street...' style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: T.r, padding: '8px 12px 8px 32px', color: T.text, fontSize: T.base, width: '100%', outline: 'none', fontFamily: T.mono }} />
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: T.lg, opacity: 0.5 }}>🔍</span>
          </div>
          <select value={txDistF} onChange={e => setTxDistF(e.target.value)} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: T.r, padding: '8px 12px', color: T.text, fontSize: T.base, cursor: 'pointer', outline: 'none', fontFamily: T.mono }}>
            <option value="">All Districts</option>
            {(txFilters.districts || []).map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={txSegF} onChange={e => setTxSegF(e.target.value)} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: T.r, padding: '8px 12px', color: T.text, fontSize: T.base, cursor: 'pointer', outline: 'none', fontFamily: T.mono }}>
            <option value="">All Segments</option>
            {(txFilters.segments || []).map(sg => <option key={sg} value={sg}>{sg}</option>)}
          </select>
          {s && <select value={txTypeF} onChange={e => setTxTypeF(e.target.value)} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: T.r, padding: '8px 12px', color: T.text, fontSize: T.base, cursor: 'pointer', outline: 'none', fontFamily: T.mono }}>
            <option value="">All Sale Types</option>
            {(txFilters.types || []).map(t => <option key={t} value={t}>{t}</option>)}
          </select>}
          {!s && <select value={txBedF} onChange={e => setTxBedF(e.target.value)} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: T.r, padding: '8px 12px', color: T.text, fontSize: T.base, cursor: 'pointer', outline: 'none', fontFamily: T.mono }}>
            <option value="">All Bedrooms</option>
            {(txFilters.bedrooms || []).map(b => <option key={b} value={b}>{b} Bed</option>)}
          </select>}
          {!s && <select value={txAreaF} onChange={e => setTxAreaF(e.target.value)} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: T.r, padding: '8px 12px', color: T.text, fontSize: T.base, cursor: 'pointer', outline: 'none', fontFamily: T.mono }}>
            <option value="">All Sizes</option>
            {(txFilters.areaSqftRanges || []).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>}
          <div style={{ color: T.textSub, fontSize: T.md, display: 'flex', alignItems: 'center', gap: 6 }}>
            {txLoading && <span style={{ display: 'inline-block', width: 12, height: 12, border: `2px solid ${T.border}`, borderTop: `2px solid ${T.blue}`, borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />}
            {txData.total.toLocaleString()} records
          </div>
        </div>
        <div style={{ overflowX: 'auto', opacity: txLoading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
          <table>
            <thead><tr>
              {s ? <>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('date')}>Date{sortIcon('date')}</th>
                <th>Project</th><th>Street</th><th>District</th>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('area')}>Area{sortIcon('area')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('price')}>Price{sortIcon('price')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('psf')}>PSF{sortIcon('psf')}</th>
                <th>Type</th><th>Segment</th>
              </> : <>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('date')}>Period{sortIcon('date')}</th>
                <th>Project</th><th>Street</th><th>District</th>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('area')}>Area (sf){sortIcon('area')}</th>
                <th>Beds</th>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('rent')}>Rent/mo{sortIcon('rent')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('psf')}>Rent PSF{sortIcon('psf')}</th>
                <th>Segment</th>
              </>}
            </tr></thead>
            <tbody>
              {txData.results.map((tx, i) => <tr key={i}>
                <td style={{ color: T.textSub, fontSize: T.md, whiteSpace: 'nowrap' }}>{s ? tx.date : tx.period}</td>
                <td style={{ color: T.text, fontWeight: 600, fontSize: T.md, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.project}</td>
                <td style={{ color: T.textMute, fontSize: T.sm, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.street}</td>
                <td><span style={{ background: SC[tx.segment] + '18', color: SC[tx.segment], padding: '2px 8px', borderRadius: 4, fontSize: T.sm, fontWeight: 600 }}>{tx.district}</span></td>
                <td style={{ fontFamily: T.mono, fontSize: T.md, whiteSpace: 'nowrap' }}>{s ? `${tx.area?.toLocaleString()} sf` : (tx.area || '—')}</td>
                {!s && <td style={{ color: T.textSub, fontSize: T.md, fontFamily: T.mono, textAlign: 'center' }}>{tx.bedrooms || '—'}</td>}
                {s
                  ? <><td style={{ color: T.blue, fontFamily: T.mono, fontWeight: 600, fontSize: T.md }}>${tx.price?.toLocaleString()}</td><td style={{ color: psfColor(tx.psf), fontFamily: T.mono, fontWeight: 600, fontSize: T.md }}>${tx.psf?.toLocaleString()}</td></>
                  : <><td style={{ color: T.teal, fontFamily: T.mono, fontWeight: 600, fontSize: T.md }}>${tx.rent?.toLocaleString()}</td><td style={{ color: rpColor(tx.rentPsf), fontFamily: T.mono, fontSize: T.md }}>${tx.rentPsf}</td></>
                }
                {s && <td style={{ color: T.textSub, fontSize: T.sm }}>{tx.type}</td>}
                <td style={{ color: SC[tx.segment], fontSize: T.sm, fontWeight: 600 }}>{tx.segment}</td>
              </tr>)}
              {txData.results.length === 0 && !txLoading && <tr><td colSpan={s ? 9 : 10} style={{ textAlign: 'center', color: T.textMute, padding: 24 }}>No transactions match your filters</td></tr>}
            </tbody>
          </table>
        </div>
        {txData.pages > 1 && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <button onClick={() => goPage(Math.max(1, txPage - 1))} disabled={txPage <= 1} style={{ background: txPage <= 1 ? T.borderLt : '#fff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 14px', fontSize: T.md, color: txPage <= 1 ? T.textFaint : T.textSub, cursor: txPage <= 1 ? 'default' : 'pointer' }}>← Prev</button>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {[...Array(Math.min(7, txData.pages))].map((_, i) => {
              let pg;
              if (txData.pages <= 7) pg = i + 1;
              else if (txPage <= 4) pg = i + 1;
              else if (txPage >= txData.pages - 3) pg = txData.pages - 6 + i;
              else pg = txPage - 3 + i;
              return <button key={pg} onClick={() => goPage(pg)} style={{ background: pg === txPage ? T.blue : '#fff', color: pg === txPage ? '#fff' : T.textSub, border: '1px solid ' + (pg === txPage ? T.blue : T.textFaint), borderRadius: 6, padding: '4px 10px', fontSize: T.md, cursor: 'pointer', fontWeight: pg === txPage ? 700 : 400, minWidth: 32 }}>{pg}</button>;
            })}
          </div>
          <button onClick={() => goPage(Math.min(txData.pages, txPage + 1))} disabled={txPage >= txData.pages} style={{ background: txPage >= txData.pages ? T.borderLt : '#fff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 14px', fontSize: T.md, color: txPage >= txData.pages ? T.textFaint : T.textSub, cursor: txPage >= txData.pages ? 'default' : 'pointer' }}>Next →</button>
        </div>}
      </Card>
    </div>
  );
}

MarketTab.propTypes = {
  mode: PropTypes.oneOf(['sales', 'rental']).isRequired,
  data: PropTypes.shape({
    yoy: PropTypes.array,
    rTrend: PropTypes.array,
    sSeg: PropTypes.array,
    rSeg: PropTypes.array,
    sTop: PropTypes.array,
    rTop: PropTypes.array,
    sDistLine: PropTypes.array,
    rDistLine: PropTypes.array,
    sDistBar: PropTypes.array,
    rDistBar: PropTypes.array,
    sType: PropTypes.array,
    rType: PropTypes.array,
    sTenure: PropTypes.array,
    sHist: PropTypes.array,
    rHist: PropTypes.array,
    sScat: PropTypes.array,
    rScat: PropTypes.array,
    sCum: PropTypes.array,
    rCum: PropTypes.array,
    topDistricts: PropTypes.array,
    totalTx: PropTypes.number,
    avgPsf: PropTypes.number,
    avgRent: PropTypes.number,
    avgRentPsf: PropTypes.number,
    yoyPct: PropTypes.number,
    totalVolume: PropTypes.number,
    rentalTotal: PropTypes.number,
    hasRealRental: PropTypes.bool,
    psfP25: PropTypes.number,
    psfP75: PropTypes.number,
    distTopPsf: PropTypes.array,
  }),
};
