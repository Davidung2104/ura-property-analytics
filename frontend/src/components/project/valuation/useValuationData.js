/**
 * useValuationData.js — Shared computation hooks for ValuationTab sections
 * Extracted from ValuationTab.jsx: all useMemo/useCallback logic lives here.
 * Sub-components import only the hooks they need → zero duplicated computation.
 */
import { useState, useMemo, useCallback } from 'react';
import { computeBucketCAGR, DEFAULT_YIELD } from '../../constants';

// ── Master filter: apply beds, year range, sale type, tenure, floor ──

function matchFloor(t, band) {
  const fl = t.floorMid || 0;
  if (band === '01-05') return fl >= 1 && fl <= 5;
  if (band === '06-10') return fl >= 6 && fl <= 10;
  if (band === '11-15') return fl >= 11 && fl <= 15;
  if (band === '16-20') return fl >= 16 && fl <= 20;
  if (band === '21-30') return fl >= 21 && fl <= 30;
  if (band === '31+') return fl >= 31;
  return true;
}

export function useFilteredTxs(projData, masterFilters) {
  const bedsFilter = masterFilters?.beds || 'all';
  const yearFrom = masterFilters?.yearFrom || '';
  const yearTo = masterFilters?.yearTo || '';
  const saleType = masterFilters?.saleType || 'all';
  const tenureFilter = masterFilters?.tenure || 'all';
  const floorFilter = masterFilters?.floor || 'all';

  const filteredTxs = useMemo(() => {
    let txs = projData?.txs || [];
    if (bedsFilter !== 'all') txs = txs.filter(t => t.beds && t.beds.split('/').includes(bedsFilter));
    if (yearFrom) txs = txs.filter(t => t.year >= yearFrom);
    if (yearTo) txs = txs.filter(t => t.year <= yearTo);
    if (saleType !== 'all') txs = txs.filter(t => t.saleType === saleType);
    if (tenureFilter !== 'all') txs = txs.filter(t => t.tenure === tenureFilter);
    if (floorFilter !== 'all') txs = txs.filter(t => matchFloor(t, floorFilter));
    return txs;
  }, [projData, bedsFilter, yearFrom, yearTo, saleType, tenureFilter, floorFilter]);

  const hasFilters = bedsFilter !== 'all' || yearFrom || yearTo || saleType !== 'all' || tenureFilter !== 'all' || floorFilter !== 'all';

  return { filteredTxs, hasFilters };
}

// ── Unit selection state (shared between PriceEstimator + ValuationModel) ──

export function useUnitSelection(projData) {
  const projSizes = projData?.projSizes || [];
  const projFloorRanges = projData?.floorRanges || [];

  const [estArea, setEstArea] = useState(() =>
    projSizes.length > 0 ? projSizes[Math.floor(projSizes.length / 2)] : 0
  );
  const [estFloor, setEstFloor] = useState('');

  const pArea = estArea || (projSizes.length > 0 ? projSizes[Math.floor(projSizes.length / 2)] : 0);
  const pFloor = estFloor;

  return { estArea, setEstArea, estFloor, setEstFloor, pArea, pFloor, projSizes, projFloorRanges };
}

// ── Time windows (3M/6M/12M) ──

export function useTxWindows(filteredTxs) {
  return useMemo(() => {
    if (!filteredTxs.length) return { m3: [], m6: [], m12: [] };
    const now = new Date();
    const cutoff = (months) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    return {
      m3: filteredTxs.filter(t => t.date >= cutoff(3)),
      m6: filteredTxs.filter(t => t.date >= cutoff(6)),
      m12: filteredTxs.filter(t => t.date >= cutoff(12)),
    };
  }, [filteredTxs]);
}

// ── Project CAGR ──

export function useProjCagr(filteredTxs) {
  return useMemo(() => computeBucketCAGR(filteredTxs).cagr, [filteredTxs]);
}

// ── Time adjustment function ──

export function useTimeAdjust(projCagr) {
  return useCallback((psf, txDate) => {
    if (!psf || !txDate) return { adjPsf: psf, months: 0, rate: null };
    const now = new Date();
    const [y, m] = txDate.split('-').map(Number);
    const txTime = new Date(y, (m || 1) - 1, 15);
    const months = Math.max(0, (now.getFullYear() - txTime.getFullYear()) * 12 + now.getMonth() - txTime.getMonth());
    if (projCagr === null || projCagr === undefined) return { adjPsf: psf, months, rate: null };
    if (months < 1) return { adjPsf: psf, months: 0, rate: projCagr };
    const adjPsf = Math.round(psf * Math.pow(1 + projCagr / 100, months / 12));
    return { adjPsf, months, rate: projCagr };
  }, [projCagr]);
}

// ── Filtered floor premium data ──

export function useFilteredFloorData(projData, filteredTxs, hasFilters) {
  return useMemo(() => {
    if (!hasFilters) return { floors: projData?.projFloor || [], thinBands: projData?.thinBands || [], baselineSource: projData?.baselineSource || '' };
    const floorRanges = projData?.floorRanges || [];
    if (!floorRanges.length || !filteredTxs.length) return { floors: [], thinBands: [], baselineSource: '' };
    const thinThreshold = 3;
    const byF = {};
    floorRanges.forEach(r => { byF[r] = []; });
    filteredTxs.forEach(t => {
      const fm = t.floorMid || 0;
      for (const r of floorRanges) {
        const [lo, hi] = r.split('-').map(Number);
        if (fm >= lo && fm <= hi) { byF[r].push(t.psf); break; }
      }
    });
    const floors = floorRanges.map(r => {
      const v = byF[r] || [];
      if (!v.length) return null;
      const fp = Math.round(v.reduce((s, x) => s + x, 0) / v.length);
      return { range: r, psf: fp, count: v.length, thin: v.length < thinThreshold, premium: 0 };
    }).filter(Boolean);
    if (floors.length > 0) {
      const base = floors[0].psf;
      floors.forEach(f => { f.premium = base > 0 ? +((f.psf / base - 1) * 100).toFixed(1) : 0; });
    }
    const thinBands = floors.filter(f => f.thin).map(f => f.range);
    return { floors, thinBands, baselineSource: floors.length > 0 ? 'filtered' : '' };
  }, [projData, filteredTxs, hasFilters]);
}

