/**
 * FloorPremium.jsx — Floor premium analysis chart
 * Extracted from ValuationTab lines 786–836
 */
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Line, Cell, Legend, ComposedChart,
} from 'recharts';
import { T } from '../../../constants';
import { Card, SectionHeader, NoteText } from '../../ui';

export default function FloorPremium({ projData, filteredFloorData, hasFilters }) {
  return <>
    <SectionHeader icon="🏗️" title="Floor Premium Analysis" sub={`Average PSF by floor band${hasFilters ? ' (filtered)' : projData?.floorPeriod === '12M' ? ' (last 12 months)' : ' (all time — limited recent data)'}.`} />
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
            <div style={{ color: d.thin ? T.amber : T.textMute, fontSize: T.md }}>{d.count} transaction{d.count !== 1 ? 's' : ''}{d.thin ? ' ⚠️' : ''}</div>
          </div>;
        }} />
        <Legend wrapperStyle={{ fontSize: T.md }} />
        <Bar yAxisId="l" dataKey="psf" name="Avg PSF" radius={[4, 4, 0, 0]} barSize={20}>{filteredFloorData.floors.map((f, i) => <Cell key={i} fill={f.thin ? T.textMute : T.sky} fillOpacity={f.thin ? 0.5 : 1} />)}</Bar>
        <Line yAxisId="r" type="monotone" dataKey="premium" name="Premium %" stroke={T.amber} strokeWidth={2.5} dot={{ r: 4, fill: T.amber }} />
      </ComposedChart></ResponsiveContainer></div>
      {filteredFloorData.thinBands.length > 0 && <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, color: T.amber, fontSize: T.md }}><span>⚠️</span><span>Floor{filteredFloorData.thinBands.length > 1 ? 's' : ''} {filteredFloorData.thinBands.join(', ')} — fewer than 3 transactions, treat with caution</span></div>}
      {filteredFloorData.baselineSource === 'project_avg' && <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, color: T.textMute, fontSize: T.sm }}><span>ℹ️</span><span>Premiums shown vs project average (insufficient low-floor data for standard baseline)</span></div>}
    </Card>
    <NoteText>Higher floors command a premium — the gap reflects unobstructed views and reduced noise.{!hasFilters && projData?.floorPeriod === 'all' ? ' Data uses all-time transactions due to limited recent sales.' : ''}</NoteText>
  </>;
}
