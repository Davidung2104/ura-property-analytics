// ═══════════════════════════════════════════════════════
// bedroom.ts — Bedroom inference model
// Builds per-project and market-wide area→bedroom mapping from rental data.
// ═══════════════════════════════════════════════════════
import { rentalStore, bedroomModel, setBedroomModel } from './state.ts';

interface BedroomRange {
  br: string;
  min: number;
  max: number;
  median: number;
  count: number;
}

export interface BedroomModelData {
  projRanges: Record<string, BedroomRange[]>;
  mktRanges: BedroomRange[] | null;
}

/** Build bedroom inference model from rental data. */
export function buildBedroomModel(): void {
  const projAreas: Record<string, Record<string, number[]>> = {};
  const mktAreas: Record<string, number[]> = {};

  for (const r of rentalStore) {
    const br = r.br;
    if (!br || br === '' || !/^\d+$/.test(br) || r.a <= 0) continue;
    if (!projAreas[r.p]) projAreas[r.p] = {};
    if (!projAreas[r.p]![br]) projAreas[r.p]![br] = [];
    projAreas[r.p]![br]!.push(r.a);
    if (!mktAreas[br]) mktAreas[br] = [];
    mktAreas[br]!.push(r.a);
  }

  const buildRanges = (areasByBed: Record<string, number[]>): BedroomRange[] | null => {
    const entries = Object.entries(areasByBed)
      .filter(([, areas]) => areas.length >= 3)
      .map(([br, areas]): BedroomRange => {
        const sorted = [...areas].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)]!;
        return { br, min: sorted[0]!, max: sorted[sorted.length - 1]!, median, count: areas.length };
      })
      .sort((a, b) => a.median - b.median);
    return entries.length >= 2 ? entries : null;
  };

  const projRanges: Record<string, BedroomRange[]> = {};
  for (const [proj, areasByBed] of Object.entries(projAreas)) {
    const r = buildRanges(areasByBed);
    if (r) projRanges[proj] = r;
  }

  const mktRanges = buildRanges(mktAreas);

  setBedroomModel({ projRanges, mktRanges } as any);
  const projCount = Object.keys(projRanges).length;
  const mktBeds = mktRanges ? mktRanges.map(b => `${b.br}BR[${b.min}-${b.max}]`).join(', ') : 'none';
  console.log(`  🛏️  Bedroom model: ${projCount} projects with project-level, market=[${mktBeds}]`);
}

/**
 * Infer bedroom count from area using range overlap.
 * Returns "3/4" for overlaps, falls back to closest-median.
 */
export function inferBedrooms(project: string, area: number): string {
  if (!bedroomModel || area <= 0) return '';

  const model = bedroomModel as unknown as BedroomModelData;
  const ranges = model.projRanges[project] || model.mktRanges;
  if (!ranges) return '';

  const matches = ranges.filter(r => area >= r.min && area <= r.max);
  if (matches.length === 1) return matches[0]!.br;
  if (matches.length > 1) return matches.map(m => m.br).join('/');

  let best = ranges[0]!;
  let bestDist = Math.abs(area - best.median);
  for (let i = 1; i < ranges.length; i++) {
    const dist = Math.abs(area - ranges[i]!.median);
    if (dist < bestDist) { bestDist = dist; best = ranges[i]!; }
  }
  return best.br;
}
