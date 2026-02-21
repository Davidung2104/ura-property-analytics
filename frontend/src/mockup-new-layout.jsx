import { useState } from "react";

const T = {
  bg: '#0f172a', card: '#1e293b', border: '#334155', borderLt: '#1e293b',
  text: '#f1f5f9', textSub: '#94a3b8', textMute: '#64748b', textFaint: '#475569',
  purple: '#a78bfa', blue: '#3b82f6', green: '#22c55e', amber: '#f59e0b',
  red: '#ef4444', teal: '#14b8a6', orange: '#f97316',
  mono: "'JetBrains Mono', 'Fira Code', monospace",
  sans: "'DM Sans', 'Inter', system-ui, sans-serif",
  r: '8px', rLg: '12px',
};

// ── Simulated project data ──
const PROJECT = {
  name: 'THE LANDMARK',
  district: 'D03 — Queenstown',
  tenure: '99-year Leasehold',
  top: '2027',
  units: 396,
  sizes: [527, 689, 872, 1076, 1259, 1496],
  floors: ['01-05', '06-10', '11-15', '16-20', '21-30', '31+'],
};

const COMPARABLES = [
  { score: 100, date: '2025-01', floor: '16-20', area: 689, rawPsf: 2847, adjPsf: 2891, price: 1991979, type: 'New Sale' },
  { score: 87, date: '2024-11', floor: '11-15', area: 700, rawPsf: 2780, adjPsf: 2843, price: 1990100, type: 'New Sale' },
  { score: 74, date: '2024-09', floor: '21-30', area: 678, rawPsf: 2920, adjPsf: 3012, price: 2042136, type: 'New Sale' },
  { score: 61, date: '2024-07', floor: '06-10', area: 710, rawPsf: 2650, adjPsf: 2758, price: 1958050, type: 'New Sale' },
  { score: 48, date: '2024-03', floor: '16-20', area: 695, rawPsf: 2720, adjPsf: 2869, price: 1993555, type: 'Resale' },
];

const MARKET_PULSE = {
  m3: { psf: 2891, cnt: 4 },
  m6: { psf: 2856, cnt: 9 },
  m12: { psf: 2812, cnt: 18 },
};

function Card({ children, style }) {
  return (
    <div style={{ background: T.card, borderRadius: T.rLg, border: `1px solid ${T.border}`, padding: '20px', ...style }}>
      {children}
    </div>
  );
}

