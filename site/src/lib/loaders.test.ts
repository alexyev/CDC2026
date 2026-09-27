import { afterEach, describe, expect, it, vi } from "vitest";

describe("loaders with VITE_USE_FIXTURES", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reads every data file from src/test/fixtures and caches it", async () => {
    vi.stubEnv("VITE_USE_FIXTURES", "1");
    const { load, dataPath } = await import("./loaders");
    const { isCached } = await import("./dataCache");
    expect(dataPath("schools")).toBe("fixtures/schools/all.json");

    const schools = await load("schools");
    expect(schools.ids).toHaveLength(200);
    expect(schools.values.composite).toHaveLength(200);
    expect(isCached("fixtures/schools/all.json")).toBe(true);
    expect(await load("schools")).toBe(schools);

    const [topo, states, breaks, catalog] = await Promise.all([
      load("statesTopo"),
      load("states"),
      load("breaks"),
      load("catalog"),
    ]);
    expect(Object.keys(topo.objects)).toEqual(["states"]);
    expect(states.ids).toHaveLength(10);
    expect(breaks.composite.local.quint).toEqual([21, 25, 30, 35]);
    expect(catalog.layers).toHaveLength(35);
    expect((await load("counties")).ids).toHaveLength(30);
    expect((await load("presets")).presets.map((p) => p.id)).toContain("where-stress-concentrates");
    expect((await load("meta")).placeholders.connecticut).toBe("filled");
  });

  it("points at /data/v1 without fixtures", async () => {
    const { dataPath } = await import("./loaders");
    expect(dataPath("states")).toBe("/data/v1/states.json");
  });
});
