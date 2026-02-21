import { useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ComposedChart, Line,
  ScatterChart, Scatter, ZAxis,
} from 'recharts';
import { T } from '../../constants';
import Tip from '../ui/Tip';
import { Card, SectionHeader, InsightBar } from '../ui';

const matchFloor = (fl, band) => {
  if (band === '01-05') return fl >= 1 && fl <= 5;
  if (band === '06-10') return fl >= 6 && fl <= 10;
  if (band === '11-15') return fl >= 11 && fl <= 15;
  if (band === '16-20') return fl >= 16 && fl <= 20;
  if (band === '21-30') return fl >= 21 && fl <= 30;
  if (band === '31+') return fl >= 31;
  return true;
};

function med(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export default function ProjectOverview({ projInfo, projData, masterFilters = {} }) {
  const p = projInfo;
  const bedsFilter = masterFilters.beds || 'all';
  const yearFrom = masterFilters.yearFrom || '';
  const yearTo = masterFilters.yearTo || '';
  const saleType = masterFilters.saleType || 'all';
  const tenureFilter = masterFilters.tenure || 'all';
  const floorFilter = masterFilters.floor || 'all';

  const filteredTxs = useMemo(() => {
    let txs = projData?.txs || [];
    if (bedsFilter !== 'all') txs = txs.filter(t => t.beds && t.beds.split('/').includes(bedsFilter));
    if (yearFrom) txs = txs.filter(t => t.year >= yearFrom);
    if (yearTo) txs = txs.filter(t => t.year <= yearTo);
    if (saleType !== 'all') txs = txs.filter(t => t.saleType === saleType);
    if (tenureFilter !== 'all') txs = txs.filter(t => t.tenure === tenureFilter);
    if (floorFilter !== 'all') txs = txs.filter(t => matchFloor(t.floorMid || 0, floorFilter));
    return txs;
  }, [projData, bedsFilter, yearFrom, yearTo, saleType, tenureFilter, floorFilter]);

  const hasFilters = bedsFilter !== 'all' || yearFrom || yearTo || saleType !== 'all' || tenureFilter !== 'all' || floorFilter !== 'all';

  // Recompute PSF trend from filtered txs
  const psfTrend = useMemo(() => {
    if (!hasFilters) return projData?.projPsfTrend || [];
    const byQ = {};
    filteredTxs.forEach(t => { if (!byQ[t.quarter]) byQ[t.quarter] = []; byQ[t.quarter].push(t.psf); });
    return Object.keys(byQ).sort().slice(-8).map(q => {
      const v = byQ[q];
      return { q, avg: Math.round(v.reduce((s, x) => s + x, 0) / v.length), med: med(v), vol: v.length };
    });
  }, [projData, filteredTxs, hasFilters]);

  // Recompute scatter from filtered txs
  const scatter = useMemo(() => {
    if (!hasFilters) return projData?.projScatter || [];
    return filteredTxs.slice(0, 80).map(t => ({ area: t.area, psf: t.psf, floor: t.floorMid, price: t.price, beds: t.beds }));
  }, [projData, filteredTxs, hasFilters]);

  // Recompute stats from filtered txs
  const stats = useMemo(() => {
    if (!hasFilters || !filteredTxs.length) return { avgPsf: p.avgPsf, medPsf: p.medPsf, totalTx: p.totalTx };
    const psfs = filteredTxs.map(t => t.psf);
    return {
      avgPsf: Math.round(psfs.reduce((s, v) => s + v, 0) / psfs.length),
      medPsf: med(psfs),
      totalTx: filteredTxs.length,
    };
  }, [filteredTxs, hasFilters, p]);

  const rentTrend = projData?.projRentTrend || [];
  const psfLabel = p.psfPeriod === 'all' ? 'all-time' : p.psfPeriod || '';

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <InsightBar items={[
        <span key="p">Trading at <span style={{ color: T.blue, fontWeight: 700, fontFamily: T.mono }}>${stats.avgPsf.toLocaleString()}</span> PSF {psfLabel && !hasFilters && <span style={{ color: T.textMute, fontSize: T.sm }}>({psfLabel})</span>}{hasFilters && <span style={{ color: T.purple, fontSize: T.sm }}>(filtered · {stats.totalTx} tx)</span>} {p.distAvg ? <> — <span style={{ color: stats.avgPsf < p.distAvg ? T.green : T.red, fontWeight: 700 }}>{Math.abs(Math.round((1 - stats.avgPsf / p.distAvg) * 100))}% {stats.avgPsf < p.distAvg ? 'below' : 'above'}</span> district avg (${p.distAvg.toLocaleString()})</> : null}</span>,
        <span key="y">Yield {p.hasRealRental ? <span style={{ color: T.green, fontWeight: 700, fontFamily: T.mono }}>{p.yield}%</span> : <span style={{ color: T.textMute }}>N/A</span>}</span>,
        <span key="r">{p.tenure || '—'}</span>,
      ]} />

      <SectionHeader title="PSF Trend" sub={`Quarterly average PSF trend.${hasFilters ? ' Filtered data.' : ''}`} />
      <Card><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={psfTrend}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border} />
        <XAxis dataKey="q" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} />
        <YAxis yAxisId="l" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => '$' + v.toLocaleString()} />
        <YAxis yAxisId="r" orientation="right" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => v + ' tx'} />
        <Tooltip content={<Tip />} /><Legend wrapperStyle={{ fontSize: T.md }} />
        <Bar yAxisId="l" dataKey="avg" name="Avg PSF" fill={T.sky} radius={[4, 4, 0, 0]} barSize={18} opacity={0.4} legendType="none" />
        <Line yAxisId="l" type="monotone" dataKey="avg" name="Avg PSF" stroke={T.blue} strokeWidth={2} dot={{ r: 3, fill: T.blue }} />
        <Line yAxisId="l" type="monotone" dataKey="med" name="Med PSF" stroke={T.indigo} strokeWidth={2} dot={{ r: 3, fill: T.indigo }} strokeDasharray="5 5" />
        <Bar yAxisId="r" dataKey="vol" name="Tx Volume" fill={`${T.textMute}40`} radius={[4, 4, 0, 0]} barSize={8} />
      </ComposedChart></ResponsiveContainer></div></Card>

      <SectionHeader title="Rental Trend" sub={p.hasRealRental ? 'Average & median monthly rent from real URA rental contracts.' : 'No URA rental data available for this project.'} />
      {rentTrend.length > 0 ? (
      <Card><div style={{ height: 240 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={rentTrend}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border} />
        <XAxis dataKey="q" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} />
        <YAxis tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => '$' + v.toLocaleString()} />
        <Tooltip content={<Tip />} /><Legend wrapperStyle={{ fontSize: T.md }} />
        <Bar dataKey="avg" name="Avg Rent" fill={T.emerald} radius={[4, 4, 0, 0]} barSize={18} opacity={0.4} legendType="none" />
        <Line type="monotone" dataKey="avg" name="Avg Rent" stroke={T.green} strokeWidth={2} dot={{ r: 3, fill: T.green }} />
        <Line type="monotone" dataKey="med" name="Med Rent" stroke={T.teal} strokeWidth={2} dot={{ r: 3, fill: T.teal }} strokeDasharray="5 5" />
      </ComposedChart></ResponsiveContainer></div></Card>
      ) : (
      <Card><div style={{ textAlign: 'center', color: T.textMute, padding: 32 }}>No rental records from URA for this project yet.</div></Card>
      )}

      <SectionHeader title="Transaction Scatter: Size × Floor × PSF" sub={`${scatter.length} transactions${hasFilters ? ' (filtered)' : ' (most recent 80)'}. Bubble size = floor level.`} />
      <Card><div style={{ height: 300 }}><ResponsiveContainer width="100%" height="100%"><ScatterChart>
        <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
        <XAxis type="number" dataKey="area" name="Area (sqft)" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => `${v} sf`} />
        <YAxis type="number" dataKey="psf" name="PSF ($)" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => '$' + v.toLocaleString()} />
        <ZAxis type="number" dataKey="floor" name="Floor" range={[30, 200]} />
        <Tooltip content={<Tip />} />
        <Scatter name="Transactions" data={scatter} fill={T.purple} fillOpacity={0.6} />
      </ScatterChart></ResponsiveContainer></div></Card>
    </div>
  );
}

ProjectOverview.propTypes = {
  projInfo: PropTypes.object.isRequired,
  projData: PropTypes.object,
  masterFilters: PropTypes.object,
};
