import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { COLORS as P, T, yieldColor, growthColor, cagrColor } from '../../constants';
import Tip from '../ui/Tip';
import { Card, SectionHeader, NoteText } from '../ui';

export default function CompareTab({ proj, cmpPool, cmpSelected, setCmpSelected, mktData, nearbyProjects = [], selfYearPsf = {}, projList = [], projIndex = {} }) {
  // Build unified lookup: nearbyProjects (from backend, has yearPsf) + cmpPool (top 30)
  const allProjects = useMemo(() => {
    const map = {};
    // cmpPool first (has rent, yield, yearPsf for top 30)
    cmpPool.forEach(p => { map[p.name] = { ...p, rel: 'other' }; });
    // nearbyProjects override with accurate rel + yearPsf from backend
    nearbyProjects.forEach(p => {
      map[p.name] = { ...map[p.name], ...p, rent: map[p.name]?.rent || p.rent || 0 };
    });
    // Hydrate any selected project not yet in map from projIndex (search-added)
    cmpSelected.forEach(name => {
      if (!map[name] && projIndex[name]) {
        const pi = projIndex[name];
        map[name] = { name, dist: pi.dist, seg: pi.seg, psf: pi.psf || 0, n: pi.n || 0, yield: pi.yield || '0', street: pi.street || '', rent: 0, rel: 'other' };
      }
    });
    // Self: ensure selected project always has yearPsf
    if (map[proj]) {
      map[proj].rel = 'self';
      if (!map[proj].yearPsf || Object.keys(map[proj].yearPsf).length === 0) {
        map[proj].yearPsf = selfYearPsf;
      }
    } else {
      map[proj] = { name: proj, rel: 'self', yearPsf: selfYearPsf };
    }
    return map;
  }, [cmpPool, nearbyProjects, proj, selfYearPsf, cmpSelected, projIndex]);

  const projEntry = allProjects[proj] || cmpPool.find(p => p.name === proj);
  const projDist = projEntry?.dist || '';

  // Classify for display
  const classify = (name) => allProjects[name]?.rel || 'other';

  // ── Heatmap: uses yearPsf from nearbyProjects (backend) + cmpPool ──
  const nearbyHm = useMemo(() => {
    if (!mktData?.years || !cmpSelected.length) return { projects: [], years: [], data: {}, vol: {} };
    const years = (mktData.years || []).slice(-7);
    const data = {};
    const vol = {};
    cmpSelected.forEach(name => {
      const p = allProjects[name];
      if (!p?.yearPsf) return;
      years.forEach(y => {
        data[`${name}-${y}`] = p.yearPsf?.[y] || 0;
        vol[`${name}-${y}`] = p.yearPsf?.[y] ? 1 : 0;
      });
    });
    return { projects: cmpSelected, years, data, vol };
  }, [mktData, cmpSelected, allProjects]);

  // Selected project data for charts (need psf)
  const sel = cmpSelected.map(n => allProjects[n]).filter(p => p && p.psf > 0);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* ── Project Selector ── */}
      <SectionHeader icon="⚖️" title="Comparative Market Analysis" sub={`Select up to 8 projects to compare. Type to search across all ${projList.length.toLocaleString()} projects.`} />
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ color: T.textSub, fontSize: T.md, fontWeight: 600 }}>SELECTED ({cmpSelected.length}/8)</div>
          {cmpSelected.length < 8 && (
            <ProjectSearchAdd
              projList={projList}
              projIndex={projIndex}
              nearbyProjects={nearbyProjects}
              cmpPool={cmpPool}
              exclude={new Set([...cmpSelected, proj])}
              onSelect={(name) => { if (cmpSelected.length < 8 && !cmpSelected.includes(name)) setCmpSelected([...cmpSelected, name]); }}
            />
          )}
        </div>
        {/* Selected chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {cmpSelected.map((name, i) => {
            const cmpP = allProjects[name];
            const isSelf = name === proj;
            const rel = classify(name);
            const relLabel = rel === 'street' ? '📍 Same St' : rel === 'district' ? '🏘️ Same Dist' : '';
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
            const street = nearbyProjects.filter(p => p.rel === 'street').slice(0, 4).map(p => p.name);
            const dist = nearbyProjects.filter(p => p.rel === 'district' && !street.includes(p.name)).slice(0, 3).map(p => p.name);
            setCmpSelected([proj, ...street, ...dist].slice(0, 6));
          }} style={presetBtn}>📍 Nearby</button>
          <button onClick={() => {
            const distProjs = nearbyProjects.filter(p => p.dist === projDist).slice(0, 7).map(p => p.name);
            setCmpSelected([proj, ...distProjs].slice(0, 8));
          }} style={presetBtn}>🏘️ Same District</button>
          <button onClick={() => {
            const seg = projEntry?.seg || projEntry?.segment || '';
            const sameSeg = cmpPool.filter(p => (p.segment || p.seg) === seg && p.name !== proj)
              .sort((a, b) => (b.units || b.n || 0) - (a.units || a.n || 0)).slice(0, 7).map(p => p.name);
            setCmpSelected([proj, ...sameSeg].slice(0, 8));
          }} style={presetBtn}>🏷️ Same Segment</button>
        </div>
      </Card>

      {/* ── Charts — need ≥2 selected ── */}
      {sel.length >= 2 && <>
        <SectionHeader icon="📊" title="PSF Comparison" sub={`${sel[0].name} at $${sel[0].psf.toLocaleString()} PSF — ${sel[0].psf < sel[1].psf ? 'cheaper' : 'more expensive'} than ${sel[1].name}.`} />
        <Card><div style={{ height: Math.max(200, sel.length * 32) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={sel.map(p => ({ n: p.name, v: p.psf }))} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={T.border} /><XAxis type="number" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => '$' + v.toLocaleString()} /><YAxis dataKey="n" type="category" width={140} tick={{ fill: T.textSub, fontSize: T.xs }} axisLine={false} /><Tooltip content={<Tip />} /><Bar dataKey="v" name="Avg PSF" radius={[0, 4, 4, 0]} barSize={18}>{sel.map((p, i) => <Cell key={i} fill={p.name === proj ? T.purple : P[i % P.length]} />)}</Bar></BarChart></ResponsiveContainer></div></Card>

        <div className="g2">
          <Card><SectionHeader icon="💵" title="Rental Comparison" sub="Monthly rent across selected projects." /><div style={{ height: Math.max(200, sel.length * 28) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={sel.filter(p => p.rent > 0).map(p => ({ n: p.name, v: p.rent }))} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={T.border} /><XAxis type="number" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => '$' + v.toLocaleString()} /><YAxis dataKey="n" type="category" width={120} tick={{ fill: T.textSub, fontSize: 8 }} axisLine={false} /><Tooltip content={<Tip />} /><Bar dataKey="v" name="Avg Rent/mo" radius={[0, 4, 4, 0]} barSize={16}>{sel.filter(p => p.rent > 0).map((p, i) => <Cell key={i} fill={p.name === proj ? T.purple : P[i % P.length]} />)}</Bar></BarChart></ResponsiveContainer></div></Card>
          <Card><SectionHeader icon="💰" title="Yield Comparison" sub="Gross rental yield across selected projects." /><div style={{ height: Math.max(200, sel.length * 28) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={sel.map(p => ({ n: p.name, v: parseFloat(p.yield) || 0 }))} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={T.border} /><XAxis type="number" tick={{ fill: T.textSub, fontSize: T.sm }} axisLine={false} tickFormatter={v => `${v}%`} /><YAxis dataKey="n" type="category" width={120} tick={{ fill: T.textSub, fontSize: 8 }} axisLine={false} /><Tooltip content={<Tip fmt="%" />} /><Bar dataKey="v" name="Yield %" radius={[0, 4, 4, 0]} barSize={16}>{sel.map((p, i) => <Cell key={i} fill={p.name === proj ? T.purple : P[i % P.length]} />)}</Bar></BarChart></ResponsiveContainer></div></Card>
        </div>

        {/* Summary table */}
        <Card>
          <h4 style={{ color: T.text, fontSize: T.lg, fontWeight: 600, marginBottom: 12 }}>Side-by-Side Summary ({sel.length} projects)</h4>
          <div style={{ overflowX: 'auto' }}>
            <table><thead><tr>{['Project', 'District', 'Street', 'Txns', 'PSF', 'Yield'].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{sel.map((r, i) => {
                const rel = classify(r.name);
                const relBadge = rel === 'street' ? '📍' : rel === 'district' ? '🏘️' : '';
                return <tr key={r.name}>
                  <td style={{ color: r.name === proj ? T.purple : T.text, fontWeight: r.name === proj ? 700 : 400 }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: r.name === proj ? T.purple : P[i % P.length] }} />{r.name}</div></td>
                  <td style={{ color: T.textMute }}>{r.dist}{relBadge ? ` ${relBadge}` : ''}</td>
                  <td style={{ color: T.textSub, fontSize: T.sm, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.street}>{r.street || '-'}</td>
                  <td style={{ color: T.textSub, fontFamily: T.mono }}>{(r.units || r.n || 0).toLocaleString()}</td>
                  <td style={{ color: T.blue, fontFamily: T.mono, fontWeight: 600 }}>${r.psf.toLocaleString()}</td>
                  <td style={{ color: yieldColor(parseFloat(r.yield) || 0), fontWeight: 700, fontFamily: T.mono }}>{r.yield}%</td>
                </tr>;
              })}</tbody></table>
          </div>
          <NoteText style={{ marginTop: 12 }}>📍 Same street · 🏘️ Same district. Projects matched using URA transaction street data.</NoteText>
        </Card>
      </>}
      {sel.length < 2 && <Card><div style={{ textAlign: 'center', color: T.textMute, padding: 32 }}>Select at least 2 projects to compare</div></Card>}

      {/* ── Nearby PSF Heatmap ── */}
      <SectionHeader icon="🏘️" title="Nearby Project PSF Comparison" sub={`Project × Year PSF matrix. Darker = higher PSF. Based on URA street data.`} />
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 600 }}>
            <div style={{ display: 'flex' }}>
              <div style={{ width: 130, flexShrink: 0, fontSize: T.sm, fontWeight: 600, color: T.textMute, padding: '8px 4px' }}>Project</div>
              {nearbyHm.years.map(y => <div key={y} style={{ flex: 1, minWidth: 64, textAlign: 'center', fontSize: T.sm, fontWeight: 600, color: T.textMute, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>{y}</div>)}
              <div style={{ width: 72, flexShrink: 0, textAlign: 'center', fontSize: T.sm, fontWeight: 600, color: T.text, padding: '8px 0', borderBottom: '1px solid #f1f5f9', background: T.bg, borderLeft: '1px solid #e2e8f0' }}>Growth</div>
              <div style={{ width: 72, flexShrink: 0, textAlign: 'center', fontSize: T.sm, fontWeight: 600, color: T.text, padding: '8px 0', borderBottom: '1px solid #f1f5f9', background: T.bg, borderLeft: '1px solid #f1f5f9' }}>CAGR</div>
            </div>
            {nearbyHm.projects.map((pName) => {
              const vals = nearbyHm.years.map(y => nearbyHm.data[`${pName}-${y}`] || 0);
              const firstIdx = vals.findIndex(v => v > 0);
              const lastIdx = vals.reduce((acc, v, i) => v > 0 ? i : acc, -1);
              const first = firstIdx >= 0 ? vals[firstIdx] : 0;
              const last = lastIdx >= 0 ? vals[lastIdx] : 0;
              const spanYears = lastIdx > firstIdx ? lastIdx - firstIdx : 0;
              const totalGrowth = first > 0 && last > 0 && spanYears > 0 ? Math.round((last / first - 1) * 100) : 0;
              const cagr = first > 0 && last > 0 && spanYears > 0 ? +((Math.pow(last / first, 1 / spanYears) - 1) * 100).toFixed(1) : 0;
              const isSelf = pName === proj;
              const allVals = Object.values(nearbyHm.data).filter(v => v > 0);
              const nearMin = allVals.length ? Math.min(...allVals) : 0;
              const nearMax = allVals.length ? Math.max(...allVals) : 1;
              return <div key={pName} style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', background: isSelf ? '#a78bfa12' : 'transparent' }} onMouseEnter={e => { if (!isSelf) e.currentTarget.style.background = T.borderLt; }} onMouseLeave={e => { if (!isSelf) e.currentTarget.style.background = isSelf ? '#a78bfa12' : 'transparent'; }}>
                <div style={{ width: 130, flexShrink: 0, fontSize: T.md, fontWeight: isSelf ? 700 : 500, color: isSelf ? T.purple : T.text, padding: '10px 4px', display: 'flex', alignItems: 'center', gap: 4 }}>{isSelf && <span style={{ fontSize: 8 }}>●</span>}{pName}</div>
                {nearbyHm.years.map(y => {
                  const psf = nearbyHm.data[`${pName}-${y}`];
                  if (!psf) return <div key={y} style={{ flex: 1, minWidth: 64, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textSub, fontSize: T.md }}>-</div>;
                  const ratio = (nearMax > nearMin) ? Math.max(0, Math.min(1, (psf - nearMin) / (nearMax - nearMin))) : 0.5;
                  const alpha = 0.08 + ratio * 0.6;
                  const hue = isSelf ? '167,139,250' : '14,165,233';
                  return <div key={y} style={{ flex: 1, minWidth: 64, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: T.md, fontFamily: T.mono, fontWeight: isSelf ? 600 : 500, backgroundColor: `rgba(${hue},${alpha})`, color: ratio > 0.55 ? T.text : T.textMute, transition: 'all 0.2s' }} title={`${pName}, ${y}: $${psf.toLocaleString()} PSF`}>${psf.toLocaleString()}</div>;
                })}
                <div style={{ width: 72, flexShrink: 0, height: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: T.mono, background: T.bg, borderLeft: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: T.md, fontWeight: 700, color: growthColor(totalGrowth) }}>{totalGrowth > 0 ? '+' : ''}{totalGrowth}%</span>
                  {spanYears > 0 && <span style={{ fontSize: 9, color: T.textMute, fontWeight: 400 }}>{spanYears}yr</span>}
                </div>
                <div style={{ width: 72, flexShrink: 0, height: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: T.mono, background: T.bg, borderLeft: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: T.md, fontWeight: 700, color: cagrColor(cagr) }}>{cagr > 0 ? '+' : ''}{cagr}%</span>
                  <span style={{ fontSize: 9, color: T.textMute, fontWeight: 400 }}>p.a.</span>
                </div>
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
        <NoteText style={{ marginTop: 12 }}>Growth = total change from first to last year with data. CAGR = annualised compound growth rate over the same span.</NoteText>
      </Card>
    </div>
  );
}

// ── Type-to-search project adder ──
function ProjectSearchAdd({ projList, projIndex, nearbyProjects, cmpPool, exclude, onSelect }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const inputRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Build categorised + filtered results
  const results = useMemo(() => {
    const q = query.trim().toUpperCase();
    const nearbySet = new Set((nearbyProjects || []).map(p => p.name));
    const cmpSet = new Set((cmpPool || []).map(p => p.name));

    // Candidate list: ALL projects from projList, minus excluded
    const candidates = projList.filter(name => !exclude.has(name));

    // Filter by query
    const filtered = q.length > 0
      ? candidates.filter(name => name.toUpperCase().includes(q))
      : candidates;

    // Categorise: nearby first, then cmpPool, then rest
    const nearby = [];
    const popular = [];
    const rest = [];
    filtered.forEach(name => {
      if (nearbySet.has(name)) nearby.push(name);
      else if (cmpSet.has(name)) popular.push(name);
      else rest.push(name);
    });

    // Cap results for performance
    return {
      nearby: nearby.slice(0, 10),
      popular: popular.slice(0, 10),
      rest: rest.slice(0, q.length >= 2 ? 30 : 10),
      total: nearby.length + popular.length + rest.length,
    };
  }, [query, projList, projIndex, nearbyProjects, cmpPool, exclude]);

  const handleSelect = useCallback((name) => {
    onSelect(name);
    setQuery('');
    setOpen(false);
  }, [onSelect]);

  const renderItem = (name) => {
    const meta = projIndex[name];
    const nearbyP = (nearbyProjects || []).find(p => p.name === name);
    const relLabel = nearbyP?.rel === 'street' ? '📍 St' : nearbyP?.rel === 'district' ? '🏘️ Dist' : '';
    return (
      <div key={name}
        onClick={() => handleSelect(name)}
        onMouseEnter={e => e.currentTarget.style.background = T.borderLt}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        style={{ padding: '7px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderBottom: `1px solid ${T.borderLt}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: T.md, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {relLabel && <span style={{ fontSize: T.xs, color: T.purple, fontWeight: 600 }}>{relLabel}</span>}
          {meta?.dist && <span style={{ fontSize: T.xs, color: T.textMute, fontFamily: T.mono }}>{meta.dist}</span>}
          {meta?.seg && <span style={{ fontSize: T.xs, color: meta.seg === 'CCR' ? T.red : meta.seg === 'OCR' ? T.green : T.amber }}>{meta.seg}</span>}
          {meta?.psf > 0 && <span style={{ fontSize: T.xs, color: T.blue, fontFamily: T.mono }}>${meta.psf.toLocaleString()}</span>}
        </div>
      </div>
    );
  };

  const hasResults = results.nearby.length + results.popular.length + results.rest.length > 0;

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 300 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: `1px solid ${open ? T.sky : '#cbd5e1'}`, borderRadius: 6, padding: '0 10px', transition: 'border-color 0.15s' }}>
        <span style={{ color: T.textMute, fontSize: T.base }}>🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search project to add..."
          style={{ border: 'none', outline: 'none', padding: '7px 0', fontSize: T.md, color: T.text, background: 'transparent', flex: 1, fontFamily: T.sans, minWidth: 0 }}
        />
        {query && <button onClick={() => { setQuery(''); inputRef.current?.focus(); }} style={{ background: 'none', border: 'none', color: T.textMute, cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}>✕</button>}
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: '#fff', border: `1px solid ${T.border}`, borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100,
          maxHeight: 360, overflowY: 'auto',
        }}>
          {!hasResults && (
            <div style={{ padding: '20px 16px', textAlign: 'center', color: T.textMute, fontSize: T.md }}>
              {query.length > 0 ? `No projects matching "${query}"` : 'Start typing to search...'}
            </div>
          )}
          {results.nearby.length > 0 && <>
            <div style={{ padding: '8px 12px 4px', fontSize: T.xs, fontWeight: 700, color: T.purple, letterSpacing: 0.5, textTransform: 'uppercase' }}>📍 Nearby (same street & district)</div>
            {results.nearby.map(renderItem)}
          </>}
          {results.popular.length > 0 && <>
            <div style={{ padding: '8px 12px 4px', fontSize: T.xs, fontWeight: 700, color: T.textMute, letterSpacing: 0.5, textTransform: 'uppercase' }}>🏠 Popular projects</div>
            {results.popular.map(renderItem)}
          </>}
          {results.rest.length > 0 && <>
            <div style={{ padding: '8px 12px 4px', fontSize: T.xs, fontWeight: 700, color: T.textMute, letterSpacing: 0.5, textTransform: 'uppercase' }}>All projects</div>
            {results.rest.map(renderItem)}
          </>}
          {results.total > (results.nearby.length + results.popular.length + results.rest.length) && (
            <div style={{ padding: '8px 12px', textAlign: 'center', color: T.textMute, fontSize: T.sm, borderTop: `1px solid ${T.borderLt}` }}>
              {results.total - results.nearby.length - results.popular.length - results.rest.length} more — type to narrow
            </div>
          )}
        </div>
      )}
    </div>
  );
}

ProjectSearchAdd.propTypes = {
  projList: PropTypes.array.isRequired,
  projIndex: PropTypes.object.isRequired,
  nearbyProjects: PropTypes.array,
  cmpPool: PropTypes.array,
  exclude: PropTypes.instanceOf(Set),
  onSelect: PropTypes.func.isRequired,
};

const presetBtn = { background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 12px', fontSize: T.sm, color: T.textSub, cursor: 'pointer' };

CompareTab.propTypes = {
  proj: PropTypes.string.isRequired,
  cmpPool: PropTypes.array.isRequired,
  cmpSelected: PropTypes.array.isRequired,
  setCmpSelected: PropTypes.func.isRequired,
  mktData: PropTypes.object,
  nearbyProjects: PropTypes.array,
  selfYearPsf: PropTypes.object,
  projList: PropTypes.array,
  projIndex: PropTypes.object,
};
