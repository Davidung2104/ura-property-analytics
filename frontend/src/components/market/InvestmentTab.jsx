import PropTypes from 'prop-types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend, ScatterChart, Scatter,
} from 'recharts';
import { SEG_COLORS as SC, T, yieldColor } from '../../constants';
import Tip from '../ui/Tip';
import { Card, SectionHeader, InsightBar, NoteText } from '../ui';

export default function InvestmentTab({ data }) {
  if (!data) return null;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <InsightBar items={[
        <span key="y">Best yield: <span style={{ color: T.green, fontWeight: 700 }}>{data.bestYield ? `${data.bestYield.d} at ${data.bestYield.y}%` : '—'}</span> — OCR outperforms CCR on income</span>,
        <span key="q">Avg yield: <span style={{ color: T.amber, fontWeight: 700 }}>{data.avgYield || '—'}%</span> across all districts</span>,
        <span key="s">Top 3 yield districts: <span style={{ color: T.amber, fontWeight: 700 }}>{(data.yd || []).slice(0, 3).map(d => d.d).join(', ') || '—'}</span></span>,
      ]} />

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

      <SectionHeader icon="💰" title="Gross Rental Yield by District" sub="Yield = (Monthly Rent PSF × 12) ÷ Sale PSF. Green ≥ 3%, yellow ≥ 2.5%, red < 2.5%." />
      <Card><div className="g2">
        <div style={{ height: Math.max(260, (data.yd || []).length * 34) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={data.yd || []} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={T.border} /><XAxis type="number" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => `${v}%`} domain={[0, 'auto']} /><YAxis dataKey="d" type="category" width={45} tick={{ fill: T.textMute, fontSize: T.md }} axisLine={false} /><Tooltip content={<Tip fmt="%" />} /><Bar dataKey="y" name="Yield %" radius={[0, 6, 6, 0]} barSize={18}>{(data.yd || []).map((e, i) => <Cell key={i} fill={yieldColor(e.y)} />)}</Bar></BarChart></ResponsiveContainer></div>
        <div style={{ overflowX: 'auto' }}><table><thead><tr>{['District', 'Seg', 'Rent PSF', 'Buy PSF', 'Yield'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{(data.yd || []).map(r => <tr key={r.d}><td style={{ color: T.text, fontWeight: 600, fontFamily: T.mono }}>{r.d}</td><td style={{ color: SC[r.seg], fontSize: T.md }}>{r.seg}</td><td style={{ color: T.amber, fontFamily: T.mono }}>${r.rp}/sf/mo</td><td style={{ color: T.blue, fontFamily: T.mono }}>${r.bp.toLocaleString()}/sf</td><td style={{ color: yieldColor(r.y), fontWeight: 700, fontFamily: T.mono }}>{r.y}%</td></tr>)}</tbody></table></div>
      </div></Card>
      <NoteText>OCR districts typically deliver the best yields due to stable rental demand and lower entry prices.</NoteText>

      <SectionHeader icon="⚖️" title="Buy Price vs Rent Collected" sub="The wider the gap between blue (cost) and green (income), the longer your payback period." />
      <Card><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={data.yd || []}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border} /><XAxis dataKey="d" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} /><YAxis yAxisId="l" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => '$' + v.toLocaleString()} /><YAxis yAxisId="r" orientation="right" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => `$${v}/sf/mo`} /><Tooltip content={<Tip />} /><Legend wrapperStyle={{ fontSize: T.md }} /><Bar yAxisId="l" dataKey="bp" name="Buy PSF ($)" fill={T.blue} radius={[4, 4, 0, 0]} barSize={14} /><Bar yAxisId="r" dataKey="rp" name="Rent PSF ($/sf/mo)" fill={T.teal} radius={[4, 4, 0, 0]} barSize={14} /></BarChart></ResponsiveContainer></div></Card>
    </div>
  );
}

InvestmentTab.propTypes = {
  data: PropTypes.shape({
    bestYield: PropTypes.object,
    avgYield: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    yd: PropTypes.array,
  }),
};
