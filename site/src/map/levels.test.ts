import { describe, expect, it } from "vitest";
import { cameraForMove } from "@/command/apply";
import { INITIAL_BOUNDS, MIN_ZOOM, levelForZoom } from "./levels";

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

  it("fits between the panels at desktop sizes without going below MIN_ZOOM", () => {
    for (const [w, h] of [
      [1280, 800],
      [1440, 900],
      [1920, 1080],
    ]) {
      expect(cameraForMove({ kind: "fit", bbox: [west, south, east, north] }, w!, h!).zoom).toBeGreaterThan(MIN_ZOOM);
    }
  });
});
