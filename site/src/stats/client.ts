// Main-thread interface to the stats worker. Only the latest request resolves; older ones resolve to null (stale).

import type { InsightRequest, InsightResult } from "@/lib/types";
import type { StatsWorkerRequest, StatsWorkerResponse } from "./protocol";

type Pending = { resolve: (r: InsightResult | null) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let latestId = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./stats.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<StatsWorkerResponse>) => {
      const msg = event.data;
      const id = msg.type === "insight" ? msg.result.requestId : msg.requestId;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (msg.type === "error") p.reject(new Error(msg.message));
      else p.resolve(id === latestId ? msg.result : null);
    };
  }
  return worker;
}

/** Next request id; pass it in InsightRequest.requestId. */
export function nextRequestId(): number {
  return ++latestId;
}

/**
 * Sends a request to the worker. Resolves with the result, or with null when a newer request
 * was issued in the meantime (the caller drops it). Send typed arrays' contents as plain arrays per InsightRequest.
 */
export function requestInsight(request: InsightRequest): Promise<InsightResult | null> {
  latestId = Math.max(latestId, request.requestId);
  for (const [id, p] of pending) {
    if (id < request.requestId) {
      pending.delete(id);
      p.resolve(null);
    }
  }
  return new Promise((resolve, reject) => {
    pending.set(request.requestId, { resolve, reject });
    const msg: StatsWorkerRequest = { type: "insight", request };
    getWorker().postMessage(msg);
  });
}
