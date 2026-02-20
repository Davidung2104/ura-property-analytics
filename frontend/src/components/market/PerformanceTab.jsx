import { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { SEG_COLORS as SC, T } from '../../constants';
import Tip from '../ui/Tip';
import { Card, SectionHeader, InsightBar } from '../ui';

const fmtDollar = v => `${v >= 0 ? '+' : '-'}$${Math.abs(v).toLocaleString()}`;
const fmtPct = v => `${v >= 0 ? '+' : ''}${v}%`;
const posNeg = v => v >= 0 ? T.green : T.red;

const COL_DEFS = [
  { key: 'rank',     label: '#',          w: 32,  align: 'center', fmt: v => v },
  { key: 'd',        label: 'District',   w: 56,  align: 'left' },
  { key: 'seg',      label: 'Seg',        w: 48,  align: 'center' },
  { key: 'startPsf', label: 'Start PSF',  w: 80,  align: 'right', fmt: v => `$${v.toLocaleString()}` },
  { key: 'endPsf',   label: 'End PSF',    w: 80,  align: 'right', fmt: v => `$${v.toLocaleString()}` },
  { key: 'absDiff',  label: 'Δ PSF',      w: 72,  align: 'right', fmt: fmtDollar, color: posNeg },
  { key: 'pctChg',   label: '% Chg',      w: 64,  align: 'right', fmt: fmtPct, color: posNeg },
  { key: 'cagr',     label: 'CAGR',       w: 64,  align: 'right', fmt: fmtPct, color: posNeg },
  { key: 'yield',    label: 'Yield',      w: 56,  align: 'right', fmt: v => `${v}%`, color: () => T.amber },
  { key: 'totalReturn', label: 'Total',   w: 64,  align: 'right', fmt: fmtPct, color: v => v >= 5 ? T.green : v >= 0 ? T.amber : T.red },
  { key: 'txTotal',  label: 'Tx',         w: 48,  align: 'right' },
];

const SORTABLE = ['cagr', 'absDiff', 'pctChg', 'totalReturn', 'yield', 'endPsf', 'txTotal'];

const PROJ_COLS = [
  { key: 'rank',     label: '#',          w: 32,  align: 'center', fmt: v => v },
  { key: 'name',     label: 'Project',    w: 180, align: 'left' },
  { key: 'dist',     label: 'Dist',       w: 42,  align: 'center' },
  { key: 'seg',      label: 'Seg',        w: 42,  align: 'center' },
  { key: 'startPsf', label: 'Start PSF',  w: 80,  align: 'right', fmt: v => `$${v.toLocaleString()}` },
  { key: 'endPsf',   label: 'End PSF',    w: 80,  align: 'right', fmt: v => `$${v.toLocaleString()}` },
  { key: 'absDiff',  label: 'Δ PSF',      w: 72,  align: 'right', fmt: fmtDollar, color: posNeg },
  { key: 'pctChg',   label: '% Chg',      w: 64,  align: 'right', fmt: fmtPct, color: posNeg },
  { key: 'cagr',     label: 'CAGR',       w: 64,  align: 'right', fmt: fmtPct, color: posNeg },
  { key: 'yield',    label: 'Yield',      w: 52,  align: 'right', fmt: v => `${v}%`, color: () => T.amber },
  { key: 'totalReturn', label: 'Total',   w: 60,  align: 'right', fmt: fmtPct, color: v => v >= 5 ? T.green : v >= 0 ? T.amber : T.red },
  { key: 'txTotal',  label: 'Tx',         w: 44,  align: 'right' },
];

const PROJ_SORTABLE = ['cagr', 'absDiff', 'pctChg', 'totalReturn', 'yield', 'endPsf', 'txTotal'];

export default function PerformanceTab({ data }) {
  const [sortBy, setSortBy] = useState('cagr');
  const [sortDir, setSortDir] = useState('desc');
  const [projSortBy, setProjSortBy] = useState('cagr');
  const [projSortDir, setProjSortDir] = useState('desc');
  const [projFilter, setProjFilter] = useState('all'); // district filter

  const rows = useMemo(() => {
    const perf = data?.distPerf || [];
    const sorted = [...perf].sort((a, b) => sortDir === 'desc' ? b[sortBy] - a[sortBy] : a[sortBy] - b[sortBy]);
    return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [data, sortBy, sortDir]);

  const projRows = useMemo(() => {
    let perf = data?.projPerf || [];
    if (projFilter !== 'all') perf = perf.filter(r => r.dist === projFilter);
    const sorted = [...perf].sort((a, b) => projSortDir === 'desc' ? b[projSortBy] - a[projSortBy] : a[projSortBy] - b[projSortBy]);
    return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [data, projSortBy, projSortDir, projFilter]);

  const handleSort = (key) => {
    if (!SORTABLE.includes(key)) return;
    if (sortBy === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(key); setSortDir('desc'); }
  };

  const handleProjSort = (key) => {
    if (!PROJ_SORTABLE.includes(key)) return;
    if (projSortBy === key) setProjSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setProjSortBy(key); setProjSortDir('desc'); }
  };

  if (!data?.distPerf?.length) return <Card><div style={{ color: T.textMute, textAlign: 'center', padding: 40 }}>No district performance data available</div></Card>;

  const cagrYrs = rows[0]?.window || 5;
  const sYear = rows[0]?.startYear || '';
  const eYear = rows[0]?.endYear || '';
  const top3Cagr = [...rows].sort((a, b) => b.cagr - a.cagr).slice(0, 3);
  const top3Abs = [...rows].sort((a, b) => b.absDiff - a.absDiff).slice(0, 3);
  const avgCagr = rows.length > 0 ? +(rows.reduce((s, r) => s + r.cagr, 0) / rows.length).toFixed(1) : 0;

  // Chart data: top 12 by current sort
  const chartData = rows.slice(0, 12).map(r => ({ ...r, name: `D${r.d}` }));
  const absChartData = [...rows].sort((a, b) => b.absDiff - a.absDiff).slice(0, 12).map(r => ({ ...r, name: `D${r.d}` }));

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <InsightBar items={[
        <span key="w">{cagrYrs}-year window: <span style={{ fontWeight: 700, fontFamily: T.mono }}>{sYear} → {eYear}</span></span>,
        <span key="c">Avg CAGR: <span style={{ color: avgCagr >= 0 ? T.green : T.red, fontWeight: 700, fontFamily: T.mono }}>{avgCagr > 0 ? '+' : ''}{avgCagr}%</span></span>,
        <span key="t">Top CAGR: <span style={{ color: T.green, fontWeight: 700 }}>{top3Cagr.map(r => `D${r.d}`).join(', ')}</span></span>,
        <span key="a">Top absolute: <span style={{ color: T.green, fontWeight: 700 }}>{top3Abs.map(r => `D${r.d} (${fmtDollar(r.absDiff)})`).join(', ')}</span></span>,
      ]} />

      {/* ── Visual Overview: CAGR + Absolute PSF side by side ── */}
      <SectionHeader icon="📈" title={`District ${cagrYrs}-Year Growth`} sub={`${sYear} → ${eYear}. Left = annualised CAGR (%). Right = absolute PSF gain/loss ($).`} />
      <div className="g2">
        <Card>
          <div style={{ color: T.textMute, fontSize: T.sm, fontWeight: 600, marginBottom: 8, letterSpacing: 0.5 }}>CAGR (%)</div>
          <div style={{ height: Math.max(280, chartData.length * 32) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={T.border} />
                <XAxis type="number" tick={{ fill: T.textSub, fontSize: T.sm, fontFamily: T.sans }} axisLine={false} tickFormatter={v => `${v}%`} />
                <YAxis dataKey="name" type="category" width={40} tick={{ fill: T.textMute, fontSize: T.md, fontFamily: T.mono }} axisLine={false} />
                <Tooltip content={<Tip fmt="%" />} />
                <ReferenceLine x={0} stroke={T.textFaint} />
                <Bar dataKey="cagr" name="CAGR %" radius={[0, 6, 6, 0]} barSize={20}>
                  {chartData.map((e, i) => <Cell key={i} fill={e.cagr >= 0 ? T.green : T.red} fillOpacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <div style={{ color: T.textMute, fontSize: T.sm, fontWeight: 600, marginBottom: 8, letterSpacing: 0.5 }}>Δ PSF ($)</div>
          <div style={{ height: Math.max(280, absChartData.length * 32) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={absChartData} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={T.border} />
                <XAxis type="number" tick={{ fill: T.textSub, fontSize: T.sm, fontFamily: T.sans }} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} />
                <YAxis dataKey="name" type="category" width={40} tick={{ fill: T.textMute, fontSize: T.md, fontFamily: T.mono }} axisLine={false} />
                <Tooltip content={<Tip pre="$" />} />
                <ReferenceLine x={0} stroke={T.textFaint} />
                <Bar dataKey="absDiff" name="Δ PSF ($)" radius={[0, 6, 6, 0]} barSize={20}>
                  {absChartData.map((e, i) => <Cell key={i} fill={e.absDiff >= 0 ? T.blue : T.red} fillOpacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* ── District Performance Table ── */}
      <SectionHeader icon="🏆" title="District Performance Table" sub={`All districts ranked by ${sortBy === 'cagr' ? 'CAGR' : sortBy}. Click column headers to sort. Click a row to filter projects below. ${sYear} → ${eYear} (${cagrYrs}yr).`} />
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 780 }}>
            <thead>
              <tr>
                {COL_DEFS.map(col => {
                  const sortable = SORTABLE.includes(col.key);
                  const active = sortBy === col.key;
                  return (
                    <th key={col.key}
                      onClick={() => sortable && handleSort(col.key)}
                      style={{
                        width: col.w, textAlign: col.align, cursor: sortable ? 'pointer' : 'default',
                        color: active ? T.purple : T.textMute, userSelect: 'none',
                        position: 'sticky', top: 0, background: T.card, zIndex: 1,
                        padding: '10px 8px',
                      }}>
                      {col.label === 'Start PSF' ? `${sYear} PSF` : col.label === 'End PSF' ? `${eYear} PSF` : col.label}
                      {active && <span style={{ marginLeft: 3, fontSize: T.xs }}>{sortDir === 'desc' ? '▼' : '▲'}</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.d}
                  onClick={() => setProjFilter(projFilter === row.d ? 'all' : row.d)}
                  style={{
                    opacity: row.lowConf ? 0.55 : 1, cursor: 'pointer',
                    background: projFilter === row.d ? '#a78bfa12' : undefined,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (projFilter !== row.d) e.currentTarget.style.background = '#f1f5f9'; }}
                  onMouseLeave={e => { if (projFilter !== row.d) e.currentTarget.style.background = ''; }}
                >
                  {COL_DEFS.map(col => {
                    const val = row[col.key];
                    const isMono = ['startPsf', 'endPsf', 'absDiff', 'pctChg', 'cagr', 'yield', 'totalReturn', 'txTotal'].includes(col.key);
                    const color = col.color ? col.color(val) : col.key === 'seg' ? SC[val] : col.key === 'rank' ? T.textMute : T.text;
                    return (
                      <td key={col.key} style={{
                        textAlign: col.align, fontFamily: isMono ? T.mono : T.sans,
                        fontWeight: ['cagr', 'totalReturn', 'absDiff'].includes(col.key) ? 700 : col.key === 'd' ? 600 : 400,
                        color: projFilter === row.d && col.key === 'd' ? T.purple : color,
                        fontSize: T.md, padding: '8px',
                        letterSpacing: isMono ? '-0.01em' : undefined,
                      }}>
                        {col.fmt ? col.fmt(val) : val}
                        {col.key === 'd' && projFilter === row.d && <span style={{ marginLeft: 4, fontSize: T.xs, color: T.purple }}>✓</span>}
                        {col.key === 'd' && row.lowConf && <span title="Low confidence: fewer than 3 transactions in start or end year" style={{ marginLeft: 4, fontSize: T.xs, color: T.amber }}>⚠️</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 16px', borderTop: `1px solid ${T.border}`, color: T.textMute, fontSize: T.sm }}>
          {rows.length} districts · Click a row to filter projects below
          {projFilter !== 'all' && <span style={{ color: T.purple, fontWeight: 600 }}> · Showing D{projFilter}</span>}
          {rows.filter(r => r.lowConf).length > 0 && <span style={{ color: T.amber }}> · ⚠️ Faded = {'<'}3 tx in start/end year</span>}
        </div>
      </Card>

      {/* ── Project Performance Table ── */}
      {(data?.projPerf?.length > 0) && <>
        <SectionHeader icon="🏠" title={projFilter !== 'all' ? `District ${projFilter} — Project Performance` : 'Project Performance Table'} sub={`${projFilter !== 'all' ? projRows.length : data?.projPerf?.length || 0} projects with transactions in both ${sYear} and ${eYear}. Min 5 total tx. Click headers to sort.`} />
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {/* District filter */}
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: T.textMute, fontSize: T.sm, fontWeight: 600 }}>FILTER BY DISTRICT:</span>
            <button onClick={() => setProjFilter('all')} style={{
              background: projFilter === 'all' ? T.purple : T.borderLt, color: projFilter === 'all' ? '#fff' : T.textSub,
              border: `1px solid ${projFilter === 'all' ? T.purple : T.border}`, borderRadius: 6, padding: '3px 10px',
              fontSize: T.sm, cursor: 'pointer', fontWeight: 600,
            }}>All</button>
            {[...new Set((data?.projPerf || []).map(r => r.dist))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(d => (
              <button key={d} onClick={() => setProjFilter(d)} style={{
                background: projFilter === d ? T.purple : T.borderLt, color: projFilter === d ? '#fff' : T.textSub,
                border: `1px solid ${projFilter === d ? T.purple : T.border}`, borderRadius: 6, padding: '3px 10px',
                fontSize: T.sm, cursor: 'pointer', fontWeight: 500, fontFamily: T.mono,
              }}>{d}</button>
            ))}
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 600 }}>
            <table style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  {PROJ_COLS.map(col => {
                    const sortable = PROJ_SORTABLE.includes(col.key);
                    const active = projSortBy === col.key;
                    return (
                      <th key={col.key}
                        onClick={() => sortable && handleProjSort(col.key)}
                        style={{
                          width: col.w, textAlign: col.align, cursor: sortable ? 'pointer' : 'default',
                          color: active ? T.purple : T.textMute, userSelect: 'none',
                          position: 'sticky', top: 0, background: T.card, zIndex: 1,
                          padding: '10px 8px',
                        }}>
                        {col.label === 'Start PSF' ? `${sYear} PSF` : col.label === 'End PSF' ? `${eYear} PSF` : col.label}
                        {active && <span style={{ marginLeft: 3, fontSize: T.xs }}>{projSortDir === 'desc' ? '▼' : '▲'}</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {projRows.length === 0 && (
                  <tr><td colSpan={PROJ_COLS.length} style={{ textAlign: 'center', padding: 32, color: T.textMute, fontSize: T.md }}>
                    No projects with sufficient data in District {projFilter}. <button onClick={() => setProjFilter('all')} style={{ background: 'none', border: 'none', color: T.purple, cursor: 'pointer', fontWeight: 600, fontSize: T.md, textDecoration: 'underline' }}>Show all</button>
                  </td></tr>
                )}
                {projRows.slice(0, 100).map(row => (
                  <tr key={row.name} style={{ opacity: row.lowConf ? 0.55 : 1 }}>
                    {PROJ_COLS.map(col => {
                      const val = row[col.key];
                      const isMono = ['startPsf', 'endPsf', 'absDiff', 'pctChg', 'cagr', 'yield', 'totalReturn', 'txTotal', 'dist'].includes(col.key);
                      const color = col.color ? col.color(val) : col.key === 'seg' ? SC[val] : col.key === 'rank' ? T.textMute : col.key === 'name' ? T.text : T.text;
                      return (
                        <td key={col.key} style={{
                          textAlign: col.align, fontFamily: isMono ? T.mono : T.sans,
                          fontWeight: ['cagr', 'totalReturn', 'absDiff'].includes(col.key) ? 700 : col.key === 'name' ? 600 : 400,
                          color, fontSize: col.key === 'name' ? T.sm : T.md, padding: '7px 8px',
                          letterSpacing: isMono ? '-0.01em' : undefined,
                          maxWidth: col.key === 'name' ? 180 : undefined,
                          overflow: col.key === 'name' ? 'hidden' : undefined,
                          textOverflow: col.key === 'name' ? 'ellipsis' : undefined,
                          whiteSpace: col.key === 'name' ? 'nowrap' : undefined,
                        }}>
                          {col.fmt ? col.fmt(val) : val}
                          {col.key === 'name' && row.lowConf && <span title="Low confidence: fewer than 2 transactions in start or end year" style={{ marginLeft: 4, fontSize: T.xs, color: T.amber }}>⚠️</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 16px', borderTop: `1px solid ${T.border}`, color: T.textMute, fontSize: T.sm }}>
            {projFilter !== 'all' ? `${projRows.length} projects in D${projFilter}` : `${projRows.length} projects`}
            {projRows.length > 100 && ` · Showing top 100`}
            {projRows.filter(r => r.lowConf).length > 0 && <span style={{ color: T.amber }}> · ⚠️ Faded = {'<'}2 tx in start/end year</span>}
            {' · '}Total = CAGR + Yield
          </div>
        </Card>
      </>}
    </div>
  );
}

PerformanceTab.propTypes = {
  data: PropTypes.shape({
    distPerf: PropTypes.array,
    projPerf: PropTypes.array,
  }),
};
