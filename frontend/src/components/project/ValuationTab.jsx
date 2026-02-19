import { useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Line, Cell, Legend, ComposedChart,
} from 'recharts';
import { T, computeBucketCAGR, cagrColor, yieldColor, DEFAULT_YIELD, pctChgColor, totalPctColor } from '../../constants';
import { Card, SectionHeader, NoteText } from '../ui';

export default function ValuationTab({ projInfo, projData }) {
  const p = projInfo;

  // ── Price Estimator state ──
  const [expandedTier, setExpandedTier] = useState(null);
  const [selectedTx, setSelectedTx] = useState(null); // Reference transaction for CAGR adjustment
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

  // ── Time windows: 3M, 6M, 12M (rolling from today, matching backend formula) ──
  const txWindows = useMemo(() => {
    if (!projData?.txs?.length) return { m3: [], m6: [], m12: [] };
    const now = new Date();
    // Rolling window: include current month + (months-1) prior months
    const cutoff = (months) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    return {
      m3: projData.txs.filter(t => t.date >= cutoff(3)),
      m6: projData.txs.filter(t => t.date >= cutoff(6)),
      m12: projData.txs.filter(t => t.date >= cutoff(12)),
    };
  }, [projData]);

  const calcTier = (txs) => {
    if (!txs.length) return { psf: 0, cnt: 0, txs: [] };
    const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
    const avgP = Math.round(txs.reduce((s, t) => s + t.psf, 0) / txs.length);
    return { psf: avgP, cnt: txs.length, txs: sorted };
  };

  // Each tier: { m3: {...}, m12: {...} }
  const nearSize = projSizes.length > 0 ? projSizes.reduce((prev, c) => Math.abs(c - pArea) < Math.abs(prev - pArea) ? c : prev, projSizes[0]) : pArea;
  const sizeFilter = (txs) => txs.filter(t => Math.abs(t.area - nearSize) < 50);
  const floorFilter = (txs) => {
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
        m3: calcTier(floorFilter(txWindows.m3)), m6: calcTier(floorFilter(txWindows.m6)), m12: calcTier(floorFilter(txWindows.m12)) });
    }
    if (pFloor && nearSize) {
      t.push({ id: 4, label: 'EXACT MATCH', desc: `${nearSize.toLocaleString()} sqft · Floor ${pFloor}`, ic: '🎯', c: T.green,
        m3: calcTier(exactFilter(txWindows.m3)), m6: calcTier(exactFilter(txWindows.m6)), m12: calcTier(exactFilter(txWindows.m12)) });
    }
    return t;
  }, [txWindows, nearSize, pFloor]);

  // ── Project CAGR for time adjustment ──
  const projCagr = useMemo(() => {
    const r = computeBucketCAGR(projData?.rawTx || []);
    return r.cagr;  // null if insufficient data, 0 if flat market
  }, [projData]);

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
    const txs = projData?.txs || [];
    if (txs.length < 3) return null;
    const floorData = projData?.projFloor || [];
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
  }, [projData, pArea, pFloor, projCagr]);

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
      {/* ── Price Estimator ── */}
      <SectionHeader icon="🧮" title="Price Estimator" sub="Average PSF by tier. 3M = market pulse, 6M = recent trend, 12M = fair value benchmark." />
      <Card>
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: T.text, fontSize: T.xl, fontWeight: 600, marginBottom: 6 }}>🏷️ Price Estimator</div>
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
              return { label: `${s.toLocaleString()} sqft`, sub: `${filtered.length} transactions`, icon: '📐', ...r, yield: parseFloat(p.yield) || DEFAULT_YIELD };
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
                const firstIdx = vals.findIndex(v => v > 0);
                const lastIdx = vals.reduce((acc, v, i) => v > 0 ? i : acc, -1);
                const firstV = firstIdx >= 0 ? vals[firstIdx] : 0;
                const lastV = lastIdx >= 0 ? vals[lastIdx] : 0;
                const totalPct = firstV > 0 && lastV > 0 ? Math.round((lastV / firstV - 1) * 100) : 0;
                const absChg = lastV - firstV;
                const gapYears = firstIdx >= 0 && lastIdx > firstIdx ? lastIdx - firstIdx : 0;
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

      {/* ── Floor Premium ── */}
      <SectionHeader icon="🏗️" title="Floor Premium Analysis" sub={`Average PSF by floor band (${projData?.floorPeriod === '12M' ? 'last 12 months' : 'all time — limited recent data'}).`} />
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
        {projData?.baselineSource === 'project_avg' && <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, color: T.textMute, fontSize: T.sm }}><span>ℹ️</span><span>Premiums shown vs project average (insufficient low-floor data for standard baseline)</span></div>}
      </Card>
      <NoteText>Higher floors command a premium — the gap reflects unobstructed views and reduced noise.{projData?.floorPeriod === 'all' ? ' Data uses all-time transactions due to limited recent sales.' : ''}</NoteText>
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
    projSizes: PropTypes.array,
    floorRanges: PropTypes.array,
    floorPeriod: PropTypes.string,
    thinBands: PropTypes.array,
    baselineSource: PropTypes.string,
    rawTx: PropTypes.array,
    txs: PropTypes.array,
    hmYears: PropTypes.array,
    hmFloors: PropTypes.array,
    hmMatrix: PropTypes.object,
  }),
};
