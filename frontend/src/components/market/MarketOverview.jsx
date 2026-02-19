import PropTypes from 'prop-types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { COLORS as P, SEG_COLORS as SC, T } from '../../constants';
import Tip from '../ui/Tip';
import { Card, SectionHeader, InsightBar } from '../ui';

export default function MarketOverview({ data }) {
  if (!data) return null;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <InsightBar items={[
        <span key="y">{data.cagrData?.[0]?.cagrYears || 5}-yr CAGR <span style={{ color: (data.avgCagr || 0) >= 0 ? T.lime : T.red, fontWeight: 700, fontFamily: T.mono }}>{(data.avgCagr || 0) > 0 ? '+' : ''}{data.avgCagr || 0}%</span> avg across all districts</span>,
        <span key="p">Avg gross yield: <span style={{ color: T.amber, fontWeight: 700, fontFamily: T.mono }}>{data.avgYield || 0}%</span>{data.hasRealRental ? ' (from real rental data)' : ' (estimated)'}</span>,
        <span key="r">Total annualised return (CAGR + yield): <span style={{ color: ((parseFloat(data.avgCagr) || 0) + (parseFloat(data.avgYield) || 0)) >= 0 ? T.green : T.red, fontWeight: 700, fontFamily: T.mono }}>~{((parseFloat(data.avgCagr) || 0) + (parseFloat(data.avgYield) || 0)).toFixed(1)}%</span></span>,
      ]} />

      {/* Sale vs Rent snapshots */}
      <div className="g2">
        <Card>
          <SectionHeader icon="🏷️" title="Sale Market Snapshot" sub="Key metrics at a glance — click Sales tab for deep dive" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <SnapBox label={`AVG PSF (${data.psfPeriod || data.latestYear || '—'})`} value={`$${data.avgPsf?.toLocaleString() || '—'}`} color={T.blue} sub={data.yoyPct != null ? `${data.yoyPct > 0 ? '+' : ''}${data.yoyPct}% YoY` : '—'} subColor={T.lime} />
            <SnapBox label="TRANSACTIONS" value={data.totalTx?.toLocaleString() || '—'} color={T.purple} sub={data.totalVolume ? `$${(data.totalVolume / 1e9).toFixed(1)}B volume` : '—'} />
            <SnapBox label={`MEDIAN PSF (${data.psfPeriod || data.latestYear || '—'})`} value={`$${data.medPsf?.toLocaleString() || '—'}`} color={T.indigo} sub="Right-skewed" />
            <SnapBox label={`${data.cagrData?.[0]?.cagrYears || 5}-YR CAGR`} value={`${(data.avgCagr || 0) > 0 ? '+' : ''}${data.avgCagr || 0}%`} color={(data.avgCagr || 0) >= 0 ? T.green : T.red} sub={`${data.distPerf?.[0]?.startYear || '—'}→${data.distPerf?.[0]?.endYear || data.latestYear || '—'}`} />
          </div>
        </Card>
        <Card>
          <SectionHeader icon="🏠" title="Rental Market Snapshot" sub="Key metrics at a glance — click Rental tab for deep dive" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <SnapBox label="AVG RENT" value={`$${data.avgRent?.toLocaleString() || '—'}`} color={T.teal} sub={data.hasRealRental ? 'Real data' : 'Estimated'} subColor={T.lime} />
            <SnapBox label="CONTRACTS" value={data.rentalTotal?.toLocaleString() || '—'} color={T.purple} sub="total" />
            <SnapBox label="MEDIAN RENT" value={`$${data.medRent?.toLocaleString() || '—'}`} color={T.emerald} sub="CCR outliers lift avg" />
            <SnapBox label="AVG RENT PSF" value={`$${data.avgRentPsf || '—'}`} color={T.amber} sub="$/sqft/month" />
          </div>
        </Card>
      </div>

      {/* Segments + Top projects */}
      <div className="g2">
        <Card><SectionHeader icon="📊" title="Market Segments" sub="Volume and PSF by segment." />
          <div style={{ height: 220, display: 'flex', gap: 16 }}><div style={{ flex: 1 }}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.sSeg || []} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={42} paddingAngle={3}>{(data.sSeg || []).map((e, i) => <Cell key={i} fill={SC[e.name]} />)}</Pie><Tooltip content={<Tip fmt="none" />} /></PieChart></ResponsiveContainer></div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>{(data.sSeg || []).map(x => <div key={x.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: SC[x.name] }} /><div><div style={{ color: T.text, fontSize: T.base, fontWeight: 600 }}>{x.name}</div><div style={{ color: T.textSub, fontSize: T.md }}>${x.val.toLocaleString()} psf · {x.count.toLocaleString()}</div></div></div>)}</div></div>
        </Card>
        <Card><SectionHeader icon="🏆" title="Most Active Projects" sub="High-volume projects — easier to buy and exit." />
          <div style={{ height: 220 }}><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={data.sTop || []}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={T.border} /><XAxis type="number" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} /><YAxis dataKey="n" type="category" width={160} tick={{ fill: T.textMute, fontSize: T.xs }} axisLine={false} /><Tooltip content={<Tip />} /><Bar dataKey="c" name="Transactions" radius={[0, 6, 6, 0]} barSize={14}>{(data.sTop || []).map((_, i) => <Cell key={i} fill={P[i % P.length]} />)}</Bar></BarChart></ResponsiveContainer></div>
        </Card>
      </div>
    </div>
  );
}

/** Snapshot metric box used in overview grid */
function SnapBox({ label, value, color, sub, subColor }) {
  return (
    <div style={{ background: T.borderLt, borderRadius: T.rLg, padding: 12, textAlign: 'center' }}>
      <div style={{ color: T.textSub, fontSize: T.sm, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ color, fontSize: 20, fontWeight: 700, fontFamily: T.mono, letterSpacing: '-0.01em' }}>{value}</div>
      <div style={{ color: subColor || T.textMute, fontSize: T.md, fontWeight: 500 }}>{sub}</div>
    </div>
  );
}
SnapBox.propTypes = { label: PropTypes.string, value: PropTypes.string, color: PropTypes.string, sub: PropTypes.string, subColor: PropTypes.string };

MarketOverview.propTypes = {
  data: PropTypes.object,
};
