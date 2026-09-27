// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Viewport membership and bbox helpers (SPEC.md 6.1). Membership uses the centroids and bboxes shipped in the
// aggregate files and the school coordinates, so no polygon math runs on the client.

import type { BBox } from "./types";
import type { LonLat } from "./dataTypes";

/** The subset of maplibre-gl's LngLatBounds these helpers read. */
export interface BoundsLike {
  getWest(): number;
  getSouth(): number;
  getEast(): number;
  getNorth(): number;
}

/** A map viewport as a BBox. West may be below -180 or east above 180 when the map shows a wrapped world copy. */
export function boundsToBBox(bounds: BoundsLike): BBox {
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

/**
 * Moves a projected x onto the world copy nearest `nearX`. With world copies on, the map draws every point once per
 * copy, `worldWidth` px apart, but a projection returns only one of them.
 */
export function nearestCopyX(x: number, nearX: number, worldWidth: number): number {
  return x + Math.round((nearX - x) / worldWidth) * worldWidth;
}

/** Whether the point lies inside the bbox, edges included; handles viewports that cross the antimeridian. */
export function containsPoint(bbox: BBox, lon: number, lat: number): boolean {
  const [west, south, east, north] = bbox;
  if (lat < south || lat > north) return false;
  if (east - west >= 360) return true;
  return (
    (lon >= west && lon <= east) || (lon + 360 >= west && lon + 360 <= east) || (lon - 360 >= west && lon - 360 <= east)
  );
}

/** Indices of the points (e.g. area centroids) inside the bbox, in input order. */
export function pointsInBBox(points: readonly LonLat[], bbox: BBox): number[] {
  const out: number[] = [];
  for (let i = 0; i < points.length; i++) if (containsPoint(bbox, points[i][0], points[i][1])) out.push(i);
  return out;
}

/** Indices of the coordinates given as parallel lon and lat columns (schools) inside the bbox, in input order. */
export function coordsInBBox(lon: readonly number[], lat: readonly number[], bbox: BBox): number[] {
  const out: number[] = [];
  for (let i = 0; i < lon.length; i++) if (containsPoint(bbox, lon[i], lat[i])) out.push(i);
  return out;
}

/** Indices whose key (a school's state FIPS or county GEOID) is in `keys`, in input order. */
export function indicesWithKey(column: readonly string[], keys: ReadonlySet<string>): number[] {
  const out: number[] = [];
  for (let i = 0; i < column.length; i++) if (keys.has(column[i])) out.push(i);
  return out;
}

/** Whether two bboxes overlap, edges included (no antimeridian handling; area bboxes never cross it). */
export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

/** The smallest bbox covering every input, or null for none. */
export function bboxUnion(boxes: readonly BBox[]): BBox | null {
  if (boxes.length === 0) return null;
  const out: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    out[0] = Math.min(out[0], b[0]);
    out[1] = Math.min(out[1], b[1]);
    out[2] = Math.max(out[2], b[2]);
    out[3] = Math.max(out[3], b[3]);
  }
  return out;
}

/** The bbox of points, or null for none (a single point gives a zero-size bbox). */
export function bboxOfPoints(points: readonly LonLat[]): BBox | null {
  return bboxUnion(points.map(([lon, lat]): BBox => [lon, lat, lon, lat]));
}

export function bboxCenter(b: BBox): LonLat {
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}
