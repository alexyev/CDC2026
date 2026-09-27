// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { describe, expect, it } from "vitest";
import type { InsightRequest, InsightResult } from "@/lib/types";
import type { StatsWorkerResponse } from "./protocol";
import { createInsightQueue } from "./queue";

const req = (requestId: number): InsightRequest => ({
  requestId,
  layerA: "composite",
  schools: { ids: [], x: [] },
  bootstrap: { resamples: 1000, seed: 42 },
});

function harness(compute?: (r: InsightRequest) => InsightResult) {
  const replies: StatsWorkerResponse[] = [];
  const deferred: (() => void)[] = [];
  const computed: number[] = [];
  const enqueue = createInsightQueue(
    (r) => replies.push(r),
    (run) => deferred.push(run),
    compute ??
      ((r) => {
        computed.push(r.requestId);
        return { requestId: r.requestId, schools: {} as InsightResult["schools"], ms: 0 };
      }),
  );
  const flush = () => deferred.splice(0).forEach((run) => run());
  return { replies, computed, enqueue, flush };
}

describe("createInsightQueue", () => {
  it("computes only the newest of a burst and drops the stale ones", () => {
    const h = harness();
    h.enqueue({ type: "insight", request: req(1) });
    h.enqueue({ type: "insight", request: req(2) });
    h.enqueue({ type: "insight", request: req(3) });
    h.flush();
    expect(h.computed).toEqual([3]);
    expect(h.replies.map((r) => (r.type === "insight" ? r.result.requestId : -1))).toEqual([3]);
  });

  it("ignores an older request that arrives after a newer one", () => {
    const h = harness();
    h.enqueue({ type: "insight", request: req(5) });
    h.enqueue({ type: "insight", request: req(4) });
    h.flush();
    expect(h.computed).toEqual([5]);
  });

  it("computes each request that arrives after the previous run", () => {
    const h = harness();
    h.enqueue({ type: "insight", request: req(1) });
    h.flush();
    h.enqueue({ type: "insight", request: req(2) });
    h.flush();
    expect(h.computed).toEqual([1, 2]);
  });

  it("replies with an error carrying the request id when computing throws", () => {
    const h = harness(() => {
      throw new Error("boom");
    });
    h.enqueue({ type: "insight", request: req(9) });
    h.flush();
    expect(h.replies).toEqual([{ type: "error", requestId: 9, message: "Error: boom" }]);
  });
});
