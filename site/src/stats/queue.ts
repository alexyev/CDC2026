// Request coalescing for the stats worker: requests that arrive while one is computing, or before the deferred
// run starts, collapse to the newest, so a burst of viewport changes computes once instead of once per frame.
// Superseded requests get no reply; the client has already resolved them as stale (client.ts).

import type { StatsWorkerRequest, StatsWorkerResponse } from "./protocol";
import { computeInsight } from "./insight";

export function createInsightQueue(
  post: (reply: StatsWorkerResponse) => void,
  defer: (run: () => void) => void,
  compute = computeInsight,
): (msg: StatsWorkerRequest) => void {
  let queued: StatsWorkerRequest["request"] | null = null;
  const run = () => {
    const request = queued;
    queued = null;
    if (!request) return;
    try {
      post({ type: "insight", result: compute(request) });
    } catch (err) {
      post({ type: "error", requestId: request.requestId, message: String(err) });
    }
  };
  return (msg) => {
    if (queued && queued.requestId > msg.request.requestId) return;
    if (!queued) defer(run);
    queued = msg.request;
  };
}
