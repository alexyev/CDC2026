import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FLY_DURATION_MS,
  cameraForBBox,
  drillZoom,
  flyToBBox,
  flyToCamera,
  flyToAreas,
  flyToPlace,
  mapPadding,
  normalizeBBox,
  setBottomInset,
  unitLevelZoom,
  type CameraMap,
} from "./camera";
import { clearDataCache } from "@/lib/dataCache";
import { LOCAL_LEVEL_ZOOM, MAP_PADDING, STATE_LEVEL_ZOOM, levelForZoom } from "./levels";

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
  clearDataCache();
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

describe("mapPadding", () => {
  it("raises the bottom padding to clear a docked card and never lowers it", () => {
    const map = stubMap();
    setBottomInset(300);
    expect(mapPadding()).toEqual({ ...MAP_PADDING, bottom: 300 });
    cameraForBBox(map, [-120, 30, -110, 40]);
    expect(map.cameraForBounds).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ padding: { ...MAP_PADDING, bottom: 300 } }),
    );
    setBottomInset(20);
    expect(mapPadding()).toEqual({ ...MAP_PADDING });
    setBottomInset(0);
    expect(mapPadding()).toEqual({ ...MAP_PADDING });
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

  it("fly to a state at the state level even when it fits below it, as Texas does on a 1280 px window", async () => {
    vi.stubGlobal("fetch", async (path: string) =>
      path.endsWith("states.json")
        ? new Response(JSON.stringify({ ids: ["48"], bbox: [[-106.6, 25.8, -93.5, 36.5]] }))
        : new Response("", { status: 404 }),
    );
    const map = stubMap(4.9);
    expect(await flyToPlace(map, { kind: "state", id: "48" })).toBe(true);
    const { zoom } = map.flyTo.mock.calls[0]![0] as { zoom: number };
    expect(levelForZoom(zoom)).toBe("state");
  });
});

describe("drillZoom", () => {
  it("opens a state where its counties are drawn and a county where its schools are", () => {
    expect(levelForZoom(drillZoom("state").minZoom!)).toBe("state");
    expect(levelForZoom(drillZoom("county").minZoom!)).toBe("local");
    expect(drillZoom("city")).toEqual({});
  });
});

describe("flyToAreas (leaving compare mode, SPEC.md 3.9)", () => {
  const LA = [-118.9, 32.8, -117.6, 34.8];
  const SF = [-122.5, 37.7, -122.4, 37.8];
  const CA = [-124.4, 32.5, -114.1, 42];
  const TX = [-106.6, 25.8, -93.5, 36.5];

  function stubData() {
    vi.stubGlobal("fetch", async (path: string) => {
      if (path.endsWith("counties.json"))
        return new Response(JSON.stringify({ ids: ["06037", "06075"], bbox: [LA, SF] }));
      if (path.endsWith("states.json")) return new Response(JSON.stringify({ ids: ["06", "48"], bbox: [CA, TX] }));
      return new Response("", { status: 404 });
    });
  }

  it("keeps each kind at the level where it is drawn", () => {
    expect(unitLevelZoom("county")).toEqual({ minZoom: STATE_LEVEL_ZOOM, maxZoom: LOCAL_LEVEL_ZOOM - 0.1 });
    expect(unitLevelZoom("state")).toEqual({ maxZoom: STATE_LEVEL_ZOOM - 0.1 });
  });

  it("frames two pinned counties together at the state level", async () => {
    stubData();
    const map = stubMap(6.2);
    const pins = [
      { kind: "county", id: "06037" },
      { kind: "county", id: "06075" },
    ] as const;
    expect(await flyToAreas(map, [...pins])).toBe(true);
    expect(map.cameraForBounds).toHaveBeenCalledWith(
      [
        [-122.5, 32.8],
        [-117.6, 37.8],
      ],
      { padding: { ...MAP_PADDING }, maxZoom: LOCAL_LEVEL_ZOOM - 0.1 },
    );
    expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [-120.05, 35.3], zoom: 6.2 }));
  });

  it("frames two pinned states at the nation level", async () => {
    stubData();
    const map = stubMap(4);
    const pins = [
      { kind: "state", id: "06" },
      { kind: "state", id: "48" },
    ] as const;
    expect(await flyToAreas(map, [...pins])).toBe(true);
    expect(map.cameraForBounds).toHaveBeenCalledWith(
      [
        [-124.4, 25.8],
        [-93.5, 42],
      ],
      { padding: { ...MAP_PADDING }, maxZoom: STATE_LEVEL_ZOOM - 0.1 },
    );
  });

  it("does not move without a known area", async () => {
    stubData();
    const map = stubMap();
    expect(await flyToAreas(map, [])).toBe(false);
    expect(await flyToAreas(map, [{ kind: "county", id: "99999" }])).toBe(false);
    expect(await flyToAreas(map, [{ kind: "school", id: "060000000001" }])).toBe(false);
    expect(map.flyTo).not.toHaveBeenCalled();
  });
});
