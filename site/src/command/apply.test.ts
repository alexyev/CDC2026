import { describe, expect, it, vi } from "vitest";
import type { Intent } from "@/lib/types";
import { COUNTY_DRILL_MIN_ZOOM, LOCAL_LEVEL_ZOOM, STATE_LEVEL_ZOOM } from "@/map/levels";
import { cameraForMove, executeCommand, planIntent, runPlan, type CameraMove } from "./apply";
import { parseIntent } from "./remote";
import { fixtureResolver, recordingTarget, refString } from "./testUtils";
import { UTTERANCES } from "./utterances.fixture";

const resolver = fixtureResolver();
const context = { level: "nation" as const, layers: ["composite"] };

/** A fetch that answers like the command function with `intent`. */
const functionReturning = (intent: Intent) =>
  vi.fn(async () => Response.json({ ok: true, intent, model: "claude-haiku-4-5" }));

describe("the 12-utterance fixture through apply (SPEC.md 14.7)", () => {
  for (const u of UTTERANCES) {
    it(u.text, async () => {
      const target = recordingTarget({
        // Start from a non-default view so "reset" has something to undo.
        ...(u.intent.action === "clear" ? { layers: ["crime", "education"], display: "pct" as const } : {}),
      });
      const fetchImpl = functionReturning(u.intent);
      const { result, degraded } = await executeCommand(u.text, {
        context,
        resolver: Promise.resolve(resolver),
        target,
        fetchImpl,
      });

      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(degraded).toBe(false);
      expect(result.status).toBe(u.expect.status);
      if (result.status === "needs-choice") {
        expect(result.labels).toEqual(u.expect.choices);
        expect(target.moves).toHaveLength(0);
        return;
      }
      if (result.status !== "applied") throw new Error(`unexpected ${result.status}`);
      expect(result.summary).toBe(u.expect.summary);
      const v = target.view;
      if (u.expect.layers) expect(v.layers).toEqual(u.expect.layers);
      expect(v.display).toBe(u.expect.display ?? "score");
      if (u.expect.selected !== undefined) expect(refString(v.selected)).toBe(u.expect.selected);
      if (u.expect.compare) {
        expect(v.compare.armed).toBe(true);
        expect(v.compare.pins.map(refString)).toEqual(u.expect.compare);
      }
      if (u.expect.profile) expect(v.profile).toBe(u.expect.profile);
      expect(target.moves).toHaveLength(u.intent.places.length || u.intent.action === "clear" ? 1 : 0);
    });
  }
});

describe("choosing a place from needs-choice chips", () => {
  it("applies the chosen Springfield", () => {
    const intent: Intent = {
      action: "explore",
      layers: ["poverty"],
      places: [{ query: "Springfield", kind: "unknown" }],
    };
    const target = recordingTarget();
    const first = runPlan(intent, resolver, target, false);
    expect(first.status).toBe("needs-choice");
    if (first.status !== "needs-choice") return;
    expect(target.view.layers).toEqual(["composite"]);

    const ma = first.candidates.find((c) => c.id === "MA:Springfield")!;
    const second = runPlan(intent, resolver, target, false, { [first.placeIndex]: ma });
    expect(second).toEqual({ status: "applied", summary: "Poverty · Springfield, MA", note: undefined });
    expect(refString(target.view.selected)).toBe("city:MA:Springfield");
    expect(target.view.layers).toEqual(["poverty"]);
  });
});

describe("degraded mode", () => {
  const text = "compare crime and education in LA County and California";

  it("runs the local parser when the function returns 503", async () => {
    const target = recordingTarget();
    const fetchImpl = vi.fn(async () => Response.json({ ok: false, error: "upstream_unreachable" }, { status: 503 }));
    const { result, degraded } = await executeCommand(text, {
      context,
      resolver: Promise.resolve(resolver),
      target,
      fetchImpl,
    });
    expect(degraded).toBe(true);
    expect(result).toEqual({
      status: "degraded",
      summary: "Crime × Education · Los Angeles County vs California · compare",
      note: undefined,
    });
    expect(target.view.compare.pins.map(refString)).toEqual(["county:06037"]);
  });

  it("runs the local parser when the function times out", async () => {
    const target = recordingTarget();
    const fetchImpl = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    );
    const started = Date.now();
    const { result, degraded } = await executeCommand("show me poverty in Texas", {
      context,
      resolver: Promise.resolve(resolver),
      target,
      fetchImpl,
      timeoutMs: 50,
    });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(degraded).toBe(true);
    expect(result).toMatchObject({ status: "degraded", summary: "Poverty · Texas" });
  });

  it("runs the local parser when the network is down or the body is not an intent", async () => {
    for (const fetchImpl of [
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
      vi.fn(async () =>
        Response.json({ ok: true, intent: { action: "explore", layers: ["not_a_layer"], places: [] } }),
      ),
    ]) {
      const { degraded } = await executeCommand("poverty in Texas", {
        context,
        resolver: Promise.resolve(resolver),
        target: recordingTarget(),
        fetchImpl,
      });
      expect(degraded).toBe(true);
    }
  });

  it("stops without applying when superseded", async () => {
    const controller = new AbortController();
    const target = recordingTarget();
    const fetchImpl = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    );
    const run = executeCommand("poverty in Texas", {
      context,
      resolver: Promise.resolve(resolver),
      target,
      fetchImpl,
      signal: controller.signal,
    });
    controller.abort();
    await expect(run).rejects.toBeDefined();
    expect(target.view.layers).toEqual(["composite"]);
  });

  it("posts the text and view context to /api/command", async () => {
    const fetchImpl = functionReturning({ action: "explore", layers: ["crime"], places: [] });
    await executeCommand("crime", {
      context: { level: "state", layers: ["composite"], selected: "California" },
      resolver: Promise.resolve(resolver),
      target: recordingTarget(),
      fetchImpl,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/command");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      text: "crime",
      context: { level: "state", layers: ["composite"], selected: "California" },
    });
  });
});

