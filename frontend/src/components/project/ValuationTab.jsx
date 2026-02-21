import { useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { T, computeBucketCAGR, DEFAULT_YIELD } from '../../constants';
import { Card, SectionHeader, NoteText } from '../ui';
import { useProjectFilters } from './useProjectFilters';

export default function ValuationTab({ projInfo, projData, masterFilters = {} }) {
  const p = projInfo;
  const { filteredTxs, filteredFloorData, hasFilters } = useProjectFilters(projData, masterFilters);

  // ── Price Estimator state ──
  const [expandedTier, setExpandedTier] = useState(null);
  const [selectedTx, setSelectedTx] = useState(null); // Reference transaction for CAGR adjustment
  const [estArea, setEstArea] = useState(() => {
    const sizes = projData?.projSizes || [];
    return sizes.length > 0 ? sizes[Math.floor(sizes.length / 2)] : 0;
  });
  const [estFloor, setEstFloor] = useState('');

  // ── Derived data ──
  const projSizes = projData?.projSizes || [];
  const projFloorRanges = projData?.floorRanges || [];
  const pArea = estArea || (projSizes.length > 0 ? projSizes[Math.floor(projSizes.length / 2)] : 0);
  const pFloor = estFloor;

  // ── Time windows: 3M, 6M, 12M (rolling from today, matching backend formula) ──
  const txWindows = useMemo(() => {
    if (!filteredTxs.length) return { m3: [], m6: [], m12: [] };
    const now = new Date();
    // Rolling window: include current month + (months-1) prior months
    const cutoff = (months) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    return {
      m3: filteredTxs.filter(t => t.date >= cutoff(3)),
      m6: filteredTxs.filter(t => t.date >= cutoff(6)),
      m12: filteredTxs.filter(t => t.date >= cutoff(12)),
    };
  }, [filteredTxs]);

  const calcTier = (txs) => {
    if (!txs.length) return { psf: 0, cnt: 0, txs: [] };
    const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
    const avgP = Math.round(txs.reduce((s, t) => s + t.psf, 0) / txs.length);
    return { psf: avgP, cnt: txs.length, txs: sorted };
  };

  // Each tier: { m3: {...}, m12: {...} }
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

  // ── Project CAGR for time adjustment ──
  const projCagr = useMemo(() => {
    const r = computeBucketCAGR(filteredTxs);
    return r.cagr;  // null if insufficient data, 0 if flat market
  }, [filteredTxs]);

  // Time-adjust a PSF value from a transaction date to today using pro-rated CAGR
  const timeAdjust = useCallback((psf, txDate) => {
    if (!psf || !txDate) return { adjPsf: psf, months: 0, rate: null };
    const now = new Date();
    const [y, m] = txDate.split('-').map(Number);
    const txTime = new Date(y, (m || 1) - 1, 15);
    const months = Math.max(0, (now.getFullYear() - txTime.getFullYear()) * 12 + now.getMonth() - txTime.getMonth());
    if (projCagr === null || projCagr === undefined) return { adjPsf: psf, months, rate: null };
    if (months < 1) return { adjPsf: psf, months: 0, rate: projCagr };
    const adjPsf = Math.round(psf * Math.pow(1 + projCagr / 100, months / 12));
    return { adjPsf, months, rate: projCagr };
  }, [projCagr]);

  // Get median date from a sorted (desc) tx list
  const medianDate = (txs) => txs?.length ? txs[Math.floor(txs.length / 2)]?.date : null;

  // Best estimate: prefer highest specificity tier with most recent data (3M → 6M → 12M)
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

  // ── Selected reference transaction → time-adjusted to today ──
  const selectedTxAdj = useMemo(() => {
    if (!selectedTx) return null;
    const adj = timeAdjust(selectedTx.psf, selectedTx.date);
    return { ...adj, tx: selectedTx };
  }, [selectedTx, timeAdjust]);

  // All project transactions for the dropdown picker (sorted newest first)
  const allTxSorted = useMemo(() => {
    return [...(projData?.txs || [])].sort((a, b) => b.date.localeCompare(a.date));
  }, [projData]);

  // ── Valuation Model (CMA-based, SRX-style) ──
  const valuationModel = useMemo(() => {
    const txs = hasFilters ? filteredTxs : (projData?.txs || []);
    if (txs.length < 3) return null;
    const floorData = filteredFloorData.floors;
    const now = new Date();
    const targetSize = pArea;
    const targetFloorMid = pFloor ? (() => { const [lo, hi] = pFloor.split('-').map(Number); return (lo + hi) / 2; })() : null;

    // Score and adjust each transaction
    const scored = txs.map(tx => {
      // ── Recency weight: exponential decay (half-life ~25 months) ──
      const [y, m] = tx.date.split('-').map(Number);
      const txTime = new Date(y, (m || 1) - 1, 15);
      const monthsAgo = Math.max(0, (now.getFullYear() - txTime.getFullYear()) * 12 + now.getMonth() - txTime.getMonth());
      const recencyW = Math.exp(-0.5 * monthsAgo / 18);

      // ── Size similarity weight: Gaussian, σ = 150 sqft ──
      const sizeDiff = Math.abs(tx.area - targetSize);
      const sizeW = Math.exp(-0.5 * Math.pow(sizeDiff / 150, 2));

      // ── Floor similarity weight: Gaussian, σ = 8 floors ──
      let floorW = 0.5; // default if no floor selected
      if (targetFloorMid && tx.floorMid) {
        const floorDiff = Math.abs(tx.floorMid - targetFloorMid);
        floorW = Math.exp(-0.5 * Math.pow(floorDiff / 8, 2));
      }

      const weight = recencyW * sizeW * floorW;

      // ── Adjustments ──
      let adjPsf = tx.psf;

      // Time adjustment: bring PSF forward to today using CAGR
      if (monthsAgo > 0 && projCagr) {
        adjPsf = adjPsf * Math.pow(1 + projCagr / 100, monthsAgo / 12);
      }

      // Floor adjustment: if user selected a floor, adjust PSF by floor premium differential
      if (targetFloorMid && tx.floorMid && floorData.length > 1) {
        const findPremium = (mid) => {
          const band = floorData.find(f => { const [lo, hi] = f.range.split('-').map(Number); return mid >= lo && mid <= hi; });
          return band ? band.premium : 0;
        };
        const txPrem = findPremium(tx.floorMid);
        const targetPrem = findPremium(targetFloorMid);
        const premDiff = (targetPrem - txPrem) / 100;
        adjPsf = adjPsf * (1 + premDiff);
      }

      return { ...tx, adjPsf: Math.round(adjPsf), weight, monthsAgo, sizeDiff, recencyW, sizeW, floorW };
    });

    // Weighted average
    const totalW = scored.reduce((s, t) => s + t.weight, 0);
    if (totalW === 0) return null;
    const wAvgPsf = Math.round(scored.reduce((s, t) => s + t.adjPsf * t.weight, 0) / totalW);

    // Weighted standard deviation for confidence range
    const variance = scored.reduce((s, t) => s + t.weight * Math.pow(t.adjPsf - wAvgPsf, 2), 0) / totalW;
    const stdDev = Math.round(Math.sqrt(variance));
    const lowPsf = wAvgPsf - stdDev;
    const highPsf = wAvgPsf + stdDev;

    // Top 5 comparables by weight
    const topComps = [...scored].sort((a, b) => b.weight - a.weight).slice(0, 5);

    // Confidence score (0-100): based on number of recent comparables, size matches, and floor matches
    const recent6mo = scored.filter(t => t.monthsAgo <= 6).length;
    const recent12mo = scored.filter(t => t.monthsAgo <= 12).length;
    const sizeMatches = scored.filter(t => t.sizeDiff < 50).length;
    const floorMatches = targetFloorMid ? scored.filter(t => t.floorMid && Math.abs(t.floorMid - targetFloorMid) <= 4).length : null;
    const conf = Math.min(100, Math.round(
      targetFloorMid
        ? (Math.min(recent12mo, 10) / 10) * 30 +
          (Math.min(sizeMatches, 5) / 5) * 25 +
          (Math.min(floorMatches, 5) / 5) * 20 +
          (Math.min(scored.length, 20) / 20) * 25
        : (Math.min(recent12mo, 10) / 10) * 40 +
          (Math.min(sizeMatches, 5) / 5) * 30 +
          (Math.min(scored.length, 20) / 20) * 30
    ));

    return { wAvgPsf, lowPsf, highPsf, stdDev, topComps, totalTx: scored.length, recent6mo, recent12mo, sizeMatches, floorMatches, conf, cagr: projCagr };
  }, [projData, pArea, pFloor, projCagr, filteredTxs, filteredFloorData, hasFilters]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>

      {/* ── Price Estimator ── */}
      <SectionHeader icon="🧮" title="Price Estimator" sub="Average PSF by tier. 3M = market pulse, 6M = recent trend, 12M = fair value benchmark." />
      <Card>
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

        {/* Best Estimate banner */}
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

        {/* ── Reference Transaction Picker ── */}
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
                  const [date, psf, area, floorRange] = e.target.value.split('|');
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
          <div style={{ color: T.textMute, fontSize: T.xs, marginTop: 4 }}>Or click ○ on any row in the expanded tables below to select it</div>

          {/* ── Adjusted Estimate from Selected Transaction ── */}
          {selectedTx && selectedTxAdj && (() => {
            const adj = selectedTxAdj;
            const origPrice = selectedTx.psf * pArea;
            const adjPrice = adj.adjPsf * pArea;
            const diff = adj.adjPsf - selectedTx.psf;
            const diffPct = selectedTx.psf > 0 ? ((adj.adjPsf / selectedTx.psf - 1) * 100) : 0;
            const isUp = diff > 0;
            return <div style={{ marginTop: 12, background: 'linear-gradient(135deg, #a78bfa10, #06b6d410)', borderRadius: T.r, padding: '16px 18px', border: '1px solid #a78bfa20' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
                {/* Original */}
                <div>
                  <div style={{ color: T.textMute, fontSize: T.xs, fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>ORIGINAL ({selectedTx.date})</div>
                  <div style={{ color: T.textSub, fontSize: T.xl, fontWeight: 700, fontFamily: T.mono }}>${selectedTx.psf.toLocaleString()} <span style={{ fontSize: T.sm, fontWeight: 400 }}>PSF</span></div>
                  <div style={{ color: T.textMute, fontSize: T.sm, fontFamily: T.mono }}>${origPrice.toLocaleString()}</div>
                  <div style={{ color: T.textMute, fontSize: T.xs, marginTop: 2 }}>
                    {selectedTx.floorRange ? `Floor ${selectedTx.floorRange}` : '—'} · {selectedTx.area.toLocaleString()} sf · {selectedTx.saleType || '—'}
                  </div>
                </div>
                {/* Arrow */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, color: adj.rate !== null ? T.purple : T.amber }}>→</div>
                  {adj.months > 0 && <div style={{ color: adj.rate !== null ? T.purple : T.amber, fontSize: T.xs, fontWeight: 600, marginTop: 2 }}>{adj.months} months</div>}
                  {adj.rate !== null && <div style={{ color: T.textMute, fontSize: T.xs }}>{adj.rate > 0 ? '+' : ''}{Number(adj.rate).toFixed(1)}% CAGR</div>}
                  {adj.rate === null && adj.months > 0 && <div style={{ color: T.amber, fontSize: T.xs }}>No CAGR</div>}
                </div>
                {/* Adjusted */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: T.textMute, fontSize: T.xs, fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>TODAY&apos;S ESTIMATE</div>
                  <div style={{ color: adj.months > 0 ? T.purple : T.textSub, fontSize: 24, fontWeight: 800, fontFamily: T.mono }}>${adj.adjPsf.toLocaleString()} <span style={{ fontSize: T.sm, fontWeight: 400 }}>PSF</span></div>
                  <div style={{ color: adj.months > 0 ? T.purple : T.textMute, fontSize: T.base, fontFamily: T.mono, fontWeight: 700 }}>${adjPrice.toLocaleString()}</div>
                  {adj.months > 0 && diff !== 0 && <div style={{ color: isUp ? T.green : T.red, fontSize: T.sm, fontWeight: 600, marginTop: 2 }}>
                    {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{diff.toLocaleString()} PSF ({diffPct >= 0 ? '+' : ''}{diffPct.toFixed(1)}%)
                  </div>}
                  {adj.months === 0 && <div style={{ color: T.textMute, fontSize: T.xs, marginTop: 2 }}>Transaction is current — no adjustment needed</div>}
                  {adj.months > 0 && adj.rate === null && <div style={{ color: T.amber, fontSize: T.xs, marginTop: 2 }}>⚠️ Insufficient data to compute CAGR</div>}
                </div>
              </div>
              {adj.rate !== null && <div style={{ marginTop: 10, padding: '8px 12px', background: '#a78bfa08', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12 }}>💡</span>
                <span style={{ color: T.textSub, fontSize: T.sm }}>
                  This projects the <strong>${selectedTx.psf.toLocaleString()}</strong> PSF recorded in {selectedTx.date} forward to today
                  using the project&apos;s {Number(adj.rate).toFixed(1)}% annual CAGR, assuming consistent growth.
                  {pArea !== selectedTx.area && <> Price uses your selected size of <strong>{pArea.toLocaleString()} sqft</strong> (original tx was {selectedTx.area.toLocaleString()} sqft).</>}
                </span>
              </div>}
              {adj.rate === null && adj.months > 0 && <div style={{ marginTop: 10, padding: '8px 12px', background: '#f59e0b08', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12 }}>⚠️</span>
                <span style={{ color: T.amber, fontSize: T.sm }}>
                  This project doesn&apos;t have enough transaction history across multiple years to compute a reliable CAGR.
                  The original PSF of <strong>${selectedTx.psf.toLocaleString()}</strong> is shown unadjusted.
                </span>
              </div>}
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
          const m3 = t.m3, m6 = t.m6, m12 = t.m12;
          const hasAny = m3.psf > 0 || m6.psf > 0 || m12.psf > 0;
          if (!hasAny) return null;
          const exp3m = expandedTier === t.id + '-3m';
          const exp6m = expandedTier === t.id + '-6m';
          const exp12m = expandedTier === t.id + '-12m';
          const expandTxs = exp3m ? m3.txs : exp6m ? m6.txs : exp12m ? m12.txs : null;
          const expandLabel = exp3m ? '3M' : exp6m ? '6M' : '12M';
          return <div key={t.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 1fr', gap: 8, alignItems: 'stretch' }}>
              {/* Tier label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0' }}>
                <span style={{ fontSize: 14 }}>{t.ic}</span>
                <div>
                  <div style={{ color: T.text, fontSize: T.md, fontWeight: 700 }}>{t.label}</div>
                  <div style={{ color: T.textMute, fontSize: T.xs }}>{t.desc}</div>
                </div>
              </div>
              {/* 3M cell */}
              {m3.psf > 0 ? <div onClick={() => setExpandedTier(exp3m ? null : t.id + '-3m')}
                style={{ background: '#a78bfa08', border: '1px solid #a78bfa26', borderRadius: T.r, padding: '10px 12px', cursor: 'pointer', transition: 'all 0.15s' }}>
                <div style={{ color: T.text, fontSize: 18, fontWeight: 800, fontFamily: T.mono }}>${(m3.psf * pArea).toLocaleString()}</div>
                <div style={{ color: T.textSub, fontSize: T.sm }}>${m3.psf.toLocaleString()} PSF · {m3.cnt} tx</div>
              </div> : <div style={{ background: T.borderLt, borderRadius: T.r, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: T.textMute, fontSize: T.sm }}>No data</span>
              </div>}
              {/* 6M cell */}
              {m6.psf > 0 ? <div onClick={() => setExpandedTier(exp6m ? null : t.id + '-6m')}
                style={{ background: '#14b8a608', border: '1px solid #14b8a626', borderRadius: T.r, padding: '10px 12px', cursor: 'pointer', transition: 'all 0.15s' }}>
                <div style={{ color: T.text, fontSize: 18, fontWeight: 800, fontFamily: T.mono }}>${(m6.psf * pArea).toLocaleString()}</div>
                <div style={{ color: T.textSub, fontSize: T.sm }}>${m6.psf.toLocaleString()} PSF · {m6.cnt} tx</div>
              </div> : <div style={{ background: T.borderLt, borderRadius: T.r, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: T.textMute, fontSize: T.sm }}>No data</span>
              </div>}
              {/* 12M cell */}
              {m12.psf > 0 ? <div onClick={() => setExpandedTier(exp12m ? null : t.id + '-12m')}
                style={{ background: '#3b82f608', border: '1px solid #3b82f626', borderRadius: T.r, padding: '10px 12px', cursor: 'pointer', transition: 'all 0.15s' }}>
                <div style={{ color: T.text, fontSize: 18, fontWeight: 800, fontFamily: T.mono }}>${(m12.psf * pArea).toLocaleString()}</div>
                <div style={{ color: T.textSub, fontSize: T.sm }}>${m12.psf.toLocaleString()} PSF · {m12.cnt} tx</div>
              </div> : <div style={{ background: T.borderLt, borderRadius: T.r, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: T.textMute, fontSize: T.sm }}>No data</span>
              </div>}
            </div>
            {/* Expanded tx table */}
            {(exp3m || exp6m || exp12m) && expandTxs?.length > 0 && <div style={{ background: T.borderLt, border: `1px solid ${T.border}`, borderTop: 'none', borderRadius: `0 0 ${T.rLg}px ${T.rLg}px`, padding: '12px 14px', maxHeight: 280, overflowY: 'auto', marginTop: -1 }}>
              <div style={{ color: T.textSub, fontSize: T.sm, fontWeight: 600, marginBottom: 8 }}>{t.label} — {expandLabel} — {expandTxs.length} transactions</div>
              <table style={{ margin: 0 }}>
                <thead><tr>
                  {['', 'Date', 'Floor', 'Area', 'Price', 'PSF', 'Type'].map(h => <th key={h} style={{ fontSize: T.sm, padding: '5px 8px' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {expandTxs.slice(0, 30).map((tx, i) => {
                    const isSel = selectedTx && selectedTx.date === tx.date && selectedTx.psf === tx.psf && selectedTx.area === tx.area;
                    return <tr key={i} onClick={() => setSelectedTx(isSel ? null : tx)}
                      style={{ cursor: 'pointer', background: isSel ? '#a78bfa14' : undefined, transition: 'background 0.12s' }}
                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#f8fafc'; }}
                      onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = ''; }}>
                      <td style={{ width: 20, textAlign: 'center', fontSize: T.sm, color: isSel ? T.purple : T.textFaint }}>{isSel ? '◉' : '○'}</td>
                      <td style={{ color: T.textMute, fontSize: T.md, whiteSpace: 'nowrap' }}>{tx.date}</td>
                      <td style={{ fontFamily: T.mono, fontSize: T.md }}>{tx.floorRange || '—'}</td>
                      <td style={{ fontFamily: T.mono, fontSize: T.md }}>{tx.area.toLocaleString()} sf</td>
                      <td style={{ color: T.blue, fontFamily: T.mono, fontWeight: 600, fontSize: T.md }}>${tx.price.toLocaleString()}</td>
                      <td style={{ color: tx.psf >= p.avgPsf * 1.05 ? T.green : tx.psf <= p.avgPsf * 0.95 ? T.orange : T.textSub, fontFamily: T.mono, fontWeight: 600, fontSize: T.md }}>${tx.psf.toLocaleString()}</td>
                      <td style={{ color: T.textMute, fontSize: T.sm }}>{tx.saleType || '—'}</td>
                    </tr>;
                  })}
                  {expandTxs.length > 30 && <tr><td colSpan={7} style={{ color: T.textMute, fontSize: T.sm, textAlign: 'center', padding: 8 }}>Showing 30 of {expandTxs.length}</td></tr>}
                </tbody>
              </table>
            </div>}
          </div>;
        })}
      </Card>

      {/* ── VALUATION MODEL ── */}
      {valuationModel && <><SectionHeader icon="🔍" title="Valuation Model" sub={`Comparable Market Analysis — ${valuationModel.totalTx} transactions scored by recency, size & floor similarity${projCagr != null ? `, time-adjusted at ${projCagr > 0 ? '+' : ''}${Number(projCagr).toFixed(1)}% CAGR` : ''}.`} />
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) 1fr', gap: 12, marginBottom: 16 }}>
          {/* Estimated Value */}
          <div style={{ background: 'linear-gradient(135deg,#06b6d418,#8b5cf618)', borderRadius: T.rLg, padding: '18px 16px', border: '1px solid #06b6d426' }}>
            <div style={{ color: T.textMute, fontSize: T.sm, fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>ESTIMATED VALUE</div>
            <div style={{ color: T.text, fontSize: 32, fontWeight: 800, fontFamily: T.mono, lineHeight: 1 }}>${(valuationModel.wAvgPsf * pArea).toLocaleString()}</div>
            <div style={{ color: T.textSub, fontSize: T.base, marginTop: 6 }}>${valuationModel.wAvgPsf.toLocaleString()} PSF × {pArea.toLocaleString()} sqft{pFloor ? ` · Floor ${pFloor}` : ''}</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
              <div style={{ color: T.textMute, fontSize: T.sm }}>
                <span style={{ color: T.textSub, fontWeight: 600 }}>Range: </span>
                <span style={{ fontFamily: T.mono }}>${valuationModel.lowPsf.toLocaleString()} — ${valuationModel.highPsf.toLocaleString()} PSF</span>
              </div>
              <div style={{ color: T.textMute, fontSize: T.sm }}>
                <span style={{ color: T.textSub, fontWeight: 600 }}>±</span>
                <span style={{ fontFamily: T.mono }}> ${(valuationModel.stdDev * pArea).toLocaleString()}</span>
              </div>
            </div>
          </div>
          {/* Confidence */}
          <div style={{ background: T.borderLt, borderRadius: T.rLg, padding: '18px 16px', border: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ color: T.textMute, fontSize: T.sm, fontWeight: 600, marginBottom: 8 }}>CONFIDENCE</div>
            <div style={{ fontSize: 40, fontWeight: 800, fontFamily: T.mono, color: valuationModel.conf >= 70 ? T.green : valuationModel.conf >= 40 ? T.amber : T.red }}>{valuationModel.conf}</div>
            <div style={{ color: T.textMute, fontSize: T.sm, marginTop: 4 }}>/ 100</div>
            <div style={{ width: '80%', height: 6, background: T.border, borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
              <div style={{ width: `${valuationModel.conf}%`, height: '100%', background: valuationModel.conf >= 70 ? T.green : valuationModel.conf >= 40 ? T.amber : T.red, borderRadius: 3, transition: 'width 0.3s' }} />
            </div>
          </div>
        </div>

        {/* Model Inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${valuationModel.floorMatches != null ? 5 : 4}, 1fr)`, gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Total Comparables', val: valuationModel.totalTx, ic: '📊' },
            { label: 'Last 6 Months', val: valuationModel.recent6mo, ic: '📅' },
            { label: 'Last 12 Months', val: valuationModel.recent12mo, ic: '🗓️' },
            { label: 'Size Matches', val: `${valuationModel.sizeMatches} (±50sf)`, ic: '📐' },
            ...(valuationModel.floorMatches != null ? [{ label: 'Floor Matches', val: `${valuationModel.floorMatches} (±4fl)`, ic: '🏢' }] : []),
          ].map(s => <div key={s.label} style={{ background: T.borderLt, borderRadius: T.r, padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, marginBottom: 4 }}>{s.ic}</div>
            <div style={{ color: T.text, fontFamily: T.mono, fontWeight: 700, fontSize: T.lg }}>{s.val}</div>
            <div style={{ color: T.textMute, fontSize: T.xs }}>{s.label}</div>
          </div>)}
        </div>

        {/* Top Comparables */}
        <div style={{ color: T.textSub, fontSize: T.sm, fontWeight: 600, marginBottom: 8 }}>TOP COMPARABLES — highest similarity score</div>
        <table style={{ margin: 0 }}>
          <thead><tr>
            {['Sim', 'Date', 'Floor', 'Area', 'Raw PSF', 'Adj PSF', 'Price', 'Type'].map(h => <th key={h} style={{ fontSize: T.sm, padding: '5px 8px' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {valuationModel.topComps.map((tx, i) => <tr key={i}>
              <td style={{ fontFamily: T.mono, fontSize: T.md }}>
                <div style={{ width: 36, height: 18, background: T.border, borderRadius: 9, overflow: 'hidden', display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }}>
                  <div style={{ width: `${Math.round(tx.weight / valuationModel.topComps[0].weight * 100)}%`, height: '100%', background: T.blue, borderRadius: 9 }} />
                </div>
                <span style={{ color: T.textSub }}>{(tx.weight / valuationModel.topComps[0].weight * 100).toFixed(0)}</span>
              </td>
              <td style={{ color: T.textMute, fontSize: T.md, whiteSpace: 'nowrap' }}>{tx.date}</td>
              <td style={{ fontFamily: T.mono, fontSize: T.md }}>{tx.floorRange || '—'}</td>
              <td style={{ fontFamily: T.mono, fontSize: T.md }}>{tx.area.toLocaleString()} sf</td>
              <td style={{ color: T.textMute, fontFamily: T.mono, fontSize: T.md }}>${tx.psf.toLocaleString()}</td>
              <td style={{ color: T.blue, fontFamily: T.mono, fontWeight: 600, fontSize: T.md }}>${tx.adjPsf.toLocaleString()}</td>
              <td style={{ fontFamily: T.mono, fontSize: T.md }}>${tx.price.toLocaleString()}</td>
              <td style={{ color: T.textMute, fontSize: T.sm }}>{tx.saleType || '—'}</td>
            </tr>)}
          </tbody>
        </table>
        <NoteText>Model uses weighted Comparable Market Analysis. Each transaction scored by: recency (exponential decay, ~25mo half-life), size similarity (±150sf Gaussian), floor proximity (±8 floors Gaussian).{projCagr != null ? ` PSF adjusted forward to today using ${projCagr > 0 ? '+' : ''}${Number(projCagr).toFixed(1)}% project CAGR` : ''}{pFloor ? ' and floor premium differential' : ''}. Confidence based on recent comparable volume and size match density.</NoteText>
      </Card></>}

    </div>
  );
}

ValuationTab.propTypes = {
  projInfo: PropTypes.shape({
    avgPsf: PropTypes.number.isRequired,
    yield: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    rentPsf: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }).isRequired,
  masterFilters: PropTypes.object,
  projData: PropTypes.object,
};
