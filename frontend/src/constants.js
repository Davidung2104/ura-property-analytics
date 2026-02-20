/** Shared constants, palettes, tokens, and helper functions */

// ── Design Tokens ──
export const T = {
  // Text
  text:     '#1e293b',
  textSub:  '#64748b',
  textMute: '#94a3b8',
  textFaint:'#cbd5e1',

  // Surfaces
  bg:       '#f8fafc',
  card:     '#f1f5f9',
  border:   '#e2e8f0',
  borderLt: '#f1f5f9',

  // Accents
  blue:     '#38bdf8',
  sky:      '#0ea5e9',
  indigo:   '#6366f1',
  purple:   '#a78bfa',
  violet:   '#8b5cf6',
  green:    '#22c55e',
  emerald:  '#10b981',
  lime:     '#4ade80',
  teal:     '#34d399',
  amber:    '#f59e0b',
  orange:   '#fb923c',
  red:      '#ef4444',
  rose:     '#f43f5e',
  pink:     '#ec4899',

  // Semantic
  pos:      '#22c55e',
  posLt:    '#4ade80',
  neg:      '#ef4444',
  negLt:    '#f87171',
  warn:     '#f59e0b',

  // Type scale
  xs: 9, sm: 10, md: 11, base: 12, lg: 13, xl: 15, '2xl': 18, '3xl': 22, '4xl': 32,

  // Radii
  r: 8, rLg: 12, rXl: 14,

  // Font
  mono: "'IBM Plex Mono', monospace",
  sans: "'Urbanist', -apple-system, sans-serif",
};

// ── Shorthand style factories ──
export const S = {
  // Axis tick
  tick:     { fill: T.textSub, fontSize: T.sm, fontFamily: T.sans },
  tickSm:   { fill: T.textSub, fontSize: T.xs, fontFamily: T.sans },
  tickMute:  { fill: T.textMute, fontSize: T.xs },
  // Legend
  legend:   { fontSize: T.md },
  // Grid
  grid:     { strokeDasharray: '3 3', stroke: T.border },
  gridV:    { strokeDasharray: '3 3', vertical: false, stroke: T.border },
  gridH:    { strokeDasharray: '3 3', horizontal: false, stroke: T.border },
  // Toggle button (active/inactive)
  togBtn: (active, color = T.purple) => ({
    background: active ? `${color}26` : 'transparent',
    border: active ? `1px solid ${color}4D` : '1px solid transparent',
    borderRadius: 6, padding: '5px 14px', fontSize: T.md,
    color: active ? color : T.textSub, cursor: 'pointer', fontWeight: 600, letterSpacing: '0.01em',
  }),
  // Section toggle
  secBtn: (active, color) => ({
    background: active ? `${color}18` : 'transparent',
    border: active ? `1px solid ${color}4D` : '1px solid transparent',
    borderRadius: 10, padding: '10px 24px',
    color: active ? color : T.textSub, fontSize: T.lg, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.01em',
  }),
  // Filter select
  filterSel: (active) => ({
    background: active ? '#38bdf818' : T.card,
    border: active ? `1px solid ${T.blue}` : `1px solid ${T.textFaint}`,
    borderRadius: T.r, padding: '6px 12px',
    color: active ? T.sky : T.text,
    fontSize: T.base, cursor: 'pointer', fontWeight: active ? 600 : 400,
    outline: 'none', minWidth: 90,
  }),
  // Mono value
  mono:     { fontFamily: T.mono },
  monoB:    { fontFamily: T.mono, fontWeight: 700 },
  // Labels
  label:    { color: T.textMute, fontSize: T.sm, fontWeight: 600, letterSpacing: 0.5 },
  labelXs:  { color: T.textMute, fontSize: T.xs, fontWeight: 600 },
  sub:      { color: T.textSub, fontSize: T.md },
  subSm:    { color: T.textSub, fontSize: T.sm },
};

// ── Tab + Section Config ──
export const SECTIONS = [
  { id: 'market',    label: '📊 Market',           color: T.blue },
  { id: 'analyze',   label: '🔍 Project Analysis', color: T.purple },
  { id: 'portfolio', label: '💼 Portfolio',         color: T.green },
];

export const MARKET_TABS = [
  { id: 'overview', label: '📊 Overview' },
  { id: 'sales',    label: '🏷️ Sales' },
  { id: 'rental',   label: '🏠 Rental' },
  { id: 'invest',   label: '💰 Investment' },
  { id: 'perform',  label: '🏆 Performance' },
];

