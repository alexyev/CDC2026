// Zoom thresholds shared by the map, the insight panel, and the pipeline (SPEC.md 3.3).
// analysis/schoolscape/config.py mirrors these numbers.

import type { Level } from "@/lib/types";

/** Counties are drawn from this zoom; below it, states. */
export const STATE_LEVEL_ZOOM = 5;
/** School pins are drawn from this zoom. */
export const LOCAL_LEVEL_ZOOM = 8;

/** State fills fade out and county fills fade in over this zoom range. */
export const STATE_COUNTY_CROSSFADE: [number, number] = [4.5, 5.5];
/** County fills fade from 0.85 to 0 over this zoom range. */
export const COUNTY_FADE_OUT: [number, number] = [8, 9.5];

/** Clicking a county flies to max(fitZoom, this) so the map lands in the local level (SPEC.md 3.4). */
export const COUNTY_DRILL_MIN_ZOOM = 8.2;

/** Standard fitBounds / flyTo padding so targets land between the panels (SPEC.md 3.2). */
export const MAP_PADDING = { top: 72, left: 332, right: 412, bottom: 96 } as const;

/**
 * Initial camera bounds and the "Nation" view (SPEC.md 3.3): the contiguous US, Alaska, Hawaii, and Puerto Rico.
 * The west edge is Attu Island (172.46° E) written unwrapped as 172.46 - 360 so the fit runs west across the
 * antimeridian and keeps the whole Aleutian chain, which the map draws from the neighboring world copy.
 */
export const INITIAL_BOUNDS: [[number, number], [number, number]] = [
  [-187.6, 17.8],
  [-65.1, 71.5],
];

/**
 * Longitude span of the widest feature on the map: Alaska with the Aleutians, 172.46° E to 130.0° W across the
 * antimeridian (levels.test.ts measures it from the state geometry).
 */
export const WIDEST_FEATURE_LON_SPAN = 57.6;
/** Degrees kept clear on top of that, so not even a sliver of a second copy shows. */
const WRAP_MARGIN_LON = 2;
/** Widest longitude span the viewport may show: any wider and both copies of Alaska can be on screen at once. */
export const MAX_VISIBLE_LON_SPAN = 360 - WIDEST_FEATURE_LON_SPAN - WRAP_MARGIN_LON;
/** MapLibre's world is 512 * 2^zoom px wide. */
const WORLD_TILE_SIZE = 512;

/**
 * Lowest zoom for a map `width` px wide: the world wraps (SPEC.md 3.3), so zooming out further would show more
 * than MAX_VISIBLE_LON_SPAN and draw a place twice. Never below 0, where the world is already wider than a phone.
 */
export function minZoomForWidth(width: number): number {
  return Math.max(0, Math.log2((width * 360) / (WORLD_TILE_SIZE * MAX_VISIBLE_LON_SPAN)));
}

export function levelForZoom(zoom: number): Level {
  if (zoom < STATE_LEVEL_ZOOM) return "nation";
  if (zoom < LOCAL_LEVEL_ZOOM) return "state";
  return "local";
}
