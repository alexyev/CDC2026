// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { describe, expect, it } from "vitest";
import counties from "@/test/fixtures/counties.json";
import national from "@/test/fixtures/national.json";
import schools from "@/test/fixtures/schools/all.json";
import states from "@/test/fixtures/states.json";
import {
  areaBBox,
  areaKindForLevel,
  areaName,
  distribution,
  flatLayer,
  layerRange,
  nationalSpearman,
  pairCount,
  schoolsInArea,
  valuePairs,
  viewportPairs,
} from "./compareData";
import type { CountiesFile, NationalFile, SchoolsFile, StatesFile } from "./dataTypes";
import type { BBox } from "./types";

const S = schools as unknown as SchoolsFile;
const ST = states as unknown as StatesFile;
const CO = counties as unknown as CountiesFile;
const NAT = national as unknown as NationalFile;

describe("compare data helpers", () => {
  it("pins states at nation level and counties below it", () => {
    expect(areaKindForLevel("nation")).toBe("state");
    expect(areaKindForLevel("state")).toBe("county");
    expect(areaKindForLevel("local")).toBe("county");
  });

  it("finds the schools inside a state or county", () => {
    const la = schoolsInArea(S, { kind: "county", id: "06037" });
    expect(la).toHaveLength(37);
    expect(la.every((i) => S.county[i] === "06037")).toBe(true);
    const ca = schoolsInArea(S, { kind: "state", id: "06" });
    expect(ca.every((i) => S.stfp[i] === "06")).toBe(true);
    expect(ca.length).toBeGreaterThan(la.length);
    expect(schoolsInArea(S, { kind: "city", id: "CA:Los Angeles" })).toEqual([]);
  });

  it("takes viewport schools from the insight request builder, or every school without a map", () => {
    const files = { schools: S, states: ST, counties: CO };
    expect(viewportPairs("nation", null, files, "composite").ids).toHaveLength(S.ids.length);

    const californiaBox: BBox = [-124.5, 32.5, -114, 42];
    const ca = viewportPairs("nation", californiaBox, files, "composite", "education");
    expect(new Set(ca.ids.map((id) => S.stfp[S.ids.indexOf(id)]))).toEqual(new Set(["06"]));
    expect(ca.y).toHaveLength(ca.ids.length);

    // A box around Los Angeles County's centroid only, at county level, holds exactly its schools.
    const [lon, lat] = CO.centroid[CO.ids.indexOf("06037")]!;
    const tight: BBox = [lon - 0.05, lat - 0.05, lon + 0.05, lat + 0.05];
    const la = schoolsInArea(S, { kind: "county", id: "06037" }).map((i) => S.ids[i]);
    expect(viewportPairs("state", tight, files, "composite").ids).toEqual(la);
  });

  it("builds pairs and counts pairwise-complete units", () => {
    const idx = schoolsInArea(S, { kind: "county", id: "06037" });
    const p = valuePairs(S, idx, "crime", "education");
    expect(p.ids).toHaveLength(idx.length);
    expect(p.x[0]).toBe(S.values.crime![idx[0]!]);
    expect(pairCount({ ids: ["a", "b", "c"], x: [1, null, 3], y: [1, 2, null] })).toBe(1);
    expect(pairCount({ ids: ["a", "b", "c"], x: [1, null, 3] })).toBe(2);
  });

  it("bins distributions over the national range with the median", () => {
    const d = distribution([0, 4.9, 5, 50, 100, null], [0, 100]);
    expect(d.counts).toHaveLength(20);
    expect(d.counts[0]).toBe(2);
    expect(d.counts[1]).toBe(1);
    expect(d.counts[10]).toBe(1);
    expect(d.counts[19]).toBe(1);
    expect(d.n).toBe(5);
    expect(d.median).toBe(5);
    expect(d.mean).toBeCloseTo(31.98, 6);
    expect(distribution([0.3, 0.5], layerRange({ unit: "gini" })).median).toBeCloseTo(0.4, 9);
    expect(distribution([null], [0, 100])).toMatchObject({ n: 0, median: null, mean: null });
  });

  it("reads the national baseline, names, and boxes", () => {
    const r = nationalSpearman(NAT, "crime", "education");
    expect(typeof r).toBe("number");
    expect(r).toBe(NAT.schools.spearman[NAT.layers.indexOf("crime")]![NAT.layers.indexOf("education")]);
    expect(nationalSpearman(NAT, "crime", "nope")).toBeNull();
    expect(areaName({ kind: "state", id: "06" }, ST, CO)).toBe("California");
    expect(areaName({ kind: "county", id: "06037" }, ST, CO)).toBe("Los Angeles County, CA");
    expect(areaBBox({ kind: "county", id: "06037" }, ST, CO)).toEqual(CO.bbox[CO.ids.indexOf("06037")]);
  });
});

describe("flatLayer", () => {
  it("names the layer that takes one value across the pairs, ignoring pairs with a missing value", () => {
    // Crime inside Los Angeles County: one county value for every school, so there is no ranking to correlate.
    expect(flatLayer({ x: [48, 48, null, 48], y: [20, 31, 25, 12] })).toBe("a");
    expect(flatLayer({ x: [20, 31, 25], y: [7, 7, 7] })).toBe("b");
    expect(flatLayer({ x: [20, 31, 25], y: [7, null, 9] })).toBeNull();
    expect(flatLayer({ x: [1, 2, 3] })).toBeNull();
  });
});
