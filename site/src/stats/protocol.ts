// Message protocol between the main thread and stats.worker.ts (SPEC.md 6.2). Frozen after T0.
// The main thread posts an InsightRequest; the worker answers with the InsightResult of the same requestId.

import type { InsightRequest, InsightResult } from "@/lib/types";

export type StatsWorkerRequest = { type: "insight"; request: InsightRequest };

export type StatsWorkerResponse =
  { type: "insight"; result: InsightResult } | { type: "error"; requestId: number; message: string };
