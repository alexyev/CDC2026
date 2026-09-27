// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Hover overview cards (SPEC.md 3.5): pure content builders for the state, county, and school cards, plus the
// placement rule that keeps a card inside the map and off the cursor. Built from files the app already holds
// (states.json, counties.json, schools/all.json); nothing here fetches.

import { CT_NOTE, formatMean, formatValue, missingReason, ordinal } from "@/components/profileData";
import { SchoolFlag, type CountiesFile, type SchoolsFile, type StatesFile } from "@/lib/dataTypes";
import { catalogLayer, THIN_N } from "@/lib/scales";
import type { Display, LayerDef } from "@/lib/types";
import type { AreaKind } from "./choropleth";

/** The composite and the five domain scores every card lists, in this order after the active layers. */
export const OVERVIEW_LAYERS = ["composite", "economic", "education", "health", "housing", "crime"] as const;

export type CardKind = AreaKind | "school";

export interface CardRow {
  id: string;
  label: string;
  /** "A" or "B" for the active layers, which lead the list; null for the rest of the overview. */
  slot: "A" | "B" | null;
  /** Score as the CSV has it (schools) or mean to one decimal (areas), or null for "No data". */
  value: string | null;
  /** Percentile 0 to 100: national for schools, among all US peers (states or counties) for areas. */
  pct: number | null;
  /** County-level measure: every school in a county shares the value (SPEC.md 4). */
  countyLevel: boolean;
  /** Connecticut fill badge on a school row (SPEC.md 7). */
  badge?: "approx" | "proxy";
  /** One caption under the row: why the value is missing, or "Few schools (n = 2)". */
  note?: string;
}

export interface OverviewCard {
  kind: CardKind;
  id: string;
  title: string;
  /** "State" for counties, "United States" for states, "District · City, ST" for schools. */
  subtitle: string;
  /** "1,918 schools" for areas; empty for schools. */
  count: string;
  /** Column heading for the value column. */
  valueHeading: string;
  /** What the percentiles rank against, e.g. "vs. US counties". */
  pctHeading: string;
  /** Which column leads: the value in score display, the percentile in percentile display. */
  lead: "value" | "pct";
  rows: CardRow[];
  /** Card-level notes: no schools, few schools, Connecticut fill, county-level means. */
  flags: string[];
  /** What a click does. */
  hint: string;
}

const fmt = new Intl.NumberFormat("en-US");
const NO_SCHOOLS_NOTE = "No ODIS high schools in this county";
const STATE_COUNTY_NOTE = "County-level measures are school-weighted means of county values";

/** Active layers first (A then B), then the overview layers that are not active. */
export function cardLayers(active: readonly string[]): { layer: LayerDef; slot: "A" | "B" | null }[] {
  const lead = active.slice(0, 2).flatMap((id, k) => {
    const layer = catalogLayer(id);
    return layer ? [{ layer, slot: (k === 0 ? "A" : "B") as "A" | "B" }] : [];
  });
  const rest = OVERVIEW_LAYERS.filter((id) => !active.includes(id)).flatMap((id) => {
    const layer = catalogLayer(id);
    return layer ? [{ layer, slot: null }] : [];
  });
  return [...lead, ...rest];
}

/** Percentile label for the card's percentile column: "72nd", or "–" when unknown. */
export function pctLabel(pct: number | null): string {
  return pct === null ? "–" : ordinal(pct);
}

// ---- area percentiles ----

const sortedCache = new WeakMap<readonly (number | null)[], Float64Array>();

function sortedMeans(means: readonly (number | null)[]): Float64Array {
  let sorted = sortedCache.get(means);
  if (!sorted) {
    sorted = Float64Array.from(means.filter((m): m is number => m != null)).sort();
    sortedCache.set(means, sorted);
  }
  return sorted;
}

