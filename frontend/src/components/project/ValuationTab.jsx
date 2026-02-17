import { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Line, Cell, Legend, ComposedChart, ScatterChart, Scatter, ZAxis,
} from 'recharts';
import { T, computeBucketCAGR, cagrColor, yieldColor, getBed, DEFAULT_YIELD, pctChgColor, totalPctColor } from '../../constants';
import Tip from '../ui/Tip';
import { Card, SectionHeader, NoteText } from '../ui';

export default function ValuationTab({ projInfo, projData }) {
  const p = projInfo;

  // ── Price Estimator state ──
  const [pricingMode, setPricingMode] = useState('latest');
  const [estArea, setEstArea] = useState(() => {
    const sizes = projData?.projSizes || [];
    return sizes.length > 0 ? sizes[Math.floor(sizes.length / 2)] : 0;
  });
  const [estFloor, setEstFloor] = useState('');

  // ── CAGR state ──
  const [investorMode, setInvestorMode] = useState('overall');

  // ── Heatmap state ──
  const [hmMetric, setHmMetric] = useState('psf');
  const [hmShowDiff, setHmShowDiff] = useState(false);
  const [hmSelFloor, setHmSelFloor] = useState('');
  const [hmSelYear, setHmSelYear] = useState(null);

  // ── Derived data ──
  const projSizes = projData?.projSizes || [];
  const projFloorRanges = projData?.floorRanges || [];
  const pArea = estArea || (projSizes.length > 0 ? projSizes[Math.floor(projSizes.length / 2)] : 0);
  const pFloor = estFloor;

  // Tier 1: Project average
  const t1 = useMemo(() => {
    if (!projData?.txs?.length) return { psf: 0, count: 0 };
    return { psf: p.avgPsf, count: projData.txs.length };
  }, [projData, p.avgPsf]);

  // Tier 2: Size match
  const nearSize = projSizes.length > 0 ? projSizes.reduce((prev, c) => Math.abs(c - pArea) < Math.abs(prev - pArea) ? c : prev, projSizes[0]) : pArea;
  const t2 = useMemo(() => {
    if (!projData?.txs?.length) return { psf: 0, cnt: 0, lp: 0 };
    const sizeTx = projData.txs.filter(t => Math.abs(t.area - nearSize) < 50);
    if (!sizeTx.length) return { psf: 0, cnt: 0, lp: 0 };
    const sorted = [...sizeTx].sort((a, b) => b.date.localeCompare(a.date));
    const avgP = Math.round(sizeTx.reduce((s, t) => s + t.psf, 0) / sizeTx.length);
    return { psf: pricingMode === 'latest' ? sorted[0].psf : avgP, cnt: sizeTx.length, lp: sorted[0].psf };
  }, [projData, nearSize, pricingMode]);

  // Tier 3: Floor match
  const t3 = useMemo(() => {
    if (!pFloor || !projData?.txs?.length) return { psf: 0, cnt: 0 };
    const [lo, hi] = pFloor.split('-').map(Number);
    const floorTx = projData.txs.filter(t => t.floorMid >= lo && t.floorMid <= hi);
    if (!floorTx.length) return { psf: 0, cnt: 0 };
    return { psf: Math.round(floorTx.reduce((s, t) => s + t.psf, 0) / floorTx.length), cnt: floorTx.length };
  }, [projData, pFloor]);

  // Tier 4: Exact match
  const t4 = useMemo(() => {
    if (!pFloor || !projData?.txs?.length) return { psf: 0, cnt: 0 };
    const [lo, hi] = pFloor.split('-').map(Number);
    const exactTx = projData.txs.filter(t => Math.abs(t.area - nearSize) < 50 && t.floorMid >= lo && t.floorMid <= hi);
    if (!exactTx.length) return { psf: 0, cnt: 0 };
    return { psf: Math.round(exactTx.reduce((s, t) => s + t.psf, 0) / exactTx.length), cnt: exactTx.length };
  }, [projData, nearSize, pFloor]);

  const bestPsf = t4.psf || t2.psf || t3.psf || t1.psf;

  // Heatmap matrix — recompute when size filter active
  const projHmYears = projData?.hmYears || [];
  const projHmMatrix = useMemo(() => {
    const base = projData?.hmMatrix || {};
    if (!hmSelFloor || !projData?.rawTx?.length) return base;
    const sizeVal = parseInt(hmSelFloor);
    if (isNaN(sizeVal)) return base;
    const filtered = projData.rawTx.filter(tx => Math.abs(tx.size - sizeVal) < 50);
    if (!filtered.length) return base;
    const matrix = {};
    (projData?.hmFloors || []).forEach(f => {
      const [lo, hi] = f.split('-').map(Number);
      projHmYears.forEach(y => {
        const c = filtered.filter(t => t.floorMid >= lo && t.floorMid <= hi && t.year === y);
        if (c.length > 0) matrix[`${f}-${y}`] = { psf: Math.round(c.reduce((s, t) => s + t.psf, 0) / c.length), vol: c.length, price: Math.round(c.reduce((s, t) => s + t.price, 0) / c.length) };
      });
    });
    return matrix;
  }, [projData, hmSelFloor, projHmYears]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* ── Floor Premium ── */}
      <SectionHeader icon="🏗️" title="Floor Premium Analysis" sub={`Average PSF by floor band (${projData?.floorPeriod === '12mo' ? 'last 12 months' : 'all time — limited recent data'}).`} />
      <Card>
        <div style={{ height: 300 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={projData?.projFloor || []}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border} />
          <XAxis dataKey="range" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} />
          <YAxis yAxisId="l" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => '$' + v.toLocaleString()} />
          <YAxis yAxisId="r" orientation="right" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => `${v >= 0 ? '+' : ''}${v}%`} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0]?.payload;
            return <div style={{ background: '#1e293bf0', padding: '10px 14px', borderRadius: T.r, border: '1px solid #334155' }}>
              <div style={{ color: T.border, fontWeight: 700, fontSize: T.lg }}>Floor {d.range}</div>
              <div style={{ color: T.blue, fontSize: T.base }}>${d.psf?.toLocaleString()} PSF</div>
              <div style={{ color: T.amber, fontSize: T.base }}>{d.premium >= 0 ? '+' : ''}{d.premium}% premium</div>
              <div style={{ color: d.thin ? T.amber : T.textMute, fontSize: T.md }}>{d.count} transaction{d.count !== 1 ? 's' : ''}{d.thin ? ' ⚠️' : ''}</div>
            </div>;
          }} />
          <Legend wrapperStyle={{ fontSize: T.md }} />
          <Bar yAxisId="l" dataKey="psf" name="Avg PSF" radius={[4, 4, 0, 0]} barSize={20}>{(projData?.projFloor || []).map((f, i) => <Cell key={i} fill={f.thin ? T.textMute : T.sky} fillOpacity={f.thin ? 0.5 : 1} />)}</Bar>
          <Line yAxisId="r" type="monotone" dataKey="premium" name="Premium %" stroke={T.amber} strokeWidth={2.5} dot={{ r: 4, fill: T.amber }} />
        </ComposedChart></ResponsiveContainer></div>
        {(projData?.thinBands?.length > 0) && <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, color: T.amber, fontSize: T.md }}><span>⚠️</span><span>Floor{projData.thinBands.length > 1 ? 's' : ''} {projData.thinBands.join(', ')} — fewer than 3 transactions, treat with caution</span></div>}
      </Card>
      <NoteText>Higher floors command a premium — the gap reflects unobstructed views and reduced noise.{projData?.floorPeriod === 'all' ? ' Data uses all-time transactions due to limited recent sales.' : ''}</NoteText>

      {/* ── Transaction Scatter ── */}
      <SectionHeader icon="⬡" title="Transaction Scatter: Size × Floor × PSF" sub="Each dot is a real transaction. Bubble size = floor level." />
      <Card><div style={{ height: 300 }}><ResponsiveContainer width="100%" height="100%"><ScatterChart>
        <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
        <XAxis type="number" dataKey="area" name="Area (sqft)" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => `${v} sf`} />
        <YAxis type="number" dataKey="psf" name="PSF ($)" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => '$' + v.toLocaleString()} />
        <ZAxis type="number" dataKey="floor" name="Floor" range={[30, 200]} />
        <Tooltip content={<Tip />} />
        <Scatter name="Transactions" data={projData?.projScatter || []} fill={T.purple} fillOpacity={0.6} />
      </ScatterChart></ResponsiveContainer></div></Card>

      {/* ── Price Estimator ── */}
      <SectionHeader icon="🧮" title="Price Estimator" sub="Multi-tier estimation: finds the best match from project → size → floor → exact." />
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ color: T.text, fontSize: T.xl, fontWeight: 600 }}>🏷️ Price Estimator</div>
          <div style={{ display: 'flex', background: T.borderLt, borderRadius: T.r, padding: 2, border: '1px solid #e2e8f0' }}>
            {['latest', 'average'].map(m => <button key={m} onClick={() => setPricingMode(m)} style={{ background: pricingMode === m ? '#a78bfa26' : 'transparent', border: pricingMode === m ? '1px solid #a78bfa4D' : '1px solid transparent', borderRadius: 6, padding: '5px 14px', fontSize: T.md, color: pricingMode === m ? T.purple : T.textSub, cursor: 'pointer', fontWeight: 600 }}>{m === 'latest' ? 'Latest' : 'Average'}</button>)}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div>
            <label style={{ color: T.textMute, fontSize: T.sm, fontWeight: 600, marginBottom: 6, display: 'block' }}>UNIT SIZE (SQFT)</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {projSizes.map(s => <button key={s} onClick={() => setEstArea(s)} style={{ background: pArea === s ? T.purple : T.borderLt, border: pArea === s ? '1px solid #a78bfa' : '1px solid #cbd5e1', borderRadius: 6, padding: '6px 12px', fontSize: T.base, color: pArea === s ? '#fff' : T.textMute, cursor: 'pointer', fontFamily: T.mono, fontWeight: pArea === s ? 700 : 400 }}>{s.toLocaleString()}</button>)}
            </div>
          </div>
          <div>
            <label style={{ color: T.textMute, fontSize: T.sm, fontWeight: 600, marginBottom: 6, display: 'block' }}>FLOOR LEVEL</label>
            <select value={estFloor} onChange={e => setEstFloor(e.target.value)} style={{ background: T.border, border: '1px solid #cbd5e1', borderRadius: T.r, padding: '8px 12px', color: T.text, fontSize: T.lg, width: '100%', outline: 'none', fontFamily: T.mono, cursor: 'pointer' }}>
              <option value="">All floors</option>
              {projFloorRanges.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
        {bestPsf > 0 && <div style={{ background: 'linear-gradient(135deg,#a78bfa18,#38bdf818)', borderRadius: T.rLg, padding: '18px 20px', border: '1px solid #a78bfa26', marginBottom: 12 }}>
          <div style={{ color: T.textMute, fontSize: T.sm, fontWeight: 600, letterSpacing: 0.5, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>BEST ESTIMATE · {pricingMode === 'latest' ? 'LATEST TX' : 'SMART AVERAGE'}<span title="Cascading match: exact (size+floor) → size → floor → project avg" style={{ cursor: 'help', opacity: 0.6, fontSize: T.base }}>ℹ️</span></div>
          <div style={{ color: T.text, fontSize: 32, fontWeight: 800, fontFamily: T.mono, lineHeight: 1 }}>${(bestPsf * pArea).toLocaleString()}</div>
          <div style={{ color: T.textSub, fontSize: T.base, marginTop: 6 }}>${bestPsf.toLocaleString()} PSF × {pArea.toLocaleString()} sqft{pFloor ? ` · Floor ${pFloor}` : ''}</div>
        </div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { tier: 1, label: 'PROJECT AVG', desc: 'All sizes · All floors', psf: t1.psf, cnt: t1.count, c: T.textMute, ic: '📊', act: !t2.psf && !t3.psf && !t4.psf },
            { tier: 2, label: 'SIZE MATCH', desc: `${nearSize.toLocaleString()} sqft · Any floor`, psf: t2.psf, cnt: t2.cnt, c: T.blue, ic: '📐', act: t2.psf > 0 && !t4.psf },
            ...(pFloor ? [{ tier: 3, label: 'FLOOR MATCH', desc: `Any size · Floor ${pFloor}`, psf: t3.psf, cnt: t3.cnt, c: T.amber, ic: '🏢', act: t3.psf > 0 && !t4.psf }] : []),
            ...(pFloor && nearSize ? [{ tier: 4, label: 'EXACT MATCH', desc: `${nearSize.toLocaleString()} sqft · Floor ${pFloor}`, psf: t4.psf, cnt: t4.cnt, c: T.green, ic: '🎯', act: t4.psf > 0 }] : [])
          ].map(t => t.psf > 0 && <div key={t.tier} style={{ background: t.act ? `${t.c}08` : T.borderLt, border: `1px solid ${t.act ? t.c + '4D' : T.border}`, borderRadius: T.rLg, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
            {t.act && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: t.c }} />}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 14 }}>{t.ic}</span><span style={{ color: t.act ? t.c : T.textMute, fontSize: T.md, fontWeight: 700 }}>{t.label}</span></div>
              <span style={{ background: T.borderLt, borderRadius: 6, padding: '2px 8px', fontSize: T.sm, color: T.textSub }}>{t.cnt} tx</span>
            </div>
            <div style={{ color: t.act ? T.text : T.textMute, fontSize: 22, fontWeight: 800, fontFamily: T.mono }}>${(t.psf * pArea).toLocaleString()}</div>
            <div style={{ color: T.textSub, fontSize: T.sm, marginTop: 4 }}>${t.psf.toLocaleString()} PSF × {pArea.toLocaleString()} sqft</div>
            <div style={{ color: T.textSub, fontSize: T.xs, marginTop: 2 }}>{t.desc}</div>
          </div>)}
        </div>
      </Card>

      {/* ── CAGR Analysis ── */}
      <SectionHeader icon="📈" title="CAGR Analysis — Investor Mode" sub="Computed from this project's transaction history. Toggle views to analyse by size and floor." />
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 0, background: T.borderLt, borderRadius: T.r, padding: 2, border: '1px solid #e2e8f0' }}>
            {[{ id: 'overall', l: 'Overall' }, { id: 'size', l: 'By Size Type' }, { id: 'floor', l: 'By Floor Band' }].map(m =>
              <button key={m.id} onClick={() => setInvestorMode(m.id)} style={{ background: investorMode === m.id ? '#a78bfa26' : 'transparent', border: investorMode === m.id ? '1px solid #a78bfa4D' : '1px solid transparent', borderRadius: 6, padding: '6px 16px', fontSize: T.md, color: investorMode === m.id ? T.purple : T.textSub, cursor: 'pointer', fontWeight: 600 }}>{m.l}</button>
            )}
          </div>
          <div style={{ color: T.textSub, fontSize: T.sm, fontStyle: 'italic' }}>{(() => { const yrs = [...new Set((projData?.rawTx || []).map(t => t.year))].sort(); return yrs.length > 1 ? `Period: ${yrs[0]} → ${yrs[yrs.length - 1]} (${parseInt(yrs[yrs.length - 1]) - parseInt(yrs[0])} years) · ${(projData?.rawTx || []).length} transactions` : `${(projData?.rawTx || []).length} transactions`; })()}</div>
        </div>
        {(() => {
          let rows = [];
          if (investorMode === 'overall') {
            const r = computeBucketCAGR(projData?.rawTx || []);
            rows = [{ label: 'ALL UNITS', sub: 'All sizes · All floors', icon: '📊', ...r, yield: parseFloat(p.yield) || DEFAULT_YIELD }];
          } else if (investorMode === 'size') {
            rows = (projData?.projSizes || []).map(s => {
              const filtered = (projData?.rawTx || []).filter(tx => Math.abs(tx.size - s) < 50);
              const r = computeBucketCAGR(filtered);
              const bed = getBed(s);
              const bedData = (projData?.projByBed || []).find(b => b.bed === bed);
              const sizeYield = bedData && bedData.psf > 0 ? +((bedData.rentPsf * 12 / bedData.psf) * 100).toFixed(2) : (p.yield || DEFAULT_YIELD);
              return { label: `${s.toLocaleString()} sqft`, sub: `${filtered.length} transactions`, icon: '📐', ...r, yield: sizeYield };
            });
          } else {
            rows = (projData?.floorRanges || []).map(f => {
              const filtered = (projData?.rawTx || []).filter(tx => tx.floor === f);
              const r = computeBucketCAGR(filtered);
              const floorData = (projData?.projFloor || []).find(fl => fl.range === f);
              const floorYield = floorData && floorData.psf > 0 && p.rentPsf > 0 ? +((p.rentPsf * 12 / floorData.psf) * 100).toFixed(2) : (p.yield || DEFAULT_YIELD);
              return { label: `Floor ${f}`, sub: `${filtered.length} transactions`, icon: '🏢', ...r, yield: floorYield };
            });
          }
          const colHeader = investorMode === 'overall' ? 'Bucket' : investorMode === 'size' ? 'Unit Size' : 'Floor Band';
          const yrs = [...new Set((projData?.rawTx || []).map(t => t.year))].sort();
          return <div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr>
                  {[colHeader, `${yrs[0] || 'Start'} Avg`, `${yrs[yrs.length - 1] || 'End'} Avg`, 'n (Start)', 'n (End)', 'CAGR', 'Yield', 'Total Return'].map(h => <th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>{rows.map((r, ri) => {
                  const totalReturn = r.cagr !== null ? (r.cagr + r.yield).toFixed(1) : null;
                  return <tr key={ri} style={{ opacity: r.lowConf ? 0.5 : 1 }}>
                    <td style={{ color: T.text, fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: T.lg }}>{r.icon}</span>
                        <div>
                          <div style={{ fontFamily: T.mono }}>{r.label}{r.lowConf && <span style={{ color: T.amber, marginLeft: 4 }} title={`Low confidence: start n=${r.startN}, end n=${r.endN}`}>*</span>}</div>
                          <div style={{ color: T.textSub, fontSize: T.xs, fontWeight: 400 }}>{r.sub}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ color: T.textMute, fontFamily: T.mono }}>{r.startAvg ? `$${r.startAvg.toLocaleString()}` : '—'}</td>
                    <td style={{ color: T.blue, fontFamily: T.mono, fontWeight: 600 }}>{r.endAvg ? `$${r.endAvg.toLocaleString()}` : '—'}</td>
                    <td style={{ color: r.startN < 3 ? T.amber : T.textSub, fontFamily: T.mono, fontSize: T.md }}>{r.startN}</td>
                    <td style={{ color: r.endN < 3 ? T.amber : T.textSub, fontFamily: T.mono, fontSize: T.md }}>{r.endN}</td>
                    <td style={{ color: r.cagr !== null ? cagrColor(r.cagr) : T.textSub, fontFamily: T.mono, fontWeight: 700, fontSize: 14 }}>{r.cagr !== null ? `${r.cagr >= 0 ? '+' : ''}${r.cagr.toFixed(1)}%` : '—'}</td>
                    <td style={{ color: yieldColor(r.yield), fontFamily: T.mono }}>{r.yield}%</td>
                    <td style={{ color: totalReturn && Number(totalReturn) < 0 ? T.red : T.purple, fontWeight: 700, fontFamily: T.mono, fontSize: T.xl }}>{totalReturn ? `${Number(totalReturn) >= 0 ? '+' : ''}${totalReturn}%` : '—'}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            {/* Sparklines */}
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: `repeat(${Math.min(rows.length, investorMode === 'overall' ? 1 : 5)},1fr)`, gap: 8 }}>
              {rows.slice(0, investorMode === 'overall' ? 1 : 10).map((r, ri) => <div key={ri} style={{ background: T.borderLt, borderRadius: T.r, padding: '10px 12px', opacity: r.lowConf ? 0.5 : 1 }}>
                <div style={{ color: T.textMute, fontSize: T.sm, fontWeight: 600, marginBottom: 6 }}>{r.label}</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 40 }}>
                  {r.annualAvg.map((a, ai) => {
                    if (!a.avg) return <div key={ai} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}><div style={{ height: 2, width: '100%', background: T.border, borderRadius: 1 }} /><div style={{ fontSize: 7, color: T.textSub }}>{a.year.slice(2)}</div></div>;
                    const allAvgs = r.annualAvg.filter(x => x.avg).map(x => x.avg);
                    const min = Math.min(...allAvgs); const max = Math.max(...allAvgs);
                    const h = max > min ? 4 + ((a.avg - min) / (max - min)) * 32 : 20;
                    return <div key={ai} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <div style={{ fontSize: 8, color: T.textMute, fontFamily: T.mono }}>{a.avg}</div>
                      <div style={{ height: h, width: '100%', background: ai === r.annualAvg.length - 1 ? T.purple : T.blue, borderRadius: 2, opacity: a.n < 3 ? 0.4 : 0.8 }} />
                      <div style={{ fontSize: 7, color: T.textSub }}>{a.year.slice(2)}</div>
                    </div>;
                  })}
                </div>
                {r.cagr !== null && <div style={{ textAlign: 'center', marginTop: 4, fontSize: T.md, fontWeight: 700, color: cagrColor(r.cagr), fontFamily: T.mono }}>CAGR {r.cagr >= 0 ? '+' : ''}{r.cagr.toFixed(1)}%</div>}
              </div>)}
            </div>
            {rows.some(r => r.lowConf) && <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, color: T.amber, fontSize: T.sm }}><span>⚠️</span><span>* Dimmed rows have fewer than 3 transactions in start or end year — CAGR may be unreliable</span></div>}
          </div>;
        })()}
        <NoteText style={{ marginTop: 12 }}>CAGR = (End PSF ÷ Start PSF)^(1/years) − 1. Total Return = CAGR + Gross Yield (simple additive).</NoteText>
      </Card>

      {/* ── Floor × Year Heatmap ── */}
      <SectionHeader icon="🗓️" title="Historical Heatmap — Floor × Year" sub="Click any cell to inspect. Toggle metrics (PSF/Price/Vol), enable ± Changes for YoY diffs, or filter by unit size." />
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 0, background: T.borderLt, borderRadius: T.r, padding: 2, border: '1px solid #e2e8f0' }}>
            {[{ id: 'psf', l: 'PSF' }, { id: 'price', l: 'Price' }, { id: 'vol', l: 'Vol' }].map(m =>
              <button key={m.id} onClick={() => setHmMetric(m.id)} style={{ background: hmMetric === m.id ? '#a78bfa26' : 'transparent', border: hmMetric === m.id ? '1px solid #a78bfa4D' : '1px solid transparent', borderRadius: 6, padding: '5px 14px', fontSize: T.md, color: hmMetric === m.id ? T.purple : T.textSub, cursor: 'pointer', fontWeight: 600, fontFamily: T.mono }}>{m.l}</button>
            )}
          </div>
          <button onClick={() => setHmShowDiff(!hmShowDiff)} style={{ background: hmShowDiff ? '#f59e0b20' : T.borderLt, border: hmShowDiff ? '1px solid #f59e0b4D' : '1px solid #e2e8f0', borderRadius: T.r, padding: '5px 14px', fontSize: T.md, color: hmShowDiff ? T.amber : T.textSub, cursor: 'pointer', fontWeight: 600 }}>± Changes</button>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {['All', ...projSizes].map(s => {
              const active = (s === 'All' && hmSelFloor === '') || hmSelFloor === String(s);
              return <button key={s} onClick={() => setHmSelFloor(s === 'All' ? '' : String(s))} style={{ background: active ? '#a78bfa26' : 'transparent', border: active ? '1px solid #a78bfa4D' : '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', fontSize: T.sm, color: active ? T.purple : T.textSub, cursor: 'pointer', fontWeight: 600 }}>{s === 'All' ? 'All sizes' : `${s}sf`}</button>;
            })}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 850 }}>
            <div style={{ display: 'flex' }}>
              <div style={{ width: 70, flexShrink: 0, fontSize: T.sm, fontWeight: 600, color: T.textMute, padding: '8px 4px' }}>Floor</div>
              {projHmYears.map(y => <div key={y} onClick={() => setHmSelYear(hmSelYear === y ? null : y)} style={{ flex: 1, minWidth: 72, textAlign: 'center', fontSize: T.sm, fontWeight: 600, color: hmSelYear === y ? T.purple : T.textMute, padding: '8px 0', borderBottom: hmSelYear === y ? '2px solid #a78bfa' : '1px solid #f1f5f9', cursor: 'pointer' }}>{y}</div>)}
              {['Avg Incr.', '% Chg', 'Abs. Chg', 'Total %'].map(h => <div key={h} style={{ width: h.includes('Avg') || h.includes('Abs') ? 65 : 60, flexShrink: 0, textAlign: 'center', fontSize: T.xs, fontWeight: 600, color: T.text, padding: '8px 2px', borderBottom: '1px solid #f1f5f9', background: T.bg, borderLeft: h === 'Avg Incr.' ? '1px solid #e2e8f0' : 'none' }}>{h}</div>)}
            </div>
            {(() => {
              const allCells = Object.values(projHmMatrix);
              const allPsf = allCells.map(c => c.psf).filter(Boolean);
              const allPrice = allCells.map(c => c.price).filter(Boolean);
              const allVol = allCells.map(c => c.vol).filter(Boolean);
              const globalMin = hmMetric === 'psf' ? (allPsf.length ? Math.min(...allPsf) : 0) : hmMetric === 'price' ? (allPrice.length ? Math.min(...allPrice) : 0) : (allVol.length ? Math.min(...allVol) : 0);
              const globalMax = hmMetric === 'psf' ? (allPsf.length ? Math.max(...allPsf) : 1) : hmMetric === 'price' ? (allPrice.length ? Math.max(...allPrice) : 1) : (allVol.length ? Math.max(...allVol) : 1);

              return (projData?.hmFloors || []).map(f => {
                const vals = projHmYears.map(y => { const cell = projHmMatrix[`${f}-${y}`]; if (!cell) return 0; return hmMetric === 'psf' ? cell.psf : hmMetric === 'price' ? cell.price : cell.vol; });
                const firstV = vals.find(v => v > 0) || 1;
                const lastV = vals[vals.length - 1] || 0;
                const totalPct = firstV > 0 ? Math.round((lastV / firstV - 1) * 100) : 0;
                const absChg = lastV - firstV;
                const gapYears = projHmYears.length - 1;
                const avgIncr = gapYears > 0 ? Math.round(absChg / gapYears) : 0;
                const pctChg = gapYears > 0 ? (totalPct / gapYears).toFixed(1) : 0;

                return <div key={f} style={{ display: 'flex', borderBottom: '1px solid #f1f5f9' }} onMouseEnter={e => e.currentTarget.style.background = T.borderLt} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ width: 70, flexShrink: 0, fontSize: T.md, fontWeight: 600, color: T.text, padding: '10px 4px', fontFamily: T.mono }}>{f}</div>
                  {projHmYears.map((y, yi) => {
                    const cell = projHmMatrix[`${f}-${y}`];
                    if (!cell) return <div key={y} style={{ flex: 1, minWidth: 72, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textSub, fontSize: T.md }}>-</div>;
                    const raw = hmMetric === 'psf' ? cell.psf : hmMetric === 'price' ? cell.price : cell.vol;
                    const prevRaw = yi > 0 ? (hmMetric === 'psf' ? projHmMatrix[`${f}-${projHmYears[yi - 1]}`]?.psf : hmMetric === 'price' ? projHmMatrix[`${f}-${projHmYears[yi - 1]}`]?.price : projHmMatrix[`${f}-${projHmYears[yi - 1]}`]?.vol) : null;
                    const diff = prevRaw ? raw - prevRaw : null;
                    const ratio = (globalMax > globalMin) ? Math.max(0, Math.min(1, (raw - globalMin) / (globalMax - globalMin))) : 0.5;
                    const alpha = hmShowDiff && yi === 0 ? 0.05 : 0.08 + ratio * 0.65;

                    let displayVal, displayColor;
                    if (hmShowDiff && yi > 0 && diff !== null) {
                      displayVal = hmMetric === 'psf' ? (diff >= 0 ? '+$' : '-$') + Math.abs(diff) : hmMetric === 'price' ? (diff >= 0 ? '+$' : '-$') + Math.abs(diff).toLocaleString() : (diff >= 0 ? '+' : '') + diff;
                      displayColor = diff > 0 ? T.lime : diff < 0 ? T.negLt : T.textMute;
                    } else {
                      displayVal = hmMetric === 'psf' ? '$' + raw.toLocaleString() : hmMetric === 'price' ? '$' + (raw >= 1e6 ? (raw / 1e6).toFixed(2) + 'M' : raw.toLocaleString()) : raw;
                      displayColor = ratio > 0.6 ? T.text : T.textMute;
                    }

                    const bgAlpha = hmShowDiff && yi > 0 && diff !== null ? (diff > 0 ? `rgba(74,222,128,${Math.min(0.3, Math.abs(diff) / (hmMetric === 'psf' ? 200 : 500000) * 0.3)})` : diff < 0 ? `rgba(248,113,113,${Math.min(0.3, Math.abs(diff) / (hmMetric === 'psf' ? 200 : 500000) * 0.3)})` : 'transparent') : `rgba(14,165,233,${alpha})`;
                    const isSelected = hmSelYear === y;

                    return <div key={y} onClick={() => setHmSelYear(y)} style={{ flex: 1, minWidth: 72, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: T.sm, fontFamily: T.mono, fontWeight: 500, backgroundColor: bgAlpha, color: displayColor, transition: 'all 0.2s', cursor: 'pointer', outline: isSelected ? '2px solid #a78bfa' : 'none', outlineOffset: -2, borderRadius: isSelected ? 2 : 0 }} title={`${f}, ${y}: $${cell.psf.toLocaleString()} PSF · ${cell.vol} txns · $${cell.price.toLocaleString()} avg price`}>{displayVal}</div>;
                  })}
                  {/* Summary columns */}
                  <div style={{ width: 65, flexShrink: 0, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: T.sm, fontFamily: T.mono, fontWeight: 600, color: avgIncr >= 0 ? T.textMute : T.negLt, background: T.bg, borderLeft: '1px solid #e2e8f0' }}>{hmMetric === 'psf' ? (avgIncr >= 0 ? '+$' : '-$') + Math.abs(avgIncr) : hmMetric === 'price' ? (avgIncr >= 0 ? '+$' : '-$') + (Math.abs(avgIncr) / 1e3).toFixed(0) + 'K' : (avgIncr >= 0 ? '+' : '') + avgIncr}</div>
                  <div style={{ width: 60, flexShrink: 0, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: T.sm, fontFamily: T.mono, fontWeight: 600, color: pctChgColor(Number(pctChg)), background: T.bg }}>{Number(pctChg) > 0 ? '+' : ''}{pctChg}%</div>
                  <div style={{ width: 65, flexShrink: 0, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: T.sm, fontFamily: T.mono, fontWeight: 600, color: absChg >= 0 ? T.blue : T.negLt, background: T.bg }}>{hmMetric === 'psf' ? (absChg >= 0 ? '+$' : '-$') + Math.abs(absChg) : hmMetric === 'price' ? (absChg >= 0 ? '+$' : '-$') + (Math.abs(absChg) / 1e3).toFixed(0) + 'K' : (absChg >= 0 ? '+' : '') + absChg}</div>
                  <div style={{ width: 60, flexShrink: 0, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: T.sm, fontFamily: T.mono, fontWeight: 700, color: totalPctColor(totalPct), background: T.bg }}>{totalPct > 0 ? '+' : ''}{totalPct}%</div>
                </div>;
              });
            })()}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, fontSize: T.sm, color: T.textSub, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Low</span>
                <div style={{ width: 80, height: 6, borderRadius: 3, background: hmShowDiff ? 'linear-gradient(to right, rgba(248,113,113,0.3), transparent, rgba(74,222,128,0.3))' : 'linear-gradient(to right, rgba(14,165,233,0.08), rgba(14,165,233,0.73))' }} />
                <span>{hmShowDiff ? 'High Δ' : 'High ' + hmMetric.toUpperCase()}</span>
              </div>
              <span style={{ fontStyle: 'italic' }}>Click cells to select · {hmShowDiff ? 'Showing YoY changes' : 'Showing absolute values'}</span>
            </div>
          </div>
        </div>
        <NoteText style={{ marginTop: 12 }}>Higher floors tend to show stronger long-term growth. Check the YoY changes toggle to see growth patterns by floor band.</NoteText>
      </Card>
    </div>
  );
}

ValuationTab.propTypes = {
  projInfo: PropTypes.shape({
    avgPsf: PropTypes.number.isRequired,
    yield: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    rentPsf: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }).isRequired,
  projData: PropTypes.shape({
    projFloor: PropTypes.array,
    projScatter: PropTypes.array,
    projSizes: PropTypes.array,
    floorRanges: PropTypes.array,
    floorPeriod: PropTypes.string,
    thinBands: PropTypes.array,
    rawTx: PropTypes.array,
    txs: PropTypes.array,
    hmYears: PropTypes.array,
    hmFloors: PropTypes.array,
    hmMatrix: PropTypes.object,
    projByBed: PropTypes.array,
  }),
};
