import { useMemo } from 'react';

/**
 * Shared project filtering logic used across project tabs.
 * Extracts masterFilters, applies them to projData.txs, and derives:
 *  - filteredTxs: filtered transaction array
 *  - filteredFloorData: { floors, thinBands, baselineSource }
 *  - filteredHm: { matrix, years, floors }
 *  - hasFilters: boolean
 */
export function useProjectFilters(projData, masterFilters = {}) {
  const bedsFilter = masterFilters.beds || 'all';
  const yearFrom = masterFilters.yearFrom || '';
  const yearTo = masterFilters.yearTo || '';
  const saleType = masterFilters.saleType || 'all';
  const tenureFilter = masterFilters.tenure || 'all';
  const floorFilter = masterFilters.floor || 'all';

  const matchFloor = (t, band) => {
    const fl = t.floorMid || 0;
    if (band === '01-05') return fl >= 1 && fl <= 5;
    if (band === '06-10') return fl >= 6 && fl <= 10;
    if (band === '11-15') return fl >= 11 && fl <= 15;
    if (band === '16-20') return fl >= 16 && fl <= 20;
    if (band === '21-30') return fl >= 21 && fl <= 30;
    if (band === '31+') return fl >= 31;
    return true;
  };

  const hasFilters = bedsFilter !== 'all' || yearFrom || yearTo || saleType !== 'all' || tenureFilter !== 'all' || floorFilter !== 'all';

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

  const filteredFloorData = useMemo(() => {
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

  const filteredHm = useMemo(() => {
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

  return { filteredTxs, filteredFloorData, filteredHm, hasFilters };
}
