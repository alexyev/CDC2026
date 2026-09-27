// Area means for correlations (SPEC.md 6.1): the unrounded mean of the school values behind each state or county.

import type { CountiesFile, SchoolsFile, StatesFile } from "./dataTypes";

/** The schools column that names each school's area at a level. */
export type AreaKey = "stfp" | "county";

/** Sum and count of one layer's school values per area, cached per schools file since it only changes on reload. */
const sumsCache = new WeakMap<SchoolsFile, Map<string, Map<string, { sum: number; n: number }>>>();

function schoolSums(schools: SchoolsFile, key: AreaKey, layer: string): Map<string, { sum: number; n: number }> {
  let byLayer = sumsCache.get(schools);
  if (!byLayer) sumsCache.set(schools, (byLayer = new Map()));
  const cacheKey = `${key}:${layer}`;
  let sums = byLayer.get(cacheKey);
  if (!sums) {
    sums = new Map();
    const areas = schools[key];
    const values = schools.values[layer] ?? [];
    values.forEach((v, i) => {
      if (v === null) return;
      const area = areas[i]!;
      const e = sums!.get(area);
      if (e) {
        e.sum += v;
        e.n++;
      } else sums!.set(area, { sum: v, n: 1 });
    });
    byLayer.set(cacheKey, sums);
  }
  return sums;
}

/**
 * One layer's area means at full precision. The shipped means are rounded for display, and rounding ties ranks
 * (Gini to two decimals), so a correlation over them drifts from the pipeline's nationwide figure, which uses
 * unrounded means (0.48 against 0.50 for Composite and Gini across states). The mean is recomputed from the school
 * values whenever they hold every school behind the shipped mean, and the shipped mean is kept otherwise.
 */
export function areaMeans(
  file: StatesFile | CountiesFile,
  idx: readonly number[],
  layer: string,
  schools: SchoolsFile | null | undefined,
  key: AreaKey,
): (number | null)[] {
  const m = file.measures[layer];
  if (!m) throw new Error(`unknown layer "${layer}" in area measures`);
  const sums = schools?.values[layer] ? schoolSums(schools, key, layer) : null;
  return idx.map((i) => {
    const e = sums?.get(file.ids[i]!);
    return e && e.n === m.n[i] ? e.sum / e.n : (m.mean[i] ?? null);
  });
}
