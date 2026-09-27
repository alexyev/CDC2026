// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Compare mode's own channel to the stats worker (SPEC.md 6.2), so compare requests and the insight panel's
// requests never cancel each other in the shared latest-wins client. Same worker module, same protocol.
// One request carries both compare columns: the first column in `areas`, the second in `schools`.

import type { InsightRequest, InsightResult } from "./types";
import type { StatsWorkerRequest, StatsWorkerResponse } from "@/stats/protocol";
import type { ValuePairs } from "./compareData";

let worker: Worker | null = null;
let latestId = 0;
const pending = new Map<number, (result: InsightResult | null) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../stats/stats.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<StatsWorkerResponse>) => {
      const msg = event.data;
      const id = msg.type === "insight" ? msg.result.requestId : msg.requestId;
      const resolve = pending.get(id);
      if (!resolve) return;
      pending.delete(id);
      resolve(msg.type === "insight" && id === latestId ? msg.result : null);
    };
  }
  return worker;
}

export function compareRequest(
  requestId: number,
  layerA: string,
  layerB: string | undefined,
  first: ValuePairs,
  second: ValuePairs,
): InsightRequest {
  return {
    requestId,
    layerA,
    layerB,
    areas: { ids: first.ids, x: first.x, y: first.y },
    schools: { ids: second.ids, x: second.x, y: second.y },
    bootstrap: { resamples: 1000, seed: 42 },
  };
}

/** Correlates both compare columns. Resolves null when a newer compare request superseded it or the worker failed. */
export function requestCompareStats(
  layerA: string,
  layerB: string | undefined,
  first: ValuePairs,
  second: ValuePairs,
): Promise<InsightResult | null> {
  const requestId = ++latestId;
  for (const [id, resolve] of pending) {
    pending.delete(id);
    resolve(null);
  }
  return new Promise((resolve) => {
    pending.set(requestId, resolve);
    const msg: StatsWorkerRequest = {
      type: "insight",
      request: compareRequest(requestId, layerA, layerB, first, second),
    };
    getWorker().postMessage(msg);
  });
}
