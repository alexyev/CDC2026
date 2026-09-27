// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import breaksFixture from "@/test/fixtures/breaks.json";
import type { BreaksFile } from "./dataTypes";
import {
  BIVARIATE_COLORS,
  UNIVARIATE_COLORS,
  bivariateIndex,
  catalogLayer,
  classIndex,
  classOf,
  classRanges,
  colorOf,
  formatValue,
  hexToRgb,
  isThin,
  resolveScale,
  usesPercentile,
} from "./scales";

const breaks = breaksFixture as unknown as BreaksFile;
const COMPOSITE_SCHOOLS = [21, 25, 30, 35];

describe("classIndex", () => {
  it("assigns values between breaks to the class between them", () => {
    expect(classIndex(10, COMPOSITE_SCHOOLS)).toBe(0);
    expect(classIndex(22, COMPOSITE_SCHOOLS)).toBe(1);
    expect(classIndex(27.4, COMPOSITE_SCHOOLS)).toBe(2);
    expect(classIndex(31, COMPOSITE_SCHOOLS)).toBe(3);
    expect(classIndex(99, COMPOSITE_SCHOOLS)).toBe(4);
  });

  it("puts a value equal to a break in the upper class", () => {
    expect(classIndex(21, COMPOSITE_SCHOOLS)).toBe(1);
    expect(classIndex(25, COMPOSITE_SCHOOLS)).toBe(2);
    expect(classIndex(30, COMPOSITE_SCHOOLS)).toBe(3);
    expect(classIndex(35, COMPOSITE_SCHOOLS)).toBe(4);
    expect(classIndex(20.999, COMPOSITE_SCHOOLS)).toBe(0);
    expect(classIndex(34.999, COMPOSITE_SCHOOLS)).toBe(3);
  });

  it("handles the ends of the range", () => {
    expect(classIndex(0, COMPOSITE_SCHOOLS)).toBe(0);
    expect(classIndex(100, COMPOSITE_SCHOOLS)).toBe(4);
    expect(classIndex(-Infinity, COMPOSITE_SCHOOLS)).toBe(0);
    expect(classIndex(Infinity, COMPOSITE_SCHOOLS)).toBe(4);
  });

  it("gives missing values no class", () => {
    expect(classIndex(null, COMPOSITE_SCHOOLS)).toBeNull();
    expect(classIndex(undefined, COMPOSITE_SCHOOLS)).toBeNull();
    expect(classIndex(Number.NaN, COMPOSITE_SCHOOLS)).toBeNull();
  });

  it("skips empty classes when breaks repeat", () => {
    // ctx_aian local quintiles in the fixture are [0, 0, 1, 1].
    const repeated = [0, 0, 1, 1];
    expect(classIndex(0, repeated)).toBe(2);
    expect(classIndex(0.5, repeated)).toBe(2);
    expect(classIndex(1, repeated)).toBe(4);
  });

  it("classifies terciles and Gini's 0-1 range with the same rule", () => {
    expect(classIndex(24, [24, 31])).toBe(1);
    expect(classIndex(31, [24, 31])).toBe(2);
    expect(classIndex(0.43, [0.43, 0.45, 0.46, 0.48])).toBe(1);
    expect(classIndex(0.4299, [0.43, 0.45, 0.46, 0.48])).toBe(0);
  });
});

describe("bivariateIndex", () => {
  const terc = [24, 31];
  it("is 3 * classA + classB with A the primary layer", () => {
    expect(bivariateIndex(10, 10, terc, terc)).toBe(0);
    expect(bivariateIndex(10, 40, terc, terc)).toBe(2);
    expect(bivariateIndex(40, 10, terc, terc)).toBe(6);
    expect(bivariateIndex(24, 31, terc, terc)).toBe(5);
    expect(bivariateIndex(40, 40, terc, terc)).toBe(8);
  });

  it("is no data when either value is missing", () => {
    expect(bivariateIndex(null, 40, terc, terc)).toBeNull();
    expect(bivariateIndex(40, null, terc, terc)).toBeNull();
  });
});

