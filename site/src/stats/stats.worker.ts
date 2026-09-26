// Stats worker (SPEC.md 6.2): runs every correlation off the main thread. Requests are coalesced to the newest
// (queue.ts) and each row of the result is memoized (insight.ts).

import type { StatsWorkerRequest } from "./protocol";
import { createInsightQueue } from "./queue";

const enqueue = createInsightQueue(
  (reply) => self.postMessage(reply),
  (run) => setTimeout(run, 0),
);

self.onmessage = (event: MessageEvent<StatsWorkerRequest>) => enqueue(event.data);
