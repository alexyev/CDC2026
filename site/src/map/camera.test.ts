import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FLY_DURATION_MS,
  cameraForBBox,
  flyToBBox,
  flyToCamera,
  flyToPlace,
  normalizeBBox,
  type CameraMap,
} from "./camera";
import { MAP_PADDING } from "./levels";

function stubMap(fitZoom = 6): CameraMap & { flyTo: ReturnType<typeof vi.fn>; jumpTo: ReturnType<typeof vi.fn> } {
  return {
    cameraForBounds: vi.fn((bounds) => {
      const [[w, s], [e, n]] = bounds as [[number, number], [number, number]];
      return { center: { lng: (w + e) / 2, lat: (s + n) / 2 }, zoom: fitZoom, bearing: 0 };
    }),
    flyTo: vi.fn(),
    jumpTo: vi.fn(),
    getZoom: vi.fn(() => 4),
  } as never;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeBBox", () => {
  it("clamps antimeridian-spanning bboxes to the western hemisphere", () => {
    expect(normalizeBBox([-179.1, 51.2, 179.8, 71.4])).toEqual([-179.9, 51.2, -129.9, 71.4]);
    expect(normalizeBBox([-124.4, 32.5, -114.1, 42])).toEqual([-124.4, 32.5, -114.1, 42]);
  });
});

describe("cameraForBBox", () => {
  it("fits with the standard padding and honors minZoom", () => {
    const map = stubMap(6.5);
    expect(cameraForBBox(map, [-120, 30, -110, 40])).toEqual({ lon: -115, lat: 35, zoom: 6.5 });
    expect(map.cameraForBounds).toHaveBeenCalledWith(
      [
        [-120, 30],
        [-110, 40],
      ],
      expect.objectContaining({ padding: { ...MAP_PADDING } }),
    );
    expect(cameraForBBox(map, [-120, 30, -110, 40], { minZoom: 8.2 })?.zoom).toBe(8.2);
  });
});

describe("flyTo helpers", () => {
  it("fly for 1,200 ms", () => {
    const map = stubMap();
    flyToBBox(map, [-120, 30, -110, 40]);
    expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ duration: FLY_DURATION_MS, zoom: 6 }));
    expect(map.jumpTo).not.toHaveBeenCalled();
  });

  it("jump instead under prefers-reduced-motion", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce") }));
    const map = stubMap();
    flyToCamera(map, { lon: -96, lat: 38, zoom: 4 });
    expect(map.jumpTo).toHaveBeenCalledWith({ center: [-96, 38], zoom: 4 });
    expect(map.flyTo).not.toHaveBeenCalled();
  });

  it("fly to a county at no less than z8.2 and resolve false for unknown places", async () => {
    vi.stubGlobal("fetch", async (path: string) => {
      if (path.endsWith("counties.json")) {
        return new Response(JSON.stringify({ ids: ["06037"], bbox: [[-118.9, 33.7, -117.6, 34.8]] }));
      }
      return new Response("", { status: 404 });
    });
    const map = stubMap(7.1);
    expect(await flyToPlace(map, { kind: "county", id: "06037" })).toBe(true);
    expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 8.2 }));
    expect(await flyToPlace(map, { kind: "county", id: "99999" })).toBe(false);
  });
});
