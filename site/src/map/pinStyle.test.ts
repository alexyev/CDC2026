// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { describe, expect, it } from "vitest";
import breaksFixture from "@/test/fixtures/breaks.json";
import schoolsFixture from "@/test/fixtures/schools/all.json";
import type { BreaksFile, SchoolsFile } from "@/lib/dataTypes";
import { BIVARIATE_COLORS, classIndex, hexToRgb, PERCENTILE_QUINTILES, UNIVARIATE_COLORS } from "@/lib/scales";
import {
  haloRadius,
  HALO_WIDTH,
  NO_DATA_MARKER,
  noDataMarker,
  PIN_COLORS,
  pinAttributes,
  pinBeforeId,
  pinColor,
  pinRadius,
  pinScale,
  pinsOpacity,
  pinsVisible,
  PIN_STROKE_WIDTH,
} from "./pinStyle";

const schools = schoolsFixture as SchoolsFile;
const breaks = breaksFixture as unknown as BreaksFile;
const rgba = (hex: string) => [...hexToRgb(hex), 255];

describe("pin colors", () => {
  const composite = schools.values.composite!;

  it("color a univariate view by the local (school) quintiles", () => {
    const scale = pinScale(["composite"], "score", breaks)!;
    expect(scale.a.breaks).toEqual(breaks.composite!.local.quint);
    composite.forEach((v, i) => {
      expect(pinColor(scale, schools, i, true)).toEqual(rgba(UNIVARIATE_COLORS[classIndex(v, [21, 25, 30, 35])!]));
    });
  });

  it("color a bivariate view by 3 * classA + classB on the local terciles", () => {
    const scale = pinScale(["composite", "education"], "score", breaks)!;
    const edu = schools.values.education!;
    const i = edu.findIndex((v) => v !== null);
    const a = classIndex(composite[i], breaks.composite!.local.terc)!;
    const b = classIndex(edu[i], breaks.education!.local.terc)!;
    expect(pinColor(scale, schools, i, true)).toEqual(rgba(BIVARIATE_COLORS[3 * a + b]));
  });

  it("use national percentile ranks with fixed breaks in percentile display", () => {
    const scale = pinScale(["composite"], "pct", breaks)!;
    expect(scale.a.valueKey).toBe("composite_pct");
    expect(scale.a.breaks).toEqual(PERCENTILE_QUINTILES);
    expect(pinScale(["gini"], "pct", breaks)!.a.valueKey).toBe("gini");
  });

  it("give no color when an active layer is missing, and a neutral color with no layer", () => {
    const i = schools.values.crime!.findIndex((v) => v === null);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(pinColor(pinScale(["composite", "crime"], "score", breaks), schools, i, true)).toBeNull();
    expect(pinColor(null, schools, i, false)).toEqual(PIN_COLORS.neutral);
    expect(pinColor(null, schools, i, true)).toBeNull();
  });
});

describe("pinAttributes", () => {
  it("splits schools into filled pins and no-data markers", () => {
    const n = schools.ids.length;
    const { fill, rows, noData } = pinAttributes(["crime"], "score", schools, breaks);
    expect(fill.length).toBe(n * 4);
    expect(rows.length + noData.length).toBe(n);
    const missing = schools.values.crime!.findIndex((v) => v === null);
    const present = schools.values.crime!.findIndex((v) => v !== null);
    expect([...noData]).toContain(missing);
    expect([...rows]).toContain(present);
    expect([...fill.slice(missing * 4, missing * 4 + 4)]).toEqual([0, 0, 0, 0]);
    expect([...fill.slice(present * 4, present * 4 + 4)]).toEqual(
      pinColor(pinScale(["crime"], "score", breaks), schools, present, true),
    );
  });

  it("draws every school as a filled pin when no layer is active", () => {
    const { rows, noData } = pinAttributes([], "score", schools, breaks);
    expect(rows.length).toBe(schools.ids.length);
    expect(noData.length).toBe(0);
  });
});

// WCAG relative luminance and contrast ratio, for checking the pin casing against every fill it can sit on.
const luminance = ([r, g, b]: readonly number[]) => {
  const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
};
const contrast = (x: readonly number[], y: readonly number[]) => {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (hi! + 0.05) / (lo! + 0.05);
};
/** A translucent RGBA ring composited over an opaque background. */
const over = ([r, g, b, a]: readonly number[], bg: readonly number[]) =>
  [r!, g!, b!].map((c, k) => (c * a!) / 255 + bg[k]! * (1 - a! / 255));

