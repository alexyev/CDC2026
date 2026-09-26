// A2's shared 12-utterance contract fixture (api/_lib/utterances.json, SPEC.md 14.7) against the real pipeline
// outputs in public/data/v1: each expected intent, as a mocked function response, must resolve and apply, and the
// local parser must reach the same view for at least 9 of the 12.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import utterances from "../../api/_lib/utterances.json";
import type { GazetteerFile, SchoolsFile } from "@/lib/dataTypes";
import type { Intent } from "@/lib/types";
import { executeCommand, planIntent } from "./apply";
import { parseLocally } from "./localParser";
import { createResolver } from "./resolver";
import { recordingTarget, refString } from "./testUtils";

const readData = <T>(path: string): T =>
  JSON.parse(readFileSync(join(process.cwd(), "public/data/v1", path), "utf8")) as T;
const resolver = createResolver(readData<GazetteerFile>("gazetteer.json"), readData<SchoolsFile>("schools/all.json"));
const cases = utterances.cases as { text: string; expected: Intent }[];

describe("A2 contract utterances through apply, real data", () => {
  it.each(cases)("$text", async ({ text, expected }) => {
    const target = recordingTarget({ layers: ["crime", "education"], display: "pct" });
    const fetchImpl = vi.fn(async () => Response.json({ ok: true, intent: expected, model: "claude-haiku-4-5" }));
    const { result, degraded } = await executeCommand(text, {
      context: { level: "nation", layers: ["crime", "education"] },
      resolver: Promise.resolve(resolver),
      target,
      fetchImpl,
    });
    expect(degraded).toBe(false);
    expect(result.status).toBe("applied");
    if (expected.layers.length) expect(target.view.layers).toEqual(expected.layers);
    if (expected.display) expect(target.view.display).toBe(expected.display);
    if (expected.action === "compare") expect(target.view.compare.pins).toHaveLength(2);
    if (expected.action === "profile") expect(target.view.profile).toMatch(/^\d{12}$/);
  });

  it("resolves the named places to the right ids", () => {
    const tj = cases.find((c) => c.text.startsWith("open Thomas Jefferson"))!.expected;
    const tjId = planIntent(tj, resolver).patch?.profile;
    const schools = readData<SchoolsFile>("schools/all.json");
    expect(schools.name[schools.ids.indexOf(tjId!)]).toBe("Thomas Jefferson High For Science And Technology");
    const place = (text: string) => {
      const { expected } = cases.find((c) => c.text === text)!;
      return planIntent(expected, resolver).patch;
    };
    expect(refString(place("take me to Cook County")?.selected)).toBe("county:17031");
    expect(refString(place("lead exposure and park access in Wayne County, Michigan")?.selected)).toBe("county:26163");
    expect(refString(place("what does the Hispanic share look like in Miami-Dade County")?.selected)).toBe(
      "county:12086",
    );
    expect(place("compare Harris County and Dallas County on poverty")?.compare?.pins.map(refString)).toEqual([
      "county:48201",
      "county:48113",
    ]);
    expect(place("compare income inequality between New York and California")?.compare?.pins.map(refString)).toEqual([
      "state:36",
      "state:06",
    ]);
  });
});

describe("local parser parity, real data (SPEC.md 14.7 target: 9 of 12)", () => {
  it("reaches the function's view for at least 9 of the 12", () => {
    const misses = cases.filter(
      ({ text, expected }) =>
        JSON.stringify(planIntent(parseLocally(text, resolver), resolver)) !==
        JSON.stringify(planIntent(expected, resolver)),
    );
    expect(misses.map((c) => c.text)).toEqual([]);
  });
});

describe("resolver on real data", () => {
  const decide = (query: string, kind: Intent["places"][number]["kind"] = "unknown") =>
    resolver.decide(resolver.resolve({ query, kind }));

  it("offers up to three Springfields", () => {
    const d = decide("Springfield");
    expect(d.kind).toBe("choice");
    if (d.kind === "choice") expect(d.candidates.map((c) => resolver.label(c))).toHaveLength(3);
  });

  it("reads LA as Los Angeles County and California as the state", () => {
    const la = decide("LA");
    expect(la.kind === "match" && refString(la.candidate.ref)).toBe("county:06037");
    const ca = decide("California");
    expect(ca.kind === "match" && refString(ca.candidate.ref)).toBe("state:06");
  });
});
