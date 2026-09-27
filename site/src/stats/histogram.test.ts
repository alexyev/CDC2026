// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { describe, expect, it } from "vitest";
import { HISTOGRAM_BINS, histogram, layerDomain, median } from "./histogram";

describe("histogram", () => {
  it("uses 20 bins of 5 over 0-100 with values on an edge in the upper bin", () => {
    const h = histogram(Float64Array.from([0, 4.9, 5, 50, 99.9, 100]), layerDomain("composite"));
    expect(h.bins).toHaveLength(HISTOGRAM_BINS + 1);
    expect(h.bins[1]).toBe(5);
    expect(h.bins[20]).toBe(100);
    expect(h.counts).toHaveLength(HISTOGRAM_BINS);
    expect(h.counts[0]).toBe(2);
    expect(h.counts[1]).toBe(1);
    expect(h.counts[10]).toBe(1);
    expect(h.counts[19]).toBe(2);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(6);
  });

  it("uses 0-1 in steps of 0.05 for Gini, keeping float edges exact", () => {
    expect(layerDomain("gini")).toEqual([0, 1]);
    const h = histogram(Float64Array.from([0.15, 0.3, 0.46, 1]), layerDomain("gini"));
    expect(h.bins[3]).toBe(0.15);
    expect(h.counts[3]).toBe(1);
    expect(h.counts[6]).toBe(1);
    expect(h.counts[9]).toBe(1);
    expect(h.counts[19]).toBe(1);
  });

  it("clamps out-of-range values into the end bins", () => {
    const h = histogram(Float64Array.from([-3, 140]), [0, 100]);
    expect(h.counts[0]).toBe(1);
    expect(h.counts[19]).toBe(1);
  });

  it("reports the median of the values, null when empty", () => {
    expect(median(Float64Array.from([3, 1, 2]))).toBe(2);
    expect(median(Float64Array.from([4, 1, 3, 2]))).toBe(2.5);
    expect(histogram(new Float64Array(0), [0, 100]).median).toBeNull();
  });
});