describe("resolveScale", () => {
  it("uses the level's quintiles for one layer", () => {
    const scale = resolveScale(["composite"], "nation", "score", breaks);
    expect(scale?.kind).toBe("univariate");
    expect(scale?.a.breaks).toEqual([24.1, 25.8, 29.3, 34.0]);
    expect(scale?.colors).toBe(UNIVARIATE_COLORS);
    expect(resolveScale(["composite"], "state", "score", breaks)?.a.breaks).toEqual([23.0, 27.0, 31.0, 37.7]);
    expect(resolveScale(["composite"], "local", "score", breaks)?.a.breaks).toEqual(COMPOSITE_SCHOOLS);
  });

  it("uses each layer's terciles for two layers", () => {
    const scale = resolveScale(["composite", "crime"], "state", "score", breaks);
    expect(scale?.kind).toBe("bivariate");
    if (scale?.kind !== "bivariate") return;
    expect(scale.a.layer.id).toBe("composite");
    expect(scale.a.breaks).toEqual(breaks.composite!.state.terc);
    expect(scale.b.layer.id).toBe("crime");
    expect(scale.b.breaks).toEqual(breaks.crime!.state.terc);
    expect(scale.colors).toBe(BIVARIATE_COLORS);
  });

  it("switches school values to fixed percentile breaks in percentile display", () => {
    const scale = resolveScale(["composite"], "local", "pct", breaks);
    expect(scale?.a.mode).toBe("pct");
    expect(scale?.a.valueKey).toBe("composite_pct");
    expect(scale?.a.breaks).toEqual([20, 40, 60, 80]);
    expect(scale && classOf(scale, 40)).toBe(2);
    expect(scale && classOf(scale, 39.9)).toBe(1);
  });

  it("applies percentile display to school values of the six scores only", () => {
    const composite = catalogLayer("composite")!;
    expect(usesPercentile(composite, "local", "pct")).toBe(true);
    expect(usesPercentile(composite, "local", "score")).toBe(false);
    expect(usesPercentile(composite, "state", "pct")).toBe(false);
    expect(usesPercentile(catalogLayer("gini")!, "local", "pct")).toBe(false);
    expect(usesPercentile(catalogLayer("poverty")!, "local", "pct")).toBe(false);
  });

  it("keeps area fills and layers without a percentile column on score breaks", () => {
    expect(resolveScale(["composite"], "nation", "pct", breaks)?.a.mode).toBe("score");
    expect(resolveScale(["composite"], "state", "pct", breaks)?.a.valueKey).toBe("composite");
    const gini = resolveScale(["gini"], "local", "pct", breaks);
    expect(gini?.a.mode).toBe("score");
    expect(gini?.a.breaks).toEqual(breaks.gini!.local.quint);
  });

  it("mixes percentile and score axes in a bivariate percentile view", () => {
    const scale = resolveScale(["crime", "poverty"], "local", "pct", breaks);
    if (scale?.kind !== "bivariate") throw new Error("expected bivariate");
    expect(scale.a.mode).toBe("pct");
    expect(scale.a.breaks[0]).toBeCloseTo(33.333, 3);
    expect(scale.b.mode).toBe("score");
  });

  it("returns null without a usable layer or breaks", () => {
    expect(resolveScale([], "nation", "score", breaks)).toBeNull();
    expect(resolveScale(["nope"], "nation", "score", breaks)).toBeNull();
    expect(resolveScale(["composite", "nope"], "nation", "score", breaks)).toBeNull();
    expect(resolveScale(["composite"], "nation", "score", {})).toBeNull();
  });
});

describe("colorOf", () => {
  it("maps classes to the ramp and missing values to null", () => {
    const uni = resolveScale(["composite"], "local", "score", breaks)!;
    expect(colorOf(uni, 10)).toBe(UNIVARIATE_COLORS[0]);
    expect(colorOf(uni, 35)).toBe(UNIVARIATE_COLORS[4]);
    expect(colorOf(uni, null)).toBeNull();
    const bi = resolveScale(["composite", "education"], "local", "score", breaks)!;
    expect(colorOf(bi, 99, 0)).toBe(BIVARIATE_COLORS[6]);
    expect(colorOf(bi, 0, 99)).toBe(BIVARIATE_COLORS[2]);
    expect(colorOf(bi, 99, null)).toBeNull();
  });
});

describe("palette", () => {
  const tokens = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");
  const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i").exec(tokens)?.[1]?.toLowerCase();

  it("mirrors the tokens.css ramps", () => {
    UNIVARIATE_COLORS.forEach((hex, i) => expect(hex).toBe(token(`u${i + 1}`)));
    BIVARIATE_COLORS.forEach((hex, i) => expect(hex).toBe(token(`bv${i}`)));
  });

  it("converts hex to rgb for deck.gl", () => {
    expect(hexToRgb("#e068c0")).toEqual([224, 104, 192]);
    expect(hexToRgb("#262a36")).toEqual([38, 42, 54]);
  });
});

describe("labels", () => {
  const composite = catalogLayer("composite")!;

  it("formats values per unit with one precision per axis", () => {
    const score = { layer: composite, mode: "score" as const };
    expect(formatValue(21, { ...score, breaks: COMPOSITE_SCHOOLS })).toBe("21");
    expect(formatValue(34, { ...score, breaks: [24.1, 25.8, 29.3, 34] })).toBe("34.0");
    expect(formatValue(37.7, { ...score, breaks: [23, 27, 31, 37.7] })).toBe("37.7");
    const gini = { layer: catalogLayer("gini")!, mode: "score" as const, breaks: [0.43, 0.45] };
    expect(formatValue(0.4, gini)).toBe("0.40");
    const white = { layer: catalogLayer("ctx_white")!, mode: "score" as const, breaks: [56.6, 66.8] };
    expect(formatValue(56.6, white)).toBe("56.6%");
    expect(formatValue(100 / 3, { ...score, mode: "pct", breaks: [100 / 3] })).toBe("33");
  });

  it("describes every class so swatches have text alternatives", () => {
    const scale = resolveScale(["composite"], "local", "score", breaks)!;
    expect(classRanges(scale.a).map((r) => r.label)).toEqual([
      "below 21",
      "21 to under 25",
      "25 to under 30",
      "30 to under 35",
      "35 and above",
    ]);
  });

  it("marks classes that repeated breaks leave empty", () => {
    const scale = resolveScale(["ctx_aian"], "local", "score", breaks)!;
    expect(classRanges(scale.a).map((r) => r.empty)).toEqual([false, true, false, true, false]);
  });

  it("flags thin areas", () => {
    expect([0, 1, 2, 3].map(isThin)).toEqual([false, true, true, false]);
  });
});
