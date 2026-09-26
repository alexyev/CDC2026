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

/** Lowest zoom; low enough for INITIAL_BOUNDS to fit between the panels on a 1280 px wide window. */
export const MIN_ZOOM = 1;

export function levelForZoom(zoom: number): Level {
  if (zoom < STATE_LEVEL_ZOOM) return "nation";
  if (zoom < LOCAL_LEVEL_ZOOM) return "state";
  return "local";
}