function TabBar({ tabs, active, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: 2, background: T.bg, borderRadius: '10px', padding: 3, marginBottom: 20 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onSelect(t.id)} style={{
          flex: 1, padding: '10px 16px', borderRadius: '8px', border: 'none',
          background: active === t.id ? T.card : 'transparent',
          color: active === t.id ? T.text : T.textMute,
          fontSize: 13, fontWeight: active === t.id ? 700 : 500,
          cursor: 'pointer', transition: 'all 0.15s',
          fontFamily: T.sans, letterSpacing: '-0.01em',
        }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Badge({ children, color = T.purple }) {
  return (
    <span style={{
      background: color + '18', color, fontSize: 11, fontWeight: 700,
      padding: '3px 8px', borderRadius: 6, letterSpacing: '0.02em',
    }}>{children}</span>
  );
}

// ══════════════════════════════════════
// VALUATION TAB — The new layout
// ══════════════════════════════════════
function ValuationTab() {
  const [selectedSize, setSelectedSize] = useState(689);
  const [selectedFloor, setSelectedFloor] = useState('');
  const [showPulse, setShowPulse] = useState(false);
  const [showTimeMachine, setShowTimeMachine] = useState(false);

  const estValue = 2891;
  const totalPrice = estValue * selectedSize;
  const confidence = 74;
  const lowPsf = 2650;
  const highPsf = 3012;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── LAYER 1: THE ANSWER ── */}
      <Card>
        {/* Compact selectors */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ color: T.textMute, fontSize: 11, fontWeight: 700, marginBottom: 6, letterSpacing: '0.05em' }}>UNIT SIZE</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {PROJECT.sizes.map(s => (
                <button key={s} onClick={() => setSelectedSize(s)} style={{
                  background: selectedSize === s ? T.purple : T.bg,
                  border: `1px solid ${selectedSize === s ? T.purple : T.border}`,
                  borderRadius: 6, padding: '6px 12px', fontSize: 12,
                  color: selectedSize === s ? '#fff' : T.textMute,
                  cursor: 'pointer', fontFamily: T.mono, fontWeight: selectedSize === s ? 700 : 400,
                  transition: 'all 0.12s',
                }}>{s.toLocaleString()}</button>
              ))}
            </div>
          </div>
          <div style={{ minWidth: 140 }}>
            <div style={{ color: T.textMute, fontSize: 11, fontWeight: 700, marginBottom: 6, letterSpacing: '0.05em' }}>FLOOR</div>
            <select value={selectedFloor} onChange={e => setSelectedFloor(e.target.value)} style={{
              background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6,
              padding: '7px 12px', color: T.text, fontSize: 13, width: '100%',
              fontFamily: T.mono, cursor: 'pointer', outline: 'none',
            }}>
              <option value="">All floors</option>
              {PROJECT.floors.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>

        {/* Hero estimate + confidence side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'center' }}>
          {/* Value */}
          <div>
            <div style={{ color: T.textMute, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>
              ESTIMATED VALUE
            </div>
            <div style={{ color: T.text, fontSize: 42, fontWeight: 800, fontFamily: T.mono, lineHeight: 1, letterSpacing: '-0.02em' }}>
              ${totalPrice.toLocaleString()}
            </div>
            <div style={{ color: T.textSub, fontSize: 14, marginTop: 8, fontFamily: T.mono }}>
              ${estValue.toLocaleString()} PSF × {selectedSize.toLocaleString()} sqft
              {selectedFloor && <span> · Floor {selectedFloor}</span>}
            </div>
            <div style={{ color: T.textMute, fontSize: 12, marginTop: 6, fontFamily: T.mono }}>
              Range: ${lowPsf.toLocaleString()} — ${highPsf.toLocaleString()} PSF
              <span style={{ margin: '0 8px', opacity: 0.3 }}>|</span>
              ${(lowPsf * selectedSize).toLocaleString()} — ${(highPsf * selectedSize).toLocaleString()}
            </div>
          </div>

          {/* Confidence */}
          <div style={{ textAlign: 'center', padding: '0 16px' }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: `conic-gradient(${confidence >= 70 ? T.green : confidence >= 40 ? T.amber : T.red} ${confidence * 3.6}deg, ${T.bg} 0deg)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', background: T.card,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column',
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: T.mono, color: confidence >= 70 ? T.green : confidence >= 40 ? T.amber : T.red }}>
                  {confidence}
                </div>
              </div>
            </div>
            <div style={{ color: T.textMute, fontSize: 10, fontWeight: 700, marginTop: 6, letterSpacing: '0.05em' }}>CONFIDENCE</div>
          </div>
        </div>

        {/* Model summary — one line */}
        <div style={{ marginTop: 16, padding: '10px 14px', background: T.bg, borderRadius: 8, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Comparables', value: '42' },
            { label: 'Last 6mo', value: '9' },
            { label: 'Size matches', value: '14' },
            { label: 'Project CAGR', value: '+3.2%' },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: T.text, fontFamily: T.mono, fontWeight: 700, fontSize: 14 }}>{s.value}</span>
              <span style={{ color: T.textMute, fontSize: 11 }}>{s.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* ── LAYER 2: THE EVIDENCE ── */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ color: T.textSub, fontSize: 13, fontWeight: 700 }}>TOP COMPARABLES</div>
          <Badge>Highest similarity</Badge>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Match', 'Date', 'Floor', 'Area', 'Adj PSF', 'Price', 'Type'].map(h => (
                <th key={h} style={{
                  color: T.textMute, fontSize: 10, fontWeight: 700, padding: '6px 10px',
                  textAlign: h === 'Match' ? 'center' : 'left', borderBottom: `1px solid ${T.border}`,
                  letterSpacing: '0.05em',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARABLES.map((tx, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${T.border}22` }}>
                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 32, height: 5, background: T.bg, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${tx.score}%`, height: '100%', background: T.blue, borderRadius: 3 }} />
                    </div>
                    <span style={{ color: T.textMute, fontSize: 11, fontFamily: T.mono }}>{tx.score}</span>
                  </div>
                </td>
                <td style={{ color: T.textMute, fontSize: 12, padding: '8px 10px', fontFamily: T.mono }}>{tx.date}</td>
                <td style={{ color: T.textSub, fontSize: 12, padding: '8px 10px', fontFamily: T.mono }}>{tx.floor}</td>
                <td style={{ color: T.textSub, fontSize: 12, padding: '8px 10px', fontFamily: T.mono }}>{tx.area} sf</td>
                <td style={{ color: T.blue, fontSize: 13, padding: '8px 10px', fontFamily: T.mono, fontWeight: 700 }}>${tx.adjPsf.toLocaleString()}</td>
                <td style={{ color: T.textSub, fontSize: 12, padding: '8px 10px', fontFamily: T.mono }}>${tx.price.toLocaleString()}</td>
                <td style={{ color: T.textFaint, fontSize: 11, padding: '8px 10px' }}>{tx.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ color: T.textFaint, fontSize: 10, marginTop: 10, lineHeight: 1.5 }}>
          Weighted CMA: each transaction scored by recency (exponential decay), size similarity (±150sf), floor proximity (±8 floors). PSF adjusted to today using +3.2% project CAGR.
        </div>
      </Card>

      {/* ── LAYER 3: MARKET CONTEXT (expandable) ── */}
      <Card style={{ cursor: 'pointer' }} onClick={() => setShowPulse(!showPulse)}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: T.textSub, fontSize: 13, fontWeight: 700 }}>RECENT MARKET PULSE</span>
            <Badge color={T.teal}>Live pricing</Badge>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {/* Always-visible summary */}
            <div style={{ display: 'flex', gap: 16 }}>
              {[
                { label: '3M', psf: MARKET_PULSE.m3.psf, cnt: MARKET_PULSE.m3.cnt, color: T.purple },
                { label: '6M', psf: MARKET_PULSE.m6.psf, cnt: MARKET_PULSE.m6.cnt, color: T.teal },
                { label: '12M', psf: MARKET_PULSE.m12.psf, cnt: MARKET_PULSE.m12.cnt, color: T.blue },
              ].map(p => (
                <div key={p.label} style={{ textAlign: 'center' }}>
                  <div style={{ color: p.color, fontFamily: T.mono, fontWeight: 700, fontSize: 14 }}>${p.psf.toLocaleString()}</div>
                  <div style={{ color: T.textFaint, fontSize: 10 }}>{p.label} · {p.cnt}tx</div>
                </div>
              ))}
            </div>
            <span style={{ color: T.textFaint, fontSize: 16, transition: 'transform 0.2s', transform: showPulse ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
          </div>
        </div>

        {showPulse && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }} onClick={e => e.stopPropagation()}>
            <div style={{ color: T.textMute, fontSize: 11, marginBottom: 12 }}>
              Full breakdown by specificity tier — click to expand transaction details
            </div>
            {/* Simplified tier grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 1fr', gap: 6 }}>
              <div />
              <div style={{ color: T.purple, fontSize: 10, fontWeight: 700, textAlign: 'center', letterSpacing: '0.05em' }}>3 MONTHS</div>
              <div style={{ color: T.teal, fontSize: 10, fontWeight: 700, textAlign: 'center', letterSpacing: '0.05em' }}>6 MONTHS</div>
              <div style={{ color: T.blue, fontSize: 10, fontWeight: 700, textAlign: 'center', letterSpacing: '0.05em' }}>12 MONTHS</div>
              {[
                { label: 'All Units', desc: 'Any size + floor' },
                { label: 'By Size', desc: `±50sf of ${selectedSize}` },
                { label: 'By Floor', desc: 'Same band' },
                { label: 'Exact Match', desc: 'Size + floor' },
              ].map((tier, i) => (
                <div key={tier.label} style={{ display: 'contents' }}>
                  <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ color: T.textSub, fontSize: 12, fontWeight: 600 }}>{tier.label}</div>
                    <div style={{ color: T.textFaint, fontSize: 10 }}>{tier.desc}</div>
                  </div>
                  {[T.purple, T.teal, T.blue].map((color, j) => {
                    const hasData = !(i === 3 && j === 0);
                    const psf = hasData ? (2891 - i * 30 + j * 15) : 0;
                    return hasData ? (
                      <div key={j} style={{
                        background: color + '08', border: `1px solid ${color}20`,
                        borderRadius: 6, padding: '8px 10px', textAlign: 'center',
                        cursor: 'pointer', transition: 'all 0.12s',
                      }}>
                        <div style={{ color: T.text, fontSize: 14, fontWeight: 700, fontFamily: T.mono }}>
                          ${(psf * selectedSize).toLocaleString()}
                        </div>
                        <div style={{ color: T.textMute, fontSize: 10, fontFamily: T.mono }}>${psf} PSF</div>
                      </div>
                    ) : (
                      <div key={j} style={{ background: T.bg, borderRadius: 6, padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: T.textFaint, fontSize: 10 }}>—</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ── LAYER 4: TIME MACHINE (expandable) ── */}
      <Card style={{ cursor: 'pointer' }} onClick={() => setShowTimeMachine(!showTimeMachine)}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: T.textSub, fontSize: 13, fontWeight: 700 }}>TIME MACHINE</span>
            <Badge color={T.amber}>Power tool</Badge>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: T.textMute, fontSize: 12 }}>Project a past sale to today's value</span>
            <span style={{ color: T.textFaint, fontSize: 16, transition: 'transform 0.2s', transform: showTimeMachine ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
          </div>
        </div>

        {showTimeMachine && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <select style={{
                background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6,
                padding: '8px 12px', color: T.text, fontSize: 12, fontFamily: T.mono,
                cursor: 'pointer', outline: 'none', flex: 1,
              }}>
                <option>Choose a past transaction...</option>
                <option>2024-03 · Floor 16-20 · 695sf · $2,720 PSF</option>
                <option>2023-09 · Floor 11-15 · 689sf · $2,580 PSF</option>
                <option>2023-01 · Floor 06-10 · 710sf · $2,410 PSF</option>
              </select>
            </div>
            <div style={{ background: T.bg, borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: T.textMute, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>ORIGINAL (MAR 2024)</div>
                <div style={{ color: T.textSub, fontSize: 20, fontWeight: 700, fontFamily: T.mono }}>$2,720 <span style={{ fontSize: 12, fontWeight: 400 }}>PSF</span></div>
                <div style={{ color: T.textMute, fontSize: 11, fontFamily: T.mono }}>${(2720 * selectedSize).toLocaleString()}</div>
              </div>
              <div style={{ color: T.textFaint, fontSize: 20 }}>→</div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: T.textMute, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>TODAY'S ESTIMATE</div>
                <div style={{ color: T.purple, fontSize: 20, fontWeight: 700, fontFamily: T.mono }}>$2,869 <span style={{ fontSize: 12, fontWeight: 400 }}>PSF</span></div>
                <div style={{ color: T.purple, fontSize: 11, fontFamily: T.mono }}>${(2869 * selectedSize).toLocaleString()}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: T.textMute, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>CHANGE</div>
                <div style={{ color: T.green, fontSize: 16, fontWeight: 700, fontFamily: T.mono }}>+5.5%</div>
                <div style={{ color: T.textMute, fontSize: 10 }}>11mo · 3.2% CAGR</div>
              </div>
            </div>
          </div>
        )}
      </Card>

    </div>
  );
}

// ══════════════════════════════════════
// PROPERTY ANALYSIS TAB (placeholder)
// ══════════════════════════════════════
function PropertyAnalysisTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ color: T.textSub, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>FLOOR PREMIUM</div>
        <div style={{ color: T.textMute, fontSize: 12, marginBottom: 16 }}>Does floor level matter? Higher floors at The Landmark trade at a premium.</div>
        {/* Simplified bar chart */}
        {[
          { band: '31+', psf: 3120, prem: '+12.4%' },
          { band: '21-30', psf: 2980, prem: '+7.3%' },
          { band: '16-20', psf: 2891, prem: '+4.1%' },
          { band: '11-15', psf: 2810, prem: '+1.2%' },
          { band: '06-10', psf: 2770, prem: '-0.2%' },
          { band: '01-05', psf: 2680, prem: '-3.5%' },
        ].map(f => (
          <div key={f.band} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{ width: 44, color: T.textMute, fontSize: 11, fontFamily: T.mono, textAlign: 'right' }}>{f.band}</div>
            <div style={{ flex: 1, height: 22, background: T.bg, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${(f.psf / 3200) * 100}%`, height: '100%', background: `linear-gradient(90deg, ${T.blue}40, ${T.purple}60)`, borderRadius: 4, display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
                <span style={{ color: T.text, fontSize: 11, fontFamily: T.mono, fontWeight: 600 }}>${f.psf.toLocaleString()}</span>
              </div>
            </div>
            <div style={{ width: 50, color: f.prem.startsWith('+') ? T.green : T.red, fontSize: 11, fontFamily: T.mono, fontWeight: 600, textAlign: 'right' }}>{f.prem}</div>
          </div>
        ))}
      </Card>
      <Card>
        <div style={{ color: T.textSub, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>PRICE HISTORY BY FLOOR</div>
        <div style={{ color: T.textMute, fontSize: 12 }}>Heatmap showing PSF trends across floor levels and years. Currently in Property Analysis tab → reduces clutter on Valuation.</div>
        <div style={{ background: T.bg, borderRadius: 8, padding: 32, marginTop: 12, textAlign: 'center', color: T.textFaint, fontSize: 12 }}>
          [ Heatmap renders here — same component, new home ]
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════
// INVESTMENT TAB (placeholder)
// ══════════════════════════════════════
function InvestmentTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ color: T.textSub, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>PRICE GROWTH</div>
        <div style={{ display: 'flex', gap: 24 }}>
          {[
            { label: 'Overall CAGR', value: '+3.2%', sub: '3yr', color: T.green },
            { label: 'By Size (689sf)', value: '+3.8%', sub: '2-bed', color: T.blue },
            { label: 'By Floor (16-20)', value: '+4.1%', sub: 'mid-high', color: T.purple },
            { label: 'Rental Yield', value: '3.4%', sub: 'gross', color: T.amber },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: T.bg, borderRadius: 8, padding: 14, textAlign: 'center' }}>
              <div style={{ color: s.color, fontSize: 22, fontWeight: 800, fontFamily: T.mono }}>{s.value}</div>
              <div style={{ color: T.textSub, fontSize: 11, fontWeight: 600, marginTop: 4 }}>{s.label}</div>
              <div style={{ color: T.textFaint, fontSize: 10 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <div style={{ color: T.textSub, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>CAGR BY SEGMENT</div>
        <div style={{ color: T.textMute, fontSize: 12 }}>Full CAGR tables with sparklines. Currently in Investment tab → dedicated space for investor analysis.</div>
        <div style={{ background: T.bg, borderRadius: 8, padding: 32, marginTop: 12, textAlign: 'center', color: T.textFaint, fontSize: 12 }}>
          [ CAGR breakdown + sparklines render here ]
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════
// MAIN APP — Tab structure demo
// ══════════════════════════════════════
const NEW_TABS = [
  { id: 'valuation', label: 'Valuation' },
  { id: 'analysis', label: 'Property Analysis' },
  { id: 'investment', label: 'Investment' },
  { id: 'market', label: 'Market Overview' },
  { id: 'records', label: 'Records' },
];

const OLD_TABS = [
  { id: 'overview', label: '📊 Overview' },
  { id: 'valuation', label: '💎 Valuation' },
  { id: 'compare', label: '⚖️ Compare' },
  { id: 'records', label: '📋 Records' },
  { id: 'report', label: '📄 Report' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('valuation');
  const [view, setView] = useState('new');

  return (
    <div style={{ background: T.bg, minHeight: '100vh', color: T.text, fontFamily: T.sans, padding: '20px 24px' }}>

      {/* Toggle between old and new */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
            {PROJECT.name}
          </h1>
          <div style={{ color: T.textMute, fontSize: 12, marginTop: 2 }}>
            {PROJECT.district} · {PROJECT.tenure} · TOP {PROJECT.top} · {PROJECT.units} units
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, background: T.card, borderRadius: 8, padding: 3 }}>
          <button onClick={() => { setView('new'); setActiveTab('valuation'); }} style={{
            padding: '6px 14px', borderRadius: 6, border: 'none',
            background: view === 'new' ? T.purple : 'transparent',
            color: view === 'new' ? '#fff' : T.textMute,
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>New Layout</button>
          <button onClick={() => { setView('old'); setActiveTab('overview'); }} style={{
            padding: '6px 14px', borderRadius: 6, border: 'none',
            background: view === 'old' ? T.amber : 'transparent',
            color: view === 'old' ? '#000' : T.textMute,
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>Current Layout</button>
        </div>
      </div>

      {/* Tab bar */}
      <TabBar
        tabs={view === 'new' ? NEW_TABS : OLD_TABS}
        active={activeTab}
        onSelect={setActiveTab}
      />

      {/* Content */}
      {view === 'new' && (
        <>
          {activeTab === 'valuation' && <ValuationTab />}
          {activeTab === 'analysis' && <PropertyAnalysisTab />}
          {activeTab === 'investment' && <InvestmentTab />}
          {activeTab === 'market' && (
            <Card><div style={{ color: T.textMute, fontSize: 13, padding: 20, textAlign: 'center' }}>
              Market Overview — district comparisons, segment positioning, existing ProjectOverview content
            </div></Card>
          )}
          {activeTab === 'records' && (
            <Card><div style={{ color: T.textMute, fontSize: 13, padding: 20, textAlign: 'center' }}>
              Records — full transaction table, existing RecordsTab content
            </div></Card>
          )}
        </>
      )}

      {view === 'old' && (
        <Card>
          <div style={{ padding: 20, textAlign: 'center' }}>
            <div style={{ color: T.amber, fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Current Layout</div>
            <div style={{ color: T.textMute, fontSize: 12, lineHeight: 1.8 }}>
              {activeTab === 'valuation' ? (
                <div style={{ textAlign: 'left', maxWidth: 500, margin: '0 auto' }}>
                  <div style={{ color: T.text, fontWeight: 700, marginBottom: 12 }}>Everything on one scroll:</div>
                  {[
                    '🧮 Price Estimator — size/floor buttons, Best Estimate banner',
                    '📌 Reference Transaction Picker',
                    '📊 4×3 Tier Grid (12 clickable cells)',
                    '   └─ Expandable transaction tables under each cell',
                    '🔍 Valuation Model — separate CMA estimate + confidence',
                    '   └─ Top 5 comparables table',
                    '📈 CAGR Analysis — 3 toggle modes (overall/size/floor)',
                    '🗓️ Heatmap — 3 metric toggles + size filter',
                    '🏗️ Floor Premium — bar + line chart',
                  ].map((line, i) => (
                    <div key={i} style={{ padding: '4px 0', color: line.startsWith('   ') ? T.textFaint : T.textSub, fontSize: 12, fontFamily: T.mono }}>
                      {line}
                    </div>
                  ))}
                  <div style={{ color: T.amber, fontSize: 11, marginTop: 16, fontStyle: 'italic' }}>
                    = 836 lines, 5 sections, ~15 controls, 3 different value estimates
                  </div>
                </div>
              ) : (
                `${OLD_TABS.find(t => t.id === activeTab)?.label || activeTab} — existing content unchanged`
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Legend */}
      {view === 'new' && activeTab === 'valuation' && (
        <div style={{ marginTop: 24, padding: '16px 20px', background: T.card, borderRadius: T.rLg, border: `1px dashed ${T.border}` }}>
          <div style={{ color: T.textSub, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>LAYOUT STRUCTURE</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { layer: 'Layer 1', name: 'The Answer', desc: 'One number + confidence. Always visible. Size/floor selectors inline.', state: 'Open' },
              { layer: 'Layer 2', name: 'The Evidence', desc: 'Top 5 comparables with similarity scores. Always visible.', state: 'Open' },
              { layer: 'Layer 3', name: 'Market Pulse', desc: 'Recent pricing windows. Summary always visible, tier grid expandable.', state: 'Collapsed' },
              { layer: 'Layer 4', name: 'Time Machine', desc: 'Reference transaction projector. Power user tool.', state: 'Collapsed' },
            ].map(l => (
              <div key={l.layer} style={{ background: T.bg, borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ color: T.purple, fontSize: 11, fontWeight: 700 }}>{l.layer}</span>
                  <span style={{ color: T.text, fontSize: 12, fontWeight: 600 }}>{l.name}</span>
                  <Badge color={l.state === 'Open' ? T.green : T.amber}>{l.state}</Badge>
                </div>
                <div style={{ color: T.textMute, fontSize: 11 }}>{l.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
