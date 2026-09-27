// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { describe, expect, it } from "vitest";
import type { InsightRequest } from "@/lib/types";
import { clearInsightCache, computeInsight } from "./insight";

const x = Array.from({ length: 40 }, (_, i) => (i * 13) % 40);
const y = x.map((v, i) => (i % 7 === 0 ? null : v + (i % 5)));
const req = (requestId: number, overrides: Partial<InsightRequest> = {}): InsightRequest => ({
  requestId,
  layerA: "composite",
  layerB: "education",
  schools: { ids: x.map((_, i) => `s${i}`), x, y },
  bootstrap: { resamples: 1000, seed: 42 },
  ...overrides,
});

describe("computeInsight", () => {
  it("echoes the request id and memoizes rows by content", () => {
    clearInsightCache();
    const a = computeInsight(req(1));
    const b = computeInsight(req(2));
    expect(a.requestId).toBe(1);
    expect(b.requestId).toBe(2);
    expect(b.schools).toBe(a.schools);
    expect(a.schools.spearman.n).toBe(34);
    expect(a.schools.spearman.nMissing).toBe(6);
  });

  it("recomputes when a value, an id, or a layer changes", () => {
    clearInsightCache();
    const a = computeInsight(req(1));
    const changedValue = computeInsight(
      req(2, { schools: { ids: x.map((_, i) => `s${i}`), x: [...x.slice(0, 39), 99], y } }),
    );
    const changedId = computeInsight(req(3, { schools: { ids: x.map((_, i) => `t${i}`), x, y } }));
    const changedLayer = computeInsight(req(4, { layerB: "housing" }));
    expect(changedValue.schools).not.toBe(a.schools);
    expect(changedId.schools).not.toBe(a.schools);
    expect(changedLayer.schools).not.toBe(a.schools);
    expect(changedId.schools).toEqual(a.schools);
  });

  it("uses the Gini range for the Gini histogram", () => {
    const r = computeInsight(
      req(5, { layerA: "gini", layerB: undefined, schools: { ids: ["a", "b"], x: [0.42, 0.51] } }),
    );
    expect(r.schools.histA.bins[20]).toBe(1);
    expect(r.schools.histA.counts[8] + r.schools.histA.counts[10]).toBe(2);
    expect(r.schools.histA.median).toBeCloseTo(0.465, 12);
  });
});