// ── Filtered heatmap data ──

export function useFilteredHeatmap(projData, filteredTxs, hasFilters) {
  return useMemo(() => {
    const hmYears = projData?.hmYears || [];
    const hmFloors = projData?.hmFloors || [];
    if (!hasFilters) return { matrix: projData?.hmMatrix || {}, years: hmYears, floors: hmFloors };
    const matrix = {};
    hmFloors.forEach(f => {
      const [lo, hi] = f.split('-').map(Number);
      hmYears.forEach(y => {
        const c = filteredTxs.filter(t => t.floorMid >= lo && t.floorMid <= hi && t.year === y);
        if (c.length > 0) matrix[`${f}-${y}`] = { psf: Math.round(c.reduce((s, t) => s + t.psf, 0) / c.length), vol: c.length, price: Math.round(c.reduce((s, t) => s + t.price, 0) / c.length) };
      });
    });
    return { matrix, years: hmYears, floors: hmFloors };
  }, [projData, filteredTxs, hasFilters]);
}

// ── Valuation model (CMA) ──

export function useValuationModel(projData, filteredTxs, hasFilters, pArea, pFloor, projCagr, floorData) {
  return useMemo(() => {
    const txs = hasFilters ? filteredTxs : (projData?.txs || []);
    if (txs.length < 3) return null;
    const now = new Date();
    const targetSize = pArea;
    const targetFloorMid = pFloor ? (() => { const [lo, hi] = pFloor.split('-').map(Number); return (lo + hi) / 2; })() : null;

    const scored = txs.map(tx => {
      const [y, m] = tx.date.split('-').map(Number);
      const txTime = new Date(y, (m || 1) - 1, 15);
      const monthsAgo = Math.max(0, (now.getFullYear() - txTime.getFullYear()) * 12 + now.getMonth() - txTime.getMonth());
      const recencyW = Math.exp(-0.5 * monthsAgo / 18);
      const sizeDiff = Math.abs(tx.area - targetSize);
      const sizeW = Math.exp(-0.5 * Math.pow(sizeDiff / 150, 2));
      let floorW = 0.5;
      if (targetFloorMid && tx.floorMid) {
        const floorDiff = Math.abs(tx.floorMid - targetFloorMid);
        floorW = Math.exp(-0.5 * Math.pow(floorDiff / 8, 2));
      }
      const weight = recencyW * sizeW * floorW;
      let adjPsf = tx.psf;
      if (monthsAgo > 0 && projCagr) adjPsf = adjPsf * Math.pow(1 + projCagr / 100, monthsAgo / 12);
      if (targetFloorMid && tx.floorMid && floorData.length > 1) {
        const findPremium = (mid) => {
          const band = floorData.find(f => { const [lo, hi] = f.range.split('-').map(Number); return mid >= lo && mid <= hi; });
          return band ? band.premium : 0;
        };
        const premDiff = (findPremium(targetFloorMid) - findPremium(tx.floorMid)) / 100;
        adjPsf = adjPsf * (1 + premDiff);
      }
      return { ...tx, adjPsf: Math.round(adjPsf), weight, monthsAgo, sizeDiff, recencyW, sizeW, floorW };
    });

    const totalW = scored.reduce((s, t) => s + t.weight, 0);
    if (totalW === 0) return null;
    const wAvgPsf = Math.round(scored.reduce((s, t) => s + t.adjPsf * t.weight, 0) / totalW);
    const variance = scored.reduce((s, t) => s + t.weight * Math.pow(t.adjPsf - wAvgPsf, 2), 0) / totalW;
    const stdDev = Math.round(Math.sqrt(variance));
    const topComps = [...scored].sort((a, b) => b.weight - a.weight).slice(0, 5);
    const recent6mo = scored.filter(t => t.monthsAgo <= 6).length;
    const recent12mo = scored.filter(t => t.monthsAgo <= 12).length;
    const sizeMatches = scored.filter(t => t.sizeDiff < 50).length;
    const floorMatches = targetFloorMid ? scored.filter(t => t.floorMid && Math.abs(t.floorMid - targetFloorMid) <= 4).length : null;
    const conf = Math.min(100, Math.round(
      targetFloorMid
        ? (Math.min(recent12mo, 10) / 10) * 30 + (Math.min(sizeMatches, 5) / 5) * 25 + (Math.min(floorMatches, 5) / 5) * 20 + (Math.min(scored.length, 20) / 20) * 25
        : (Math.min(recent12mo, 10) / 10) * 40 + (Math.min(sizeMatches, 5) / 5) * 30 + (Math.min(scored.length, 20) / 20) * 30
    ));

    return { wAvgPsf, lowPsf: wAvgPsf - stdDev, highPsf: wAvgPsf + stdDev, stdDev, topComps, totalTx: scored.length, recent6mo, recent12mo, sizeMatches, floorMatches, conf, cagr: projCagr };
  }, [projData, pArea, pFloor, projCagr, filteredTxs, floorData, hasFilters]);
}