/** First index in ascending `a` whose value is not below (`strict` false) or above (`strict` true) `v`. */
function bound(a: Float64Array, v: number, strict: boolean): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (strict ? a[mid]! <= v : a[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Percentile rank of `value` among the non-null `means`, 0 to 100 with ties at their midpoint, so the highest-stress
 * area of 52 lands near the 99th and the lowest near the 1st. Sorted copies are cached per column.
 */
export function percentileAmong(means: readonly (number | null)[], value: number): number | null {
  const sorted = sortedMeans(means);
  if (sorted.length === 0) return null;
  const below = bound(sorted, value, false);
  const equal = bound(sorted, value, true) - below;
  return (100 * (below + equal / 2)) / sorted.length;
}

// ---- builders ----

export interface AreaCardSources {
  states: StatesFile;
  counties?: CountiesFile;
}

export interface CardOptions {
  display: Display;
  /** Compare mode is armed, so a click pins the area instead of drilling (SPEC.md 3.9). */
  compareArmed?: boolean;
}

/** The overview card for a state or county, or null when the id is not in the loaded file. */
export function areaCard(
  kind: AreaKind,
  id: string,
  active: readonly string[],
  src: AreaCardSources,
  { display, compareArmed = false }: CardOptions,
): OverviewCard | null {
  const file = kind === "state" ? src.states : src.counties;
  const i = file ? file.ids.indexOf(id) : -1;
  if (!file || i < 0) return null;

  const stfp = kind === "state" ? id : (src.counties?.st[i] ?? id.slice(0, 2));
  const si = src.states.ids.indexOf(stfp);
  const usps = si >= 0 ? (src.states.usps[si] ?? "") : "";
  const stateName = si >= 0 ? (src.states.names[si] ?? "") : "";
  const n = file.n[i] ?? 0;

  const rows = cardLayers(active).map<CardRow>(({ layer, slot }) => {
    const m = file.measures[layer.id];
    const mean = m?.mean[i] ?? null;
    const ln = m?.n[i] ?? 0;
    const row: CardRow = {
      id: layer.id,
      label: layer.label,
      slot,
      value: mean === null ? null : formatMean(layer, mean),
      pct: mean === null || !m ? null : percentileAmong(m.mean, mean),
      countyLevel: layer.resolution === "county",
    };
    if (mean === null) {
      const reason = n > 0 ? missingReason(layer.id, usps) : undefined;
      if (reason) row.note = reason;
    } else if (ln < THIN_N) {
      row.note = `Few schools (n = ${ln})`;
    }
    return row;
  });

  const flags: string[] = [];
  if (n === 0) flags.push(NO_SCHOOLS_NOTE);
  else if (n < THIN_N) flags.push(`Few schools (n = ${n})`);
  if (usps === "CT" && n > 0) flags.push(CT_NOTE);
  if (kind === "state" && rows.some((r) => r.countyLevel && r.value !== null)) flags.push(STATE_COUNTY_NOTE);
  // Few-schools is said once at card level when it applies to the whole area.
  if (n > 0 && n < THIN_N) for (const r of rows) if (r.note?.startsWith("Few schools")) delete r.note;

  const name = file.names[i] ?? id;
  return {
    kind,
    id,
    title: name,
    subtitle: kind === "state" ? "United States" : stateName,
    count: `${fmt.format(n)} ${n === 1 ? "school" : "schools"}`,
    valueHeading: "Mean",
    pctHeading: kind === "state" ? "vs. all states" : "vs. US counties",
    lead: display === "pct" ? "pct" : "value",
    rows,
    flags,
    hint: compareArmed
      ? "Click to pin for compare"
      : kind === "state"
        ? `Click to zoom into ${name}`
        : "Click to zoom in to its schools",
  };
}

/** The overview card for the school at row `i` of schools/all.json. */
export function schoolCard(
  schools: SchoolsFile,
  i: number,
  active: readonly string[],
  { display }: CardOptions,
): OverviewCard {
  const st = schools.st[i] ?? "";
  const ctFilled = ((schools.flags[i] ?? 0) & SchoolFlag.ctFilled) !== 0;
  const city = [schools.city[i], st].filter(Boolean).join(", ");

  const rows = cardLayers(active).map<CardRow>(({ layer, slot }) => {
    const v = schools.values[layer.id]?.[i] ?? null;
    const pct = layer.pctColumn ? (schools.values[`${layer.id}_pct`]?.[i] ?? null) : null;
    const row: CardRow = {
      id: layer.id,
      label: layer.label,
      slot,
      value: v === null ? null : formatValue(layer, v),
      pct: v === null ? null : pct,
      countyLevel: layer.resolution === "county",
    };
    if (ctFilled && layer.id === "lead_risk") row.badge = "approx";
    if (ctFilled && layer.id === "park_access") row.badge = "proxy";
    if (v === null) {
      const reason = missingReason(layer.id, st);
      if (reason) row.note = reason;
    }
    return row;
  });

  return {
    kind: "school",
    id: schools.ids[i] ?? "",
    title: schools.name[i] ?? "",
    subtitle: [schools.district[i], city].filter(Boolean).join(" · "),
    count: "",
    valueHeading: "Score",
    pctHeading: "vs. US schools",
    lead: display === "pct" ? "pct" : "value",
    rows,
    flags: ctFilled ? [CT_NOTE] : [],
    hint: "Click pin for full profile",
  };
}

/** One-line summary for the polite live region (SPEC.md 10.3). */
export function cardSummary(card: OverviewCard): string {
  const rows = card.rows.map(
    (r) => `${r.label} ${r.value ?? "no data"}${r.pct === null ? "" : ` (${ordinal(r.pct)} percentile)`}`,
  );
  return [card.title, card.subtitle, card.count, ...rows].filter(Boolean).join(". ");
}

// ---- placement ----

export interface Placement {
  left: number;
  top: number;
}

/**
 * Where a `w` x `h` card goes next to an anchor at (`x`, `y`) inside a `bw` x `bh` box: to the right and below by
 * `offset` when that fits, flipped to the left or above when it does not, and clamped `margin` inside the box. The
 * card keeps to one side of the anchor horizontally, so it never covers the cursor.
 */
export function placeCard(
  x: number,
  y: number,
  w: number,
  h: number,
  bw: number,
  bh: number,
  offset = 14,
  margin = 8,
): Placement {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));
  const rightFits = x + offset + w <= bw - margin;
  const leftFits = x - offset - w >= margin;
  const toRight = rightFits || (!leftFits && bw - x >= x);
  const left = toRight ? x + offset : x - offset - w;
  const belowFits = y + offset + h <= bh - margin;
  const aboveFits = y - offset - h >= margin;
  const top = belowFits ? y + offset : aboveFits ? y - offset - h : clamp(y - h / 2, margin, bh - margin - h);
  return { left: clamp(left, margin, bw - margin - w), top };
}
