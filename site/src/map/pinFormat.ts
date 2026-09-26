// Pin tooltip content (SPEC.md 3.5): school name, district, city and state, then each active layer's value
// with its national percentile in parentheses when the layer has one.

import type { SchoolsFile } from "@/lib/dataTypes";
import type { Display, LayerDef } from "@/lib/types";

export interface TooltipRow {
  id: string;
  label: string;
  /** Formatted value, or null for "No data". */
  value: string | null;
  /** Secondary figure in parentheses: the national percentile in score display, the score in percentile display. */
  aside: string | null;
  /** County-level measure: every school in the county shares the value (SPEC.md 3.6). */
  countyLevel: boolean;
}

export interface TooltipModel {
  id: string;
  name: string;
  /** "District · City, ST" with empty parts left out. */
  place: string;
  rows: TooltipRow[];
}

export function ordinal(n: number): string {
  const r = Math.round(n);
  const mod100 = r % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${r}th`;
  return `${r}${["th", "st", "nd", "rd"][r % 10] ?? "th"}`;
}

export function formatValue(layer: LayerDef, v: number): string {
  if (layer.unit === "gini") return v.toFixed(2);
  const rounded = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return layer.unit === "percent" ? `${rounded}%` : rounded;
}

function at(values: readonly (number | null)[] | undefined, i: number): number | null {
  const v = values?.[i];
  return v === undefined ? null : v;
}

export function tooltipRow(layer: LayerDef, schools: SchoolsFile, i: number, display: Display): TooltipRow {
  const score = at(schools.values[layer.id], i);
  const pct = layer.pctColumn ? at(schools.values[`${layer.id}_pct`], i) : null;
  const countyLevel = layer.resolution === "county";
  const row = { id: layer.id, label: layer.label, countyLevel };
  if (display === "pct" && layer.pctColumn) {
    if (pct === null) return { ...row, value: null, aside: null };
    return {
      ...row,
      value: `${ordinal(pct)} pct`,
      aside: score === null ? null : `score ${formatValue(layer, score)}`,
    };
  }
  if (score === null) return { ...row, value: null, aside: null };
  return { ...row, value: formatValue(layer, score), aside: pct === null ? null : `${ordinal(pct)} pct` };
}

export function tooltipModel(
  schools: SchoolsFile,
  i: number,
  layers: readonly LayerDef[],
  display: Display,
): TooltipModel {
  const city = [schools.city[i], schools.st[i]].filter(Boolean).join(", ");
  return {
    id: schools.ids[i] ?? "",
    name: schools.name[i] ?? "",
    place: [schools.district[i], city].filter(Boolean).join(" · "),
    rows: layers.map((layer) => tooltipRow(layer, schools, i, display)),
  };
}

/** One-line summary for the polite live region (SPEC.md 10.3). */
export function tooltipSummary(model: TooltipModel): string {
  const values = model.rows.map((r) => `${r.label} ${r.value ?? "no data"}${r.aside ? ` (${r.aside})` : ""}`);
  return [model.name, model.place, ...values].filter(Boolean).join(". ");
}
