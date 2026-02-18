import { useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { COLORS as P, T, yieldColor, growthColor } from '../../constants';
import Tip from '../ui/Tip';
import { Card, SectionHeader, NoteText } from '../ui';

// Adjacent Singapore postal districts (factual boundary data)
const ADJACENT_DISTRICTS = {
  D1: ['D2','D4','D6','D7'], D2: ['D1','D3','D4','D7','D8'], D3: ['D2','D4','D5'],
  D4: ['D1','D2','D3','D5'], D5: ['D3','D4','D21'], D6: ['D1','D7','D8'],
  D7: ['D1','D2','D6','D8','D12'], D8: ['D2','D7','D11','D12'],
  D9: ['D1','D10','D11'], D10: ['D5','D9','D11','D21'],
  D11: ['D8','D9','D10','D12','D20'], D12: ['D7','D8','D11','D13','D20'],
  D13: ['D12','D14','D19'], D14: ['D13','D15','D16'],
  D15: ['D14','D16'], D16: ['D14','D15','D17'],
  D17: ['D16','D18'], D18: ['D17','D19'],
  D19: ['D13','D18','D20','D28'], D20: ['D11','D12','D19','D26','D27'],
  D21: ['D5','D10','D22','D23'], D22: ['D21','D23'],
  D23: ['D21','D22','D25'], D25: ['D23','D26','D27'],
  D26: ['D20','D25','D27'], D27: ['D20','D25','D26','D28'],
  D28: ['D19','D20','D27'],
};

export default function CompareTab({ proj, cmpPool, cmpSelected, setCmpSelected, mktData }) {
  const projEntry = cmpPool.find(p => p.name === proj);
  const projDist = projEntry?.dist || '';
  const projStreet = projEntry?.street || '';
  const adjDists = ADJACENT_DISTRICTS[projDist] || [];

  // Classify each pool project's relationship to the selected project
  const classify = (p) => {
    if (p.name === proj) return 'self';
    if (p.street && p.street === projStreet) return 'street';
    if (p.dist === projDist) return 'district';
    if (adjDists.includes(p.dist)) return 'adjacent';
    return 'other';
  };

  // ── Nearby project heatmap ──
  const nearbyHm = useMemo(() => {
    if (!mktData?.years || !cmpSelected.length) return { projects: [], years: [], data: {}, vol: {} };
    const years = (mktData.years || []).slice(-5);
    const data = {};
    const vol = {};
    cmpSelected.forEach(name => {
      const p = cmpPool.find(c => c.name === name);
      if (!p) return;
      years.forEach(y => {
        data[`${name}-${y}`] = p.yearPsf?.[y] || 0;
        vol[`${name}-${y}`] = p.yearPsf?.[y] ? 1 : 0;
      });
    });
    return { projects: cmpSelected, years, data, vol };
  }, [mktData, cmpSelected, cmpPool]);

  const sel = cmpSelected.map(n => cmpPool.find(p => p.name === n)).filter(Boolean);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* ── Project Selector ── */}
      <SectionHeader icon="⚖️" title="Comparative Market Analysis" sub={`Select up to 8 projects to compare. Auto-suggested: same street, district & adjacent areas.`} />
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ color: T.textSub, fontSize: T.md, fontWeight: 600 }}>SELECTED ({cmpSelected.length}/8)</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ color: T.textSub, fontSize: T.sm }}>Add:</span>
            <select value="" onChange={e => { if (e.target.value && cmpSelected.length < 8 && !cmpSelected.includes(e.target.value)) { setCmpSelected([...cmpSelected, e.target.value]); } e.target.value = ''; }} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 10px', fontSize: T.md, color: T.text, cursor: 'pointer', outline: 'none', minWidth: 220 }}>
              <option value="">+ Add project...</option>
              {cmpPool.filter(p => !cmpSelected.includes(p.name)).map(p => {
                const rel = classify(p);
                const tag = rel === 'street' ? '📍 Same St' : rel === 'district' ? '🏘️ Same Dist' : rel === 'adjacent' ? '↔️ Adjacent' : '';
                return <option key={p.name} value={p.name}>{p.name} ({p.dist}{tag ? ` · ${tag}` : ''})</option>;
              })}
            </select>
          </div>
        </div>
        {/* Selected chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {cmpSelected.map((name, i) => {
            const cmpP = cmpPool.find(p => p.name === name);
            const isSelf = name === proj;
            const rel = cmpP ? classify(cmpP) : 'other';
            const relLabel = rel === 'street' ? '📍 Same St' : rel === 'district' ? '🏘️ Same Dist' : rel === 'adjacent' ? '↔️ Adj Dist' : rel === 'self' ? '' : '';
            return <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, background: isSelf ? '#a78bfa12' : T.borderLt, border: isSelf ? '1px solid #a78bfa4D' : '1px solid #e2e8f0', borderRadius: T.r, padding: '6px 10px' }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: isSelf ? T.purple : P[i % P.length] }} />
              <div>
                <div style={{ fontSize: T.md, fontWeight: 600, color: isSelf ? T.purple : T.text }}>{name}</div>
                <div style={{ fontSize: T.xs, color: T.textMute }}>{cmpP?.dist || ''}{cmpP?.street ? ` · ${cmpP.street}` : ''}{relLabel ? ` · ${relLabel}` : ''}</div>
              </div>
              {!isSelf && <button onClick={() => setCmpSelected(cmpSelected.filter(n => n !== name))} style={{ background: 'none', border: 'none', color: T.textMute, cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}>×</button>}
            </div>;
          })}
        </div>
        {/* Preset buttons */}
        <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
          <button onClick={() => {
            // Same street + same district
            const sameStreet = projStreet ? cmpPool.filter(p => p.street === projStreet && p.name !== proj).slice(0, 3).map(p => p.name) : [];
            const sameDist = cmpPool.filter(p => p.dist === projDist && p.name !== proj && !sameStreet.includes(p.name)).slice(0, 4 - sameStreet.length).map(p => p.name);
            setCmpSelected([proj, ...sameStreet, ...sameDist].slice(0, 5));
          }} style={presetBtn}>🏘️ Same District</button>
          <button onClick={() => {
            // Adjacent districts
            const adj = cmpPool.filter(p => p.name !== proj && adjDists.includes(p.dist))
              .sort((a, b) => b.units - a.units).slice(0, 7).map(p => p.name);
            setCmpSelected([proj, ...adj].slice(0, 8));
          }} style={presetBtn}>↔️ Adjacent Districts</button>
          <button onClick={() => {
            // Same segment (CCR/RCR/OCR)
            const seg = projEntry?.segment || '';
            const sameSeg = cmpPool.filter(p => p.segment === seg && p.name !== proj)
              .sort((a, b) => b.units - a.units).slice(0, 7).map(p => p.name);
            setCmpSelected([proj, ...sameSeg].slice(0, 8));
          }} style={presetBtn}>🏷️ Same Segment</button>
        </div>
      </Card>

      {/* ── Charts — need ≥2 selected ── */}
      {sel.length >= 2 && <>
        <SectionHeader icon="📊" title="PSF Comparison" sub={`${sel[0].name} at $${sel[0].psf.toLocaleString()} PSF — ${sel[0].psf < sel[1].psf ? 'cheaper' : 'more expensive'} than ${sel[1].name}.`} />
        <Card><div style={{ height: Math.max(200, sel.length * 32) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={sel.map(p => ({ n: p.name, v: p.psf }))} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={T.border} /><XAxis type="number" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => '$' + v.toLocaleString()} /><YAxis dataKey="n" type="category" width={140} tick={{ fill: T.textSub, fontSize: T.xs }} axisLine={false} /><Tooltip content={<Tip />} /><Bar dataKey="v" name="Avg PSF" radius={[0, 4, 4, 0]} barSize={18}>{sel.map((p, i) => <Cell key={i} fill={p.name === proj ? T.purple : P[i % P.length]} />)}</Bar></BarChart></ResponsiveContainer></div></Card>

        <div className="g2">
          <Card><SectionHeader icon="💵" title="Rental Comparison" sub="Monthly rent across selected projects." /><div style={{ height: Math.max(200, sel.length * 28) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={sel.map(p => ({ n: p.name, v: p.rent }))} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={T.border} /><XAxis type="number" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => '$' + v.toLocaleString()} /><YAxis dataKey="n" type="category" width={120} tick={{ fill: T.textSub, fontSize: 8 }} axisLine={false} /><Tooltip content={<Tip />} /><Bar dataKey="v" name="Avg Rent/mo" radius={[0, 4, 4, 0]} barSize={16}>{sel.map((p, i) => <Cell key={i} fill={p.name === proj ? T.purple : P[i % P.length]} />)}</Bar></BarChart></ResponsiveContainer></div></Card>
          <Card><SectionHeader icon="💰" title="Yield Comparison" sub="Gross rental yield across selected projects." /><div style={{ height: Math.max(200, sel.length * 28) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={sel.map(p => ({ n: p.name, v: p.yield }))} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={T.border} /><XAxis type="number" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => `${v}%`} /><YAxis dataKey="n" type="category" width={120} tick={{ fill: T.textSub, fontSize: 8 }} axisLine={false} /><Tooltip content={<Tip fmt="%" />} /><Bar dataKey="v" name="Yield %" radius={[0, 4, 4, 0]} barSize={16}>{sel.map((p, i) => <Cell key={i} fill={p.name === proj ? T.purple : P[i % P.length]} />)}</Bar></BarChart></ResponsiveContainer></div></Card>
        </div>

        {/* Summary table */}
        <Card>
          <h4 style={{ color: T.text, fontSize: T.lg, fontWeight: 600, marginBottom: 12 }}>Side-by-Side Summary ({sel.length} projects)</h4>
          <div style={{ overflowX: 'auto' }}>
            <table><thead><tr>{['Project', 'District', 'Street', 'Age', 'Units', 'PSF', 'Rent/mo', 'Yield'].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{sel.map((r, i) => {
                const rel = classify(r);
                const relBadge = rel === 'street' ? '📍' : rel === 'district' ? '🏘️' : rel === 'adjacent' ? '↔️' : '';
                return <tr key={r.name}>
                  <td style={{ color: r.name === proj ? T.purple : T.text, fontWeight: r.name === proj ? 700 : 400 }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: r.name === proj ? T.purple : P[i % P.length] }} />{r.name}</div></td>
                  <td style={{ color: T.textMute }}>{r.dist}{relBadge ? ` ${relBadge}` : ''}</td>
                  <td style={{ color: T.textSub, fontSize: T.sm, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.street}>{r.street || '-'}</td>
                  <td style={{ color: T.textMute }}>{r.age}</td>
                  <td style={{ color: T.textSub, fontFamily: T.mono }}>{r.units?.toLocaleString()}</td>
                  <td style={{ color: T.blue, fontFamily: T.mono, fontWeight: 600 }}>${r.psf.toLocaleString()}</td>
                  <td style={{ color: T.teal, fontFamily: T.mono }}>${r.rent.toLocaleString()}</td>
                  <td style={{ color: yieldColor(r.yield), fontWeight: 700, fontFamily: T.mono }}>{r.yield}%</td>
                </tr>;
              })}</tbody></table>
          </div>
          <NoteText style={{ marginTop: 12 }}>📍 Same street · 🏘️ Same district · ↔️ Adjacent district. Compare PSF, yield, and rental metrics to identify value opportunities.</NoteText>
        </Card>
      </>}
      {sel.length < 2 && <Card><div style={{ textAlign: 'center', color: T.textMute, padding: 32 }}>Select at least 2 projects to compare</div></Card>}

      {/* ── Nearby PSF Heatmap ── */}
      <SectionHeader icon="🏘️" title="Nearby Project PSF Comparison" sub={`Project × Year PSF matrix for selected projects. Darker = higher PSF.`} />
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 600 }}>
            <div style={{ display: 'flex' }}>
              <div style={{ width: 130, flexShrink: 0, fontSize: T.sm, fontWeight: 600, color: T.textMute, padding: '8px 4px' }}>Project</div>
              {nearbyHm.years.map(y => <div key={y} style={{ flex: 1, minWidth: 72, textAlign: 'center', fontSize: T.sm, fontWeight: 600, color: T.textMute, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>{y}</div>)}
              <div style={{ width: 70, flexShrink: 0, textAlign: 'center', fontSize: T.sm, fontWeight: 600, color: T.text, padding: '8px 0', borderBottom: '1px solid #f1f5f9', background: T.bg, borderLeft: '1px solid #e2e8f0' }}>{nearbyHm.years.length > 1 ? `${nearbyHm.years.length - 1}yr Growth` : 'Growth'}</div>
            </div>
            {nearbyHm.projects.map((pName) => {
              const vals = nearbyHm.years.map(y => nearbyHm.data[`${pName}-${y}`] || 0);
              const firstIdx = vals.findIndex(v => v > 0);
              const lastIdx = vals.reduce((acc, v, i) => v > 0 ? i : acc, -1);
              const first = firstIdx >= 0 ? vals[firstIdx] : 0;
              const last = lastIdx >= 0 ? vals[lastIdx] : 0;
              const growth = first > 0 && last > 0 && lastIdx > firstIdx ? Math.round((last / first - 1) * 100) : 0;
              const isSelf = pName === proj;
              const allVals = Object.values(nearbyHm.data).filter(v => v > 0);
              const nearMin = allVals.length ? Math.min(...allVals) : 0;
              const nearMax = allVals.length ? Math.max(...allVals) : 1;
              return <div key={pName} style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', background: isSelf ? '#a78bfa12' : 'transparent' }} onMouseEnter={e => { if (!isSelf) e.currentTarget.style.background = T.borderLt; }} onMouseLeave={e => { if (!isSelf) e.currentTarget.style.background = isSelf ? '#a78bfa12' : 'transparent'; }}>
                <div style={{ width: 130, flexShrink: 0, fontSize: T.md, fontWeight: isSelf ? 700 : 500, color: isSelf ? T.purple : T.text, padding: '10px 4px', display: 'flex', alignItems: 'center', gap: 4 }}>{isSelf && <span style={{ fontSize: 8 }}>●</span>}{pName}</div>
                {nearbyHm.years.map(y => {
                  const psf = nearbyHm.data[`${pName}-${y}`];
                  const vol = nearbyHm.vol[`${pName}-${y}`];
                  if (!psf) return <div key={y} style={{ flex: 1, minWidth: 72, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textSub, fontSize: T.md }}>-</div>;
                  const ratio = (nearMax > nearMin) ? Math.max(0, Math.min(1, (psf - nearMin) / (nearMax - nearMin))) : 0.5;
                  const alpha = 0.08 + ratio * 0.6;
                  const hue = isSelf ? '167,139,250' : '14,165,233';
                  return <div key={y} style={{ flex: 1, minWidth: 72, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: T.md, fontFamily: T.mono, fontWeight: isSelf ? 600 : 500, backgroundColor: `rgba(${hue},${alpha})`, color: ratio > 0.55 ? T.text : T.textMute, transition: 'all 0.2s' }} title={`${pName}, ${y}: $${psf.toLocaleString()} PSF · ${vol} txns`}>${psf.toLocaleString()}</div>;
                })}
                <div style={{ width: 70, flexShrink: 0, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: T.md, fontFamily: T.mono, fontWeight: 700, color: growthColor(growth), background: T.bg, borderLeft: '1px solid #e2e8f0' }}>{growth > 0 ? '+' : ''}{growth}%</div>
              </div>;
            })}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 12, fontSize: T.sm, color: T.textSub }}>
              <span>Low</span>
              <div style={{ width: 80, height: 6, borderRadius: 3, background: 'linear-gradient(to right, rgba(14,165,233,0.08), rgba(14,165,233,0.68))' }} />
              <span>High PSF</span>
              <span style={{ marginLeft: 12 }}><span style={{ color: T.purple, fontSize: 8 }}>●</span> = selected project</span>
            </div>
          </div>
        </div>
        <NoteText style={{ marginTop: 12 }}>Compare PSF growth across projects. Growth % shows total change over the displayed period.</NoteText>
      </Card>
    </div>
  );
}

const presetBtn = { background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 12px', fontSize: T.sm, color: T.textSub, cursor: 'pointer' };

CompareTab.propTypes = {
  proj: PropTypes.string.isRequired,
  cmpPool: PropTypes.array.isRequired,
  cmpSelected: PropTypes.array.isRequired,
  setCmpSelected: PropTypes.func.isRequired,
  mktData: PropTypes.object,
};
