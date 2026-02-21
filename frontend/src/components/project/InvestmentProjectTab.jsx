import { useState } from 'react';
import PropTypes from 'prop-types';
import { T, computeBucketCAGR, cagrColor, yieldColor, DEFAULT_YIELD } from '../../constants';
import { Card, SectionHeader, NoteText } from '../ui';
import { useProjectFilters } from './useProjectFilters';

export default function InvestmentProjectTab({ projInfo, projData, masterFilters = {} }) {
  const p = projInfo;
  const { filteredTxs, filteredFloorData } = useProjectFilters(projData, masterFilters);
  const [investorMode, setInvestorMode] = useState('overall');

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeader title="CAGR Analysis — Investor Mode" sub="Computed from this project's transaction history. Toggle views to analyse by size and floor." />
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 0, background: T.borderLt, borderRadius: T.r, padding: 2, border: '1px solid #e2e8f0' }}>
            {[{ id: 'overall', l: 'Overall' }, { id: 'size', l: 'By Size Type' }, { id: 'floor', l: 'By Floor Band' }].map(m =>
              <button key={m.id} onClick={() => setInvestorMode(m.id)} style={{ background: investorMode === m.id ? '#a78bfa26' : 'transparent', border: investorMode === m.id ? '1px solid #a78bfa4D' : '1px solid transparent', borderRadius: 6, padding: '6px 16px', fontSize: T.md, color: investorMode === m.id ? T.purple : T.textSub, cursor: 'pointer', fontWeight: 600 }}>{m.l}</button>
            )}
          </div>
          <div style={{ color: T.textSub, fontSize: T.sm, fontStyle: 'italic' }}>{(() => { const yrs = [...new Set((filteredTxs || []).map(t => t.year))].sort(); return yrs.length > 1 ? `Period: ${yrs[0]} → ${yrs[yrs.length - 1]} (${parseInt(yrs[yrs.length - 1]) - parseInt(yrs[0])} years) · ${(filteredTxs || []).length} transactions` : `${(filteredTxs || []).length} transactions`; })()}</div>
        </div>
        {(() => {
          let rows = [];
          if (investorMode === 'overall') {
            const r = computeBucketCAGR(filteredTxs || []);
            rows = [{ label: 'ALL UNITS', sub: 'All sizes · All floors', icon: '', ...r, yield: parseFloat(p.yield) || DEFAULT_YIELD }];
          } else if (investorMode === 'size') {
            rows = (projData?.projSizes || []).map(s => {
              const filtered = (filteredTxs || []).filter(tx => Math.abs(tx.size - s) < 50);
              const r = computeBucketCAGR(filtered);
              return { label: `${s.toLocaleString()} sqft`, sub: `${filtered.length} transactions`, icon: '', ...r, yield: parseFloat(p.yield) || DEFAULT_YIELD };
            });
          } else {
            rows = (projData?.floorRanges || []).map(f => {
              const filtered = (filteredTxs || []).filter(tx => tx.floor === f);
              const r = computeBucketCAGR(filtered);
              const floorData = filteredFloorData.floors.find(fl => fl.range === f);
              const floorYield = floorData && floorData.psf > 0 && p.rentPsf > 0 ? +((p.rentPsf * 12 / floorData.psf) * 100).toFixed(2) : (p.yield || DEFAULT_YIELD);
              return { label: `Floor ${f}`, sub: `${filtered.length} transactions`, icon: '', ...r, yield: floorYield };
            });
          }
          const colHeader = investorMode === 'overall' ? 'Bucket' : investorMode === 'size' ? 'Unit Size' : 'Floor Band';
          const yrs = [...new Set((filteredTxs || []).map(t => t.year))].sort();
          return <div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr>
                  {[colHeader, `${yrs[0] || 'Start'} Avg`, `${yrs[yrs.length - 1] || 'End'} Avg`, 'n (Start)', 'n (End)', 'CAGR', 'Yield', 'Total Return'].map(h => <th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>{rows.map((r, ri) => {
                  const totalReturn = r.cagr !== null ? (r.cagr + r.yield).toFixed(1) : null;
                  return <tr key={ri} style={{ opacity: r.lowConf ? 0.5 : 1 }}>
                    <td style={{ color: T.text, fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: T.lg }}>{r.icon}</span>
                        <div>
                          <div style={{ fontFamily: T.mono }}>{r.label}{r.lowConf && <span style={{ color: T.amber, marginLeft: 4 }} title={`Low confidence: start n=${r.startN}, end n=${r.endN}`}>*</span>}</div>
                          <div style={{ color: T.textSub, fontSize: T.xs, fontWeight: 400 }}>{r.sub}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ color: T.textMute, fontFamily: T.mono }}>{r.startAvg ? `$${r.startAvg.toLocaleString()}` : '—'}</td>
                    <td style={{ color: T.blue, fontFamily: T.mono, fontWeight: 600 }}>{r.endAvg ? `$${r.endAvg.toLocaleString()}` : '—'}</td>
                    <td style={{ color: r.startN < 3 ? T.amber : T.textSub, fontFamily: T.mono, fontSize: T.md }}>{r.startN}</td>
                    <td style={{ color: r.endN < 3 ? T.amber : T.textSub, fontFamily: T.mono, fontSize: T.md }}>{r.endN}</td>
                    <td style={{ color: r.cagr !== null ? cagrColor(r.cagr) : T.textSub, fontFamily: T.mono, fontWeight: 700, fontSize: 14 }}>{r.cagr !== null ? `${r.cagr >= 0 ? '+' : ''}${r.cagr.toFixed(1)}%` : '—'}</td>
                    <td style={{ color: yieldColor(r.yield), fontFamily: T.mono }}>{r.yield}%</td>
                    <td style={{ color: totalReturn && Number(totalReturn) < 0 ? T.red : T.purple, fontWeight: 700, fontFamily: T.mono, fontSize: T.xl }}>{totalReturn ? `${Number(totalReturn) >= 0 ? '+' : ''}${totalReturn}%` : '—'}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            {/* Sparklines */}
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: `repeat(${Math.min(rows.length, investorMode === 'overall' ? 1 : 5)},1fr)`, gap: 8 }}>
              {rows.slice(0, investorMode === 'overall' ? 1 : 10).map((r, ri) => <div key={ri} style={{ background: T.borderLt, borderRadius: T.r, padding: '10px 12px', opacity: r.lowConf ? 0.5 : 1 }}>
                <div style={{ color: T.textMute, fontSize: T.sm, fontWeight: 600, marginBottom: 6 }}>{r.label}</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 40 }}>
                  {r.annualAvg.map((a, ai) => {
                    if (!a.avg) return <div key={ai} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}><div style={{ height: 2, width: '100%', background: T.border, borderRadius: 1 }} /><div style={{ fontSize: 7, color: T.textSub }}>{a.year.slice(2)}</div></div>;
                    const allAvgs = r.annualAvg.filter(x => x.avg).map(x => x.avg);
                    const min = Math.min(...allAvgs); const max = Math.max(...allAvgs);
                    const h = max > min ? 4 + ((a.avg - min) / (max - min)) * 32 : 20;
                    return <div key={ai} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <div style={{ fontSize: 8, color: T.textMute, fontFamily: T.mono }}>{a.avg}</div>
                      <div style={{ height: h, width: '100%', background: ai === r.annualAvg.length - 1 ? T.purple : T.blue, borderRadius: 2, opacity: a.n < 3 ? 0.4 : 0.8 }} />
                      <div style={{ fontSize: 7, color: T.textSub }}>{a.year.slice(2)}</div>
                    </div>;
                  })}
                </div>
                {r.cagr !== null && <div style={{ textAlign: 'center', marginTop: 4, fontSize: T.md, fontWeight: 700, color: cagrColor(r.cagr), fontFamily: T.mono }}>CAGR {r.cagr >= 0 ? '+' : ''}{r.cagr.toFixed(1)}%</div>}
              </div>)}
            </div>
            {rows.some(r => r.lowConf) && <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, color: T.amber, fontSize: T.sm }}><span style={{ fontWeight: 700 }}>!</span><span>* Dimmed rows have fewer than 3 transactions in start or end year — CAGR may be unreliable</span></div>}
          </div>;
        })()}
        <NoteText style={{ marginTop: 12 }}>CAGR = (End PSF ÷ Start PSF)^(1/years) − 1. Total Return = CAGR + Gross Yield (simple additive).</NoteText>
      </Card>
    </div>
  );
}

InvestmentProjectTab.propTypes = {
  projInfo: PropTypes.object.isRequired,
  projData: PropTypes.object,
  masterFilters: PropTypes.object,
};
