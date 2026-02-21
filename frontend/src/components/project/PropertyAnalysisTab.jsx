import { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Line, Cell, Legend, ComposedChart,
} from 'recharts';
import { T, pctChgColor, totalPctColor } from '../../constants';
import { Card, SectionHeader, NoteText } from '../ui';
import { useProjectFilters } from './useProjectFilters';

export default function PropertyAnalysisTab({ projInfo, projData, masterFilters = {} }) {
  const p = projInfo;
  const { filteredTxs, filteredFloorData, filteredHm, hasFilters } = useProjectFilters(projData, masterFilters);

  // ── Heatmap state ──
  const [hmMetric, setHmMetric] = useState('psf');
  const [hmShowDiff, setHmShowDiff] = useState(false);
  const [hmSelFloor, setHmSelFloor] = useState('');
  const [hmSelYear, setHmSelYear] = useState(null);

  const projSizes = projData?.projSizes || [];
  const projHmYears = filteredHm.years;
  const projHmFloors = filteredHm.floors;

  const projHmMatrix = useMemo(() => {
    const base = filteredHm.matrix;
    if (!hmSelFloor || !filteredTxs?.length) return base;
    const sizeVal = parseInt(hmSelFloor);
    if (isNaN(sizeVal)) return base;
    const filtered = filteredTxs.filter(tx => Math.abs(tx.size - sizeVal) < 50);
    if (!filtered.length) return base;
    const matrix = {};
    projHmFloors.forEach(f => {
      const [lo, hi] = f.split('-').map(Number);
      projHmYears.forEach(y => {
        const c = filtered.filter(t => t.floorMid >= lo && t.floorMid <= hi && t.year === y);
        if (c.length > 0) matrix[`${f}-${y}`] = { psf: Math.round(c.reduce((s, t) => s + t.psf, 0) / c.length), vol: c.length, price: Math.round(c.reduce((s, t) => s + t.price, 0) / c.length) };
      });
    });
    return matrix;
  }, [filteredHm, filteredTxs, hmSelFloor, projHmYears, projHmFloors]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>

      {/* ── Floor × Year Heatmap ── */}
      <SectionHeader title="Historical Heatmap — Floor × Year" sub="Click any cell to inspect. Toggle metrics (PSF/Price/Vol), enable ± Changes for YoY diffs, or filter by unit size." />
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
              {['Avg Incr.', 'CAGR', 'Abs. Chg', 'Total %'].map(h => <div key={h} style={{ width: h.includes('Avg') || h.includes('Abs') ? 65 : 60, flexShrink: 0, textAlign: 'center', fontSize: T.xs, fontWeight: 600, color: T.text, padding: '8px 2px', borderBottom: '1px solid #f1f5f9', background: T.bg, borderLeft: h === 'Avg Incr.' ? '1px solid #e2e8f0' : 'none' }}>{h}</div>)}
            </div>
            {(() => {
              const allCells = Object.values(projHmMatrix);
              const allPsf = allCells.map(c => c.psf).filter(Boolean);
              const allPrice = allCells.map(c => c.price).filter(Boolean);
              const allVol = allCells.map(c => c.vol).filter(Boolean);
              const globalMin = hmMetric === 'psf' ? (allPsf.length ? Math.min(...allPsf) : 0) : hmMetric === 'price' ? (allPrice.length ? Math.min(...allPrice) : 0) : (allVol.length ? Math.min(...allVol) : 0);
              const globalMax = hmMetric === 'psf' ? (allPsf.length ? Math.max(...allPsf) : 1) : hmMetric === 'price' ? (allPrice.length ? Math.max(...allPrice) : 1) : (allVol.length ? Math.max(...allVol) : 1);

              return projHmFloors.map(f => {
                const vals = projHmYears.map(y => { const cell = projHmMatrix[`${f}-${y}`]; if (!cell) return 0; return hmMetric === 'psf' ? cell.psf : hmMetric === 'price' ? cell.price : cell.vol; });
                const firstIdx = vals.findIndex(v => v > 0);
                const lastIdx = vals.reduce((acc, v, i) => v > 0 ? i : acc, -1);
                const firstV = firstIdx >= 0 ? vals[firstIdx] : 0;
                const lastV = lastIdx >= 0 ? vals[lastIdx] : 0;
                const totalPct = firstV > 0 && lastV > 0 ? Math.round((lastV / firstV - 1) * 100) : 0;
                const absChg = lastV - firstV;
                const gapYears = firstIdx >= 0 && lastIdx > firstIdx ? lastIdx - firstIdx : 0;
                const avgIncr = gapYears > 0 ? Math.round(absChg / gapYears) : 0;
                const pctChg = gapYears > 0 ? +((Math.pow(lastV / firstV, 1 / gapYears) - 1) * 100).toFixed(1) : 0;

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
                  <div style={{ width: 65, flexShrink: 0, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: T.sm, fontFamily: T.mono, fontWeight: 600, color: gapYears === 0 ? T.textMute : avgIncr >= 0 ? T.textMute : T.negLt, background: T.bg, borderLeft: '1px solid #e2e8f0' }}>{gapYears === 0 ? '—' : hmMetric === 'psf' ? (avgIncr >= 0 ? '+$' : '-$') + Math.abs(avgIncr) : hmMetric === 'price' ? (avgIncr >= 0 ? '+$' : '-$') + (Math.abs(avgIncr) / 1e3).toFixed(0) + 'K' : (avgIncr >= 0 ? '+' : '') + avgIncr}</div>
                  <div style={{ width: 60, flexShrink: 0, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: T.sm, fontFamily: T.mono, fontWeight: 600, color: gapYears === 0 ? T.textMute : pctChgColor(Number(pctChg)), background: T.bg }}>{gapYears === 0 ? '—' : `${Number(pctChg) > 0 ? '+' : ''}${pctChg}%`}</div>
                  <div style={{ width: 65, flexShrink: 0, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: T.sm, fontFamily: T.mono, fontWeight: 600, color: gapYears === 0 ? T.textMute : absChg >= 0 ? T.blue : T.negLt, background: T.bg }}>{gapYears === 0 ? '—' : hmMetric === 'psf' ? (absChg >= 0 ? '+$' : '-$') + Math.abs(absChg) : hmMetric === 'price' ? (absChg >= 0 ? '+$' : '-$') + (Math.abs(absChg) / 1e3).toFixed(0) + 'K' : (absChg >= 0 ? '+' : '') + absChg}</div>
                  <div style={{ width: 60, flexShrink: 0, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: T.sm, fontFamily: T.mono, fontWeight: 700, color: gapYears === 0 ? T.textMute : totalPctColor(totalPct), background: T.bg }}>{gapYears === 0 ? '—' : `${totalPct > 0 ? '+' : ''}${totalPct}%`}</div>
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
      <SectionHeader title="Floor Premium Analysis" sub={`Average PSF by floor band${hasFilters ? ' (filtered)' : projData?.floorPeriod === '12M' ? ' (last 12 months)' : ' (all time — limited recent data)'}.`} />
      <Card>
        <div style={{ height: 300 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={filteredFloorData.floors}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border} />
          <XAxis dataKey="range" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} />
          <YAxis yAxisId="l" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => '$' + v.toLocaleString()} />
          <YAxis yAxisId="r" orientation="right" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => `${v >= 0 ? '+' : ''}${v}%`} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0]?.payload;
            return <div style={{ background: '#1b2d4bf0', padding: '10px 14px', borderRadius: T.r, border: '1px solid #334155' }}>
              <div style={{ color: T.border, fontWeight: 700, fontSize: T.lg }}>Floor {d.range}</div>
              <div style={{ color: T.blue, fontSize: T.base }}>${d.psf?.toLocaleString()} PSF</div>
              <div style={{ color: T.amber, fontSize: T.base }}>{d.premium >= 0 ? '+' : ''}{d.premium}% premium</div>
              <div style={{ color: d.thin ? T.amber : T.textMute, fontSize: T.md }}>{d.count} transaction{d.count !== 1 ? 's' : ''}{d.thin ? '' : ''}</div>
            </div>;
          }} />
          <Legend wrapperStyle={{ fontSize: T.md }} />
          <Bar yAxisId="l" dataKey="psf" name="Avg PSF" radius={[4, 4, 0, 0]} barSize={20}>{filteredFloorData.floors.map((f, i) => <Cell key={i} fill={f.thin ? T.textMute : T.sky} fillOpacity={f.thin ? 0.5 : 1} />)}</Bar>
          <Line yAxisId="r" type="monotone" dataKey="premium" name="Premium %" stroke={T.amber} strokeWidth={2.5} dot={{ r: 4, fill: T.amber }} />
        </ComposedChart></ResponsiveContainer></div>
        {filteredFloorData.thinBands.length > 0 && <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, color: T.amber, fontSize: T.md }}><span style={{ fontWeight: 700 }}>!</span><span>Floor{filteredFloorData.thinBands.length > 1 ? 's' : ''} {filteredFloorData.thinBands.join(', ')} — fewer than 3 transactions, treat with caution</span></div>}
        {filteredFloorData.baselineSource === 'project_avg' && <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, color: T.textMute, fontSize: T.sm }}><span style={{ fontWeight: 700 }}>i</span><span>Premiums shown vs project average (insufficient low-floor data for standard baseline)</span></div>}
      </Card>
      <NoteText>Higher floors command a premium — the gap reflects unobstructed views and reduced noise.{!hasFilters && projData?.floorPeriod === 'all' ? ' Data uses all-time transactions due to limited recent sales.' : ''}</NoteText>
    </div>
  );
}

PropertyAnalysisTab.propTypes = {
  projInfo: PropTypes.object.isRequired,
  projData: PropTypes.object,
  masterFilters: PropTypes.object,
};
