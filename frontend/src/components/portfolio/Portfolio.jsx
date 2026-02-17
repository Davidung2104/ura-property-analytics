import { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { T, computeCAGR, yieldColor, cagrColor } from '../../constants';
import { Card, SectionHeader, InsightBar, NoteText } from '../ui';

export default function Portfolio({ cmpPool, projList, onViewProject, holdings, setHoldings, syncStatus }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);

  // Form
  const [fProj, setFProj] = useState('');
  const [fSize, setFSize] = useState('');
  const [fFloor, setFFloor] = useState('');
  const [fPsf, setFPsf] = useState('');
  const [fYear, setFYear] = useState(new Date().getFullYear());
  const [fLabel, setFLabel] = useState('');

  // Enrich with live market data
  const enriched = useMemo(() => holdings.map(h => {
    const m = cmpPool.find(p => p.name === h.project);
    const cp = m?.psf || 0;
    const pv = h.psf * h.size;
    const cv = cp * h.size;
    const gl = cv - pv;
    const glPct = pv > 0 ? gl / pv * 100 : 0;
    // yield on cost: current annual rent psf / purchase psf
    const annualRentPsf = m ? (m.yield / 100) * m.psf : 0;
    const yoc = h.psf > 0 && annualRentPsf > 0 ? (annualRentPsf / h.psf * 100) : 0;
    const annualRent = annualRentPsf * h.size;
    const yrs = new Date().getFullYear() - h.year;
    const cagr = yrs > 0 && cp > 0 && h.psf > 0 ? computeCAGR(h.psf, cp, yrs) : null;
    const totalReturn = cagr !== null ? cagr + yoc : null;
    return { ...h, m, cp, pv, cv, gl, glPct, yoc, cagr, annualRent, totalReturn, yrs, found: !!m };
  }), [holdings, cmpPool]);

  // Totals
  const totals = useMemo(() => {
    if (!enriched.length) return null;
    const tv = enriched.reduce((s, h) => s + h.cv, 0);
    const tp = enriched.reduce((s, h) => s + h.pv, 0);
    const tr = enriched.reduce((s, h) => s + h.annualRent, 0);
    const gl = tv - tp;
    return {
      value: tv, purchase: tp, gain: gl,
      gainPct: tp > 0 ? gl / tp * 100 : 0,
      rent: tr,
      yoc: tp > 0 ? tr / tp * 100 : 0,
    };
  }, [enriched]);

  const resetForm = () => { setFProj(''); setFSize(''); setFFloor(''); setFPsf(''); setFYear(new Date().getFullYear()); setFLabel(''); };

  const addHolding = () => {
    if (!fProj || !fSize || !fPsf) return;
    if (editId) {
      setHoldings(holdings.map(h => h.id === editId ? { ...h, project: fProj, size: +fSize, floor: fFloor, psf: +fPsf, year: +fYear, label: fLabel } : h));
      setEditId(null);
    } else {
      setHoldings([...holdings, { id: Date.now(), project: fProj, size: +fSize, floor: fFloor, psf: +fPsf, year: +fYear, label: fLabel }]);
    }
    resetForm(); setShowAdd(false);
  };

  const startEdit = (h) => {
    setFProj(h.project); setFSize(String(h.size)); setFFloor(h.floor || ''); setFPsf(String(h.psf)); setFYear(h.year); setFLabel(h.label || '');
    setEditId(h.id); setShowAdd(true);
  };

  const removeHolding = (id) => { if (confirm('Remove this holding?')) setHoldings(holdings.filter(h => h.id !== id)); };

  const years = Array.from({ length: 35 }, (_, i) => new Date().getFullYear() - i);

  const inputStyle = { background: T.card, border: `1px solid ${T.textFaint}`, borderRadius: 6, padding: '8px 12px', color: T.text, fontSize: T.base, fontFamily: T.mono, outline: 'none', width: '100%' };
  const labelStyle = { color: T.textMute, fontSize: T.sm, fontWeight: 600, marginBottom: 4, display: 'block', letterSpacing: 0.5 };

  // ── Add/Edit Form ──
  const renderForm = () => (
    <Card style={{ border: `2px solid ${T.green}40` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ color: T.text, fontSize: T.xl, fontWeight: 700 }}>{editId ? '✏️ Edit Holding' : '➕ Add Property'}</div>
        <button onClick={() => { setShowAdd(false); setEditId(null); resetForm(); }} style={{ background: 'none', border: 'none', color: T.textMute, cursor: 'pointer', fontSize: 18 }}>✕</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>PROJECT</label>
          <select value={fProj} onChange={e => setFProj(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">Select project...</option>
            {projList.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>UNIT SIZE (SQFT)</label>
          <input type="number" value={fSize} onChange={e => setFSize(e.target.value)} placeholder="e.g. 850" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>FLOOR (OPTIONAL)</label>
          <input value={fFloor} onChange={e => setFFloor(e.target.value)} placeholder="e.g. 12" style={inputStyle} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>PURCHASE PSF ($)</label>
          <input type="number" value={fPsf} onChange={e => setFPsf(e.target.value)} placeholder="e.g. 1650" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>PURCHASE YEAR</label>
          <select value={fYear} onChange={e => setFYear(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>LABEL (OPTIONAL)</label>
          <input value={fLabel} onChange={e => setFLabel(e.target.value)} placeholder="e.g. Investment unit, Master bedroom" style={inputStyle} />
        </div>
      </div>
      {fProj && fSize && fPsf && (() => {
        const m = cmpPool.find(p => p.name === fProj);
        const pv = (+fPsf) * (+fSize);
        return <div style={{ background: T.borderLt, borderRadius: T.r, padding: 12, marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: T.base }}>
          <span style={{ color: T.textMute }}>Purchase value: <span style={{ color: T.text, fontWeight: 700, fontFamily: T.mono }}>${pv.toLocaleString()}</span></span>
          {m && <span style={{ color: T.textMute }}>Current PSF: <span style={{ color: T.blue, fontWeight: 700, fontFamily: T.mono }}>${m.psf.toLocaleString()}</span></span>}
          {m && <span style={{ color: T.textMute }}>Current value: <span style={{ color: m.psf >= +fPsf ? T.green : T.red, fontWeight: 700, fontFamily: T.mono }}>${(m.psf * (+fSize)).toLocaleString()}</span></span>}
          {!m && <span style={{ color: T.amber }}>⚠️ Project not in top 30 by volume — limited tracking</span>}
        </div>;
      })()}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={addHolding} disabled={!fProj || !fSize || !fPsf} style={{ background: !fProj || !fSize || !fPsf ? T.textFaint : T.green, color: '#fff', border: 'none', borderRadius: T.r, padding: '10px 28px', fontSize: T.lg, fontWeight: 600, cursor: !fProj || !fSize || !fPsf ? 'not-allowed' : 'pointer' }}>{editId ? 'Save Changes' : '+ Add to Portfolio'}</button>
        <button onClick={() => { setShowAdd(false); setEditId(null); resetForm(); }} style={{ background: T.borderLt, border: `1px solid ${T.textFaint}`, borderRadius: T.r, padding: '10px 20px', fontSize: T.lg, color: T.textSub, cursor: 'pointer' }}>Cancel</button>
      </div>
    </Card>
  );

  // ── Empty state ──
  if (!holdings.length && !showAdd) return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeader icon="💼" title="Your Portfolio" sub="Track properties you own — monitor unrealized gains, yield on cost, and annualized returns against live market data." />
      <Card>
        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🏠</div>
          <div style={{ color: T.text, fontSize: T['2xl'], fontWeight: 700, marginBottom: 8 }}>No properties yet</div>
          <div style={{ color: T.textSub, fontSize: T.base, marginBottom: 24, maxWidth: 420, margin: '0 auto 24px' }}>Add properties you own to track their current market value, unrealized gains, yield on cost, and annualized CAGR — all computed from live URA transaction data.</div>
          <button onClick={() => setShowAdd(true)} style={{ background: T.green, color: '#fff', border: 'none', borderRadius: T.r, padding: '12px 28px', fontSize: T.lg, fontWeight: 600, cursor: 'pointer' }}>+ Add Your First Property</button>
        </div>
      </Card>
      <NoteText>Data syncs to the server — accessible from any browser.</NoteText>
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <SectionHeader icon="💼" title="Your Portfolio" sub={`${holdings.length} propert${holdings.length === 1 ? 'y' : 'ies'} tracked · Data stored locally in your browser`} />

      {/* Summary bar */}
      {totals && <InsightBar items={[
        <span key="v">Portfolio value: <span style={{ color: T.blue, fontWeight: 700, fontFamily: T.mono }}>${totals.value > 1e6 ? (totals.value / 1e6).toFixed(2) + 'M' : totals.value.toLocaleString()}</span> (cost ${totals.purchase > 1e6 ? (totals.purchase / 1e6).toFixed(2) + 'M' : totals.purchase.toLocaleString()})</span>,
        <span key="g">Unrealized: <span style={{ color: totals.gain >= 0 ? T.green : T.red, fontWeight: 700, fontFamily: T.mono }}>{totals.gain >= 0 ? '+$' : '-$'}{Math.abs(totals.gain) > 1e6 ? (Math.abs(totals.gain) / 1e6).toFixed(2) + 'M' : Math.abs(totals.gain).toLocaleString()} ({totals.gainPct >= 0 ? '+' : ''}{totals.gainPct.toFixed(1)}%)</span></span>,
        <span key="y">Yield on cost: <span style={{ color: T.amber, fontWeight: 700, fontFamily: T.mono }}>{totals.yoc.toFixed(2)}%</span> (${totals.rent > 1e3 ? (totals.rent / 1e3).toFixed(0) + 'K' : totals.rent.toLocaleString()}/yr)</span>,
      ]} />}

      {/* Add button */}
      {!showAdd && <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setShowAdd(true)} style={{ background: T.green, color: '#fff', border: 'none', borderRadius: T.r, padding: '8px 20px', fontSize: T.base, fontWeight: 600, cursor: 'pointer' }}>+ Add Property</button>
        <button onClick={() => { if (confirm('Remove all holdings? This cannot be undone.')) setHoldings([]); }} style={{ background: T.borderLt, border: `1px solid ${T.textFaint}`, borderRadius: T.r, padding: '8px 16px', fontSize: T.sm, color: T.textMute, cursor: 'pointer' }}>Clear All</button>
      </div>}

      {/* Add/Edit form */}
      {showAdd && renderForm()}

      {/* Holdings */}
      {enriched.map(h => {
        const gc = h.gl >= 0 ? T.green : T.red;
        return <Card key={h.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>🏢</span>
                <span style={{ color: T.text, fontSize: T.xl, fontWeight: 700 }}>{h.project}</span>
                {h.label && <span style={{ background: `${T.purple}18`, color: T.purple, padding: '2px 10px', borderRadius: 6, fontSize: T.sm, fontWeight: 600 }}>{h.label}</span>}
              </div>
              <div style={{ color: T.textSub, fontSize: T.md, marginTop: 2 }}>
                {h.m?.dist || '—'} · {h.m?.segment || '—'} · {h.size.toLocaleString()} sqft{h.floor ? ` · Floor ${h.floor}` : ''} · Bought {h.year}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => onViewProject(h.project)} style={{ background: `${T.purple}18`, border: `1px solid ${T.purple}4D`, borderRadius: 6, padding: '4px 12px', fontSize: T.sm, color: T.purple, cursor: 'pointer', fontWeight: 600 }}>View</button>
              <button onClick={() => startEdit(h)} style={{ background: T.borderLt, border: `1px solid ${T.textFaint}`, borderRadius: 6, padding: '4px 10px', fontSize: T.sm, color: T.textSub, cursor: 'pointer' }}>✏️</button>
              <button onClick={() => removeHolding(h.id)} style={{ background: `${T.red}10`, border: `1px solid ${T.red}30`, borderRadius: 6, padding: '4px 10px', fontSize: T.sm, color: T.red, cursor: 'pointer' }}>✕</button>
            </div>
          </div>

          {!h.found && <div style={{ background: `${T.amber}15`, border: `1px solid ${T.amber}40`, borderRadius: T.r, padding: '8px 14px', marginBottom: 12, color: T.amber, fontSize: T.md }}>⚠️ This project is not in the top 30 by transaction volume. Current market data unavailable.</div>}

          {h.found && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            <MetricBox label="PURCHASE PSF" value={`$${h.psf.toLocaleString()}`} color={T.textSub} />
            <MetricBox label="CURRENT PSF" value={`$${h.cp.toLocaleString()}`} color={T.blue} />
            <MetricBox label="PURCHASE VALUE" value={`$${h.pv > 1e6 ? (h.pv / 1e6).toFixed(2) + 'M' : h.pv.toLocaleString()}`} color={T.textSub} />
            <MetricBox label="CURRENT VALUE" value={`$${h.cv > 1e6 ? (h.cv / 1e6).toFixed(2) + 'M' : h.cv.toLocaleString()}`} color={T.blue} />
            <MetricBox label="GAIN / LOSS" value={`${h.gl >= 0 ? '+$' : '-$'}${Math.abs(h.gl) > 1e6 ? (Math.abs(h.gl) / 1e6).toFixed(2) + 'M' : Math.abs(h.gl).toLocaleString()}`} color={gc} sub={`${h.glPct >= 0 ? '+' : ''}${h.glPct.toFixed(1)}%`} />
            <MetricBox label="YIELD ON COST" value={`${h.yoc.toFixed(2)}%`} color={yieldColor(h.yoc)} sub={`$${Math.round(h.annualRent).toLocaleString()}/yr`} />
            {h.cagr !== null && <MetricBox label={`${h.yrs}-YR CAGR`} value={`${h.cagr >= 0 ? '+' : ''}${h.cagr.toFixed(1)}%`} color={cagrColor(h.cagr)} />}
            {h.totalReturn !== null && <MetricBox label="TOTAL RETURN" value={`${h.totalReturn >= 0 ? '+' : ''}${h.totalReturn.toFixed(1)}%`} color={h.totalReturn >= 0 ? T.green : T.red} sub="CAGR + Yield" highlight />}
          </div>}
        </Card>;
      })}

      {/* Performance comparison table */}
      {enriched.filter(h => h.found).length >= 2 && <>
        <SectionHeader icon="📊" title="Portfolio Comparison" sub="Side-by-side performance of all holdings." />
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr>
                {['Property', 'Size', 'Bought', 'Buy PSF', 'Now PSF', 'Gain', 'CAGR', 'Yield', 'Total'].map(h => <th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>{enriched.filter(h => h.found).map(h => <tr key={h.id}>
                <td style={{ color: T.text, fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.project}</td>
                <td style={{ fontFamily: T.mono }}>{h.size.toLocaleString()}</td>
                <td style={{ color: T.textMute }}>{h.year}</td>
                <td style={{ fontFamily: T.mono }}>${h.psf.toLocaleString()}</td>
                <td style={{ color: T.blue, fontFamily: T.mono, fontWeight: 600 }}>${h.cp.toLocaleString()}</td>
                <td style={{ color: h.gl >= 0 ? T.green : T.red, fontFamily: T.mono, fontWeight: 600 }}>{h.glPct >= 0 ? '+' : ''}{h.glPct.toFixed(1)}%</td>
                <td style={{ color: h.cagr !== null ? cagrColor(h.cagr) : T.textMute, fontFamily: T.mono, fontWeight: 600 }}>{h.cagr !== null ? `${h.cagr >= 0 ? '+' : ''}${h.cagr.toFixed(1)}%` : '—'}</td>
                <td style={{ color: yieldColor(h.yoc), fontFamily: T.mono }}>{h.yoc.toFixed(1)}%</td>
                <td style={{ color: h.totalReturn !== null && h.totalReturn >= 0 ? T.green : T.red, fontFamily: T.mono, fontWeight: 700 }}>{h.totalReturn !== null ? `${h.totalReturn >= 0 ? '+' : ''}${h.totalReturn.toFixed(1)}%` : '—'}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </Card>
      </>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <NoteText>Portfolio data syncs to the server automatically. {syncStatus === 'saving' ? '⏳ Saving...' : syncStatus === 'saved' ? '✅ Saved' : syncStatus === 'error' ? '⚠️ Sync failed — data saved locally' : ''}</NoteText>
        <div style={{ fontSize: T.sm, color: syncStatus === 'saved' ? T.green : syncStatus === 'saving' ? T.amber : syncStatus === 'error' ? T.red : T.textMute }}>
          {syncStatus === 'saving' && '⏳'}
          {syncStatus === 'saved' && '☁️ Synced'}
          {syncStatus === 'error' && '⚠️ Local only'}
          {syncStatus === 'idle' && '☁️'}
        </div>
      </div>
    </div>
  );
}

function MetricBox({ label, value, color, sub, highlight }) {
  return (
    <div style={{ background: highlight ? `${color}08` : T.borderLt, borderRadius: T.r, padding: '10px 12px', border: highlight ? `1px solid ${color}30` : 'none' }}>
      <div style={{ color: T.textMute, fontSize: T.xs, fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: T.xl, fontWeight: 700, fontFamily: T.mono }}>{value}</div>
      {sub && <div style={{ color: T.textSub, fontSize: T.sm, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
MetricBox.propTypes = { label: PropTypes.string, value: PropTypes.string, color: PropTypes.string, sub: PropTypes.string, highlight: PropTypes.bool };

Portfolio.propTypes = {
  cmpPool: PropTypes.array.isRequired,
  projList: PropTypes.array.isRequired,
  onViewProject: PropTypes.func.isRequired,
  holdings: PropTypes.array.isRequired,
  setHoldings: PropTypes.func.isRequired,
  syncStatus: PropTypes.string,
};
