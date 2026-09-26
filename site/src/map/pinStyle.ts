// Pure styling rules for school pins (SPEC.md 5.3, 9.3): per-school colors from the shared scale, radius, and zoom
// visibility. Class assignment and ramp colors come from lib/scales.ts so pins, fills, and the legend always agree.
// Kept free of deck.gl and the DOM so it is unit-testable; pins.ts turns these into ScatterplotLayer attributes.

import type { BreaksFile, SchoolsFile } from "@/lib/dataTypes";
import { colorOf, hexToRgb, resolveScale, UNIVARIATE_COLORS, type ColorScale } from "@/lib/scales";
import type { Display } from "@/lib/types";
import { LOCAL_LEVEL_ZOOM } from "./levels";

export type RGBA = [number, number, number, number];

const opaque = (hex: string): RGBA => [...hexToRgb(hex), 255];

/** Mark colors of SPEC.md 9.3 (tokens.css `--mark-a`, `--selection`, the accent glow). */
export const PIN_COLORS = {
  /** Separation stroke of an ordinary pin, rgba(10,12,16,0.9). */
  stroke: [10, 12, 16, 230] as RGBA,
  /** Ring of a pin with no value for an active layer (hollow ring). */
  noData: [255, 255, 255, 115] as RGBA,
  /** Pin color when no layer is active. */
  neutral: opaque(UNIVARIATE_COLORS[2]),
  star: opaque("#ffd166"),
  selection: [255, 255, 255, 255] as RGBA,
  /** Glow under the selected ring, accent at 0.55. */
  glow: [46, 230, 197, 140] as RGBA,
};

/** The scale that colors pins: school values at the `local` level, percentile ranks in `pct` display. */
export function pinScale(layers: readonly string[], display: Display, breaks: BreaksFile): ColorScale | null {
  return resolveScale(layers, "local", display, breaks);
}

/** Color of school `i`, or null when it has no value for an active layer (or the scale is unknown). */
export function pinColor(scale: ColorScale | null, schools: SchoolsFile, i: number, active: boolean): RGBA | null {
  if (!scale) return active ? null : PIN_COLORS.neutral;
  const a = schools.values[scale.a.valueKey]?.[i];
  const b = scale.kind === "bivariate" ? schools.values[scale.b.valueKey]?.[i] : undefined;
  const hex = colorOf(scale, a, b);
  return hex === null ? null : opaque(hex);
}

/** Per-school color attributes for a ScatterplotLayer: RGBA fill, RGBA stroke, and stroke width in pixels. */
export interface PinAttributes {
  fill: Uint8Array;
  line: Uint8Array;
  lineWidth: Float32Array;
}

export const PIN_STROKE_WIDTH = 0.75;
export const NO_DATA_STROKE_WIDTH = 1.25;

export function pinAttributes(
  layers: readonly string[],
  display: Display,
  schools: SchoolsFile,
  breaks: BreaksFile,
): PinAttributes {
  const scale = pinScale(layers, display, breaks);
  const count = schools.ids.length;
  const fill = new Uint8Array(count * 4);
  const line = new Uint8Array(count * 4);
  const lineWidth = new Float32Array(count);
  const active = layers.length > 0;
  for (let i = 0; i < count; i++) {
    const color = pinColor(scale, schools, i, active);
    // No data is a hollow ring (transparent fill), never a color on the scale (SPEC.md 7).
    fill.set(color ?? [0, 0, 0, 0], i * 4);
    line.set(color ? PIN_COLORS.stroke : PIN_COLORS.noData, i * 4);
    lineWidth[i] = color ? PIN_STROKE_WIDTH : NO_DATA_STROKE_WIDTH;
  }
  return { fill, line, lineWidth };
}

export const PIN_RADIUS_MIN = 3;
export const PIN_RADIUS_MAX = 7;
export const STAR_RADIUS = 7;
export const STAR_STROKE_WIDTH = 1.5;
/** Hovered pin: radius +2 px and a white 1.5 px stroke (SPEC.md 9.3). */
export const HOVER_GROW = 2;
export const HOVER_STROKE_WIDTH = 1.5;

/** Ordinary pin radius in pixels: 4 px at z8 growing linearly to 6 px at z12, clamped to [3, 7] (SPEC.md 5.3). */
export function pinRadius(zoom: number): number {
  const r = 4 + ((zoom - LOCAL_LEVEL_ZOOM) * (6 - 4)) / (12 - LOCAL_LEVEL_ZOOM);
  return Math.min(PIN_RADIUS_MAX, Math.max(PIN_RADIUS_MIN, r));
}

/** Ordinary pins are hidden below z8; starred pins are never hidden (SPEC.md 5.3). */
export function pinsVisible(zoom: number): boolean {
  return zoom >= LOCAL_LEVEL_ZOOM;
}

/** Ordinary pins fade in over the first 0.3 zoom of the local level so 23k points do not pop in at once. */
export function pinsOpacity(zoom: number, showOnlyStarred: boolean): number {
  if (!pinsVisible(zoom)) return 0;
  const ramp = Math.min(1, 0.4 + ((zoom - LOCAL_LEVEL_ZOOM) / 0.3) * 0.6);
  // "Show only starred" dims unstarred pins to 25% (SPEC.md 3.12).
  return showOnlyStarred ? ramp * 0.25 : ramp;
}

/**
 * Where pins go in the basemap's layer order: before the first symbol layer of the trailing block that holds only
 * labels and boundary lines. SPEC.md 9.7 asks for the first symbol layer, but the OpenFreeMap style puts one label
 * layer (`water_name`) before every road and rail line, which would draw roads across the pins; this keeps road and
 * place labels above the pins and road lines below them. Falls back to the first symbol layer.
 */
export function pinBeforeId(layers: readonly { id: string; type: string }[]): string | undefined {
  let start = layers.length;
  while (start > 0) {
    const layer = layers[start - 1]!;
    if (layer.type !== "symbol" && !layer.id.startsWith("boundary")) break;
    start--;
  }
  const trailing = layers.slice(start).find((l) => l.type === "symbol");
  return (trailing ?? layers.find((l) => l.type === "symbol"))?.id;
}
