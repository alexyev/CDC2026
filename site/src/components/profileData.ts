// Pure data for the profile drawer and the pin tooltip (SPEC.md 3.5, 7, U5): one school's values from
// schools/all.json with county, state, and national benchmarks from counties.json, states.json, and national.json.

import catalog from "../../data/catalog.json";
import { SchoolFlag, type CountiesFile, type NationalFile, type SchoolsFile, type StatesFile } from "@/lib/dataTypes";
import type { Domain, LayerDef } from "@/lib/types";

export const LAYERS = catalog.layers as LayerDef[];
const LAYER_BY_ID = new Map(LAYERS.map((l) => [l.id, l]));

export function layerDef(id: string): LayerDef | undefined {
  return LAYER_BY_ID.get(id);
}

export interface ProfileSources {
  schools: SchoolsFile;
  counties: CountiesFile;
  states: StatesFile;
  national: NationalFile;
}

export interface Benchmarks {
  county: number | null;
  state: number | null;
  nation: number | null;
}

export type RowBadge = "county" | "approx" | "proxy";

export interface ProfileRow {
  layer: LayerDef;
  value: number | null;
  /** National percentile rank, for the six scores that have one. */
  pct: number | null;
  bench: Benchmarks;
  badges: RowBadge[];
  /** Why the value is missing, when known (SPEC.md 7). */
  missingReason?: string;
}

export interface ProfileSection {
  id: string;
  title: string;
  /** Domain score shown next to an indicator group heading. */
  score?: ProfileRow;
  note?: string;
  rows: ProfileRow[];
}

export interface SchoolProfile {
  id: string;
  name: string;
  district: string;
  city: string;
  st: string;
  stateName: string;
  countyName: string;
  zip: string;
  lon: number;
  lat: number;
  ctFilled: boolean;
  composite: ProfileRow;
  /** One group per domain in DOMAIN_ORDER, headed by the domain score. */
  domains: ProfileSection[];
  context: ProfileSection;
}

export const COUNTY_BADGE_TIP =
  "This measure is only available per county. Every school in a county shares the same value.";
export const CONTEXT_NOTE =
  "Race and ethnicity shares are included by ODIS for context only and do not enter any score.";
export const CT_NOTE =
  "Connecticut values filled from current public sources; lead exposure is an approximation and park access a regional proxy.";

const CRIME_LAYERS = new Set(["crime", "violent_crime", "incarceration"]);
const NO_CRIME_STATES = new Set(["CT", "PR"]);
const HALF_MISSING_LAYERS = new Set(["lead_risk", "park_access"]);

/** Profile groups: each domain score heads its indicators; Gini stands alone. */
const DOMAIN_ORDER: Domain[] = ["economic", "education", "health", "housing", "crime", "gini"];
const DOMAIN_TITLES: Record<Domain, string> = {
  composite: "Composite",
  economic: "Economic",
  education: "Education",
  health: "Health",
  housing: "Housing",
  crime: "Crime",
  gini: "Income inequality",
};

/** Why a school has no value for a layer, when the data explains it (SPEC.md 7). */
export function missingReason(layerId: string, st: string): string | undefined {
  if (CRIME_LAYERS.has(layerId) && NO_CRIME_STATES.has(st)) return "ODIS has no crime inputs for this state";
  if (HALF_MISSING_LAYERS.has(layerId)) return "Not available for about half of schools nationally";
  return undefined;
}

export function ncesUrl(ncessch: string): string {
  return `https://nces.ed.gov/ccd/schoolsearch/school_detail.asp?ID=${encodeURIComponent(ncessch)}`;
}

/** Upper end of a layer's value range: Gini is 0 to 1, everything else 0 to 100. */
export function layerMax(layer: LayerDef): number {
  return layer.unit === "gini" ? 1 : 100;
}

/** A school value as the CSV has it: integers, Gini to two decimals, shares with a percent sign. */
export function formatValue(layer: LayerDef, v: number | null): string {
  if (v === null) return "no data";
  if (layer.unit === "gini") return v.toFixed(2);
  if (layer.unit === "percent") return `${Math.round(v)}%`;
  return String(Math.round(v));
}

/** An aggregate (mean) value: one decimal, Gini two. */
export function formatMean(layer: LayerDef, v: number | null): string {
  if (v === null) return "–";
  if (layer.unit === "gini") return v.toFixed(2);
  const s = v.toFixed(1);
  return layer.unit === "percent" ? `${s}%` : s;
}

