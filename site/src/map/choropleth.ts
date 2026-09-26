// State and county choropleth (SPEC.md 3.3, 5, 7, 9.3): GeoJSON sources, fill layers colored by feature-state
// classes, the no-data hatch, thin-data, hover, compare, and selection outlines, and the state/county crossfade.
//
// Every style decision a unit needs is carried in its feature-state, so a layer switch is one setFeatureState
// pass and never rebuilds a layer:
//   c     class index: 0..4 univariate quintile, 10..18 bivariate (10 + 3 * classA + classB); absent = no data
//   nd    true when the unit has no value for an active layer (default true, so unjoined polygons are no data)
//   thin  true when 1 <= n < 3 (SPEC.md 7)
//   hover true for the hovered unit
//   sel   true for the selected unit
//   cmp   1 or 2 for compare pin A or B (SPEC.md 3.9)

import type { Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import catalog from "../../data/catalog.json";
import type { BreaksFile, CountiesFile, LevelBreaks, StatesFile } from "@/lib/dataTypes";
import { BIVARIATE_COLORS, THIN_N, UNIVARIATE_COLORS, classIndex } from "@/lib/scales";
import type { LayerDef } from "@/lib/types";
import { COUNTY_FADE_OUT, STATE_COUNTY_CROSSFADE } from "./levels";

export type AreaKind = "state" | "county";
export type AreaFile = StatesFile | CountiesFile;

type LayerSpec = Parameters<MapLibreMap["addLayer"]>[0];
type Expr = unknown[];

const LAYER_DEFS = new Map((catalog.layers as LayerDef[]).map((l) => [l.id, l]));

export function layerDef(id: string): LayerDef | undefined {
  return LAYER_DEFS.get(id);
}

export const SOURCE_IDS: Record<AreaKind, string> = { state: "ss-states", county: "ss-counties" };

const layerIds = (k: AreaKind) => ({
  fill: `ss-${k}-fill`,
  hatch: `ss-${k}-hatch`,
  outline: `ss-${k}-outline`,
  thin: `ss-${k}-thin`,
  hover: `ss-${k}-hover`,
  compare: `ss-${k}-compare`,
  selGlow: `ss-${k}-sel-glow`,
  sel: `ss-${k}-sel`,
});

export const LAYER_IDS = { state: layerIds("state"), county: layerIds("county") };

/** The fill layer hovered and clicked at each drawn level. */
export const FILL_LAYER: Record<AreaKind, string> = { state: LAYER_IDS.state.fill, county: LAYER_IDS.county.fill };

export const HATCH_IMAGE_ID = "ss-nodata-hatch";

/** Fill opacity for classed polygons (SPEC.md 9.3). */
export const FILL_OPACITY = 0.85;
/**
 * County fills fade to this opacity at the local level when every active layer is county-level, so county-sourced
 * measures keep their only honest geography at school zoom (SPEC.md decision "County-level crime").
 */
export const COUNTY_LEVEL_FLOOR = 0.3;

const [FADE_START, FADE_END] = STATE_COUNTY_CROSSFADE;
const [LOCAL_FADE_START, LOCAL_FADE_END] = COUNTY_FADE_OUT;

/** State layers' zoom visibility, 1 -> 0 across the state/county crossfade. */
export function stateFade(zoom: number): number {
  if (zoom <= FADE_START) return 1;
  if (zoom >= FADE_END) return 0;
  return (FADE_END - zoom) / (FADE_END - FADE_START);
}

/** County layers' zoom visibility: 0 -> 1 across the crossfade, then 1 -> floor across the local fade-out. */
export function countyFade(zoom: number, floor = 0): number {
  if (zoom <= FADE_START) return 0;
  if (zoom < FADE_END) return (zoom - FADE_START) / (FADE_END - FADE_START);
  if (zoom <= LOCAL_FADE_START) return 1;
  if (zoom >= LOCAL_FADE_END) return floor;
  return 1 - ((1 - floor) * (zoom - LOCAL_FADE_START)) / (LOCAL_FADE_END - LOCAL_FADE_START);
}

// ---------------------------------------------------------------------------------------------------------------
// Classes

export interface AreaStyleState {
  c: number | null;
  nd: boolean;
  thin: boolean;
}

/** The breaks level for polygons of this kind: states use nation breaks, counties use state breaks (SPEC.md 5.2). */
export const BREAKS_LEVEL: Record<AreaKind, "nation" | "state"> = { state: "nation", county: "state" };

/**
 * Feature-state per unit for the active layers. Univariate uses quintiles, bivariate terciles; a unit with no value
 * (or no breaks) for any active layer is no data (SPEC.md 7), and thin when its smallest n is 1 or 2.
 */
export function computeAreaStates(
  file: AreaFile,
  layers: readonly string[],
  breaks: BreaksFile,
  kind: AreaKind,
): Map<string, AreaStyleState> {
  const out = new Map<string, AreaStyleState>();
  const level = BREAKS_LEVEL[kind];
  const bivariate = layers.length === 2;
  const cols = layers.map((id) => ({ m: file.measures[id], b: breaks[id]?.[level] as LevelBreaks | undefined }));
  for (let i = 0; i < file.ids.length; i++) {
    const id = file.ids[i]!;
    if (cols.length === 0) {
      out.set(id, { c: null, nd: true, thin: false });
      continue;
    }
    const classes: number[] = [];
    let minN = Infinity;
    for (const { m, b } of cols) {
      const v = m?.mean[i];
      const n = m?.n[i] ?? 0;
      minN = Math.min(minN, n);
      const c = b && n > 0 ? classIndex(v, bivariate ? b.terc : b.quint) : null;
      if (c === null) break;
      classes.push(c);
    }
    if (classes.length < cols.length) {
      out.set(id, { c: null, nd: true, thin: false });
      continue;
    }
    const c = bivariate ? 10 + 3 * classes[0]! + classes[1]! : classes[0]!;
    out.set(id, { c, nd: false, thin: minN < THIN_N });
  }
  return out;
}

/** True when every active layer is a county-level measure. */
export function allCountyLevel(layers: readonly string[]): boolean {
  return layers.length > 0 && layers.every((id) => layerDef(id)?.resolution === "county");
}

// ---------------------------------------------------------------------------------------------------------------
// Palette: class colors from lib/scales.ts, mark and outline colors from the design tokens (SPEC.md 9.2).

const TOKEN_DEFAULTS: Record<string, string> = {
  "--mark-a": "#ffd166",
  "--mark-b": "#ff7a59",
  "--selection": "#ffffff",
  "--hover-outline": "rgba(255, 255, 255, 0.7)",
  "--thin-outline": "rgba(255, 255, 255, 0.35)",
};

export interface Palette {
  uni: string[];
  bi: string[];
  markA: string;
  markB: string;
  selection: string;
  hover: string;
  thin: string;
}

export function readPalette(root: Element | null = typeof document === "undefined" ? null : document.documentElement) {
  const style = root ? getComputedStyle(root) : null;
  const token = (name: string) => style?.getPropertyValue(name).trim() || TOKEN_DEFAULTS[name]!;
  return {
    // Class colors come from lib/scales.ts, the same constants the legend and pins use.
    uni: [...UNIVARIATE_COLORS],
    bi: [...BIVARIATE_COLORS],
    markA: token("--mark-a"),
    markB: token("--mark-b"),
    selection: token("--selection"),
    hover: token("--hover-outline"),
    thin: token("--thin-outline"),
  } satisfies Palette;
}

// ---------------------------------------------------------------------------------------------------------------
// Style expressions

const state = (key: string) => ["feature-state", key];
const isNoData: Expr = ["boolean", state("nd"), true];
const flag = (key: string): Expr => ["boolean", state(key), false];

/** fill-color: the class color, univariate 0..4 or bivariate 10..18. */
export function fillColorExpr(p: Palette): Expr {
  const stops: unknown[] = [];
  p.uni.forEach((c, i) => stops.push(i, c));
  p.bi.forEach((c, i) => stops.push(10 + i, c));
  return ["match", ["number", state("c"), -1], ...stops, "rgba(0, 0, 0, 0)"];
}

/** `value` scaled by the zoom fade of this kind, as an interpolate over the same stops as stateFade/countyFade. */
export function fadeExpr(kind: AreaKind, value: unknown, floor = 0): Expr {
  const scaled = (k: number): unknown => (k === 1 ? value : k === 0 ? 0 : ["*", k, value]);
  if (kind === "state") return ["interpolate", ["linear"], ["zoom"], FADE_START, scaled(1), FADE_END, scaled(0)];
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    FADE_START,
    scaled(0),
    FADE_END,
    scaled(1),
    LOCAL_FADE_START,
    scaled(1),
    LOCAL_FADE_END,
    scaled(floor),
  ];
}

