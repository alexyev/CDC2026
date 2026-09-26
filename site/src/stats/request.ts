// Builds the stats worker request for the current view (SPEC.md 6.1):
//   nation: areas = states whose centroid is in the viewport; schools = every school in those states.
//   state:  areas = counties whose centroid is in the viewport; schools = every school in those counties.
//   local:  no areas row; schools = schools whose pin is in the viewport; the panel notes the counties in view.
// Areas without any ODIS school (55 county polygons) are not units.

import type { CountiesFile, SchoolsFile, StatesFile } from "@/lib/dataTypes";
import { coordsInBBox, indicesWithKey, pointsInBBox } from "@/lib/geo";
import type { BBox, InsightRequest, Level } from "@/lib/types";

export interface InsightInputs {
  level: Level;
  /** The map viewport (lib/geo boundsToBBox). */
  viewport: BBox;
  layerA: string;
  layerB?: string;
  states: StatesFile;
  /** Needed at `state` and `local` level. */
  counties?: CountiesFile | null;
  /** Null while schools/all.json is still loading: the schools row is then empty. */
  schools: SchoolsFile | null;
}

export interface InsightPlan {
  request: InsightRequest;
  /** Areas on screen: state FIPS at `nation`, county GEOIDs at `state`, none at `local`. */
  areaIds: string[];
  /** Counties whose centroid is in view, for the local-level note "{k} counties in view". */
  countiesInView: number;
}

type Columns = InsightRequest["schools"];

function pick(
  ids: readonly string[],
  idx: readonly number[],
  x: readonly (number | null)[],
  y?: readonly (number | null)[],
): Columns {
  return {
    ids: idx.map((i) => ids[i]),
    x: idx.map((i) => x[i] ?? null),
    y: y ? idx.map((i) => y[i] ?? null) : undefined,
  };
}

function areaIndicesInView(file: StatesFile | CountiesFile, viewport: BBox): number[] {
  return pointsInBBox(file.centroid, viewport).filter((i) => file.n[i] > 0);
}

function areaColumns(file: StatesFile | CountiesFile, idx: number[], layerA: string, layerB?: string): Columns {
  const a = file.measures[layerA];
  if (!a) throw new Error(`unknown layer "${layerA}" in area measures`);
  const b = layerB === undefined ? undefined : file.measures[layerB];
  if (layerB !== undefined && !b) throw new Error(`unknown layer "${layerB}" in area measures`);
  return pick(file.ids, idx, a.mean, b?.mean);
}

function schoolColumns(
  schools: SchoolsFile | null,
  select: (s: SchoolsFile) => number[],
  layerA: string,
  layerB?: string,
): Columns {
  if (!schools) return { ids: [], x: [], y: layerB === undefined ? undefined : [] };
  const a = schools.values[layerA];
  if (!a) throw new Error(`unknown layer "${layerA}" in school values`);
  const b = layerB === undefined ? undefined : schools.values[layerB];
  if (layerB !== undefined && !b) throw new Error(`unknown layer "${layerB}" in school values`);
  return pick(schools.ids, select(schools), a, b);
}

export function buildInsightRequest(requestId: number, inputs: InsightInputs): InsightPlan {
  const { level, viewport, layerA, layerB, states, counties, schools } = inputs;
  const bootstrap = { resamples: 1000, seed: 42 } as const;
  const countyIdx = counties ? areaIndicesInView(counties, viewport) : [];

  if (level === "local") {
    const request: InsightRequest = {
      requestId,
      layerA,
      layerB,
      schools: schoolColumns(schools, (s) => coordsInBBox(s.lon, s.lat, viewport), layerA, layerB),
      bootstrap,
    };
    return { request, areaIds: [], countiesInView: countyIdx.length };
  }

  let areas: Columns;
  let keys: Set<string>;
  let schoolKey: (s: SchoolsFile) => string[];
  if (level === "nation") {
    const idx = areaIndicesInView(states, viewport);
    areas = areaColumns(states, idx, layerA, layerB);
    keys = new Set(areas.ids);
    schoolKey = (s) => s.stfp;
  } else {
    if (!counties) throw new Error("counties.json is required at state level");
    areas = areaColumns(counties, countyIdx, layerA, layerB);
    keys = new Set(areas.ids);
    schoolKey = (s) => s.county;
  }
  const request: InsightRequest = {
    requestId,
    layerA,
    layerB,
    areas,
    schools: schoolColumns(schools, (s) => indicesWithKey(schoolKey(s), keys), layerA, layerB),
    bootstrap,
  };
  return { request, areaIds: areas.ids, countiesInView: countyIdx.length };
}
