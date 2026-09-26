// @vitest-environment node
import { describe, expect, it } from "vitest";
import catalog from "../../data/catalog.json" with { type: "json" };
import { UTTERANCES } from "./contract.js";
import { FEW_SHOT_EXAMPLES, SYSTEM_PROMPT } from "./prompt.js";

describe("SYSTEM_PROMPT", () => {
  it.each(catalog.layers.map((l) => l.id))("lists catalog id %s on its own line", (id) => {
    expect(SYSTEM_PROMPT).toMatch(new RegExp(`^${id} \\| `, "m"));
  });

  it("carries every alias", () => {
    for (const alias of catalog.layers.flatMap((l) => l.aliases)) expect(SYSTEM_PROMPT).toContain(alias);
  });

  it("has the six few-shot examples from the spec", () => {
    expect(FEW_SHOT_EXAMPLES.map((e) => e.text)).toEqual([
      "compare crime and education in LA County and California",
      "show me poverty in Texas",
      "where is housing stress worst in the Bay Area",
      "Albertville High School",
      "percentile view of composite in Cook County Illinois",
      "reset",
    ]);
    for (const { intent } of FEW_SHOT_EXAMPLES) expect(SYSTEM_PROMPT).toContain(JSON.stringify(intent));
  });

  it("keeps the contract fixture out of the few-shot examples", () => {
    for (const { text } of UTTERANCES) expect(SYSTEM_PROMPT).not.toContain(JSON.stringify(text));
  });

  it("states the role and never asks for numbers or coordinates", () => {
    expect(SYSTEM_PROMPT).toContain("You never invent numbers, ids, or coordinates.");
  });
});
