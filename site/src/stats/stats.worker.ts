// Stats worker. T0 stub: answers every request with empty statistics (r = null) and the correct counts.
// owner: S1 replaces computeInsight with Spearman, Pearson, bootstrap, Bonett-Wright intervals, and histograms.

import type { Histogram, InsightRequest, InsightResult, PairStats } from "@/lib/types";
import type { StatsWorkerRequest, StatsWorkerResponse } from "./protocol";

function emptyPair(method: PairStats["method"], x: (number | null)[], y?: (number | null)[]): PairStats {
  const n = y ? x.filter((v, i) => v !== null && y[i] !== null).length : x.filter((v) => v !== null).length;
  return { method, r: null, ci: null, ciMethod: null, n, nMissing: x.length - n, tooFew: n < 10 };
}

const emptyHist: Histogram = { bins: [], counts: [], median: null };

export function computeInsight(req: InsightRequest): InsightResult {
  const t0 = performance.now();
  const part = (p: { x: (number | null)[]; y?: (number | null)[] }) => ({
    spearman: emptyPair("spearman", p.x, p.y),
    pearson: emptyPair("pearson", p.x, p.y),
    histA: emptyHist,
    histB: p.y ? emptyHist : undefined,
  });
  return {
    requestId: req.requestId,
    areas: req.areas ? part(req.areas) : undefined,
    schools: part(req.schools),
    ms: performance.now() - t0,
  };
}

self.onmessage = (event: MessageEvent<StatsWorkerRequest>) => {
  const msg = event.data;
  let reply: StatsWorkerResponse;
  try {
    reply = { type: "insight", result: computeInsight(msg.request) };
  } catch (err) {
    reply = { type: "error", requestId: msg.request.requestId, message: String(err) };
  }
  self.postMessage(reply);
};
