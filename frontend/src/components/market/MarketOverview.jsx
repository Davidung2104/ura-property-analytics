import PropTypes from 'prop-types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, ScatterChart, Scatter,
} from 'recharts';
import { COLORS as P, SEG_COLORS as SC, T } from '../../constants';
import Tip from '../ui/Tip';
import { Card, SectionHeader, InsightBar } from '../ui';

export default function MarketOverview({ data }) {
  if (!data) return null;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <InsightBar items={[
        <span key="y">{data.years?.length || 0}-yr CAGR <span style={{ color: (data.avgCagr || 0) >= 0 ? T.lime : T.red, fontWeight: 700, fontFamily: T.mono }}>{(data.avgCagr || 0) > 0 ? '+' : ''}{data.avgCagr || 0}%</span> (PSF ${data.yoy?.[0]?.avg?.toLocaleString() || '—'}→${data.yoy?.[data.yoy.length - 1]?.avg?.toLocaleString() || '—'})</span>,
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
            <SnapBox label={`${data.years?.length || 0}-YR CAGR`} value={`${(data.avgCagr || 0) > 0 ? '+' : ''}${data.avgCagr || 0}%`} color={(data.avgCagr || 0) >= 0 ? T.green : T.red} sub={`${data.years?.[0] || '—'}→${data.latestYear || '—'}`} />
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

      {/* Investment Quadrant */}
      <SectionHeader icon="🎯" title="District Investment Quadrant" sub="X = Price CAGR (capital growth), Y = Gross Yield (income). Top-right = best total return." />
      <Card>
        <div style={{ height: 340 }}><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}><CartesianGrid strokeDasharray="3 3" stroke={T.border} /><XAxis type="number" dataKey="cagr" name="Price CAGR %" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => `${v}%`} domain={['auto', 'auto']} /><YAxis type="number" dataKey="y" name="Gross Yield %" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => `${v}%`} domain={['auto', 'auto']} /><Tooltip content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const d = payload[0].payload;
          return <div style={{ background: '#1e293bf0', padding: '10px 14px', borderRadius: T.r, border: '1px solid #cbd5e1' }}>
            <div style={{ color: T.border, fontWeight: 700, fontSize: T.lg }}>{d.d}</div>
            <div style={{ color: T.textMute, fontSize: T.md }}>{d.seg} · ${d.bp.toLocaleString()} PSF</div>
            <div style={{ color: T.blue, fontSize: T.base }}>CAGR: {d.cagr}%</div>
            <div style={{ color: T.teal, fontSize: T.base }}>Yield: {d.y}%</div>
            <div style={{ color: T.amber, fontSize: T.base, fontWeight: 600 }}>Total: {d.total}%</div>
          </div>;
        }} /><Legend wrapperStyle={{ fontSize: T.md }} />{['CCR', 'RCR', 'OCR'].map(seg => <Scatter key={seg} name={seg} data={(data.cagrData || []).filter(d => d.seg === seg)} fill={SC[seg]} fillOpacity={0.9}>{(data.cagrData || []).filter(d => d.seg === seg).map((d, i) => <Cell key={i} r={10} />)}</Scatter>)}</ScatterChart></ResponsiveContainer></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          {[
            { c: T.green, icon: '🏆', label: 'Top Right: BEST', desc: 'High growth + high yield' },
            { c: T.amber, icon: '💰', label: 'Top Left: INCOME', desc: 'High yield, slower growth' },
            { c: T.blue, icon: '📈', label: 'Bottom Right: GROWTH', desc: 'High CAGR, lower yield' },
            { c: T.red, icon: '⚠️', label: 'Bottom Left: AVOID', desc: 'Low on both axes' },
          ].map(q => <div key={q.label} style={{ background: `${q.c}10`, borderRadius: T.r, padding: '8px 12px', border: `1px solid ${q.c}30` }}><span style={{ color: q.c, fontSize: T.md, fontWeight: 600 }}>{q.icon} {q.label}</span><span style={{ color: T.textSub, fontSize: T.md }}> — {q.desc}</span></div>)}
        </div>
      </Card>

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
      <div style={{ color: T.textSub, fontSize: T.sm }}>{label}</div>
      <div style={{ color, fontSize: 20, fontWeight: 700, fontFamily: T.mono }}>{value}</div>
      <div style={{ color: subColor || T.textMute, fontSize: T.md }}>{sub}</div>
    </div>
  );
}
SnapBox.propTypes = { label: PropTypes.string, value: PropTypes.string, color: PropTypes.string, sub: PropTypes.string, subColor: PropTypes.string };

MarketOverview.propTypes = {
  data: PropTypes.object,
};
