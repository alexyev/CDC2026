import { describe, expect, it } from "vitest";
import countiesJson from "@/test/fixtures/counties.json";
import schoolsJson from "@/test/fixtures/schools/all.json";
import statesJson from "@/test/fixtures/states.json";
import type { CountiesFile, SchoolsFile, StatesFile } from "@/lib/dataTypes";
import type { BBox } from "@/lib/types";
import { buildInsightRequest } from "./request";
import { computeInsight } from "./insight";

const states = statesJson as unknown as StatesFile;
const counties = countiesJson as unknown as CountiesFile;
const schools = schoolsJson as unknown as SchoolsFile;
const CONUS: BBox = [-125, 24, -66.5, 49.5];
const base = { layerA: "crime", layerB: "education", states, counties, schools };

describe("buildInsightRequest (SPEC.md 6.1)", () => {
  it("nation: states by centroid in view, and every school in those states", () => {
    const { request, areaIds } = buildInsightRequest(1, { ...base, level: "nation", viewport: CONUS });
    expect(areaIds).toEqual(["06", "48", "37", "17", "01", "09", "29", "25"]);
    const ca = states.ids.indexOf("06");
    expect(request.areas!.x[0]).toBe(states.measures.crime.mean[ca]);
    expect(request.areas!.y![0]).toBe(states.measures.education.mean[ca]);
    const expected = schools.stfp.filter((st) => areaIds.includes(st)).length;
    expect(request.schools.ids).toHaveLength(expected);
    expect(request.schools.ids.some((id) => ["15", "72"].includes(schools.stfp[schools.ids.indexOf(id)]))).toBe(false);
    expect(request.bootstrap).toEqual({ resamples: 1000, seed: 42 });
  });

  it("state: counties by centroid in view, skipping areas without schools, and the schools in those counties", () => {
    const west: BBox = [-124, 27, -95, 40];
    const { request, areaIds } = buildInsightRequest(2, { ...base, level: "state", viewport: west });
    // Loving County (48301) is in view but has no ODIS school, so it is not a unit.
    expect(areaIds).toEqual(["06019", "06037", "06075", "48007", "48201"]);
    expect(request.schools.ids).toHaveLength(6 + 37 + 6 + 1 + 6);
    const la = request.schools.ids.map((id) => schools.county[schools.ids.indexOf(id)]).filter((c) => c === "06037");
    expect(la).toHaveLength(37);
  });

  it("local: no areas row, schools by pin in view, and the count of counties in view", () => {
    const la: BBox = [-119, 33.5, -117, 35];
    const plan = buildInsightRequest(3, { ...base, level: "local", viewport: la });
    expect(plan.request.areas).toBeUndefined();
    expect(plan.countiesInView).toBe(1);
    for (const id of plan.request.schools.ids) {
      const i = schools.ids.indexOf(id);
      expect(schools.lon[i]).toBeGreaterThanOrEqual(-119);
      expect(schools.lat[i]).toBeLessThanOrEqual(35);
    }
    expect(plan.request.schools.ids.length).toBeGreaterThan(0);
  });

  it("one layer: no y columns; schools not loaded yet: an empty schools row", () => {
    const { request } = buildInsightRequest(4, {
      ...base,
      layerB: undefined,
      schools: null,
      level: "nation",
      viewport: CONUS,
    });
    expect(request.areas!.y).toBeUndefined();
    expect(request.schools).toEqual({ ids: [], x: [], y: undefined });
    const result = computeInsight(request);
    expect(result.schools.spearman).toMatchObject({ r: null, n: 0, tooFew: true });
    expect(result.areas!.histB).toBeUndefined();
    expect(result.areas!.histA.counts.reduce((a, b) => a + b, 0)).toBe(result.areas!.spearman.n);
  });

  it("rejects an unknown layer", () => {
    expect(() => buildInsightRequest(5, { ...base, layerA: "nope", level: "nation", viewport: CONUS })).toThrow(/nope/);
  });

  it("computes end to end from fixtures: areas and schools rows with pairwise-missing counts", () => {
    const { request } = buildInsightRequest(6, { ...base, level: "nation", viewport: CONUS });
    const result = computeInsight(request);
    expect(result.requestId).toBe(6);
    // Connecticut has no crime values, so its state is a pairwise-missing area.
    expect(result.areas!.spearman).toMatchObject({ n: 7, nMissing: 1, tooFew: true, r: null });
    const s = result.schools.spearman;
    expect(s.n + s.nMissing).toBe(request.schools.ids.length);
    expect(s.tooFew).toBe(false);
    expect(s.r).not.toBeNull();
    expect(s.ciMethod).toBe("bootstrap");
    expect(result.schools.histB).toBeDefined();
  });

  it("uses unrounded area means from the school values when they hold every school behind the shipped mean", () => {
    // Two states whose shipped Gini means round to the same 0.46 but whose schools differ (0.455 against 0.464).
    const area = (ids: string[], mean: number[], n: number[]) => ({
      ids,
      names: ids,
      n,
      usps: ids,
      centroid: ids.map(() => [-100, 40]),
      bbox: ids.map(() => [-101, 39, -99, 41]),
      measures: { gini: { mean, median: mean, n } },
    });
    const tiny = {
      ids: ["a1", "a2", "b1", "b2"],
      stfp: ["01", "01", "02", "02"],
      county: ["01001", "01001", "02001", "02001"],
      values: { gini: [0.45, 0.46, 0.463, 0.465] },
    } as unknown as SchoolsFile;
    const plan = (n: number[]) =>
      buildInsightRequest(7, {
        level: "nation",
        viewport: CONUS,
        layerA: "gini",
        states: area(["01", "02"], [0.46, 0.46], n) as unknown as StatesFile,
        counties: null,
        schools: tiny,
      }).request.areas!.x;
    expect(plan([2, 2])).toEqual([0.455, 0.464]);
    // The loaded schools are not every school behind the mean (as with the 200-school test fixture): keep it.
    expect(plan([5, 2])).toEqual([0.46, 0.464]);
  });
});
