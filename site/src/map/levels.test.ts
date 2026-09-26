import { describe, expect, it } from "vitest";
import type { Position } from "geojson";
import type { Topology } from "topojson-specification";
import { cameraForMove } from "@/command/apply";
import countiesTopo from "@/test/fixtures/counties.topo.json";
import statesTopo from "@/test/fixtures/states.topo.json";
import { topoToGeoJSON } from "./choropleth";
import { INITIAL_BOUNDS, MAX_VISIBLE_LON_SPAN, WIDEST_FEATURE_LON_SPAN, levelForZoom, minZoomForWidth } from "./levels";

describe("levelForZoom", () => {
  it.each([
    [0, "nation"],
    [3.6, "nation"],
    [4.99, "nation"],
    [5, "state"],
    [7.99, "state"],
    [8, "local"],
    [14, "local"],
  ])("z%s -> %s", (zoom, level) => {
    expect(levelForZoom(zoom)).toBe(level);
  });
});

describe("INITIAL_BOUNDS", () => {
  const [[west, south], [east, north]] = INITIAL_BOUNDS;
  const inside = ([lon, lat]: [number, number]) => lon >= west && lon <= east && lat >= south && lat <= north;

  it("covers the contiguous US, all of Alaska, Hawaii, and Puerto Rico", () => {
    const extremes: [number, number][] = [
      [-124.8, 48.4], // Cape Flattery
      [-66.9, 44.8], // West Quoddy Head
      [-81.8, 24.5], // Key West
      [172.46 - 360, 52.9], // Attu Island, past the antimeridian
      [-179.15, 51.2], // Amatignak Island
      [-156.8, 71.35], // Utqiagvik
      [-160.25, 21.9], // Niihau
      [-155.7, 18.91], // Ka Lae
      [-67.94, 18.1], // Mona Passage coast of Puerto Rico
      [-65.22, 17.88], // Vieques and Culebra
    ];
    for (const p of extremes) expect(inside(p), `${p}`).toBe(true);
  });

  it("fits between the panels at desktop sizes without going below the zoom floor", () => {
    for (const [w, h] of [
      [1280, 800],
      [1440, 900],
      [1920, 1080],
    ]) {
      const fit = cameraForMove({ kind: "fit", bbox: [west, south, east, north] }, w!, h!);
      expect(fit.zoom, `${w} x ${h}`).toBeGreaterThan(minZoomForWidth(w!));
    }
  });
});

/** Smallest arc of longitude covering every vertex, so a feature across the antimeridian measures its true width. */
function lonSpan(coordinates: unknown): number {
  const lons: number[] = [];
  const walk = (c: unknown) => {
    if (typeof (c as Position)[0] === "number") lons.push(((((c as Position)[0]! % 360) + 540) % 360) - 180);
    else (c as unknown[]).forEach(walk);
  };
  walk(coordinates);
  const sorted = [...new Set(lons)].sort((a, b) => a - b);
  let gap = sorted[0]! + 360 - sorted[sorted.length - 1]!;
  for (let i = 1; i < sorted.length; i++) gap = Math.max(gap, sorted[i]! - sorted[i - 1]!);
  return 360 - gap;
}

describe("minZoomForWidth (SPEC.md 3.3)", () => {
  /** Longitude the viewport shows at a zoom: MapLibre's world is 512 * 2^zoom px wide. */
  const visibleSpan = (width: number, zoom: number) => (width * 360) / (512 * 2 ** zoom);

  it("covers the widest state and county, Alaska with the Aleutians", () => {
    const spans = [
      ...topoToGeoJSON(statesTopo as unknown as Topology, "states").features,
      ...topoToGeoJSON(countiesTopo as unknown as Topology, "counties").features,
    ].map((f) => ({ name: f.properties.name, span: lonSpan((f.geometry as { coordinates: unknown }).coordinates) }));
    const widest = spans.reduce((a, b) => (b.span > a.span ? b : a));
    expect(widest.name).toBe("Alaska");
    expect(widest.span).toBeGreaterThan(57);
    expect(widest.span).toBeLessThanOrEqual(WIDEST_FEATURE_LON_SPAN);
  });

  it.each([
    [390, 0],
    [1024, 1.261],
    [1280, 1.583],
    [1440, 1.753],
    [1920, 2.168],
    [2560, 2.583],
  ])("%s px wide -> z%s", (width, zoom) => {
    expect(minZoomForWidth(width)).toBeCloseTo(zoom, 2);
  });

  it("never shows a second copy of the widest feature at the floor", () => {
    for (const width of [800, 1024, 1280, 1440, 1920, 2560, 3840]) {
      const span = visibleSpan(width, minZoomForWidth(width));
      expect(span).toBeCloseTo(MAX_VISIBLE_LON_SPAN, 6);
      expect(span + WIDEST_FEATURE_LON_SPAN).toBeLessThan(360);
    }
  });
});