describe("planIntent", () => {
  it("reports no-match for an unknown place or an empty intent", () => {
    expect(
      planIntent({ action: "explore", layers: ["crime"], places: [{ query: "Atlantis", kind: "unknown" }] }, resolver)
        .result,
    ).toEqual({ status: "no-match", place: "Atlantis" });
    expect(planIntent({ action: "explore", layers: [], places: [] }, resolver).result).toEqual({ status: "no-match" });
  });

  it("changes layers alone without moving the camera", () => {
    const plan = planIntent({ action: "explore", layers: ["crime", "education"], places: [] }, resolver);
    expect(plan.patch?.layers).toEqual(["crime", "education"]);
    expect(plan.move).toBeUndefined();
    expect(plan.result).toMatchObject({ summary: "Crime × Education" });
  });

  it("flies to a county at local level and keeps two-state compares at nation level", () => {
    const county = planIntent(
      { action: "explore", layers: [], places: [{ query: "Cook County", kind: "county" }] },
      resolver,
    );
    expect(county.move).toMatchObject({ kind: "fit", minZoom: COUNTY_DRILL_MIN_ZOOM });
    const states = planIntent(
      {
        action: "compare",
        layers: [],
        places: [
          { query: "Texas", kind: "state" },
          { query: "Illinois", kind: "state" },
        ],
      },
      resolver,
    );
    expect((states.move as Extract<CameraMove, { kind: "fit" }>).maxZoom).toBeLessThan(STATE_LEVEL_ZOOM);
    const counties = planIntent(
      {
        action: "compare",
        layers: [],
        places: [
          { query: "Cook County", kind: "county" },
          { query: "Champaign County", kind: "county" },
        ],
      },
      resolver,
    );
    expect(counties.move).toMatchObject({ minZoom: STATE_LEVEL_ZOOM });
    expect((counties.move as Extract<CameraMove, { kind: "fit" }>).maxZoom).toBeLessThan(LOCAL_LEVEL_ZOOM);
  });

  it("pins a school's county when comparing it with a state", () => {
    const plan = planIntent(
      {
        action: "compare",
        layers: [],
        places: [
          { query: "Albertville High School", kind: "school" },
          { query: "Alabama", kind: "state" },
        ],
      },
      resolver,
    );
    expect(plan.patch?.compare?.pins.map(refString)).toEqual(["county:01095"]);
    expect(refString(plan.patch?.selected)).toBe("state:01");
  });

  it("clears the preset marker on any applied command", () => {
    const plan = planIntent({ action: "explore", layers: ["crime"], places: [] }, resolver);
    expect("preset" in (plan.patch ?? {})).toBe(true);
    expect(plan.patch?.preset).toBeUndefined();
  });
});

describe("cameraForMove", () => {
  it("fits the lower 48 near the spec's initial zoom on a 1440x900 window", () => {
    const cam = cameraForMove({ kind: "fit", bbox: [-125, 24, -66.5, 49.5] }, 1440, 900);
    expect(cam.zoom).toBeGreaterThan(2.5);
    expect(cam.zoom).toBeLessThan(4);
    expect(cam.lon).toBeCloseTo(-95.75, 2);
  });

  it("honors min and max zoom and centers schools", () => {
    expect(cameraForMove({ kind: "fit", bbox: [-88, 41, -87.9, 41.1], maxZoom: 7.9 }, 1440, 900).zoom).toBe(7.9);
    expect(cameraForMove({ kind: "fit", bbox: [-125, 24, -66.5, 49.5], minZoom: 5 }, 1440, 900).zoom).toBe(5);
    expect(cameraForMove({ kind: "center", center: [-86.2, 34.26], zoom: 12 }, 1440, 900)).toEqual({
      lon: -86.2,
      lat: 34.26,
      zoom: 12,
    });
  });
});

describe("parseIntent", () => {
  it("accepts a valid intent and drops null optionals", () => {
    expect(
      parseIntent({
        action: "compare",
        layers: ["crime"],
        places: [{ query: "Texas", kind: "state", stateHint: null }],
        display: null,
        note: null,
      }),
    ).toEqual({ action: "compare", layers: ["crime"], places: [{ query: "Texas", kind: "state" }] });
  });

  it("rejects unknown layers, actions, kinds, and oversize lists", () => {
    expect(parseIntent({ action: "explore", layers: ["nope"], places: [] })).toBeNull();
    expect(parseIntent({ action: "fly", layers: [], places: [] })).toBeNull();
    expect(parseIntent({ action: "explore", layers: [], places: [{ query: "x", kind: "planet" }] })).toBeNull();
    expect(parseIntent({ action: "explore", layers: ["crime", "health", "housing"], places: [] })).toBeNull();
    expect(parseIntent(null)).toBeNull();
  });
});
