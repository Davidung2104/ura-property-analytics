/**
 * constants.js — Compatibility layer over theme.ts
 *
 * All design tokens are defined in theme.ts (single source of truth).
 * This file re-exports them in the T/S shapes that components use.
 * New code should import from theme.ts directly.
 */
import {
  colors, fonts, fontSizes, radii,
  chartColors, segmentColors,
  cagrColor as _cagrColor, yieldColor as _yieldColor,
  growthColor as _growthColor, pctChgColor as _pctChgColor, totalPctColor as _totalPctColor,
  computeBucketCAGR as _computeBucketCAGR, DEFAULT_YIELD as _DEFAULT_YIELD,
} from './theme.ts';

// ── Design Tokens (derived from theme.ts) ──
export const T = {
  // Text
  text:     colors.text,
  textSub:  colors.textSub,
  textMute: colors.textMute,
  textFaint:colors.textFaint,

  // Surfaces
  bg:       colors.bg,
  card:     colors.card,
  border:   colors.border,
  borderLt: colors.borderLight,

  // Accents
  blue:     colors.blue,
  sky:      colors.sky,
  indigo:   colors.indigo,
  purple:   colors.purple,
  violet:   colors.violet,
  green:    colors.green,
  emerald:  colors.emerald,
  lime:     colors.lime,
  teal:     colors.teal,
  amber:    colors.amber,
  orange:   colors.orange,
  red:      colors.red,
  rose:     colors.rose,
  pink:     colors.pink,

  // Semantic
  pos:      colors.pos,
  posLt:    colors.posLight,
  neg:      colors.neg,
  negLt:    colors.negLight,
  warn:     colors.warn,

  // Type scale
  xs: fontSizes.xs, sm: fontSizes.sm, md: fontSizes.md, base: fontSizes.base,
  lg: fontSizes.lg, xl: fontSizes.xl, '2xl': fontSizes['2xl'], '3xl': fontSizes['3xl'], '4xl': fontSizes['4xl'],

  // Radii
  r: radii.lg, rLg: 12, rXl: 14,

  // Font
  mono: fonts.mono,
  sans: fonts.sans,
};

// ── Shorthand style factories ──
export const S = {
  tick:     { fill: T.textSub, fontSize: T.sm, fontFamily: T.sans },
  tickSm:   { fill: T.textSub, fontSize: T.xs, fontFamily: T.sans },
  tickMute:  { fill: T.textMute, fontSize: T.xs },
  legend:   { fontSize: T.md },
  grid:     { strokeDasharray: '3 3', stroke: T.border },
  gridV:    { strokeDasharray: '3 3', vertical: false, stroke: T.border },
  gridH:    { strokeDasharray: '3 3', horizontal: false, stroke: T.border },
  togBtn: (active, color = T.purple) => ({
    background: active ? `${color}20` : 'transparent',
    border: active ? `1px solid ${color}4D` : '1px solid transparent',
    borderRadius: 6, padding: '6px 16px', fontSize: T.md,
    color: active ? color : T.textSub, cursor: 'pointer', fontWeight: 600, letterSpacing: '0.02em',
  }),
  secBtn: (active, color) => ({
    background: active ? `${color}14` : 'transparent',
    border: active ? `1px solid ${color}4D` : '1px solid transparent',
    borderRadius: 10, padding: '10px 24px',
    color: active ? color : T.textSub, fontSize: T.lg, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.01em',
  }),
  filterSel: (active) => ({
    background: active ? `${colors.accent}14` : T.card,
    border: active ? `1px solid ${colors.accent}` : `1px solid ${T.textFaint}`,
    borderRadius: T.r, padding: '7px 14px',
    color: active ? colors.accent : T.text,
    fontSize: T.base, cursor: 'pointer', fontWeight: active ? 600 : 400,
    outline: 'none', minWidth: 90,
  }),
  mono:     { fontFamily: T.mono },
  monoB:    { fontFamily: T.mono, fontWeight: 700 },
  label:    { color: T.textMute, fontSize: T.sm, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' },
  labelXs:  { color: T.textMute, fontSize: T.xs, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' },
  sub:      { color: T.textSub, fontSize: T.md },
  subSm:    { color: T.textSub, fontSize: T.sm },
};

// ── Tab Config ──
export const MARKET_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'sales',    label: 'Sales' },
  { id: 'rental',   label: 'Rental' },
  { id: 'invest',   label: 'Investment' },
  { id: 'perform',  label: 'Performance' },
];

export const PROJECT_TABS = [
  { id: 'valuation', label: 'Valuation' },
  { id: 'analysis',  label: 'Property Analysis' },
  { id: 'investment',label: 'Investment' },
  { id: 'context',   label: 'Market Context' },
  { id: 'records',   label: 'Records' },
  { id: 'compare',   label: 'Compare' },
  { id: 'report',    label: 'Report' },
];

// ── Chart palette (derived from theme.ts) ──
export const COLORS = [...chartColors];
export const SEG_COLORS = { ...segmentColors };
export const MONO_FONT = T.mono;

// ── Utility functions ──
export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

// ── Color helpers (re-export from theme) ──
export const cagrColor = _cagrColor;
export const yieldColor = _yieldColor;
export const yoyColor = (v) => v > 0 ? T.lime : v < 0 ? T.red : T.textMute;
export const signColor = (v) => v > 0 ? T.pos : v < 0 ? T.neg : T.textMute;
export const growthColor = _growthColor;
export const pctChgColor = _pctChgColor;
export const totalPctColor = _totalPctColor;

export const DEFAULT_YIELD = _DEFAULT_YIELD;

export function getBed(areaSqf) {
  if (areaSqf < 550) return '1 BR';
  if (areaSqf < 800) return '2 BR';
  if (areaSqf < 1100) return '3 BR';
  if (areaSqf < 1500) return '4 BR';
  return '5 BR';
}
