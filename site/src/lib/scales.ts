// Class assignment and colors for the choropleth, the pins, and the legend (SPEC.md 5.2, 7, 9.2).
// Breaks are never computed here: they come from breaks.json (fixed national breaks per level) or are the fixed
// percentile breaks. Everything that colors a unit goes through `resolveScale` + `classOf` so the map and the
// legend can never disagree.

import catalog from "../../data/catalog.json";
import type { BreaksFile, CatalogFile } from "./dataTypes";
import type { Display, LayerDef, Level } from "./types";

/** Univariate ramp, low -> high (tokens.css `--u1..--u5`). MapLibre and deck.gl need literal colors, not CSS vars. */
export const UNIVARIATE_COLORS = ["#262a36", "#472b5c", "#742f7f", "#a93a9c", "#e068c0"] as const;

/** Bivariate 3x3, index `3 * classA + classB` (tokens.css `--bv0..--bv8`). A owns magenta, B owns teal. */
export const BIVARIATE_COLORS = [
  "#262a36",
  "#1e6b6b",
  "#22c2b0",
  "#742f7f",
  "#6b5d95",
  "#6fc6c9",
  "#e068c0",
  "#d58ad6",
  "#f2f0fa",
] as const;

/** Percentile display uses fixed breaks (SPEC.md 5.2); the bivariate grid uses fixed thirds. */
export const PERCENTILE_QUINTILES = [20, 40, 60, 80] as const;
export const PERCENTILE_TERCILES = [100 / 3, 200 / 3] as const;

/** Areas with fewer schools than this get the thin-data outline (SPEC.md 5.1, 7). */
export const THIN_N = 3;

const LAYERS: ReadonlyMap<string, LayerDef> = new Map(
  (catalog as CatalogFile).layers.map((layer) => [layer.id, layer] as const),
);

/** The catalog entry for a layer id, or undefined for an unknown id. */
export function catalogLayer(id: string): LayerDef | undefined {
  return LAYERS.get(id);
}

/**
 * Class index of `value` given ascending `breaks`: the number of breaks at or below the value, so a value equal to
 * a break goes to the upper class. Missing values (null, undefined, NaN) have no class and are drawn as no data.
 */
export function classIndex(value: number | null | undefined, breaks: readonly number[]): number | null {
  if (value == null || Number.isNaN(value)) return null;
  let k = 0;
  while (k < breaks.length && value >= breaks[k]!) k++;
  return k;
}

/** Bivariate class `3 * classA + classB`; null when either value is missing (SPEC.md 7). */
export function bivariateIndex(
  a: number | null | undefined,
  b: number | null | undefined,
  breaksA: readonly number[],
  breaksB: readonly number[],
): number | null {
  const ca = classIndex(a, breaksA);
  const cb = classIndex(b, breaksB);
  if (ca === null || cb === null) return null;
  return 3 * ca + cb;
}

/** One layer's axis of a color scale. */
export interface ScaleAxis {
  layer: LayerDef;
  /** `pct` when the unit values are national percentile ranks (pins at `local` level in percentile display). */
  mode: Display;
  /** Key into `SchoolsFile.values` for the values this axis classifies: the layer id, or `<id>_pct`. */
  valueKey: string;
  /** Four quintile breaks (univariate) or two tercile breaks (bivariate), ascending. */
  breaks: readonly number[];
}

export type ColorScale =
  | { kind: "univariate"; level: Level; a: ScaleAxis; colors: readonly string[] }
  | { kind: "bivariate"; level: Level; a: ScaleAxis; b: ScaleAxis; colors: readonly string[] };

/**
 * Whether a layer is shown as national percentile ranks. The toggle applies to the six scores with a percentile
 * column, and only to school values: area fills always use score means (SPEC.md 3.6).
 */
export function usesPercentile(layer: LayerDef, level: Level, display: Display): boolean {
  return display === "pct" && level === "local" && layer.pctColumn !== undefined;
}

