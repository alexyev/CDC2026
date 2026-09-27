// Camera helpers (SPEC.md 3.2, 3.4, 9.6): every programmatic move uses the standard panel padding, flies for
// 1,200 ms, and jumps instead under prefers-reduced-motion. Other panels (search, profile, favorites, command bar)
// move the map through these so targets always land in the visible gap between panels.

import type { Map as MapLibreMap } from "maplibre-gl";
import { load } from "@/lib/loaders";
import type { BBox, Camera, PlaceRef } from "@/lib/types";
import { bboxUnion } from "@/lib/geo";
import { COUNTY_DRILL_MIN_ZOOM, INITIAL_BOUNDS, LOCAL_LEVEL_ZOOM, MAP_PADDING, STATE_LEVEL_ZOOM } from "./levels";

export const FLY_DURATION_MS = 1200;
export const FLY_CURVE = 1.42;
export const FLY_SPEED = 1.2;
/** Zoom for a single school (SPEC.md 3.11, 3.12). */
export const SCHOOL_ZOOM = 12;

/** The subset of the MapLibre map the helpers use, so tests can pass a stub. */
export type CameraMap = Pick<MapLibreMap, "cameraForBounds" | "flyTo" | "jumpTo" | "getZoom">;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Bboxes that cross the antimeridian (Alaska's Aleutians, [-179.1, 51.2, 179.8, 71.4]) span the whole globe in
 * [minLon, maxLon] form; clamp them to the western hemisphere part, where every such US area lies.
 */
export function normalizeBBox(b: BBox): BBox {
  const [minLon, minLat, maxLon, maxLat] = b;
  if (maxLon - minLon > 180) return [-179.9, minLat, -129.9, maxLat];
  return b;
}

export interface FlyOptions {
  /** Lower bound on the fitted zoom, e.g. COUNTY_DRILL_MIN_ZOOM so a county drill lands in the local level. */
  minZoom?: number;
  maxZoom?: number;
}

/** Extra room kept clear at the bottom of the map area, such as the story card's height (SPEC.md 3.8). */
let bottomInset = 0;

export function setBottomInset(px: number) {
  bottomInset = px;
}

/** The standard padding (SPEC.md 3.2), with the bottom raised to clear anything docked there. */
export function mapPadding(): { top: number; left: number; right: number; bottom: number } {
  return { ...MAP_PADDING, bottom: Math.max(MAP_PADDING.bottom, bottomInset) };
}

/** Center and zoom that fit `bbox` inside the map padding, clamped to the zoom bounds. */
export function cameraForBBox(map: CameraMap, bbox: BBox, opts: FlyOptions = {}): Camera | undefined {
  const [minLon, minLat, maxLon, maxLat] = normalizeBBox(bbox);
  const fit = map.cameraForBounds(
    [
      [minLon, minLat],
      [maxLon, maxLat],
    ],
    { padding: mapPadding(), maxZoom: opts.maxZoom ?? 14 },
  );
  if (!fit?.center || fit.zoom == null) return undefined;
  const center = fit.center as { lng: number; lat: number } | [number, number];
  const [lon, lat] = Array.isArray(center) ? center : [center.lng, center.lat];
  return { lon, lat, zoom: Math.max(fit.zoom, opts.minZoom ?? -Infinity) };
}

/** How far inside a level boundary a level-bound fit stays, so rounding never tips it into the next level. */
const LEVEL_EPSILON = 0.1;

/** Zoom bounds that keep the camera at the level where `kind` units are drawn (SPEC.md 3.3). */
export function unitLevelZoom(kind: "state" | "county"): FlyOptions {
  return kind === "state"
    ? { maxZoom: STATE_LEVEL_ZOOM - LEVEL_EPSILON }
    : { minZoom: STATE_LEVEL_ZOOM, maxZoom: LOCAL_LEVEL_ZOOM - LEVEL_EPSILON };
}

/** Flies (or jumps, under reduced motion) to a camera. */
export function flyToCamera(map: CameraMap, camera: Camera) {
  const target = { center: [camera.lon, camera.lat] as [number, number], zoom: camera.zoom };
  if (prefersReducedMotion()) map.jumpTo(target);
  else map.flyTo({ ...target, duration: FLY_DURATION_MS, curve: FLY_CURVE, speed: FLY_SPEED, essential: true });
}

export function flyToBBox(map: CameraMap, bbox: BBox, opts: FlyOptions = {}) {
  const camera = cameraForBBox(map, bbox, opts);
  if (camera) flyToCamera(map, camera);
}

/** Centers on a point; keeps the current zoom unless one is given. */
export function flyToPoint(map: CameraMap, lon: number, lat: number, zoom?: number) {
  flyToCamera(map, { lon, lat, zoom: zoom ?? map.getZoom() });
}

/** The initial national view (SPEC.md 3.3). */
export function flyToNation(map: CameraMap) {
  flyToBBox(map, [INITIAL_BOUNDS[0][0], INITIAL_BOUNDS[0][1], INITIAL_BOUNDS[1][0], INITIAL_BOUNDS[1][1]]);
}

/** Bbox of a place from the aggregate files and gazetteer; a school resolves to its point. */
export async function placeTarget(place: PlaceRef): Promise<{ bbox: BBox } | { point: [number, number] } | undefined> {
  switch (place.kind) {
    case "state": {
      const f = await load("states");
      const i = f.ids.indexOf(place.id);
      return i >= 0 ? { bbox: f.bbox[i]! } : undefined;
    }
    case "county": {
      const f = await load("counties");
      const i = f.ids.indexOf(place.id);
      return i >= 0 ? { bbox: f.bbox[i]! } : undefined;
    }
    case "school": {
      const f = await load("schools");
      const i = f.ids.indexOf(place.id);
      return i >= 0 ? { point: [f.lon[i]!, f.lat[i]!] } : undefined;
    }
    case "city":
    case "district": {
      const f = await load("gazetteer");
      const e = f.entries.find((x) => x.k === place.kind && x.id === place.id);
      return e ? { bbox: e.bb } : undefined;
    }
  }
}

/**
 * Flies to a place: a state or city to its bbox, a county to its bbox at z >= 8.2 so it lands in the local level
 * (SPEC.md 3.4), a school to z12. Resolves false when the place is unknown.
 */
export async function flyToPlace(map: CameraMap, place: PlaceRef): Promise<boolean> {
  const target = await placeTarget(place).catch(() => undefined);
  if (!target) return false;
  if ("point" in target) flyToPoint(map, target.point[0], target.point[1], SCHOOL_ZOOM);
  else flyToBBox(map, target.bbox, place.kind === "county" ? { minZoom: COUNTY_DRILL_MIN_ZOOM } : {});
  return true;
}

/**
 * Flies to the union of areas of one kind (states or counties) at the level where they are drawn, e.g. leaving
 * compare mode frames the two pinned areas together (SPEC.md 3.9). Resolves false when no bbox is known.
 */
export async function flyToAreas(map: CameraMap, places: PlaceRef[]): Promise<boolean> {
  const kind = places[0]?.kind;
  if (kind !== "state" && kind !== "county") return false;
  const targets = await Promise.all(places.map((p) => placeTarget(p).catch(() => undefined)));
  const bbox = bboxUnion(targets.flatMap((t) => (t && "bbox" in t ? [normalizeBBox(t.bbox)] : [])));
  if (!bbox) return false;
  flyToBBox(map, bbox, unitLevelZoom(kind));
  return true;
}