export const PROJECT_TABS = [
  { id: 'overview',  label: '📊 Overview' },
  { id: 'valuation', label: '💎 Valuation' },
  { id: 'compare',   label: '⚖️ Compare' },
  { id: 'records',   label: '📋 Records' },
  { id: 'report',    label: '📄 Report' },
];

// ── Chart palette ──
export const COLORS = [T.sky, T.indigo, T.violet, T.rose, T.emerald, T.amber, T.pink, '#14b8a6', T.red, '#3b82f6'];
export const SEG_COLORS = { CCR: T.red, RCR: T.amber, OCR: T.green };
export const MONO_FONT = T.mono;

// ── Haversine distance (km) ──
export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── CAGR computation ──
export function computeCAGR(startAvg, endAvg, years) {
  if (!startAvg || !endAvg || years <= 0) return null;
  return (Math.pow(endAvg / startAvg, 1 / years) - 1) * 100;
}

export function computeBucketCAGR(txList, startYear, endYear) {
  if (!txList?.length) return { startAvg: null, endAvg: null, startN: 0, endN: 0, totalN: 0, cagr: null, lowConf: true, annualAvg: [] };
  const years = [...new Set(txList.map(t => t.year))].sort();
  const sy = startYear || years[0];
  const ey = endYear || years[years.length - 1];
  const byYear = {};
  txList.forEach(tx => {
    if (!byYear[tx.year]) byYear[tx.year] = { sum: 0, count: 0 };
    byYear[tx.year].sum += tx.psf;
    byYear[tx.year].count += 1;
  });
  const startBucket = byYear[sy];
  const endBucket = byYear[ey];
  const startAvg = startBucket ? Math.round(startBucket.sum / startBucket.count) : null;
  const endAvg = endBucket ? Math.round(endBucket.sum / endBucket.count) : null;
  const startN = startBucket?.count || 0;
  const endN = endBucket?.count || 0;
  const n = parseInt(ey) - parseInt(sy);
  const cagr = computeCAGR(startAvg, endAvg, n);
  const lowConf = startN < 3 || endN < 3;
  const annualAvg = years.map(y => {
    const b = byYear[y];
    return { year: y, avg: b ? Math.round(b.sum / b.count) : null, n: b?.count || 0 };
  });
  return { startAvg, endAvg, startN, endN, totalN: txList.length, cagr, lowConf, annualAvg };
}

// ── Formatters ──
export const fmtDollar = (v) => '$' + (typeof v === 'number' ? v.toLocaleString() : v);
export const fmtPct = (v) => `${v > 0 ? '+' : ''}${v}%`;
export const fmtSign = (v) => `${v > 0 ? '+' : ''}${v}`;
export const fmtPsfAxis = (v) => '$' + v.toLocaleString();
export const fmtRentAxis = (v) => '$' + (typeof v === 'number' ? v.toFixed(2) : v);
export const fmtVolAxis = (v) => `$${(v / 1e9).toFixed(1)}B`;
export const fmtPctAxis = (v) => `${v > 0 ? '+' : ''}${v}%`;
export const fmtTxAxis = (v) => v + ' tx';

// ── Color helpers ──
export const cagrColor = (v) => v >= 5 ? T.green : v >= 3.5 ? T.lime : v >= 0 ? T.amber : T.red;
export const yieldColor = (v) => v >= 3 ? T.green : v >= 2.5 ? T.amber : T.red;
export const yoyColor = (v) => v > 0 ? T.lime : v < 0 ? T.red : T.textMute;
export const signColor = (v) => v > 0 ? T.pos : v < 0 ? T.neg : T.textMute;
export const growthColor = (v) => v > 20 ? T.green : v > 15 ? T.lime : v > 0 ? T.amber : v < 0 ? T.red : T.textMute;
export const pctChgColor = (v) => v > 4 ? T.lime : v > 2 ? T.amber : v < 0 ? T.negLt : T.textMute;
export const totalPctColor = (v) => v > 18 ? T.green : v > 12 ? T.amber : v < 0 ? T.red : T.textMute;

// ── Fallback yield when project data is missing (must match backend DEFAULT_YIELD.RCR) ──
export const DEFAULT_YIELD = 2.8;