function axis(layer: LayerDef, level: Level, display: Display, breaks: BreaksFile, kind: "quint" | "terc") {
  const pct = usesPercentile(layer, level, display);
  if (pct) {
    return {
      layer,
      mode: "pct",
      valueKey: `${layer.id}_pct`,
      breaks: kind === "quint" ? PERCENTILE_QUINTILES : PERCENTILE_TERCILES,
    } satisfies ScaleAxis;
  }
  const levelBreaks = breaks[layer.id]?.[level];
  if (!levelBreaks) return null;
  return { layer, mode: "score", valueKey: layer.id, breaks: levelBreaks[kind] } satisfies ScaleAxis;
}

/**
 * The color scale for the active layers at a level: univariate quintiles for one layer, a 3x3 tercile grid for two.
 * Returns null when no layer is active or a layer or its breaks are unknown.
 */
export function resolveScale(
  layers: readonly string[],
  level: Level,
  display: Display,
  breaks: BreaksFile,
): ColorScale | null {
  const [idA, idB] = layers;
  const layerA = idA === undefined ? undefined : catalogLayer(idA);
  if (!layerA) return null;
  if (idB === undefined) {
    const a = axis(layerA, level, display, breaks, "quint");
    return a && { kind: "univariate", level, a, colors: UNIVARIATE_COLORS };
  }
  const layerB = catalogLayer(idB);
  if (!layerB) return null;
  const a = axis(layerA, level, display, breaks, "terc");
  const b = axis(layerB, level, display, breaks, "terc");
  return a && b && { kind: "bivariate", level, a, b, colors: BIVARIATE_COLORS };
}

/** Class index of a unit under a scale (0..4 univariate, 0..8 bivariate), or null for no data. */
export function classOf(scale: ColorScale, a: number | null | undefined, b?: number | null): number | null {
  if (scale.kind === "univariate") return classIndex(a, scale.a.breaks);
  return bivariateIndex(a, b, scale.a.breaks, scale.b.breaks);
}

/** Fill color of a unit under a scale, or null for no data (drawn with the no-data style, never a ramp color). */
export function colorOf(scale: ColorScale, a: number | null | undefined, b?: number | null): string | null {
  const k = classOf(scale, a, b);
  return k === null ? null : scale.colors[k]!;
}

/** `#rrggbb` to `[r, g, b]`, for deck.gl color accessors. */
export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * A break as the legend prints it: Gini with two decimals, percentiles whole, other values with one decimal when any
 * break of the axis has one, so the ticks of one ramp line up ("29.3", "34.0").
 */
export function formatValue(value: number, axis: Pick<ScaleAxis, "layer" | "mode" | "breaks">): string {
  if (axis.mode === "pct") return String(Math.round(value));
  if (axis.layer.unit === "gini") return value.toFixed(2);
  const decimals = axis.breaks.every(Number.isInteger) ? 0 : 1;
  const text = value.toFixed(decimals);
  return axis.layer.unit === "percent" ? `${text}%` : text;
}

/** One class of an axis: its bounds and a text alternative for its swatch. */
export interface ClassRange {
  index: number;
  /** Inclusive lower bound; undefined for the lowest class. */
  from?: number;
  /** Exclusive upper bound; undefined for the highest class. */
  to?: number;
  /** True when two breaks repeat, so no value can fall in this class. */
  empty: boolean;
  label: string;
}

/** The classes an axis's breaks define, lowest first, with plain-English range labels. */
export function classRanges(axis: ScaleAxis): ClassRange[] {
  const { breaks } = axis;
  const fmt = (v: number) => formatValue(v, axis);
  return Array.from({ length: breaks.length + 1 }, (_, index) => {
    const from = index === 0 ? undefined : breaks[index - 1];
    const to = index === breaks.length ? undefined : breaks[index];
    const empty = from !== undefined && to !== undefined && from >= to;
    let label: string;
    if (from === undefined) label = `below ${fmt(to!)}`;
    else if (to === undefined) label = `${fmt(from)} and above`;
    else if (empty) label = `none (breaks repeat at ${fmt(from)})`;
    else label = `${fmt(from)} to under ${fmt(to)}`;
    return { index, from, to, empty, label };
  });
}

/** Whether an area's school count marks it as thin data (1 <= n < 3). */
export function isThin(n: number): boolean {
  return n >= 1 && n < THIN_N;
}
