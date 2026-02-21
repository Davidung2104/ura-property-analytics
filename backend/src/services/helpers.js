/**
 * helpers.js — Pure utility functions
 * Extracted from uraService.js lines 111-249
 * Zero external dependencies, fully testable
 */

/** Parse URA contractDate (MMYY) → { year, quarter, month } or null */
export function parseDate(cd) {
  if (!cd || cd.length < 4) return null;
  const mm = parseInt(cd.slice(0, 2));
  const yy = parseInt(cd.slice(2, 4));
  if (mm < 1 || mm > 12) return null;
  const year = yy > 50 ? 1900 + yy : 2000 + yy;
  return { year, quarter: `${String(year).slice(-2)}Q${Math.ceil(mm / 3)}`, month: mm };
}

/** Parse URA floorRange "06 to 10" → { band: "06-10", mid: 8 } */
export function parseFloor(fr) {
  if (!fr || fr === '-') return { band: null, mid: 0 };
  let parts = fr.replace(/\s/g, '').split('to');
  if (parts.length !== 2) parts = fr.split('-').map(s => s.trim());
  if (parts.length === 2) {
    const lo = parseInt(parts[0]) || 0, hi = parseInt(parts[1]) || 0;
    if (lo > 0 && hi > 0) return { band: `${String(lo).padStart(2, '0')}-${String(hi).padStart(2, '0')}`, mid: (lo + hi) / 2 };
  }
  return { band: fr, mid: parseInt(fr) || 0 };
}

/** Sort district strings "D1","D2" numerically */
export function distSort(a, b) {
  return (parseInt(a.replace('D', '')) || 0) - (parseInt(b.replace('D', '')) || 0);
}

/** Safe average: sum/n rounded. Returns 0 if n=0. */
export const avg = (sum, n) => n > 0 ? Math.round(sum / n) : 0;

/** Median of numeric array. Returns 0 for empty. */
export function med(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Estimated yields — ONLY used as last-resort fallback when URA rental API has no data */
export const DEFAULT_YIELD = { CCR: 0.025, RCR: 0.028, OCR: 0.032 };

export function getYield(seg, computedYield) {
  return (computedYield || DEFAULT_YIELD)[seg] || 0.028;
}

export function estRent(psf, seg, computedYield) {
  return +(psf * getYield(seg, computedYield) / 12).toFixed(2);
}

/** Return dominant segment from { CCR: 10, RCR: 50, OCR: 30 } */
export function domSeg(segCounts) {
  let best = 'RCR', max = 0;
  for (const [seg, n] of Object.entries(segCounts || {})) {
    if (n > max) { max = n; best = seg; }
  }
  return best;
}

/** Safe division helper — returns 0 instead of NaN when divisor is 0 */
export const safeDiv = (num, den, decimals = 2) => den > 0 ? +(num / den).toFixed(decimals) : 0;

/** Bounded top-N sorted collection (FIX #1: no unbounded array) */
export class TopN {
  constructor(n, cmp) { this.n = n; this.cmp = cmp; this.items = []; }
  add(item) {
    if (this.items.length < this.n) {
      this.items.push(item);
      if (this.items.length === this.n) this.items.sort(this.cmp);
    } else if (this.cmp(item, this.items[this.items.length - 1]) < 0) {
      this.items[this.items.length - 1] = item;
      this.items.sort(this.cmp);
    }
  }
  result() { this.items.sort(this.cmp); return this.items; }
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
