import PropTypes from 'prop-types';
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ComposedChart, Line,
} from 'recharts';
import { T } from '../../constants';
import Tip from '../ui/Tip';
import { Card, SectionHeader, InsightBar } from '../ui';

export default function ProjectOverview({ projInfo, projData }) {
  const p = projInfo;
  const psfLabel = p.psfPeriod === 'all' ? 'all-time' : p.psfPeriod || '';
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <InsightBar items={[
        <span key="p">Trading at <span style={{ color: T.blue, fontWeight: 700, fontFamily: T.mono }}>${p.avgPsf.toLocaleString()}</span> PSF {psfLabel && <span style={{ color: T.textMute, fontSize: T.sm }}>({psfLabel})</span>} {p.distAvg ? <> — <span style={{ color: p.avgPsf < p.distAvg ? T.green : T.red, fontWeight: 700 }}>{Math.abs(Math.round((1 - p.avgPsf / p.distAvg) * 100))}% {p.avgPsf < p.distAvg ? 'below' : 'above'}</span> district avg (${p.distAvg.toLocaleString()})</> : null}</span>,
        <span key="y">Yield <span style={{ color: T.green, fontWeight: 700, fontFamily: T.mono }}>{p.yield}%</span></span>,
        <span key="r">{p.tenure || '—'}</span>,
      ]} />

      <SectionHeader icon="📈" title="PSF Trend" sub="Quarterly average PSF trend for this project." />
      <Card><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={projData?.projPsfTrend || []}>
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

      <SectionHeader icon="💵" title="Rental Trend" sub={p.hasRealRental ? 'Average & median monthly rent from real URA rental contracts.' : 'Estimated quarterly rental trend based on sales data and market yields.'} />
      <Card><div style={{ height: 240 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={projData?.projRentTrend || []}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border} />
        <XAxis dataKey="q" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} />
        <YAxis tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => '$' + v.toLocaleString()} />
        <Tooltip content={<Tip />} /><Legend wrapperStyle={{ fontSize: T.md }} />
        <Bar dataKey="avg" name="Avg Rent" fill={T.emerald} radius={[4, 4, 0, 0]} barSize={18} opacity={0.4} legendType="none" />
        <Line type="monotone" dataKey="avg" name="Avg Rent" stroke={T.green} strokeWidth={2} dot={{ r: 3, fill: T.green }} />
        <Line type="monotone" dataKey="med" name="Med Rent" stroke={T.teal} strokeWidth={2} dot={{ r: 3, fill: T.teal }} strokeDasharray="5 5" />
      </ComposedChart></ResponsiveContainer></div></Card>
    </div>
  );
}

ProjectOverview.propTypes = {
  projInfo: PropTypes.shape({
    avgPsf: PropTypes.number.isRequired,
    psfPeriod: PropTypes.string,
    distAvg: PropTypes.number,
    yield: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    tenure: PropTypes.string,
    hasRealRental: PropTypes.bool,
  }).isRequired,
  projData: PropTypes.shape({
    projPsfTrend: PropTypes.array,
    projRentTrend: PropTypes.array,
  }),
};
