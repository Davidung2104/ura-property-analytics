import { useState, useMemo, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { T, computeBucketCAGR } from '../../constants';
import { Card, SectionHeader } from '../ui';

// ── Helpers ──
const fmtPsf = v => `$${(v || 0).toLocaleString()}`;
const fmtPrice = v => {
  if (!v && v !== 0) return '$0';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  return abs >= 1e6 ? `${sign}$${(abs / 1e6).toFixed(2)}M` : `$${v.toLocaleString()}`;
};
const fmtDate = d => d || '—';
const uid = () => `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function ClientReport({ projInfo, projData, clientReports, setClientReports }) {
  const p = projInfo;
  const txs = projData?.txs || [];
  const floorRanges = projData?.floorRanges || [];
  const projSizes = projData?.projSizes || [];

  // ── Report builder state ──
  const [clientName, setClientName] = useState('');
  const [unitArea, setUnitArea] = useState(() => projSizes.length > 0 ? projSizes[Math.floor(projSizes.length / 2)] : (txs.length > 0 ? Math.round(txs.reduce((s, t) => s + t.area, 0) / txs.length) : 0));
  const [unitFloor, setUnitFloor] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedTxIdxs, setSelectedTxIdxs] = useState(new Set());
  const [refTxIdx, setRefTxIdx] = useState(null);
  const [sections, setSections] = useState({
    overview: true,
    marketPosition: true,
    valuation: true,
    referenceTx: false,
    evidence: false,
    yield: true,
    floorPremium: false,
  });
  const [viewingReport, setViewingReport] = useState(null);
  const [showSaved, setShowSaved] = useState(false);
  const printRef = useRef(null);

  // ── Sorted transactions (newest first) ──
  const sortedTxs = useMemo(() => [...txs].sort((a, b) => b.date.localeCompare(a.date)), [txs]);

  // ── Project CAGR ──
  const projCagr = useMemo(() => {
    const r = computeBucketCAGR(projData?.rawTx || []);
    return r.cagr;
  }, [projData]);

  // ── Time adjustment ──
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

  // ── CMA valuation (aligned with ValuationTab model) ──
  const floorData = projData?.projFloor || [];
  const cmaEstimate = useMemo(() => {
    if (!txs.length || !unitArea) return null;
    const now = new Date();
    const targetFloorMid = unitFloor ? (() => { const [lo, hi] = unitFloor.split('-').map(Number); return (lo + hi) / 2; })() : null;

    const scored = txs.map(tx => {
      const [y, m] = (tx.date || '').split('-').map(Number);
      const monthsAgo = (now.getFullYear() - (y || now.getFullYear())) * 12 + now.getMonth() - ((m || 1) - 1);
      const recencyW = Math.exp(-0.5 * monthsAgo / 18);
      const sizeDiff = Math.abs((tx.area || 0) - unitArea);
      const sizeW = Math.exp(-0.5 * Math.pow(sizeDiff / 150, 2));
      // Floor weight: 0.5 default (matches ValuationTab), Gaussian σ=8 when floor selected
      let floorW = 0.5;
      if (targetFloorMid && tx.floorMid) {
        floorW = Math.exp(-0.5 * Math.pow((tx.floorMid - targetFloorMid) / 8, 2));
      }
      const w = recencyW * sizeW * floorW;

      // Time-adjust PSF using CAGR
      let adjPsf = tx.psf;
      if (monthsAgo > 0 && projCagr) {
        adjPsf = adjPsf * Math.pow(1 + projCagr / 100, monthsAgo / 12);
      }
      // Floor premium adjustment: shift PSF by differential between tx floor and target floor
      if (targetFloorMid && tx.floorMid && floorData.length > 1) {
        const findPremium = (mid) => {
          const band = floorData.find(f => { const [lo, hi] = f.range.split('-').map(Number); return mid >= lo && mid <= hi; });
          return band ? band.premium : 0;
        };
        const txPrem = findPremium(tx.floorMid);
        const targetPrem = findPremium(targetFloorMid);
        adjPsf = adjPsf * (1 + (targetPrem - txPrem) / 100);
      }

      return { ...tx, weight: w, adjPsf: Math.round(adjPsf), monthsAgo, sizeDiff };
    });

    if (!scored.length) return null;
    const totalW = scored.reduce((s, t) => s + t.weight, 0);
    if (totalW === 0) return null;
    const wAvgPsf = Math.round(scored.reduce((s, t) => s + t.adjPsf * t.weight, 0) / totalW);
    const wStd = Math.round(Math.sqrt(scored.reduce((s, t) => s + t.weight * Math.pow(t.adjPsf - wAvgPsf, 2), 0) / totalW));

    // Confidence: 4-factor when floor selected, 3-factor otherwise (matches ValuationTab)
    const recent12 = scored.filter(t => t.monthsAgo <= 12).length;
    const sizeMatches = scored.filter(t => t.sizeDiff < 50).length;
    const floorMatches = targetFloorMid ? scored.filter(t => t.floorMid && Math.abs(t.floorMid - targetFloorMid) <= 4).length : null;
    const conf = Math.min(100, Math.round(
      targetFloorMid
        ? (Math.min(recent12, 10) / 10) * 30 +
          (Math.min(sizeMatches, 5) / 5) * 25 +
          (Math.min(floorMatches, 5) / 5) * 20 +
          (Math.min(scored.length, 20) / 20) * 25
        : (Math.min(recent12, 10) / 10) * 40 +
          (Math.min(sizeMatches, 5) / 5) * 30 +
          (Math.min(scored.length, 20) / 20) * 30
    ));
    return { wAvgPsf, lo: wAvgPsf - wStd, hi: wAvgPsf + wStd, confidence: conf, totalTx: scored.length };
  }, [txs, unitArea, unitFloor, timeAdjust, projCagr, floorData]);

  // ── Reference transaction adjustment ──
  const refTx = refTxIdx !== null ? sortedTxs[refTxIdx] : null;
  const refAdj = useMemo(() => refTx ? timeAdjust(refTx.psf, refTx.date) : null, [refTx, timeAdjust]);

  // ── Toggle helpers ──
  const toggleSection = (key) => setSections(s => ({ ...s, [key]: !s[key] }));
  const toggleTx = (idx) => {
    setSelectedTxIdxs(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  // ── Build snapshot for saving ──
  const buildSnapshot = useCallback(() => {
    const selectedEvidence = [...selectedTxIdxs].map(i => sortedTxs[i]).filter(Boolean).map(tx => ({
      date: tx.date, floor: tx.floorRange || '—', area: tx.area, price: tx.price, psf: tx.psf, saleType: tx.saleType || '—',
    }));
    return {
      id: uid(),
      clientName: clientName.trim() || 'Unnamed Client',
      projectName: p.name,
      createdAt: new Date().toISOString(),
      unitConfig: { area: unitArea, floor: unitFloor },
      sections,
      notes,
      snapshot: {
        project: { name: p.name, district: p.district, segment: p.segment, tenure: p.tenure, type: p.type },
        marketPosition: { avgPsf: p.avgPsf, medPsf: p.medPsf, psfPeriod: p.psfPeriod, distAvg: p.distAvg },
        cma: cmaEstimate ? { ...cmaEstimate } : null,
        referenceTx: refTx && refAdj ? {
          date: refTx.date, origPsf: refTx.psf, area: refTx.area, floor: refTx.floorRange || '—',
          saleType: refTx.saleType || '—', adjPsf: refAdj.adjPsf, months: refAdj.months, rate: refAdj.rate,
        } : null,
        evidence: selectedEvidence,
        yield: { grossYield: p.yield, rentPsf: p.rentPsf, avgRent: p.avgRent, hasRealRental: p.hasRealRental },
        floorPremium: projData?.projFloor || [],
        projCagr,
      },
    };
  }, [clientName, unitArea, unitFloor, sections, notes, selectedTxIdxs, sortedTxs, p, projData, cmaEstimate, refTx, refAdj, projCagr]);

  // ── Save report ──
  const handleSave = useCallback(() => {
    const report = buildSnapshot();
    const updated = [...(clientReports || []), report];
    setClientReports(updated);
    setShowSaved(true);
  }, [buildSnapshot, clientReports, setClientReports]);

  // ── Delete report ──
  const handleDelete = useCallback((id) => {
    setClientReports((clientReports || []).filter(r => r.id !== id));
    if (viewingReport?.id === id) setViewingReport(null);
  }, [clientReports, setClientReports, viewingReport]);

  // ── Load saved report into viewer ──
  const handleView = useCallback((report) => {
    setViewingReport(report);
    setShowSaved(false);
  }, []);

  // ── Print ──
  const handlePrint = useCallback(() => {
    const el = printRef.current;
    if (!el) return;
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>Client Report — ${viewingReport?.clientName || clientName || p.name}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1b2d4b; padding: 40px; font-size: 13px; line-height: 1.5; }
        h1 { font-size: 22px; font-weight: 800; margin-bottom: 4px; }
        h2 { font-size: 15px; font-weight: 700; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #e2e8f0; color: #334155; }
        h3 { font-size: 13px; font-weight: 700; margin: 12px 0 4px; color: #475569; }
        .subtitle { color: #556b8a; font-size: 13px; margin-bottom: 16px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin: 8px 0; }
        .metric { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f1f5f9; }
        .metric-label { color: #556b8a; }
        .metric-value { font-weight: 700; font-family: 'SF Mono', monospace; }
        .highlight { font-size: 24px; font-weight: 800; font-family: 'SF Mono', monospace; color: #6366f1; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 8px 0; }
        th { text-align: left; padding: 6px 8px; border-bottom: 2px solid #e2e8f0; color: #556b8a; font-weight: 600; font-size: 11px; text-transform: uppercase; }
        td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; font-family: 'SF Mono', monospace; }
        .notes { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin: 8px 0; white-space: pre-wrap; }
        .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; color: #8496ab; font-size: 11px; text-align: center; }
        .ref-arrow { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: center; margin: 8px 0; padding: 12px; background: #f8fafc; border-radius: 8px; }
        @media print { body { padding: 20px; } }
      </style></head><body>${el.innerHTML}
      <div class="footer">Generated by SG Property Analytics · ${new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })} · Data from URA REALIS</div>
      </body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); }, 300);
  }, [viewingReport, clientName, p.name]);

  // ── Render a report (either live preview or saved snapshot) ──
  const renderReport = (data, isSnapshot = false) => {
    const s = data.snapshot || {};
    const proj = isSnapshot ? s.project : { name: p.name, district: p.district, segment: p.segment, tenure: p.tenure, type: p.type };
    const uc = data.unitConfig || { area: unitArea, floor: unitFloor };
    const sec = data.sections || sections;
    const cma = isSnapshot ? s.cma : cmaEstimate;
    const ref = isSnapshot ? s.referenceTx : (refTx && refAdj ? { date: refTx.date, origPsf: refTx.psf, area: refTx.area, floor: refTx.floorRange || '—', saleType: refTx.saleType || '—', adjPsf: refAdj.adjPsf, months: refAdj.months, rate: refAdj.rate } : null);
    const ev = isSnapshot ? (s.evidence || []) : [...selectedTxIdxs].map(i => sortedTxs[i]).filter(Boolean).map(tx => ({ date: tx.date, floor: tx.floorRange || '—', area: tx.area, price: tx.price, psf: tx.psf, saleType: tx.saleType || '—' }));
    const yld = isSnapshot ? s.yield : { grossYield: p.yield, rentPsf: p.rentPsf, avgRent: p.avgRent, hasRealRental: p.hasRealRental };
    const fp = isSnapshot ? (s.floorPremium || []) : (projData?.projFloor || []);
    const mkt = isSnapshot ? s.marketPosition : { avgPsf: p.avgPsf, medPsf: p.medPsf, psfPeriod: p.psfPeriod, distAvg: p.distAvg };
    const cagr = isSnapshot ? s.projCagr : projCagr;
    const reportNotes = data.notes || notes;

    return (
      <div style={{ fontFamily: T.sans, color: T.text, lineHeight: 1.55 }}>
        {/* Title */}
        <h1 style={{ fontSize: T['2xl'], fontWeight: 800, marginBottom: 2 }}>{proj.name}</h1>
        <div style={{ color: T.textSub, fontSize: T.base, marginBottom: 16 }}>
          Property Advisory Report {data.clientName ? `— Prepared for ${data.clientName}` : ''}
          <span style={{ color: T.textMute, marginLeft: 12, fontSize: T.sm }}>{new Date(data.createdAt || Date.now()).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>

        {/* Overview */}
        {sec.overview && <>
          <h2 style={rptH2}>Property Overview</h2>
          <div style={rptGrid}>
            <RptMetric label="District" value={proj.district} />
            <RptMetric label="Market Segment" value={proj.segment} />
            <RptMetric label="Property Type" value={proj.type || '—'} />
            <RptMetric label="Tenure" value={proj.tenure || '—'} />
            <RptMetric label="Unit Size" value={`${(uc.area || 0).toLocaleString()} sqft`} />
            {uc.floor && <RptMetric label="Floor Range" value={`Level ${uc.floor}`} />}
          </div>
        </>}

        {/* Market Position */}
        {sec.marketPosition && <>
          <h2 style={rptH2}>Market Position</h2>
          <div style={rptGrid}>
            <RptMetric label={`Average PSF (${mkt.psfPeriod || 'latest'})`} value={fmtPsf(mkt.avgPsf)} highlight />
            <RptMetric label="Median PSF" value={fmtPsf(mkt.medPsf)} />
            {mkt.distAvg > 0 && <RptMetric label="District Average" value={fmtPsf(mkt.distAvg)} />}
            {mkt.distAvg > 0 && mkt.avgPsf > 0 && <RptMetric label="vs District" value={`${mkt.avgPsf > mkt.distAvg ? '+' : ''}${Math.round((mkt.avgPsf / mkt.distAvg - 1) * 100)}%`} color={mkt.avgPsf < mkt.distAvg ? T.green : T.amber} />}
            {cagr !== null && <RptMetric label="5-Year CAGR" value={`${cagr > 0 ? '+' : ''}${Number(cagr).toFixed(1)}%`} color={cagr >= 0 ? T.green : T.red} />}
          </div>
        </>}

        {/* Valuation Estimate */}
        {sec.valuation && cma && <>
          <h2 style={rptH2}>Valuation Estimate</h2>
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '16px 20px', margin: '8px 0', border: '1px solid #e2e8f0' }}>
            <div style={{ color: T.textMute, fontSize: T.xs, fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>CMA ESTIMATED VALUE</div>
            <div className="highlight" style={{ fontSize: 28, fontWeight: 800, fontFamily: T.mono, color: T.indigo }}>{fmtPrice(cma.wAvgPsf * uc.area)}</div>
            <div style={{ color: T.textSub, fontSize: T.base, marginTop: 4 }}>{fmtPsf(cma.wAvgPsf)} PSF × {(uc.area || 0).toLocaleString()} sqft</div>
            <div style={rptGrid}>
              <RptMetric label="Confidence" value={`${cma.confidence}/100`} color={cma.confidence >= 60 ? T.green : T.amber} />
              <RptMetric label="Range" value={`${fmtPsf(cma.lo)} – ${fmtPsf(cma.hi)}`} />
              <RptMetric label="Price Range" value={`${fmtPrice(cma.lo * uc.area)} – ${fmtPrice(cma.hi * uc.area)}`} />
              <RptMetric label="Comparables Used" value={`${cma.totalTx} transactions`} />
            </div>
          </div>
        </>}

        {/* Reference Transaction */}
        {sec.referenceTx && ref && <>
          <h2 style={rptH2}>Reference Transaction — CAGR Adjusted</h2>
          <div className="ref-arrow" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center', background: '#f8fafc', borderRadius: 8, padding: '14px 18px', margin: '8px 0', border: '1px solid #e2e8f0' }}>
            <div>
              <div style={{ color: T.textMute, fontSize: T.xs, fontWeight: 600 }}>ORIGINAL ({fmtDate(ref.date)})</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: T.mono, color: T.textSub }}>{fmtPsf(ref.origPsf)} PSF</div>
              <div style={{ color: T.textMute, fontSize: T.sm }}>{fmtPrice(ref.origPsf * uc.area)}</div>
              <div style={{ color: T.textMute, fontSize: T.xs, marginTop: 2 }}>{ref.floor !== '—' ? `Floor ${ref.floor}` : '—'} · {(ref.area || 0).toLocaleString()} sf · {ref.saleType}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, color: ref.rate !== null ? T.purple : T.amber }}>→</div>
              {ref.months > 0 && <div style={{ color: T.purple, fontSize: T.xs, fontWeight: 600 }}>{ref.months} months</div>}
              {ref.rate !== null && <div style={{ color: T.textMute, fontSize: T.xs }}>{ref.rate > 0 ? '+' : ''}{Number(ref.rate).toFixed(1)}% CAGR</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: T.textMute, fontSize: T.xs, fontWeight: 600 }}>TODAY&apos;S ESTIMATE</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: T.mono, color: ref.rate !== null && ref.months > 0 ? T.purple : T.textSub }}>{fmtPsf(ref.adjPsf)} PSF</div>
              <div style={{ color: T.purple, fontSize: T.base, fontFamily: T.mono, fontWeight: 700 }}>{fmtPrice(ref.adjPsf * uc.area)}</div>
              {ref.months > 0 && ref.rate !== null && (() => {
                const diff = ref.adjPsf - ref.origPsf;
                return diff !== 0 ? <div style={{ color: diff > 0 ? T.green : T.red, fontSize: T.sm, fontWeight: 600, marginTop: 2 }}>
                  {diff > 0 ? '▲' : '▼'} {diff > 0 ? '+' : ''}{diff.toLocaleString()} PSF ({((ref.adjPsf / ref.origPsf - 1) * 100).toFixed(1)}%)
                </div> : null;
              })()}
            </div>
          </div>
        </>}

        {/* Supporting Evidence */}
        {sec.evidence && ev.length > 0 && <>
          <h2 style={rptH2}>Supporting Evidence — {ev.length} Transaction{ev.length > 1 ? 's' : ''}</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: T.sm, margin: '8px 0' }}>
            <thead><tr>
              {['Date', 'Floor', 'Area', 'Price', 'PSF', 'Type'].map(h => <th key={h} style={rptTh}>{h}</th>)}
            </tr></thead>
            <tbody>
              {ev.map((tx, i) => <tr key={i}>
                <td style={rptTd}>{fmtDate(tx.date)}</td>
                <td style={rptTd}>{tx.floor}</td>
                <td style={rptTd}>{(tx.area || 0).toLocaleString()} sf</td>
                <td style={{ ...rptTd, color: T.blue, fontWeight: 600 }}>{fmtPrice(tx.price)}</td>
                <td style={{ ...rptTd, fontWeight: 600 }}>{fmtPsf(tx.psf)}</td>
                <td style={{ ...rptTd, color: T.textMute }}>{tx.saleType}</td>
              </tr>)}
            </tbody>
          </table>
        </>}

        {/* Yield Analysis */}
        {sec.yield && <>
          <h2 style={rptH2}>Yield Analysis</h2>
          <div style={rptGrid}>
            <RptMetric label="Gross Rental Yield" value={`${Number(yld.grossYield || 0).toFixed(2)}%`} color={Number(yld.grossYield) >= 3 ? T.green : T.amber} highlight />
            <RptMetric label="Rent PSF/mo" value={`$${Number(yld.rentPsf || 0).toFixed(2)}`} />
            <RptMetric label="Est. Monthly Rent" value={fmtPrice(Math.round(Number(yld.rentPsf || 0) * uc.area))} />
            <RptMetric label="Est. Annual Rent" value={fmtPrice(Math.round(Number(yld.rentPsf || 0) * uc.area * 12))} />
            <RptMetric label="Data Source" value={yld.hasRealRental ? 'URA Real Rental' : 'Estimated'} />
          </div>
        </>}

        {/* Floor Premium */}
        {sec.floorPremium && fp.length > 0 && <>
          <h2 style={rptH2}>Floor Premium Analysis</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: T.sm, margin: '8px 0' }}>
            <thead><tr>
              {['Floor Range', 'Avg PSF', 'Premium', 'Transactions'].map(h => <th key={h} style={rptTh}>{h}</th>)}
            </tr></thead>
            <tbody>
              {fp.map((f, i) => <tr key={i} style={{ background: unitFloor === f.range ? '#eef2ff' : undefined }}>
                <td style={rptTd}>{f.range}{unitFloor === f.range ? ' ◂' : ''}</td>
                <td style={{ ...rptTd, fontWeight: 600 }}>{fmtPsf(f.psf)}</td>
                <td style={{ ...rptTd, color: f.premium > 0 ? T.green : f.premium < 0 ? T.red : T.textSub, fontWeight: 600 }}>{f.premium > 0 ? '+' : ''}{f.premium}%</td>
                <td style={{ ...rptTd, color: T.textMute }}>{f.count}{f.thin ? ' ⚠' : ''}</td>
              </tr>)}
            </tbody>
          </table>
        </>}

        {/* Notes */}
        {reportNotes && <>
          <h2 style={rptH2}>Advisor Notes</h2>
          <div className="notes" style={{ background: '#f8fafc', border: `1px solid ${T.border}`, borderRadius: 6, padding: 12, whiteSpace: 'pre-wrap', color: T.textSub, fontSize: T.base }}>{reportNotes}</div>
        </>}
      </div>
    );
  };

  // ── If viewing a saved report ──
  if (viewingReport) {
    return <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => setViewingReport(null)} style={btnStyle(T.textMute)}>← Back to Builder</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handlePrint} style={btnStyle(T.blue)}>Print / PDF</button>
          <button onClick={() => handleDelete(viewingReport.id)} style={btnStyle(T.red)}>Delete</button>
        </div>
      </div>
      <Card>
        <div ref={printRef} style={{ padding: '8px 4px' }}>
          {renderReport(viewingReport, true)}
        </div>
      </Card>
    </div>;
  }

  // ── Main builder UI ──
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeader title="Client Report Builder" sub="Curate pricing data and save a snapshot for your client. Saved reports freeze the data at the time of saving." />

      {/* Client + Unit Config */}
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>Client Name</label>
            <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g. Mr. & Mrs. Tan" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Notes / Comments</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Advisory notes for this client..." rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: T.sans }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
          <div>
            <label style={labelStyle}>Unit Size (sqft)</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {projSizes.map(s => <button key={s} onClick={() => setUnitArea(s)} style={chipStyle(unitArea === s)}>{s.toLocaleString()}</button>)}
              <input type="number" value={unitArea || ''} onChange={e => setUnitArea(+e.target.value || 0)} style={{ ...inputStyle, width: 100, fontSize: T.base }} placeholder="Custom" />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Floor Range</label>
            <select value={unitFloor} onChange={e => setUnitFloor(e.target.value)} style={inputStyle}>
              <option value="">Any floor</option>
              {floorRanges.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {/* Section toggles */}
      <Card>
        <div style={{ color: T.text, fontSize: T.md, fontWeight: 700, marginBottom: 10 }}>Include in Report</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
          {[
            { key: 'overview', label: 'Overview', desc: 'Project details' },
            { key: 'marketPosition', label: 'Market Position', desc: 'PSF, district avg' },
            { key: 'valuation', label: 'CMA Valuation', desc: 'Weighted estimate' },
            { key: 'referenceTx', label: 'Reference Tx', desc: 'CAGR adjustment' },
            { key: 'evidence', label: 'Evidence', desc: 'Selected transactions' },
            { key: 'yield', label: 'Yield', desc: 'Rental yield data' },
            { key: 'floorPremium', label: 'Floor Premium', desc: 'Floor analysis' },
          ].map(s => (
            <button key={s.key} onClick={() => toggleSection(s.key)}
              style={{ background: sections[s.key] ? '#eef2ff' : T.borderLt, border: `1px solid ${sections[s.key] ? '#818cf8' : T.border}`, borderRadius: 8, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
              <div style={{ fontSize: T.md, fontWeight: 600, color: sections[s.key] ? T.indigo : T.textSub }}>{s.label}</div>
              <div style={{ fontSize: T.xs, color: T.textMute }}>{s.desc}</div>
            </button>
          ))}
        </div>
      </Card>

      {/* Reference Transaction Selector */}
      {sections.referenceTx && <Card>
        <div style={{ color: T.text, fontSize: T.md, fontWeight: 700, marginBottom: 8 }}>Select Reference Transaction</div>
        <select value={refTxIdx ?? ''} onChange={e => setRefTxIdx(e.target.value === '' ? null : +e.target.value)}
          style={{ ...inputStyle, fontFamily: T.mono }}>
          <option value="">Choose a transaction...</option>
          {sortedTxs.map((tx, i) => (
            <option key={i} value={i}>{tx.date} · {tx.floorRange || '—'} · {tx.area.toLocaleString()}sf · ${tx.psf.toLocaleString()} PSF · {tx.saleType || '—'}</option>
          ))}
        </select>
        {refAdj && refTx && <div style={{ marginTop: 8, padding: '10px 14px', background: '#f8fafc', borderRadius: 6, border: `1px solid ${T.border}` }}>
          <span style={{ color: T.textSub, fontSize: T.sm }}>{fmtPsf(refTx.psf)} ({refTx.date}) → <strong style={{ color: T.purple }}>{fmtPsf(refAdj.adjPsf)}</strong> today
          {refAdj.months > 0 && refAdj.rate !== null && <span style={{ color: T.textMute }}> ({refAdj.months}mo at {refAdj.rate > 0 ? '+' : ''}{Number(refAdj.rate).toFixed(1)}% CAGR)</span>}
          {refAdj.rate === null && refAdj.months > 0 && <span style={{ color: T.amber }}> (insufficient CAGR data)</span>}
          </span>
        </div>}
      </Card>}

      {/* Evidence Selector */}
      {sections.evidence && <Card>
        <div style={{ color: T.text, fontSize: T.md, fontWeight: 700, marginBottom: 4 }}>Select Supporting Transactions</div>
        <div style={{ color: T.textMute, fontSize: T.xs, marginBottom: 8 }}>Pick specific transactions as comparable evidence for your client</div>
        <div style={{ maxHeight: 320, overflowY: 'auto', border: `1px solid ${T.border}`, borderRadius: 6 }}>
          <table style={{ margin: 0, width: '100%' }}>
            <thead><tr>
              {['', 'Date', 'Floor', 'Area', 'Price', 'PSF', 'Type'].map(h => <th key={h} style={{ ...rptTh, position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {sortedTxs.slice(0, 100).map((tx, i) => {
                const sel = selectedTxIdxs.has(i);
                return <tr key={i} onClick={() => toggleTx(i)} style={{ cursor: 'pointer', background: sel ? '#eef2ff' : undefined, transition: 'background 0.1s' }}
                  onMouseEnter={e => { if (!sel) e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={e => { if (!sel) e.currentTarget.style.background = ''; }}>
                  <td style={{ ...rptTd, width: 28, textAlign: 'center', color: sel ? T.indigo : T.textFaint }}>{sel ? '☑' : '☐'}</td>
                  <td style={{ ...rptTd, color: T.textMute, whiteSpace: 'nowrap' }}>{tx.date}</td>
                  <td style={rptTd}>{tx.floorRange || '—'}</td>
                  <td style={rptTd}>{tx.area.toLocaleString()} sf</td>
                  <td style={{ ...rptTd, color: T.blue, fontWeight: 600 }}>${tx.price.toLocaleString()}</td>
                  <td style={{ ...rptTd, fontWeight: 600 }}>${tx.psf.toLocaleString()}</td>
                  <td style={{ ...rptTd, color: T.textMute }}>{tx.saleType || '—'}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        {selectedTxIdxs.size > 0 && <div style={{ color: T.indigo, fontSize: T.sm, fontWeight: 600, marginTop: 6 }}>{selectedTxIdxs.size} transaction{selectedTxIdxs.size > 1 ? 's' : ''} selected</div>}
      </Card>}

      {/* Live Preview */}
      <SectionHeader title="Live Preview" sub="This is how the report will look when saved and printed." />
      <Card>
        <div ref={printRef} style={{ padding: '8px 4px' }}>
          {renderReport({ clientName, unitConfig: { area: unitArea, floor: unitFloor }, sections, notes, snapshot: null }, false)}
        </div>
      </Card>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={handleSave} style={{ ...btnStyle(T.indigo), padding: '10px 28px', fontSize: T.lg, fontWeight: 700 }}>Save Report Snapshot</button>
        <button onClick={handlePrint} style={{ ...btnStyle(T.blue), padding: '10px 20px' }}>Print / PDF</button>
        <button onClick={() => setShowSaved(!showSaved)} style={{ ...btnStyle(T.textSub), padding: '10px 20px' }}>
          Saved Reports ({(clientReports || []).filter(r => r.projectName === p.name).length})
        </button>
      </div>

      {/* Saved Reports List */}
      {showSaved && <Card>
        <div style={{ color: T.text, fontSize: T.md, fontWeight: 700, marginBottom: 10 }}>Saved Reports for {p.name}</div>
        {(clientReports || []).filter(r => r.projectName === p.name).length === 0
          ? <div style={{ color: T.textMute, fontSize: T.base, padding: '16px 0', textAlign: 'center' }}>No saved reports yet. Build one above and hit Save.</div>
          : <div style={{ display: 'grid', gap: 8 }}>
            {(clientReports || []).filter(r => r.projectName === p.name).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: T.borderLt, borderRadius: 8, border: `1px solid ${T.border}` }}>
                <div>
                  <div style={{ color: T.text, fontWeight: 600, fontSize: T.md }}>{r.clientName}</div>
                  <div style={{ color: T.textMute, fontSize: T.xs }}>
                    {new Date(r.createdAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {' · '}{(r.unitConfig?.area || 0).toLocaleString()} sqft{r.unitConfig?.floor ? ` · Floor ${r.unitConfig.floor}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => handleView(r)} style={btnStyle(T.indigo)}>View</button>
                  <button onClick={() => handleDelete(r.id)} style={btnStyle(T.red)}>Delete</button>
                </div>
              </div>
            ))}
          </div>}
      </Card>}
    </div>
  );
}

