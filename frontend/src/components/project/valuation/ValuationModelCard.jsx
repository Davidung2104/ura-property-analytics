/**
 * ValuationModel.jsx — CMA valuation display
 * Extracted from ValuationTab lines 535–608
 */
import { T } from '../../../constants';
import { Card, SectionHeader, NoteText } from '../../ui';

export default function ValuationModel({ valuationModel, pArea, pFloor, projCagr }) {
  if (!valuationModel) return null;
  const vm = valuationModel;

  return <>
    <SectionHeader title="Valuation Model" sub={`Comparable Market Analysis — ${vm.totalTx} transactions scored by recency, size & floor similarity${projCagr != null ? `, time-adjusted at ${projCagr > 0 ? '+' : ''}${Number(projCagr).toFixed(1)}% CAGR` : ''}.`} />
    <Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) 1fr', gap: 12, marginBottom: 16 }}>
        {/* Estimated Value */}
        <div style={{ background: 'linear-gradient(135deg,#06b6d418,#8b5cf618)', borderRadius: T.rLg, padding: '18px 16px', border: '1px solid #06b6d426' }}>
          <div style={{ color: T.textMute, fontSize: T.sm, fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>ESTIMATED VALUE</div>
          <div style={{ color: T.text, fontSize: 32, fontWeight: 800, fontFamily: T.mono, lineHeight: 1 }}>${(vm.wAvgPsf * pArea).toLocaleString()}</div>
          <div style={{ color: T.textSub, fontSize: T.base, marginTop: 6 }}>${vm.wAvgPsf.toLocaleString()} PSF × {pArea.toLocaleString()} sqft{pFloor ? ` · Floor ${pFloor}` : ''}</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
            <div style={{ color: T.textMute, fontSize: T.sm }}>
              <span style={{ color: T.textSub, fontWeight: 600 }}>Range: </span>
              <span style={{ fontFamily: T.mono }}>${vm.lowPsf.toLocaleString()} — ${vm.highPsf.toLocaleString()} PSF</span>
            </div>
            <div style={{ color: T.textMute, fontSize: T.sm }}>
              <span style={{ color: T.textSub, fontWeight: 600 }}>±</span>
              <span style={{ fontFamily: T.mono }}> ${(vm.stdDev * pArea).toLocaleString()}</span>
            </div>
          </div>
        </div>
        {/* Confidence */}
        <div style={{ background: T.borderLt, borderRadius: T.rLg, padding: '18px 16px', border: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ color: T.textMute, fontSize: T.sm, fontWeight: 600, marginBottom: 8 }}>CONFIDENCE</div>
          <div style={{ fontSize: 40, fontWeight: 800, fontFamily: T.mono, color: vm.conf >= 70 ? T.green : vm.conf >= 40 ? T.amber : T.red }}>{vm.conf}</div>
          <div style={{ color: T.textMute, fontSize: T.sm, marginTop: 4 }}>/ 100</div>
          <div style={{ width: '80%', height: 6, background: T.border, borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
            <div style={{ width: `${vm.conf}%`, height: '100%', background: vm.conf >= 70 ? T.green : vm.conf >= 40 ? T.amber : T.red, borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>

      {/* Model Inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${vm.floorMatches != null ? 5 : 4}, 1fr)`, gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total Comparables', val: vm.totalTx, ic: '' },
          { label: 'Last 6 Months', val: vm.recent6mo, ic: '' },
          { label: 'Last 12 Months', val: vm.recent12mo, ic: '' },
          { label: 'Size Matches', val: `${vm.sizeMatches} (±50sf)`, ic: '' },
          ...(vm.floorMatches != null ? [{ label: 'Floor Matches', val: `${vm.floorMatches} (±4fl)`, ic: '' }] : []),
        ].map(s => <div key={s.label} style={{ background: T.borderLt, borderRadius: T.r, padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, marginBottom: 4 }}>{s.ic}</div>
          <div style={{ color: T.text, fontFamily: T.mono, fontWeight: 700, fontSize: T.lg }}>{s.val}</div>
          <div style={{ color: T.textMute, fontSize: T.xs }}>{s.label}</div>
        </div>)}
      </div>

      {/* Top Comparables */}
      <div style={{ color: T.textSub, fontSize: T.sm, fontWeight: 600, marginBottom: 8 }}>TOP COMPARABLES — highest similarity score</div>
      <table style={{ margin: 0 }}>
        <thead><tr>
          {['Sim', 'Date', 'Floor', 'Area', 'Raw PSF', 'Adj PSF', 'Price', 'Type'].map(h => <th key={h} style={{ fontSize: T.sm, padding: '5px 8px' }}>{h}</th>)}
        </tr></thead>
        <tbody>
          {vm.topComps.map((tx, i) => <tr key={i}>
            <td style={{ fontFamily: T.mono, fontSize: T.md }}>
              <div style={{ width: 36, height: 18, background: T.border, borderRadius: 9, overflow: 'hidden', display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }}>
                <div style={{ width: `${Math.round(tx.weight / vm.topComps[0].weight * 100)}%`, height: '100%', background: T.blue, borderRadius: 9 }} />
              </div>
              <span style={{ color: T.textSub }}>{(tx.weight / vm.topComps[0].weight * 100).toFixed(0)}</span>
            </td>
            <td style={{ color: T.textMute, fontSize: T.md, whiteSpace: 'nowrap' }}>{tx.date}</td>
            <td style={{ fontFamily: T.mono, fontSize: T.md }}>{tx.floorRange || '—'}</td>
            <td style={{ fontFamily: T.mono, fontSize: T.md }}>{tx.area.toLocaleString()} sf</td>
            <td style={{ color: T.textMute, fontFamily: T.mono, fontSize: T.md }}>${tx.psf.toLocaleString()}</td>
            <td style={{ color: T.blue, fontFamily: T.mono, fontWeight: 600, fontSize: T.md }}>${tx.adjPsf.toLocaleString()}</td>
            <td style={{ fontFamily: T.mono, fontSize: T.md }}>${tx.price.toLocaleString()}</td>
            <td style={{ color: T.textMute, fontSize: T.sm }}>{tx.saleType || '—'}</td>
          </tr>)}
        </tbody>
      </table>
      <NoteText>Model uses weighted Comparable Market Analysis. Each transaction scored by: recency (exponential decay, ~25mo half-life), size similarity (±150sf Gaussian), floor proximity (±8 floors Gaussian).{projCagr != null ? ` PSF adjusted forward to today using ${projCagr > 0 ? '+' : ''}${Number(projCagr).toFixed(1)}% project CAGR` : ''}{pFloor ? ' and floor premium differential' : ''}. Confidence based on recent comparable volume and size match density.</NoteText>
    </Card>
  </>;
}
