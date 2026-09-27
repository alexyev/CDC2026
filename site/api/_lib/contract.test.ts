// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { compareIntent, UTTERANCES } from "./contract.js";
import type { Intent } from "./schema.js";

describe("contract fixture", () => {
  it("has 12 distinct utterances", () => {
    expect(UTTERANCES).toHaveLength(12);
    expect(new Set(UTTERANCES.map((u) => u.text)).size).toBe(12);
  });

  it("covers every action, both display modes, and every usable place kind", () => {
    const intents = UTTERANCES.map((u) => u.expected);
    expect(new Set(intents.map((i) => i.action))).toEqual(new Set(["explore", "compare", "profile", "clear"]));
    expect(intents.some((i) => i.display === "pct")).toBe(true);
    const kinds = new Set(intents.flatMap((i) => i.places.map((p) => p.kind)));
    for (const kind of ["state", "county", "school"]) expect(kinds).toContain(kind);
  });
});

describe("compareIntent", () => {
  const expected: Intent = {
    action: "explore",
    layers: ["lead_risk", "park_access"],
    places: [{ query: "Wayne County", kind: "county", stateHint: "Michigan" }],
  };

  it("matches itself and ignores the note", () => {
    for (const { expected: e } of UTTERANCES) expect(compareIntent(e, e)).toEqual([]);
    expect(compareIntent({ ...expected, note: "anything" }, expected)).toEqual([]);
  });

  it("accepts a place query that contains the expected one, ignoring case and punctuation", () => {
    const actual = {
      ...expected,
      places: [{ query: "wayne county, michigan", kind: "county" as const, stateHint: "michigan" }],
    };
    expect(compareIntent(actual, expected)).toEqual([]);
  });

  it.each([
    ["action", { ...expected, action: "compare" as const }],
    ["layer order", { ...expected, layers: ["park_access", "lead_risk"] }],
    ["display", { ...expected, display: "pct" as const }],
    ["place count", { ...expected, places: [] }],
    ["place kind", { ...expected, places: [{ ...expected.places[0], kind: "city" as const }] }],
    ["place query", { ...expected, places: [{ ...expected.places[0], query: "Wake County" }] }],
    ["stateHint", { ...expected, places: [{ query: "Wayne County", kind: "county" as const }] }],
  ])("reports a %s mismatch", (_name, actual) => {
    expect(compareIntent(actual, expected)).toHaveLength(1);
  });
});
