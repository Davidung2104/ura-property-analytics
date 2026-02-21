/**
 * theme.ts — Single source of truth for all design tokens
 * 
 * All colors, typography, spacing, and component styles are defined here.
 * No hardcoded hex values or pixel sizes should appear in components.
 */

// ── Color Palette ──
export const colors = {
  // Brand
  accent: '#2563eb',
  accentLight: '#eff6ff',
  accentBorder: '#bfdbfe',

  // Neutrals
  text: '#1b2d4b',
  textSub: '#475569',
  textMute: '#94a3b8',
  textFaint: '#cbd5e1',

  // Backgrounds
  bg: '#f8f9fb',
  card: '#ffffff',
  border: '#e5e5ee',
  borderLight: '#f5f6f8',

  // Semantic
  blue: '#3b82f6',
  sky: '#0ea5e9',
  indigo: '#6366f1',
  purple: '#8b5cf6',
  violet: '#7c3aed',
  green: '#059669',
  emerald: '#10b981',
  lime: '#65a30d',
  teal: '#0d9488',
  amber: '#d97706',
  orange: '#ea580c',
  red: '#dc2626',
  rose: '#e11d48',
  pink: '#ec4899',

  // Functional
  pos: '#059669',
  posLight: '#d1fae5',
  neg: '#dc2626',
  negLight: '#fee2e2',
  warn: '#d97706',

  // Segments
  ccr: '#dc2626',
  rcr: '#d97706',
  ocr: '#059669',
} as const;

// ── Typography ──
export const fonts = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: '"SF Mono", "Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
} as const;

export const fontSizes = {
  xs: 10,
  sm: 11,
  md: 12,
  base: 13,
  lg: 14,
  xl: 16,
  '2xl': 20,
  '3xl': 26,
  '4xl': 36,
} as const;

// ── Spacing ──
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 36,
  '5xl': 44,
} as const;

// ── Radii ──
export const radii = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 10,
  pill: 20,
  full: 9999,
} as const;

// ── Shadows ──
export const shadows = {
  sm: '0 1px 2px rgba(0,0,0,0.04)',
  md: '0 2px 8px rgba(0,0,0,0.08)',
  lg: '0 10px 40px rgba(0,0,0,0.1)',
  focus: '0 0 0 3px rgba(37,99,235,0.08)',
} as const;

// ── Chart palette ──
export const chartColors = [
  colors.sky, colors.indigo, colors.violet, colors.rose,
  colors.emerald, colors.amber, colors.pink, '#14b8a6',
  colors.red, '#3b82f6',
] as const;

export const segmentColors = {
  CCR: colors.ccr,
  RCR: colors.rcr,
  OCR: colors.ocr,
} as const;

// ── Utility functions ──
export const segColor = (s: string) =>
  s === 'CCR' ? colors.ccr : s === 'RCR' ? colors.rcr : colors.ocr;

export const cagrColor = (v: number) =>
  v >= 5 ? colors.green : v >= 3.5 ? colors.lime : v >= 0 ? colors.amber : colors.red;

export const yieldColor = (v: number) =>
  v >= 3 ? colors.green : v >= 2.5 ? colors.amber : colors.red;

export const growthColor = (v: number) =>
  v > 20 ? colors.green : v > 15 ? colors.lime : v > 0 ? colors.amber : v < 0 ? colors.red : colors.textMute;

export const pctChgColor = (v: number) =>
  v > 4 ? colors.lime : v > 2 ? colors.amber : v < 0 ? colors.negLight : colors.textMute;

export const totalPctColor = (v: number) =>
  v > 18 ? colors.green : v > 12 ? colors.amber : v < 0 ? colors.red : colors.textMute;

// ── Shared constants ──
export const DEFAULT_YIELD = 2.8;

/** Compute bucket CAGR from transaction list */
export function computeBucketCAGR(
  txList: Array<{ year: string; psf: number }>,
  startYear?: string,
  endYear?: string
) {
  if (!txList || txList.length < 2) return { cagr: null, startAvg: null, endAvg: null, lowConf: true };
  const years = [...new Set(txList.map(t => t.year))].sort();
  const sy = startYear || years[0];
  const ey = endYear || years[years.length - 1];
  const startTxs = txList.filter(t => t.year === sy);
  const endTxs = txList.filter(t => t.year === ey);
  if (!startTxs.length || !endTxs.length || sy === ey) return { cagr: null, startAvg: null, endAvg: null, lowConf: true };
  const startAvg = Math.round(startTxs.reduce((s, t) => s + t.psf, 0) / startTxs.length);
  const endAvg = Math.round(endTxs.reduce((s, t) => s + t.psf, 0) / endTxs.length);
  const yrs = parseInt(ey) - parseInt(sy);
  if (yrs <= 0 || startAvg <= 0) return { cagr: null, startAvg, endAvg, lowConf: true };
  const cagr = Number(((Math.pow(endAvg / startAvg, 1 / yrs) - 1) * 100).toFixed(1));
  return { cagr, startAvg, endAvg, lowConf: startTxs.length < 3 || endTxs.length < 3 };
}
