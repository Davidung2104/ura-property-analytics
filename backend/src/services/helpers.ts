// ═══════════════════════════════════════════════════════
// helpers.ts — Pure utility functions (zero dependencies)
// ═══════════════════════════════════════════════════════
import type { ParsedDate, ParsedFloor, YieldMap } from '../types.ts';

/** Parse URA MMYY contract date → { year, quarter, month } */
export function parseDate(cd: string | null | undefined): ParsedDate | null {
  if (!cd || cd.length < 4) return null;
  const mm = parseInt(cd.slice(0, 2));
  const yy = parseInt(cd.slice(2, 4));
  if (mm < 1 || mm > 12) return null;
  const year = yy > 50 ? 1900 + yy : 2000 + yy;
  return { year, quarter: `${String(year).slice(-2)}Q${Math.ceil(mm / 3)}`, month: mm };
}

/** Parse floor range "06 to 10" → { band: "06-10", mid: 8 } */
export function parseFloor(fr: string | null | undefined): ParsedFloor {
  if (!fr || fr === '-') return { band: null, mid: 0 };
  const parts = fr.replace(/\s/g, '').split('to');
  if (parts.length === 2) {
    const lo = parseInt(parts[0]!) || 0;
    const hi = parseInt(parts[1]!) || 0;
    return { band: `${String(lo).padStart(2, '0')}-${String(hi).padStart(2, '0')}`, mid: (lo + hi) / 2 };
  }
  // Already in "06-10" format
  const dashParts = fr.split('-');
  if (dashParts.length === 2) {
    const lo = parseInt(dashParts[0]!) || 0;
    const hi = parseInt(dashParts[1]!) || 0;
    if (lo > 0 && hi > 0) return { band: `${String(lo).padStart(2, '0')}-${String(hi).padStart(2, '0')}`, mid: (lo + hi) / 2 };
  }
  return { band: fr, mid: parseInt(fr) || 0 };
}

/** Sort district strings numerically: "D1" < "D10" */
export function distSort(a: string, b: string): number {
  return (parseInt(a.replace('D', '')) || 0) - (parseInt(b.replace('D', '')) || 0);
}

/** Safe average (returns 0 for n ≤ 0) */
export const avg = (sum: number, n: number): number => n > 0 ? Math.round(sum / n) : 0;

/** Median of numeric array (returns 0 for empty) */
export function med(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

/** Default gross yields by market segment */
export const DEFAULT_YIELD: YieldMap = { CCR: 0.025, RCR: 0.028, OCR: 0.032 };

/** Get yield for segment (uses computed if available, else default) */
export function getYield(seg: string, computed: YieldMap | null): number {
  return (computed || DEFAULT_YIELD)[seg] ?? 0.028;
}

/** Estimate monthly rent PSF from sale PSF and segment */
export function estRent(psf: number, seg: string, computed: YieldMap | null): number {
  return +(psf * getYield(seg, computed) / 12).toFixed(2);
}

/** Return dominant segment from counts map */
export function domSeg(segCounts: Record<string, number> | null): string {
  let best = 'RCR', max = 0;
  for (const [seg, n] of Object.entries(segCounts || {})) {
    if (n > max) { max = n; best = seg; }
  }
  return best;
}

/** Safe division with configurable decimal places */
export function safeDiv(num: number, den: number, decimals = 2): number {
  if (den === 0) return 0;
  return +((num / den).toFixed(decimals));
}

/**
 * Bounded top-N sorted collection.
 * Replaces unbounded array.push() + sort() pattern.
 * O(N) insert instead of O(N log N) re-sort.
 */
export class TopN<T> {
  private items: T[] = [];
  private readonly max: number;
  private readonly cmp: (a: T, b: T) => number;

  constructor(max: number, cmp: (a: T, b: T) => number) {
    this.max = max;
    this.cmp = cmp;
  }

  add(item: T): void {
    if (this.items.length < this.max) {
      this.items.push(item);
      this.items.sort(this.cmp);
    } else if (this.cmp(item, this.items[this.items.length - 1]!) < 0) {
      this.items[this.items.length - 1] = item;
      this.items.sort(this.cmp);
    }
  }

  result(): T[] { return this.items; }
}

/** Promise-based delay */
export const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));