describe("pin casing", () => {
  // Every class color a county fill can have, plus the bare basemap once the fills have faded.
  const fills = [...UNIVARIATE_COLORS, ...BIVARIATE_COLORS, "#0a0c10"].map(hexToRgb);
  const casings = {
    "filled pin (near-white border, dark shadow)": [PIN_COLORS.ring, PIN_COLORS.shadow],
    "no-data marker (light dashes, dark ring)": [PIN_COLORS.noData, PIN_COLORS.shadow],
    "starred or hovered pin (white border, dark shadow)": [PIN_COLORS.selection, PIN_COLORS.shadow],
  };

  for (const [name, tones] of Object.entries(casings)) {
    it(`gives the ${name} a tone with at least 3:1 contrast against every fill`, () => {
      for (const fill of fills) {
        const best = Math.max(...tones.map((tone) => contrast(over(tone, fill), fill)));
        expect(best, `fill ${fill}`).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it("gives every filled pin, even one of the darkest class, a border with at least 3:1 contrast against its fill", () => {
    for (const fill of [...UNIVARIATE_COLORS, ...BIVARIATE_COLORS].map(hexToRgb)) {
      const best = Math.max(...[PIN_COLORS.ring, PIN_COLORS.shadow].map((tone) => contrast(over(tone, fill), fill)));
      expect(best, `fill ${fill}`).toBeGreaterThanOrEqual(3);
    }
    // The darkest class is a solid disc inside a light border, not a hollow ring of the basemap's color.
    const darkest = hexToRgb(UNIVARIATE_COLORS[0]);
    expect(contrast(over(PIN_COLORS.ring, darkest), darkest)).toBeGreaterThanOrEqual(7);
  });

  it("draws the no-data marker as a smaller, broken ring than any filled pin", () => {
    for (const zoom of [8, 9, 10, 12]) {
      const r = pinRadius(zoom);
      const marker = noDataMarker(r);
      // The marker ends inside the outer edge of a pin at the same zoom, so the two never share a size.
      expect(marker.size / 2).toBeLessThan(r + PIN_STROKE_WIDTH / 2 + HALO_WIDTH);
      expect(marker.ring).toBeLessThan(r);
    }
    expect(NO_DATA_MARKER.dashes).toBeGreaterThanOrEqual(4);
    expect(noDataMarker(5)).toEqual({ ring: 4, size: 2 * (4 + NO_DATA_MARKER.dashWidth / 2 + HALO_WIDTH) });
  });

  it("puts the shadow right outside the border", () => {
    expect(haloRadius(5)).toBe(5 + PIN_STROKE_WIDTH / 2 + HALO_WIDTH / 2);
  });
});

describe("zoom rules", () => {
  it("grow the radius from 5 px at z8 to 6.5 px at z12 within [3, 7]", () => {
    expect(pinRadius(8)).toBe(5);
    expect(pinRadius(10)).toBe(5.75);
    expect(pinRadius(12)).toBe(6.5);
    expect(pinRadius(0)).toBe(3);
    expect(pinRadius(20)).toBe(7);
  });

  it("hide ordinary pins below z8", () => {
    expect(pinsVisible(7.99)).toBe(false);
    expect(pinsVisible(8)).toBe(true);
    expect(pinsOpacity(7.5, false)).toBe(0);
    expect(pinsOpacity(8, false)).toBeGreaterThan(0);
    expect(pinsOpacity(9, false)).toBe(1);
  });

  it("dim unstarred pins to 25% with show only starred", () => {
    expect(pinsOpacity(9, true)).toBe(0.25);
  });
});

describe("pinBeforeId", () => {
  const l = (spec: string) => spec.split(" ").map((x) => ({ id: x.split(":")[0]!, type: x.split(":")[1]! }));

  it("puts pins above road lines and below road and place labels", () => {
    const order = l(
      "background:background water:fill water_name:symbol highway_minor:line road_oneway:symbol railway:line " +
        "highway_name_other:symbol boundary_state:line place_city:symbol place_state:symbol",
    );
    expect(pinBeforeId(order)).toBe("highway_name_other");
  });

  it("falls back to the first symbol layer and to undefined", () => {
    expect(pinBeforeId(l("background:background water_name:symbol road:line"))).toBe("water_name");
    expect(pinBeforeId(l("background:background water:fill"))).toBeUndefined();
  });
});
