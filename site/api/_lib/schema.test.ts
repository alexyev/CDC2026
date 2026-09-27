// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// @vitest-environment node
import { describe, expect, it } from "vitest";
import catalog from "../../data/catalog.json" with { type: "json" };
import { UTTERANCES } from "./contract.js";
import { FEW_SHOT_EXAMPLES } from "./prompt.js";
import { IntentSchema, LayerIdSchema, type Intent } from "./schema.js";

const FULL: Intent = {
  action: "explore",
  layers: ["composite", "ctx_hispanic"],
  places: [{ query: "Cook County", kind: "county", stateHint: "Illinois" }],
  display: "pct",
  note: "Composite is the overall community stress score.",
};

describe("IntentSchema", () => {
  const valid: [string, Intent][] = [
    ["a full intent", FULL],
    ["a minimal intent", { action: "clear", layers: [], places: [] }],
    ...UTTERANCES.map((u): [string, Intent] => [`fixture: ${u.text}`, u.expected]),
    ...FEW_SHOT_EXAMPLES.map((e): [string, Intent] => [`few-shot: ${e.text}`, e.intent]),
  ];

  it.each(valid)("round-trips %s through JSON", (_name, intent) => {
    expect(IntentSchema.parse(JSON.parse(JSON.stringify(intent)))).toEqual(intent);
  });

  it("accepts exactly the catalog ids as layers", () => {
    expect(LayerIdSchema.options).toEqual(catalog.layers.map((l) => l.id));
  });

  it.each([
    ["an unknown layer", { ...FULL, layers: ["crime_rate"] }],
    ["three layers", { ...FULL, layers: ["crime", "health", "housing"] }],
    ["three places", { ...FULL, places: [FULL.places[0], FULL.places[0], FULL.places[0]] }],
    ["an unknown action", { ...FULL, action: "zoom" }],
    ["an unknown place kind", { ...FULL, places: [{ query: "Ohio", kind: "country" }] }],
    ["an empty place query", { ...FULL, places: [{ query: "", kind: "state" }] }],
    ["a place query over 80 characters", { ...FULL, places: [{ query: "x".repeat(81), kind: "school" }] }],
    ["a note over 140 characters", { ...FULL, note: "x".repeat(141) }],
    ["an unknown display", { ...FULL, display: "rank" }],
    ["a missing layers array", { action: "explore", places: [] }],
  ])("rejects %s", (_name, value) => {
    expect(IntentSchema.safeParse(value).success).toBe(false);
  });
});
