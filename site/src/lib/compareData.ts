// Data helpers for compare mode (SPEC.md 3.9, 6.1, 6.4): which schools a pinned area or the viewport holds,
// the value pairs sent to the stats worker, and the distribution strips. Pure functions, no map or store access.

import { buildInsightRequest } from "@/stats/request";
import type { CountiesFile, NationalFile, SchoolsFile, StatesFile } from "./dataTypes";
import type { BBox, LayerDef, Level, PlaceRef } from "./types";
import type { AreaKind } from "@/store/compareSlice";

/** Compare pins are states at `nation` level and counties at `state` and `local` level. */
export function areaKindForLevel(level: Level): AreaKind {
  return level === "nation" ? "state" : "county";
}

/** Plural unit name for copy such as "Click up to two counties to pin them." */
export function areaNoun(kind: AreaKind): string {
  return kind === "state" ? "states" : "counties";
}

/** Indices into schools/all.json of the schools inside a state (by STATEFP) or county (by GEOID). */
export function schoolsInArea(schools: SchoolsFile, place: PlaceRef): number[] {
  const column = place.kind === "state" ? schools.stfp : place.kind === "county" ? schools.county : null;
  if (!column) return [];
  const out: number[] = [];
  for (let i = 0; i < column.length; i++) if (column[i] === place.id) out.push(i);
  return out;
}

export interface ValuePairs {
  ids: string[];
  x: (number | null)[];
  y?: (number | null)[];
}

/**
 * The schools on screen, exactly as the insight panel's "Schools inside them" row counts them (SPEC.md 6.1), from
 * S1's request builder: at `nation` the schools of states whose centroid is in view, at `state` of counties, at
 * `local` the schools whose pin is in view. Without a viewport (no map yet), every school.
 */
export function viewportPairs(
  level: Level,
  viewport: BBox | null,
  files: { schools: SchoolsFile; states: StatesFile; counties: CountiesFile },
  layerA: string,
  layerB?: string,
): ValuePairs {
  const { schools, states, counties } = files;
  if (!viewport)
    return valuePairs(
      schools,
      schools.ids.map((_, i) => i),
      layerA,
      layerB,
    );
  return buildInsightRequest(0, { level, viewport, layerA, layerB, states, counties, schools }).request.schools;
}

/** School ids and layer values for a set of school indices, in the InsightRequest column shape. */
export function valuePairs(schools: SchoolsFile, indices: number[], layerA: string, layerB?: string): ValuePairs {
  const colA = schools.values[layerA] ?? [];
  const colB = layerB ? (schools.values[layerB] ?? []) : undefined;
  return {
    ids: indices.map((i) => schools.ids[i]!),
    x: indices.map((i) => colA[i] ?? null),
    y: colB ? indices.map((i) => colB[i] ?? null) : undefined,
  };
}

/** Number of units with both values present (pairwise deletion, SPEC.md 6.2). */
export function pairCount(p: ValuePairs): number {
  if (!p.y) return p.x.filter((v) => v !== null).length;
  let n = 0;
  for (let i = 0; i < p.x.length; i++) if (p.x[i] !== null && p.y[i] !== null) n++;
  return n;
}

/** A layer's national range: 0-100 for scores, indicators, and shares; 0-1 for Gini (SPEC.md 6.4). */
export function layerRange(def: Pick<LayerDef, "unit"> | undefined): [number, number] {
  return def?.unit === "gini" ? [0, 1] : [0, 100];
}

export const DISTRIBUTION_BINS = 20;

export interface Distribution {
  /** Counts in 20 equal bins over the layer's national range. */
  counts: number[];
  median: number | null;
  mean: number | null;
  n: number;
}

function medianOf(sorted: number[]): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Distribution strip data: 20 bins over `range` (values on the top edge go to the last bin), median, and mean. */
export function distribution(values: readonly (number | null)[], range: [number, number]): Distribution {
  const counts = new Array<number>(DISTRIBUTION_BINS).fill(0);
  const present: number[] = [];
  const [lo, hi] = range;
  const width = (hi - lo) / DISTRIBUTION_BINS;
  let sum = 0;
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) continue;
    present.push(v);
    sum += v;
    const bin = Math.min(DISTRIBUTION_BINS - 1, Math.max(0, Math.floor((v - lo) / width)));
    counts[bin]!++;
  }
  present.sort((a, b) => a - b);
  return { counts, median: medianOf(present), mean: present.length ? sum / present.length : null, n: present.length };
}

/** The nationwide school-level Spearman for a pair, from national.json (SPEC.md 6.5), or null when absent. */
export function nationalSpearman(national: NationalFile, layerA: string, layerB: string): number | null {
  const i = national.layers.indexOf(layerA);
  const j = national.layers.indexOf(layerB);
  if (i < 0 || j < 0) return null;
  return national.schools.spearman[i]?.[j] ?? null;
}

/** Display name of a pinned area: "California", or "Los Angeles County, CA". */
export function areaName(place: PlaceRef, states: StatesFile, counties: CountiesFile): string {
  if (place.kind === "state") {
    const i = states.ids.indexOf(place.id);
    return i >= 0 ? states.names[i]! : `State ${place.id}`;
  }
  const i = counties.ids.indexOf(place.id);
  if (i < 0) return `County ${place.id}`;
  const s = states.ids.indexOf(counties.st[i]!);
  return s >= 0 ? `${counties.names[i]}, ${states.usps[s]}` : counties.names[i]!;
}

/** Bounding box of a pinned area from the aggregate files, for the camera. */
export function areaBBox(place: PlaceRef, states: StatesFile, counties: CountiesFile): BBox | undefined {
  const file = place.kind === "state" ? states : place.kind === "county" ? counties : null;
  if (!file) return undefined;
  const i = file.ids.indexOf(place.id);
  return i >= 0 ? file.bbox[i] : undefined;
}