// ── Styles ──
const rptH2 = { fontSize: 15, fontWeight: 700, margin: '20px 0 8px', paddingBottom: 4, borderBottom: `2px solid ${T.border}`, color: '#334155' };
const rptGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', margin: '8px 0' };
const rptTh = { textAlign: 'left', padding: '6px 8px', borderBottom: `2px solid ${T.border}`, color: T.textMute, fontWeight: 600, fontSize: T.xs, textTransform: 'uppercase', letterSpacing: '0.03em' };
const rptTd = { padding: '5px 8px', borderBottom: `1px solid ${T.borderLt}`, fontFamily: T.mono, fontSize: T.md };
const labelStyle = { display: 'block', color: T.textSub, fontSize: T.sm, fontWeight: 600, marginBottom: 4 };
const inputStyle = { background: '#fff', border: `1px solid #cbd5e1`, borderRadius: 6, padding: '8px 12px', fontSize: T.md, color: T.text, width: '100%', outline: 'none', fontFamily: T.sans };
const chipStyle = (active) => ({
  background: active ? T.indigo : T.borderLt, color: active ? '#fff' : T.textMute,
  border: `1px solid ${active ? T.indigo : '#cbd5e1'}`, borderRadius: 6, padding: '6px 12px',
  fontSize: T.sm, fontFamily: T.mono, fontWeight: active ? 700 : 400, cursor: 'pointer',
});
const btnStyle = (color) => ({
  background: 'none', border: `1px solid ${color}`, borderRadius: 6, padding: '6px 14px',
  color, fontSize: T.md, fontWeight: 600, cursor: 'pointer',
});

function RptMetric({ label, value, color, highlight }) {
  return (
    <div className="metric" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${T.borderLt}` }}>
      <span className="metric-label" style={{ color: T.textMute, fontSize: T.sm }}>{label}</span>
      <span className="metric-value" style={{ fontWeight: highlight ? 800 : 700, fontFamily: T.mono, fontSize: highlight ? T.lg : T.md, color: color || T.text }}>{value}</span>
    </div>
  );
}
RptMetric.propTypes = { label: PropTypes.string, value: PropTypes.any, color: PropTypes.string, highlight: PropTypes.bool };

ClientReport.propTypes = {
  projInfo: PropTypes.object.isRequired,
  projData: PropTypes.object,
  clientReports: PropTypes.array,
  setClientReports: PropTypes.func.isRequired,
};
