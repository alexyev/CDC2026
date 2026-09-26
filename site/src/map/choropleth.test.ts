import { describe, expect, it } from "vitest";
import breaksFixture from "@/test/fixtures/breaks.json";
import statesFixture from "@/test/fixtures/states.json";
import countiesFixture from "@/test/fixtures/counties.json";
import type { BreaksFile, CountiesFile, StatesFile } from "@/lib/dataTypes";
import {
  COUNTY_LEVEL_FLOOR,
  allCountyLevel,
  choroplethLayers,
  computeAreaStates,
  countyFade,
  fadeExpr,
  fillColorExpr,
  hatchImage,
  kindOfUnitId,
  readPalette,
  stateFade,
} from "./choropleth";

const breaks = breaksFixture as unknown as BreaksFile;
const states = statesFixture as unknown as StatesFile;
const counties = countiesFixture as unknown as CountiesFile;

describe("zoom fades", () => {
  it("crossfades states to counties over z4.5 to z5.5 and fades counties out over z8 to z9.5", () => {
    expect(stateFade(3.6)).toBe(1);
    expect(stateFade(5)).toBeCloseTo(0.5);
    expect(stateFade(5.5)).toBe(0);
    expect(countyFade(4.5)).toBe(0);
    expect(countyFade(5)).toBeCloseTo(0.5);
    expect(countyFade(7)).toBe(1);
    expect(countyFade(8.75)).toBeCloseTo(0.5);
    expect(countyFade(9.5)).toBe(0);
    expect(countyFade(12, COUNTY_LEVEL_FLOOR)).toBe(COUNTY_LEVEL_FLOOR);
  });

  it("has no visible cut: fills change by less than 2% of full opacity per 0.02 zoom from z3.6 to z9.5", () => {
    let prevS = stateFade(3.6);
    let prevC = countyFade(3.6);
    for (let z = 3.62; z <= 9.5; z += 0.02) {
      expect(Math.abs(stateFade(z) - prevS)).toBeLessThan(0.021);
      expect(Math.abs(countyFade(z) - prevC)).toBeLessThan(0.021);
      prevS = stateFade(z);
      prevC = countyFade(z);
    }
  });

  it("builds interpolate expressions on the same stops", () => {
    expect(fadeExpr("state", 0.85)).toEqual(["interpolate", ["linear"], ["zoom"], 4.5, 0.85, 5.5, 0]);
    expect(fadeExpr("county", 1, 0.3)).toEqual([
      "interpolate",
      ["linear"],
      ["zoom"],
      4.5,
      0,
      5.5,
      1,
      8,
      1,
      9.5,
      ["*", 0.3, 1],
    ]);
  });
});

describe("computeAreaStates", () => {
  const ca = states.ids.indexOf("06");

  it("classes states by nation quintiles, values on a break going up", () => {
    const out = computeAreaStates(states, ["composite"], breaks, "state");
    // California composite mean 29.2 against nation quintiles 24.1 / 25.8 / 29.3 / 34.0.
    expect(states.measures.composite!.mean[ca]).toBe(29.2);
    expect(out.get("06")).toEqual({ c: 2, nd: false, thin: false });
    const onBreak = {
      ...states,
      measures: { composite: { ...states.measures.composite!, mean: [29.3] } },
      ids: ["06"],
    };
    expect(computeAreaStates(onBreak as StatesFile, ["composite"], breaks, "state").get("06")?.c).toBe(3);
  });

  it("uses bivariate terciles with the offset class index 10 + 3a + b", () => {
    const out = computeAreaStates(states, ["composite", "education"], breaks, "state");
    const s = out.get("06")!;
    expect(s.nd).toBe(false);
    expect(s.c).toBeGreaterThanOrEqual(10);
    expect(s.c).toBeLessThanOrEqual(18);
  });

  it("marks no data when any active layer is missing, and thin for n of 1 or 2", () => {
    const out = computeAreaStates(counties, ["crime"], breaks, "county");
    // 09110 (Connecticut) has no crime values; 48007 has one school.
    expect(out.get("09110")).toEqual({ c: null, nd: true, thin: false });
    expect(out.get("48007")?.thin).toBe(true);
    expect(out.get("48007")?.nd).toBe(false);
    // 48301 has no schools at all.
    expect(computeAreaStates(counties, ["composite"], breaks, "county").get("48301")?.nd).toBe(true);
    const bi = computeAreaStates(counties, ["composite", "crime"], breaks, "county");
    expect(bi.get("09110")?.nd).toBe(true);
  });

  it("classes counties by state-level breaks and treats unknown layers as no data", () => {
    const out = computeAreaStates(counties, ["composite"], breaks, "county");
    expect(out.size).toBe(counties.ids.length);
    const la = counties.ids.indexOf("06037");
    const mean = counties.measures.composite!.mean[la]!;
    const q = breaks.composite!.state.quint;
    expect(out.get("06037")?.c).toBe(q.filter((b) => mean >= b).length);
    expect(computeAreaStates(counties, ["nope"], breaks, "county").get("06037")?.nd).toBe(true);
  });
});

describe("style", () => {
  it("colors univariate classes 0..4 and bivariate classes 10..18 from the scale constants", () => {
    const p = readPalette(null);
    const expr = fillColorExpr(p);
    expect(expr[0]).toBe("match");
    expect(expr).toContain(p.uni[4]);
    const i = expr.indexOf(18);
    expect(expr[i + 1]).toBe(p.bi[8]);
  });

  it("orders fills below outlines and the selection on top", () => {
    const ids = choroplethLayers(readPalette(null)).map((l) => l.id);
    expect(ids[0]).toBe("ss-state-fill");
    expect(ids.indexOf("ss-county-fill")).toBeLessThan(ids.indexOf("ss-state-outline"));
    expect(ids.at(-1)).toBe("ss-state-sel");
  });

  it("draws a seamless 45° hatch tile", () => {
    const { image, pixelRatio } = hatchImage(2);
    expect(pixelRatio).toBe(2);
    expect(image.width).toBe(12);
    const alpha = (x: number, y: number) => image.data[(y * image.width + x) * 4 + 3];
    expect(alpha(0, 0)).toBe(Math.round(0.14 * 255));
    expect(alpha(5, 6)).toBe(Math.round(0.03 * 255));
    expect(alpha(11, 1)).toBe(Math.round(0.14 * 255));
  });
});

describe("helpers", () => {
  it("detects county-level layer sets", () => {
    expect(allCountyLevel(["crime"])).toBe(true);
    expect(allCountyLevel(["crime", "gini"])).toBe(true);
    expect(allCountyLevel(["crime", "education"])).toBe(false);
    expect(allCountyLevel([])).toBe(false);
  });

  it("maps unit ids to area kinds", () => {
    expect(kindOfUnitId("06")).toBe("state");
    expect(kindOfUnitId("06037")).toBe("county");
    expect(kindOfUnitId("060000000001")).toBeNull();
  });
});