const fillOpacity = (kind: AreaKind, floor = 0) => fadeExpr(kind, ["case", isNoData, 0, FILL_OPACITY], floor);
const hatchOpacity = (kind: AreaKind, floor = 0) => fadeExpr(kind, ["case", isNoData, 1, 0], floor);
const thinOpacity = (kind: AreaKind, floor = 0) =>
  fadeExpr(kind, ["case", ["all", flag("thin"), ["!", isNoData]], 1, 0], floor);

/** Every Schoolscape map layer, in draw order (bottom first). */
export function choroplethLayers(p: Palette): LayerSpec[] {
  const s = LAYER_IDS.state;
  const c = LAYER_IDS.county;
  const src = SOURCE_IDS;
  const fill = (kind: AreaKind): LayerSpec =>
    ({
      id: LAYER_IDS[kind].fill,
      type: "fill",
      source: src[kind],
      paint: { "fill-color": fillColorExpr(p), "fill-opacity": fillOpacity(kind), "fill-antialias": false },
    }) as LayerSpec;
  const hatch = (kind: AreaKind): LayerSpec =>
    ({
      id: LAYER_IDS[kind].hatch,
      type: "fill",
      source: src[kind],
      paint: { "fill-pattern": HATCH_IMAGE_ID, "fill-opacity": hatchOpacity(kind), "fill-antialias": false },
    }) as LayerSpec;
  const line = (id: string, kind: AreaKind, paint: Record<string, unknown>): LayerSpec =>
    ({ id, type: "line", source: src[kind], layout: { "line-join": "round" }, paint }) as LayerSpec;

  return [
    fill("state"),
    hatch("state"),
    fill("county"),
    hatch("county"),
    line(c.outline, "county", {
      "line-color": "rgba(255, 255, 255, 0.10)",
      "line-width": 0.6,
      "line-opacity": fadeExpr("county", 1, 0.6),
    }),
    line(s.outline, "state", { "line-color": "rgba(255, 255, 255, 0.22)", "line-width": 1 }),
    line(c.thin, "county", {
      "line-color": p.thin,
      "line-width": 1,
      "line-dasharray": [1, 2],
      "line-opacity": thinOpacity("county"),
    }),
    line(s.thin, "state", {
      "line-color": p.thin,
      "line-width": 1,
      "line-dasharray": [1, 2],
      "line-opacity": thinOpacity("state"),
    }),
    ...(["county", "state"] as const).map((k) =>
      line(LAYER_IDS[k].hover, k, {
        "line-color": p.hover,
        "line-width": 1.5,
        "line-opacity": ["case", flag("hover"), 1, 0],
      }),
    ),
    ...(["county", "state"] as const).map((k) =>
      line(LAYER_IDS[k].compare, k, {
        "line-color": ["match", ["number", state("cmp"), 0], 1, p.markA, 2, p.markB, "rgba(0, 0, 0, 0)"],
        "line-width": 2.5,
        "line-opacity": ["case", [">", ["number", state("cmp"), 0], 0], 1, 0],
      }),
    ),
    ...(["county", "state"] as const).map((k) =>
      line(LAYER_IDS[k].selGlow, k, {
        "line-color": "rgba(46, 230, 197, 0.55)",
        "line-width": 6,
        "line-blur": 4,
        "line-opacity": ["case", flag("sel"), 1, 0],
      }),
    ),
    ...(["county", "state"] as const).map((k) =>
      line(LAYER_IDS[k].sel, k, {
        "line-color": p.selection,
        "line-width": 2,
        "line-opacity": ["case", flag("sel"), 1, 0],
      }),
    ),
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// Map operations

/** Diagonal 45° hatch, 1 px lines every 6 px over a faint fill (SPEC.md 7), rendered at the device pixel ratio. */
export function hatchImage(pixelRatio = 1) {
  const r = Math.max(1, Math.round(pixelRatio));
  const size = 6 * r;
  const data = new Uint8Array(size * size * 4);
  const line = Math.round(0.14 * 255);
  const base = Math.round(0.03 * 255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = 255;
      data[o + 3] = (x + y) % size < r ? line : base;
    }
  }
  return { image: { width: size, height: size, data }, pixelRatio: r };
}

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

/** Adds the hatch image, both area sources (empty), and every choropleth layer below `beforeId`. */
export function installChoropleth(map: MapLibreMap, beforeId: string | undefined, palette = readPalette()) {
  const { image, pixelRatio } = hatchImage(typeof window === "undefined" ? 1 : window.devicePixelRatio);
  if (!map.hasImage(HATCH_IMAGE_ID)) map.addImage(HATCH_IMAGE_ID, image, { pixelRatio });
  for (const kind of ["state", "county"] as const) {
    if (!map.getSource(SOURCE_IDS[kind])) {
      map.addSource(SOURCE_IDS[kind], { type: "geojson", data: EMPTY, promoteId: "gid" });
    }
  }
  for (const layer of choroplethLayers(palette)) map.addLayer(layer, beforeId);
}

/** TopoJSON object -> GeoJSON with each geometry id copied to `properties.gid` for promoteId. */
export function topoToGeoJSON(
  topo: Topology,
  objectName: string,
): FeatureCollection<Geometry, { gid: string; name: string }> {
  const object = topo.objects[objectName] as GeometryCollection<{ name: string }>;
  const fc = feature(topo, object) as FeatureCollection<Geometry, { name: string }>;
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => ({
      ...f,
      properties: { name: f.properties?.name ?? "", gid: String(f.id) },
    })),
  };
}

