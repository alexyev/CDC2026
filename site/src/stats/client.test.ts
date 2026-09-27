// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InsightRequest, InsightResult } from "@/lib/types";
import type { StatsWorkerRequest, StatsWorkerResponse } from "./protocol";

class FakeWorker {
  static last: FakeWorker;
  posted: StatsWorkerRequest[] = [];
  onmessage: ((event: MessageEvent<StatsWorkerResponse>) => void) | null = null;
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(msg: StatsWorkerRequest) {
    this.posted.push(msg);
  }
  reply(msg: StatsWorkerResponse) {
    this.onmessage?.({ data: msg } as MessageEvent<StatsWorkerResponse>);
  }
  answer(requestId: number) {
    this.reply({ type: "insight", result: { requestId, schools: {} as InsightResult["schools"], ms: 1 } });
  }
}

const req = (requestId: number): InsightRequest => ({
  requestId,
  layerA: "composite",
  schools: { ids: [], x: [] },
  bootstrap: { resamples: 1000, seed: 42 },
});

async function loadClient() {
  vi.resetModules();
  return import("./client");
}

beforeEach(() => vi.stubGlobal("Worker", FakeWorker));
afterEach(() => vi.unstubAllGlobals());

describe("stats client", () => {
  it("resolves the latest request and drops superseded ones as null", async () => {
    const client = await loadClient();
    const first = client.requestInsight(req(client.nextRequestId()));
    const second = client.requestInsight(req(client.nextRequestId()));
    await expect(first).resolves.toBeNull();
    FakeWorker.last.answer(1);
    FakeWorker.last.answer(2);
    await expect(second).resolves.toMatchObject({ requestId: 2 });
  });

  it("cancelInsight resolves pending requests as null and drops their late results", async () => {
    const client = await loadClient();
    const pending = client.requestInsight(req(client.nextRequestId()));
    client.cancelInsight();
    await expect(pending).resolves.toBeNull();
    FakeWorker.last.answer(1);
    const next = client.requestInsight(req(client.nextRequestId()));
    expect(FakeWorker.last.posted.at(-1)!.request.requestId).toBeGreaterThan(1);
    FakeWorker.last.answer(FakeWorker.last.posted.at(-1)!.request.requestId);
    await expect(next).resolves.not.toBeNull();
  });

  it("rejects with the worker's error message", async () => {
    const client = await loadClient();
    const pending = client.requestInsight(req(client.nextRequestId()));
    FakeWorker.last.reply({ type: "error", requestId: 1, message: "Error: boom" });
    await expect(pending).rejects.toThrow("Error: boom");
  });
});
