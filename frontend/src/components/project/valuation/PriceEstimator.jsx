/**
 * PriceEstimator.jsx — Price tier grid with time windows (3M/6M/12M)
 * Extracted from ValuationTab lines 329–535
 */
import { useState, useMemo } from 'react';
import { T } from '../../../constants';
import { Card, SectionHeader } from '../../ui';

const calcTier = (txs) => {
  if (!txs.length) return { psf: 0, cnt: 0, txs: [] };
  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
  const avgP = Math.round(txs.reduce((s, t) => s + t.psf, 0) / txs.length);
  return { psf: avgP, cnt: txs.length, txs: sorted };
};

export default function PriceEstimator({
  projInfo, projData, pArea, pFloor, setEstArea, setEstFloor,
  projSizes, projFloorRanges, txWindows, projCagr, timeAdjust,
}) {
  const p = projInfo;
  const [expandedTier, setExpandedTier] = useState(null);
  const [selectedTx, setSelectedTx] = useState(null);

  const nearSize = projSizes.length > 0 ? projSizes.reduce((prev, c) => Math.abs(c - pArea) < Math.abs(prev - pArea) ? c : prev, projSizes[0]) : pArea;
  const sizeFilter = (txs) => txs.filter(t => Math.abs(t.area - nearSize) < 50);
  const floorFilterFn = (txs) => {
    if (!pFloor) return [];
    const [lo, hi] = pFloor.split('-').map(Number);
    return txs.filter(t => t.floorMid >= lo && t.floorMid <= hi);
  };
  const exactFilter = (txs) => {
    if (!pFloor) return [];
    const [lo, hi] = pFloor.split('-').map(Number);
    return txs.filter(t => Math.abs(t.area - nearSize) < 50 && t.floorMid >= lo && t.floorMid <= hi);
  };

  const tiers = useMemo(() => {
    const t = [
      { id: 1, label: 'PROJECT AVG', desc: 'All sizes · All floors', ic: '📊', c: T.textMute,
        m3: calcTier(txWindows.m3), m6: calcTier(txWindows.m6), m12: calcTier(txWindows.m12) },
      { id: 2, label: 'SIZE MATCH', desc: `${nearSize.toLocaleString()} sqft · Any floor`, ic: '📐', c: T.blue,
        m3: calcTier(sizeFilter(txWindows.m3)), m6: calcTier(sizeFilter(txWindows.m6)), m12: calcTier(sizeFilter(txWindows.m12)) },
    ];
    if (pFloor) {
      t.push({ id: 3, label: 'FLOOR MATCH', desc: `Any size · Floor ${pFloor}`, ic: '🏢', c: T.amber,
        m3: calcTier(floorFilterFn(txWindows.m3)), m6: calcTier(floorFilterFn(txWindows.m6)), m12: calcTier(floorFilterFn(txWindows.m12)) });
    }
    if (pFloor && nearSize) {
      t.push({ id: 4, label: 'EXACT MATCH', desc: `${nearSize.toLocaleString()} sqft · Floor ${pFloor}`, ic: '🎯', c: T.green,
        m3: calcTier(exactFilter(txWindows.m3)), m6: calcTier(exactFilter(txWindows.m6)), m12: calcTier(exactFilter(txWindows.m12)) });
    }
    return t;
  }, [txWindows, nearSize, pFloor]);

  const medianDate = (txs) => txs?.length ? txs[Math.floor(txs.length / 2)]?.date : null;

  const bestTier = useMemo(() => {
    for (const t of [...tiers].reverse()) {
      if (t.m3.psf > 0) return { ...t.m3, period: '3M', tier: t };
      if (t.m6.psf > 0) return { ...t.m6, period: '6M', tier: t };
      if (t.m12.psf > 0) return { ...t.m12, period: '12M', tier: t };
    }
    return null;
  }, [tiers]);

  const bestAdj = useMemo(() => {
    if (!bestTier) return { adjPsf: 0, months: 0, rate: 0 };
    return timeAdjust(bestTier.psf, medianDate(bestTier.txs));
  }, [bestTier, timeAdjust]);
  const bestRaw = bestTier?.psf || 0;
  const bestAdjPsf = bestAdj.adjPsf || bestRaw;

  const selectedTxAdj = useMemo(() => {
    if (!selectedTx) return null;
    const adj = timeAdjust(selectedTx.psf, selectedTx.date);
    return { ...adj, tx: selectedTx };
  }, [selectedTx, timeAdjust]);

  const allTxSorted = useMemo(() => [...(projData?.txs || [])].sort((a, b) => b.date.localeCompare(a.date)), [projData]);

  const TierCell = ({ data, color, bgColor, tierId, periodKey }) => {
    const isExpanded = expandedTier === tierId + '-' + periodKey;
    if (data.psf <= 0) return <div style={{ background: T.borderLt, borderRadius: T.r, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: T.textMute, fontSize: T.sm }}>No data</span>
    </div>;
    return <div onClick={() => setExpandedTier(isExpanded ? null : tierId + '-' + periodKey)}
      style={{ background: bgColor, border: `1px solid ${color}26`, borderRadius: T.r, padding: '10px 12px', cursor: 'pointer', transition: 'all 0.15s' }}>
      <div style={{ color: T.text, fontSize: 18, fontWeight: 800, fontFamily: T.mono }}>${(data.psf * pArea).toLocaleString()}</div>
      <div style={{ color: T.textSub, fontSize: T.sm }}>${data.psf.toLocaleString()} PSF · {data.cnt} tx</div>
    </div>;
  };

  return <>
    <SectionHeader icon="🧮" title="Price Estimator" sub="Average PSF by tier. 3M = market pulse, 6M = recent trend, 12M = fair value benchmark." />
    <Card>
      {/* Unit selectors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div>
          <label style={{ color: T.textMute, fontSize: T.sm, fontWeight: 600, marginBottom: 6, display: 'block' }}>UNIT SIZE (SQFT)</label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {projSizes.map(s => <button key={s} onClick={() => setEstArea(s)} style={{ background: pArea === s ? T.purple : T.borderLt, border: pArea === s ? '1px solid #a78bfa' : '1px solid #cbd5e1', borderRadius: 6, padding: '6px 12px', fontSize: T.base, color: pArea === s ? '#fff' : T.textMute, cursor: 'pointer', fontFamily: T.mono, fontWeight: pArea === s ? 700 : 400 }}>{s.toLocaleString()}</button>)}
          </div>
        </div>
        <div>
          <label style={{ color: T.textMute, fontSize: T.sm, fontWeight: 600, marginBottom: 6, display: 'block' }}>FLOOR LEVEL</label>
          <select value={pFloor} onChange={e => setEstFloor(e.target.value)} style={{ background: T.border, border: '1px solid #cbd5e1', borderRadius: T.r, padding: '8px 12px', color: T.text, fontSize: T.lg, width: '100%', outline: 'none', fontFamily: T.mono, cursor: 'pointer' }}>
            <option value="">All floors</option>
            {projFloorRanges.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>

      {/* Best estimate banner */}
      {bestRaw > 0 && <div style={{ background: 'linear-gradient(135deg,#a78bfa18,#38bdf818)', borderRadius: T.rLg, padding: '18px 20px', border: '1px solid #a78bfa26', marginBottom: 16 }}>
        <div style={{ color: T.textMute, fontSize: T.sm, fontWeight: 600, letterSpacing: 0.5, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          BEST ESTIMATE · {bestTier?.tier?.label} · {bestTier?.period}
          <span title="Uses most specific tier with data. Prefers 3M → 6M → 12M." style={{ cursor: 'help', opacity: 0.6, fontSize: T.base }}>ℹ️</span>
        </div>
        <div style={{ color: T.text, fontSize: 32, fontWeight: 800, fontFamily: T.mono, lineHeight: 1 }}>${(bestRaw * pArea).toLocaleString()}</div>
        <div style={{ color: T.textSub, fontSize: T.base, marginTop: 6 }}>${bestRaw.toLocaleString()} PSF × {pArea.toLocaleString()} sqft{pFloor ? ` · Floor ${pFloor}` : ''}</div>
        {bestAdj.months > 0 && bestAdj.rate !== null && bestAdjPsf !== bestRaw && <div style={{ color: T.purple, fontSize: T.sm, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>⏱️</span> Adjusted to today: ${bestAdjPsf.toLocaleString()} PSF · ${(bestAdjPsf * pArea).toLocaleString()} <span style={{ color: T.textMute }}>({bestAdj.months}mo at {bestAdj.rate > 0 ? '+' : ''}{Number(bestAdj.rate).toFixed(1)}% CAGR)</span>
        </div>}
      </div>}

      {/* Reference Transaction Picker */}
      <div style={{ background: T.borderLt, borderRadius: T.rLg, padding: '14px 16px', marginBottom: 16, border: `1px solid ${selectedTx ? T.purple + '40' : T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>📌</span>
            <div>
              <div style={{ color: T.text, fontSize: T.md, fontWeight: 700 }}>Reference Transaction</div>
              <div style={{ color: T.textMute, fontSize: T.xs }}>Select a past transaction to project its value to today using CAGR</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={selectedTx ? `${selectedTx.date}|${selectedTx.psf}|${selectedTx.area}|${selectedTx.floorRange || ''}` : ''}
              onChange={e => {
                if (!e.target.value) { setSelectedTx(null); return; }
                const [date, psf, area] = e.target.value.split('|');
                const tx = allTxSorted.find(t => t.date === date && t.psf === +psf && t.area === +area);
                setSelectedTx(tx || null);
              }}
              style={{ background: '#fff', border: `1px solid ${selectedTx ? T.purple : '#cbd5e1'}`, borderRadius: 6, padding: '6px 10px', fontSize: T.md, color: T.text, cursor: 'pointer', outline: 'none', minWidth: 280, fontFamily: T.mono }}
            >
              <option value="">Choose a transaction...</option>
              {allTxSorted.map((tx, i) => (
                <option key={i} value={`${tx.date}|${tx.psf}|${tx.area}|${tx.floorRange || ''}`}>
                  {tx.date} · {tx.floorRange || '—'} · {tx.area.toLocaleString()}sf · ${tx.psf.toLocaleString()} PSF
                </option>
              ))}
            </select>
            {selectedTx && <button onClick={() => setSelectedTx(null)} style={{ background: 'none', border: 'none', color: T.textMute, cursor: 'pointer', fontSize: 16, padding: '2px 6px', lineHeight: 1 }}>✕</button>}
          </div>
        </div>

        {/* Adjusted estimate from selected tx */}
        {selectedTx && selectedTxAdj && (() => {
          const adj = selectedTxAdj;
          const origPrice = selectedTx.psf * pArea;
          const adjPrice = adj.adjPsf * pArea;
          const diff = adj.adjPsf - selectedTx.psf;
          const diffPct = selectedTx.psf > 0 ? ((adj.adjPsf / selectedTx.psf - 1) * 100) : 0;
          const isUp = diff > 0;
          return <div style={{ marginTop: 12, background: 'linear-gradient(135deg, #a78bfa10, #06b6d410)', borderRadius: T.r, padding: '16px 18px', border: '1px solid #a78bfa20' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
              <div>
                <div style={{ color: T.textMute, fontSize: T.xs, fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>ORIGINAL ({selectedTx.date})</div>
                <div style={{ color: T.textSub, fontSize: T.xl, fontWeight: 700, fontFamily: T.mono }}>${selectedTx.psf.toLocaleString()} <span style={{ fontSize: T.sm, fontWeight: 400 }}>PSF</span></div>
                <div style={{ color: T.textMute, fontSize: T.sm, fontFamily: T.mono }}>${origPrice.toLocaleString()}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, color: adj.rate !== null ? T.purple : T.amber }}>→</div>
                {adj.months > 0 && <div style={{ color: adj.rate !== null ? T.purple : T.amber, fontSize: T.xs, fontWeight: 600, marginTop: 2 }}>{adj.months} months</div>}
                {adj.rate !== null && <div style={{ color: T.textMute, fontSize: T.xs }}>{adj.rate > 0 ? '+' : ''}{Number(adj.rate).toFixed(1)}% CAGR</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: T.textMute, fontSize: T.xs, fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>TODAY&apos;S ESTIMATE</div>
                <div style={{ color: adj.months > 0 ? T.purple : T.textSub, fontSize: 24, fontWeight: 800, fontFamily: T.mono }}>${adj.adjPsf.toLocaleString()} <span style={{ fontSize: T.sm, fontWeight: 400 }}>PSF</span></div>
                <div style={{ color: adj.months > 0 ? T.purple : T.textMute, fontSize: T.base, fontFamily: T.mono, fontWeight: 700 }}>${adjPrice.toLocaleString()}</div>
                {adj.months > 0 && diff !== 0 && <div style={{ color: isUp ? T.green : T.red, fontSize: T.sm, fontWeight: 600, marginTop: 2 }}>
                  {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{diff.toLocaleString()} PSF ({diffPct >= 0 ? '+' : ''}{diffPct.toFixed(1)}%)
                </div>}
              </div>
            </div>
          </div>;
        })()}
      </div>

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 1fr', gap: 8, marginBottom: 6, padding: '0 4px' }}>
        <div />
        <div style={{ color: T.purple, fontSize: T.sm, fontWeight: 700, textAlign: 'center' }}>📌 Last 3 Months</div>
        <div style={{ color: T.teal, fontSize: T.sm, fontWeight: 700, textAlign: 'center' }}>📅 Last 6 Months</div>
        <div style={{ color: T.blue, fontSize: T.sm, fontWeight: 700, textAlign: 'center' }}>📊 Last 12 Months</div>
      </div>

      {/* Tier rows */}
      {tiers.map(t => {
        const hasAny = t.m3.psf > 0 || t.m6.psf > 0 || t.m12.psf > 0;
        if (!hasAny) return null;
        const expKey = expandedTier?.startsWith(t.id + '-') ? expandedTier : null;
        const expandTxs = expKey === t.id + '-3m' ? t.m3.txs : expKey === t.id + '-6m' ? t.m6.txs : expKey === t.id + '-12m' ? t.m12.txs : null;
        const expandLabel = expKey?.endsWith('3m') ? '3M' : expKey?.endsWith('6m') ? '6M' : '12M';
        return <div key={t.id} style={{ marginBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 1fr', gap: 8, alignItems: 'stretch' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0' }}>
              <span style={{ fontSize: 14 }}>{t.ic}</span>
              <div>
                <div style={{ color: T.text, fontSize: T.md, fontWeight: 700 }}>{t.label}</div>
                <div style={{ color: T.textMute, fontSize: T.xs }}>{t.desc}</div>
              </div>
            </div>
            <TierCell data={t.m3} color="#a78bfa" bgColor="#a78bfa08" tierId={t.id} periodKey="3m" />
            <TierCell data={t.m6} color="#14b8a6" bgColor="#14b8a608" tierId={t.id} periodKey="6m" />
            <TierCell data={t.m12} color="#3b82f6" bgColor="#3b82f608" tierId={t.id} periodKey="12m" />
          </div>
          {expandTxs?.length > 0 && <div style={{ background: T.borderLt, border: `1px solid ${T.border}`, borderTop: 'none', borderRadius: `0 0 ${T.rLg}px ${T.rLg}px`, padding: '12px 14px', maxHeight: 280, overflowY: 'auto', marginTop: -1 }}>
            <div style={{ color: T.textSub, fontSize: T.sm, fontWeight: 600, marginBottom: 8 }}>{t.label} — {expandLabel} — {expandTxs.length} transactions</div>
            <table style={{ margin: 0 }}>
              <thead><tr>
                {['', 'Date', 'Floor', 'Area', 'Price', 'PSF', 'Type'].map(h => <th key={h} style={{ fontSize: T.sm, padding: '5px 8px' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {expandTxs.slice(0, 30).map((tx, i) => {
                  const isSel = selectedTx && selectedTx.date === tx.date && selectedTx.psf === tx.psf && selectedTx.area === tx.area;
                  return <tr key={i} onClick={() => setSelectedTx(isSel ? null : tx)}
                    style={{ cursor: 'pointer', background: isSel ? '#a78bfa14' : undefined, transition: 'background 0.12s' }}>
                    <td style={{ width: 20, textAlign: 'center', fontSize: T.sm, color: isSel ? T.purple : T.textFaint }}>{isSel ? '◉' : '○'}</td>
                    <td style={{ color: T.textMute, fontSize: T.md, whiteSpace: 'nowrap' }}>{tx.date}</td>
                    <td style={{ fontFamily: T.mono, fontSize: T.md }}>{tx.floorRange || '—'}</td>
                    <td style={{ fontFamily: T.mono, fontSize: T.md }}>{tx.area.toLocaleString()} sf</td>
                    <td style={{ color: T.blue, fontFamily: T.mono, fontWeight: 600, fontSize: T.md }}>${tx.price.toLocaleString()}</td>
                    <td style={{ color: tx.psf >= p.avgPsf * 1.05 ? T.green : tx.psf <= p.avgPsf * 0.95 ? T.orange : T.textSub, fontFamily: T.mono, fontWeight: 600, fontSize: T.md }}>${tx.psf.toLocaleString()}</td>
                    <td style={{ color: T.textMute, fontSize: T.sm }}>{tx.saleType || '—'}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>}
        </div>;
      })}
    </Card>
  </>;
}
