// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { describe, expect, it } from "vitest";
import type { Topology } from "topojson-specification";
import counties from "@/test/fixtures/counties.json";
import countiesTopo from "@/test/fixtures/counties.topo.json";
import statesTopo from "@/test/fixtures/states.topo.json";
import {
  COMPARE_COLORS,
  COMPARE_LINE_LAYER_ID,
  compareFeatures,
  compareOutlineLayers,
  geometryContains,
  pickArea,
} from "./compareOutlines";

const STATES = statesTopo as unknown as Topology;
const COUNTIES = countiesTopo as unknown as Topology;

describe("compare outlines (SPEC.md 3.9, 9.3)", () => {
  it("uses the --mark-a and --mark-b values of SPEC.md 9.2", () => {
    expect(COMPARE_COLORS).toEqual({ a: "#ffd166", b: "#ff7a59" });
  });

  it("draws A amber and B coral at 2.5 px on its own source", () => {
    const [casing, line] = compareOutlineLayers();
    expect(casing!.source).toBe(line!.source);
    expect(line!.id).toBe(COMPARE_LINE_LAYER_ID);
    expect(line!.paint?.["line-width"]).toBe(2.5);
    expect(line!.paint?.["line-color"]).toEqual(["match", ["get", "slot"], "a", "#ffd166", "#ff7a59"]);
  });

  it("builds slot-tagged features for the pins in order", () => {
    const fc = compareFeatures(
      [
        { kind: "county", id: "06075" },
        { kind: "county", id: "06037" },
      ],
      { county: COUNTIES },
    );
    expect(fc.features.map((f) => [f.properties.id, f.properties.slot])).toEqual([
      ["06075", "a"],
      ["06037", "b"],
    ]);
    const missing = compareFeatures([{ kind: "state", id: "99" }], { state: STATES });
    expect(missing.features).toHaveLength(0);
  });

  it("picks the area under a point by point-in-polygon", () => {
    expect(pickArea(STATES, -119.4, 37.2)).toBe("06");
    expect(pickArea(STATES, -99.3, 31.5)).toBe("48");
    expect(pickArea(STATES, -40, 30)).toBeNull();
    const i = counties.ids.indexOf("17031");
    const [lon, lat] = counties.centroid[i]!;
    expect(pickArea(COUNTIES, lon!, lat!)).toBe("17031");
  });

  it("excludes holes", () => {
    const square = (a: number, b: number) => [
      [a, a],
      [b, a],
      [b, b],
      [a, b],
      [a, a],
    ];
    const donut = { type: "Polygon" as const, coordinates: [square(0, 10), square(4, 6)] };
    expect(geometryContains(donut, 2, 2)).toBe(true);
    expect(geometryContains(donut, 5, 5)).toBe(false);
    expect(geometryContains(donut, 11, 5)).toBe(false);
  });
});
