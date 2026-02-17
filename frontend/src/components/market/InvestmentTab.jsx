import PropTypes from 'prop-types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Line, Cell, Legend, ComposedChart,
} from 'recharts';
import { COLORS as P, SEG_COLORS as SC, T, yieldColor } from '../../constants';
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

      <SectionHeader icon="💰" title="Gross Rental Yield by District" sub="Yield = (Monthly Rent PSF × 12) ÷ Sale PSF. Green ≥ 3%, yellow ≥ 2.5%, red < 2.5%." />
      <Card><div className="g2">
        <div style={{ height: Math.max(260, (data.yd || []).length * 34) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={data.yd || []} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={T.border} /><XAxis type="number" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => `${v}%`} domain={[0, 'auto']} /><YAxis dataKey="d" type="category" width={45} tick={{ fill: T.textMute, fontSize: T.md }} axisLine={false} /><Tooltip content={<Tip fmt="%" />} /><Bar dataKey="y" name="Yield %" radius={[0, 6, 6, 0]} barSize={18}>{(data.yd || []).map((e, i) => <Cell key={i} fill={yieldColor(e.y)} />)}</Bar></BarChart></ResponsiveContainer></div>
        <div style={{ overflowX: 'auto' }}><table><thead><tr>{['District', 'Seg', 'Rent PSF', 'Buy PSF', 'Yield'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{(data.yd || []).map(r => <tr key={r.d}><td style={{ color: T.text, fontWeight: 600, fontFamily: T.mono }}>{r.d}</td><td style={{ color: SC[r.seg], fontSize: T.md }}>{r.seg}</td><td style={{ color: T.amber, fontFamily: T.mono }}>${r.rp}/sf/mo</td><td style={{ color: T.blue, fontFamily: T.mono }}>${r.bp.toLocaleString()}/sf</td><td style={{ color: yieldColor(r.y), fontWeight: 700, fontFamily: T.mono }}>{r.y}%</td></tr>)}</tbody></table></div>
      </div></Card>
      <NoteText>OCR districts typically deliver the best yields due to stable rental demand and lower entry prices.</NoteText>

      <SectionHeader icon="⚖️" title="Buy Price vs Rent Collected" sub="The wider the gap between blue (cost) and green (income), the longer your payback period." />
      <Card><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={data.yd || []}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border} /><XAxis dataKey="d" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} /><YAxis yAxisId="l" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => '$' + v.toLocaleString()} /><YAxis yAxisId="r" orientation="right" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => `$${v}/sf/mo`} /><Tooltip content={<Tip />} /><Legend wrapperStyle={{ fontSize: T.md }} /><Bar yAxisId="l" dataKey="bp" name="Buy PSF ($)" fill={T.blue} radius={[4, 4, 0, 0]} barSize={14} /><Bar yAxisId="r" dataKey="rp" name="Rent PSF ($/sf/mo)" fill={T.teal} radius={[4, 4, 0, 0]} barSize={14} /></BarChart></ResponsiveContainer></div></Card>

      <SectionHeader icon="🛏️" title="Rent by Bedroom Type" sub="Smaller units produce higher rent PSF. For pure yield, compact units win." />
      <Card><div style={{ height: 250 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data.rBed || []}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border} /><XAxis dataKey="t" tick={{ fill: T.textSub, fontSize: T.md }} axisLine={false} /><YAxis yAxisId="l" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => '$' + v.toLocaleString()} /><YAxis yAxisId="r" orientation="right" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => '$' + v.toFixed(2)} /><Tooltip content={<Tip />} /><Legend wrapperStyle={{ fontSize: T.md }} /><Bar yAxisId="l" dataKey="v" name="Avg Rent/mo ($)" radius={[6, 6, 0, 0]} barSize={28}>{(data.rBed || []).map((_, i) => <Cell key={i} fill={P[i % P.length]} />)}</Bar><Line yAxisId="r" type="monotone" dataKey="psf" name="Rent PSF ($/sf/mo)" stroke={T.amber} strokeWidth={2} dot={{ r: 4, fill: T.amber }} /></ComposedChart></ResponsiveContainer></div></Card>
    </div>
  );
}

InvestmentTab.propTypes = {
  data: PropTypes.shape({
    bestYield: PropTypes.object,
    avgYield: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    yd: PropTypes.array,
    rBed: PropTypes.array,
  }),
};
