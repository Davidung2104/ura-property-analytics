/**
 * bedroom.js — Bedroom inference model
 * Extracted from uraService.js lines 153-233
 * Builds per-project and market-wide area→bedroom mapping from rental data.
 */
import { rentalStore, bedroomModel, setBedroomModel } from './state.js';

/**
 * Build bedroom inference model from rental data.
 * Creates per-project and market-wide area ranges per bedroom count.
 * When an area overlaps multiple bedroom types, returns "3/4" etc.
 * Called once after rental data is loaded.
 */
export function buildBedroomModel() {
  const projAreas = {}; // project → { '1': [areas], '2': [areas], ... }
  const mktAreas = {};  // market-wide: { '1': [areas], '2': [areas], ... }

  for (const r of rentalStore) {
    const br = r.br;
    if (!br || br === '' || !/^\d+$/.test(br) || r.a <= 0) continue;
    if (!projAreas[r.p]) projAreas[r.p] = {};
    if (!projAreas[r.p][br]) projAreas[r.p][br] = [];
    projAreas[r.p][br].push(r.a);
    if (!mktAreas[br]) mktAreas[br] = [];
    mktAreas[br].push(r.a);
  }

  // Build range lookup: each bedroom type gets [min, max] from actual rental records
  const buildRanges = (areasByBed) => {
    const entries = Object.entries(areasByBed)
      .filter(([, areas]) => areas.length >= 3)
      .map(([br, areas]) => {
        const sorted = [...areas].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        return { br, min: sorted[0], max: sorted[sorted.length - 1], median, count: areas.length };
      })
      .sort((a, b) => a.median - b.median);
    return entries.length >= 2 ? entries : null;
  };

  const projRanges = {};
  for (const [proj, areasByBed] of Object.entries(projAreas)) {
    const r = buildRanges(areasByBed);
    if (r) projRanges[proj] = r;
  }

  const mktRanges = buildRanges(mktAreas);

  setBedroomModel({ projRanges, mktRanges });
  const projCount = Object.keys(projRanges).length;
  const mktBeds = mktRanges ? mktRanges.map(b => `${b.br}BR[${b.min}-${b.max}]`).join(', ') : 'none';
  console.log(`  🛏️  Bedroom model: ${projCount} projects with project-level, market=[${mktBeds}]`);
}

/**
 * Infer bedroom count from area using range overlap.
 * If area falls within ranges of multiple bedroom types, returns "3/4" etc.
 * Falls back to closest-median if no range matches.
 * @param {string} project - Project name
 * @param {number} area - Area in sqft
 * @returns {string} Bedroom count (e.g. '1', '2', '3/4') or '' if unknown
 */
export function inferBedrooms(project, area) {
  if (!bedroomModel || area <= 0) return '';

  const ranges = bedroomModel.projRanges[project] || bedroomModel.mktRanges;
  if (!ranges) return '';

  // Find all bedroom types whose observed range contains this area
  const matches = ranges.filter(r => area >= r.min && area <= r.max);
  if (matches.length === 1) return matches[0].br;
  if (matches.length > 1) return matches.map(m => m.br).join('/');

  // No exact range match → closest median fallback
  let best = ranges[0];
  let bestDist = Math.abs(area - best.median);
  for (let i = 1; i < ranges.length; i++) {
    const dist = Math.abs(area - ranges[i].median);
    if (dist < bestDist) { bestDist = dist; best = ranges[i]; }
  }
  return best.br;
}