export function ordinal(n: number): string {
  const r = Math.round(n);
  const mod100 = r % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${r}th`;
  switch (r % 10) {
    case 1:
      return `${r}st`;
    case 2:
      return `${r}nd`;
    case 3:
      return `${r}rd`;
    default:
      return `${r}th`;
  }
}

const indexCache = new WeakMap<object, Map<string, number>>();

function idIndex(ids: string[]): Map<string, number> {
  let m = indexCache.get(ids);
  if (!m) {
    m = new Map(ids.map((id, i) => [id, i]));
    indexCache.set(ids, m);
  }
  return m;
}

/** Row index of a school in schools/all.json, or -1. */
export function schoolIndex(schools: SchoolsFile, ncessch: string): number {
  return idIndex(schools.ids).get(ncessch) ?? -1;
}

function areaMean(file: CountiesFile | StatesFile, index: number, layerId: string): number | null {
  if (index < 0) return null;
  return file.measures[layerId]?.mean[index] ?? null;
}

function buildRow(src: ProfileSources, i: number, countyIdx: number, stateIdx: number, layer: LayerDef): ProfileRow {
  const { schools } = src;
  const value = schools.values[layer.id]?.[i] ?? null;
  const pct = layer.pctColumn ? (schools.values[`${layer.id}_pct`]?.[i] ?? null) : null;
  const st = schools.st[i] ?? "";
  const ctFilled = ((schools.flags[i] ?? 0) & SchoolFlag.ctFilled) !== 0;
  const badges: RowBadge[] = [];
  if (layer.resolution === "county") badges.push("county");
  if (ctFilled && layer.id === "lead_risk") badges.push("approx");
  if (ctFilled && layer.id === "park_access") badges.push("proxy");
  return {
    layer,
    value,
    pct,
    bench: {
      county: areaMean(src.counties, countyIdx, layer.id),
      state: areaMean(src.states, stateIdx, layer.id),
      nation: src.national.schools.mean[layer.id] ?? null,
    },
    badges,
    missingReason: value === null ? missingReason(layer.id, st) : undefined,
  };
}

/** Builds the full profile card for one school, or null when the id is not in the data. */
export function buildProfile(src: ProfileSources, ncessch: string): SchoolProfile | null {
  const { schools } = src;
  const i = schoolIndex(schools, ncessch);
  if (i < 0) return null;
  const countyIdx = idIndex(src.counties.ids).get(schools.county[i] ?? "") ?? -1;
  const stateIdx = idIndex(src.states.ids).get(schools.stfp[i] ?? "") ?? -1;
  const row = (layer: LayerDef) => buildRow(src, i, countyIdx, stateIdx, layer);

  const scoreLayers = LAYERS.filter((l) => l.group === "score");
  const scoreRows = scoreLayers.map(row);
  const scoreById = new Map(scoreRows.map((r) => [r.layer.id, r]));

  const domains = DOMAIN_ORDER.map<ProfileSection>((domain) => ({
    id: domain,
    title: DOMAIN_TITLES[domain],
    score: scoreById.get(domain),
    rows: LAYERS.filter((l) => l.group === "indicator" && l.domain === domain).map(row),
  }));

  return {
    id: ncessch,
    name: schools.name[i] ?? ncessch,
    district: schools.district[i] ?? "",
    city: schools.city[i] ?? "",
    st: schools.st[i] ?? "",
    stateName: stateIdx >= 0 ? (src.states.names[stateIdx] ?? "") : "",
    countyName: schools.countyName[i] ?? "",
    zip: schools.zip[i] ?? "",
    lon: schools.lon[i] ?? 0,
    lat: schools.lat[i] ?? 0,
    ctFilled: ((schools.flags[i] ?? 0) & SchoolFlag.ctFilled) !== 0,
    composite: scoreById.get("composite") ?? row(LAYERS[0]!),
    domains,
    context: {
      id: "context",
      title: "Context (not in the index)",
      note: CONTEXT_NOTE,
      rows: LAYERS.filter((l) => l.group === "context").map(row),
    },
  };
}

export interface TooltipLine {
  layer: LayerDef;
  value: string;
  /** "63rd percentile" when the layer has a national percentile. */
  pct?: string;
  county: boolean;
  missing: boolean;
}

/** Pin tooltip lines for the active layers (SPEC.md 3.5): value with its national percentile in parentheses. */
export function tooltipLines(schools: SchoolsFile, i: number, layerIds: readonly string[]): TooltipLine[] {
  return layerIds.flatMap((id) => {
    const layer = layerDef(id);
    if (!layer) return [];
    const v = schools.values[id]?.[i] ?? null;
    const p = layer.pctColumn ? (schools.values[`${id}_pct`]?.[i] ?? null) : null;
    return [
      {
        layer,
        value: formatValue(layer, v),
        pct: v !== null && p !== null ? `${ordinal(p)} percentile` : undefined,
        county: layer.resolution === "county",
        missing: v === null,
      },
    ];
  });
}