export function setAreaGeometry(map: MapLibreMap, kind: AreaKind, data: FeatureCollection) {
  const source = map.getSource(SOURCE_IDS[kind]) as { setData?: (d: FeatureCollection) => void } | undefined;
  source?.setData?.(data);
}

/** Writes class, no-data, and thin feature-state for every unit. */
export function applyAreaStates(map: MapLibreMap, kind: AreaKind, states: Map<string, AreaStyleState>) {
  const source = SOURCE_IDS[kind];
  for (const [id, s] of states) map.setFeatureState({ source, id }, { c: s.c, nd: s.nd, thin: s.thin });
}

/** Keeps county fills at COUNTY_LEVEL_FLOOR past z9.5 when every active layer is county-level. */
export function setCountyFloor(map: MapLibreMap, floor: number) {
  const c = LAYER_IDS.county;
  // Expressions are built as plain arrays; MapLibre validates them at runtime.
  const setPaint = map.setPaintProperty.bind(map) as (layer: string, prop: string, value: unknown) => void;
  setPaint(c.fill, "fill-opacity", fillOpacity("county", floor));
  setPaint(c.hatch, "fill-opacity", hatchOpacity("county", floor));
  setPaint(c.thin, "line-opacity", thinOpacity("county", floor));
}

/** Sets a boolean or numeric feature-state key on one unit, clearing it from the previous one. */
export function moveFlag(
  map: MapLibreMap,
  key: string,
  prev: { kind: AreaKind; id: string } | null,
  next: { kind: AreaKind; id: string } | null,
  value: boolean | number = true,
) {
  const off = typeof value === "number" ? 0 : false;
  if (prev && (!next || prev.kind !== next.kind || prev.id !== next.id)) {
    map.setFeatureState({ source: SOURCE_IDS[prev.kind], id: prev.id }, { [key]: off });
  }
  if (next) map.setFeatureState({ source: SOURCE_IDS[next.kind], id: next.id }, { [key]: value });
}

/** The area kind a unit id belongs to: STATEFP has 2 digits, county GEOID 5. */
export function kindOfUnitId(id: string): AreaKind | null {
  if (/^\d{2}$/.test(id)) return "state";
  if (/^\d{5}$/.test(id)) return "county";
  return null;
}
