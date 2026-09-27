// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// @vitest-environment node
import { describe, expect, it } from "vitest";
import catalog from "../../data/catalog.json" with { type: "json" };
import { jevDecision, jevQuestions, NONE, type ChoiceAnswer, type JevAnswers } from "./jev.js";
import type { CommandRequest, PlaceOption } from "./schema.js";

// The Jev request and the mapping from its typed answers to an Intent (SPEC.md section 14.3), without the network.

const context: CommandRequest["context"] = { level: "nation", layers: ["composite"] };

const LA: PlaceOption = {
  label: "Los Angeles County, California",
  kind: "county",
  state: "California",
  text: "LA County",
  start: 31,
};
const CA: PlaceOption = { label: "California", kind: "state", text: "California", start: 45 };
const CA_CITY: PlaceOption = {
  label: "California, Missouri (city)",
  kind: "city",
  state: "Missouri",
  text: "California",
  start: 45,
};
const HEADLINE: CommandRequest = {
  text: "compare crime and education in LA County and California",
  context,
  candidates: [LA, CA, CA_CITY],
};

/** A choice answer with `choice` at probability `p` and the rest spread over `others`. */
function pick(choice: string, p = 1, others: Record<string, number> = {}): ChoiceAnswer {
  return { choice, probabilities: { [choice]: p, ...others } };
}

function answers(over: Partial<JevAnswers> = {}): JevAnswers {
  return {
    action: pick("explore"),
    layer_1: pick(NONE),
    layer_2: pick(NONE),
    place_1: pick(NONE),
    place_2: pick(NONE),
    percentile: { noul: 0.02 },
    ...over,
  };
}

describe("jevQuestions", () => {
  it("sends only the request text as state", () => {
    expect(jevQuestions(HEADLINE).state).toEqual({ request: HEADLINE.text });
  });

  it("offers every catalog layer plus none, each with a criterion", () => {
    const { questions } = jevQuestions(HEADLINE);
    for (const key of ["layer_1", "layer_2"]) {
      const q = questions[key]!;
      expect(q.type).toBe("choice");
      const criteria = (q as { criteria: Record<string, string> }).criteria;
      expect(Object.keys(criteria).sort()).toEqual([...catalog.layers.map((l) => l.id), NONE].sort());
      for (const text of Object.values(criteria)) expect(text.length).toBeGreaterThan(10);
    }
  });

  it("offers the candidates by label, with their kind, state, and words", () => {
    const place = jevQuestions(HEADLINE).questions.place_1 as { criteria: Record<string, unknown> };
    expect(Object.keys(place.criteria)).toEqual([LA.label, CA.label, CA_CITY.label, NONE]);
    expect(place.criteria[LA.label]).toEqual({
      kind: "county",
      state: "California",
      "named in the request as": "LA County",
    });
  });

  it("asks no place questions when the browser found no candidates", () => {
    const { questions } = jevQuestions({ text: "percentile ranks for housing", context, candidates: [] });
    expect(Object.keys(questions).sort()).toEqual(["action", "layer_1", "layer_2", "percentile"]);
  });

  it("lets a request point at the selected place", () => {
    const wake: PlaceOption = {
      label: "Wake County, North Carolina",
      kind: "county",
      state: "North Carolina",
      text: "",
      start: -1,
      selected: true,
    };
    const q = jevQuestions({ text: "poverty here", context, candidates: [wake] }).questions.place_1 as {
      instructions: string;
      criteria: Record<string, Record<string, string>>;
    };
    expect(q.instructions).toMatch(/name or point at/);
    expect(q.criteria[wake.label]!.note).toMatch(/selected on the map/);
    expect(q.criteria[wake.label]!["named in the request as"]).toBeUndefined();
  });
});

describe("jevDecision", () => {
  it("maps the headline example to a compare intent with the candidate labels as picks", () => {
    const d = jevDecision(
      HEADLINE,
      answers({
        action: pick("compare"),
        layer_1: pick("crime"),
        layer_2: pick("education"),
        place_1: pick(LA.label),
        place_2: pick(CA.label),
      }),
    );
    expect(d).toEqual({
      intent: {
        action: "compare",
        layers: ["crime", "education"],
        places: [
          { query: "LA County", kind: "county", stateHint: "California" },
          { query: "California", kind: "state" },
        ],
      },
      picks: [LA.label, CA.label],
    });
  });

  it("orders places by where the text names them, whatever order Jev answered in", () => {
    const d = jevDecision(HEADLINE, answers({ place_1: pick(CA.label), place_2: pick(LA.label) }));
    expect(d.picks).toEqual([LA.label, CA.label]);
  });

  it("drops a state written right after a place in it", () => {
    const cook: PlaceOption = {
      label: "Cook County, Illinois",
      kind: "county",
      state: "Illinois",
      text: "Cook County",
      start: 9,
    };
    const il: PlaceOption = { label: "Illinois", kind: "state", text: "Illinois", start: 22 };
    const req = { text: "crime in Cook County, Illinois", context, candidates: [cook, il] };
    expect(jevDecision(req, answers({ place_1: pick(il.label), place_2: pick(cook.label) })).picks).toEqual([
      cook.label,
    ]);
    // With words between them, the state is a second place.
    const vs = {
      text: "Cook County vs Illinois",
      context,
      candidates: [
        { ...cook, start: 0 },
        { ...il, start: 15 },
      ],
    };
    expect(jevDecision(vs, answers({ place_1: pick(cook.label), place_2: pick(il.label) })).picks).toEqual([
      cook.label,
      il.label,
    ]);
  });

  it("drops a second place whose words overlap the first and a repeated pick", () => {
    expect(jevDecision(HEADLINE, answers({ place_1: pick(CA.label), place_2: pick(CA_CITY.label) })).picks).toEqual([
      CA.label,
    ]);
    expect(jevDecision(HEADLINE, answers({ place_1: pick(LA.label), place_2: pick(LA.label) })).picks).toEqual([
      LA.label,
    ]);
  });

  it("keeps two different layers and drops a repeated one", () => {
    expect(
      jevDecision(HEADLINE, answers({ layer_1: pick("poverty"), layer_2: pick("poverty") })).intent.layers,
    ).toEqual(["poverty"]);
    expect(jevDecision(HEADLINE, answers({ layer_1: pick(NONE), layer_2: pick("health") })).intent.layers).toEqual([
      "health",
    ]);
  });

  it("returns an empty clear intent whatever else Jev answered", () => {
    const d = jevDecision(
      HEADLINE,
      answers({ action: pick("clear"), layer_1: pick("crime"), place_1: pick(LA.label) }),
    );
    expect(d).toEqual({ intent: { action: "clear", layers: [], places: [] }, picks: [] });
  });

  it("explores instead of comparing with one place", () => {
    const d = jevDecision(HEADLINE, answers({ action: pick("compare"), place_1: pick(CA.label) }));
    expect(d.intent).toEqual({ action: "explore", layers: [], places: [{ query: "California", kind: "state" }] });
  });

  it("explores instead of comparing or profiling when no place was picked", () => {
    expect(jevDecision(HEADLINE, answers({ action: pick("compare"), layer_1: pick("crime") })).intent.action).toBe(
      "explore",
    );
    expect(jevDecision(HEADLINE, answers({ action: pick("profile") })).intent.action).toBe("explore");
  });

  it("sets the percentile view from the noul at 0.5", () => {
    expect(jevDecision(HEADLINE, answers({ percentile: { noul: 0.66 } })).intent.display).toBe("pct");
    expect(jevDecision(HEADLINE, answers({ percentile: { noul: 0.49 } })).intent.display).toBeUndefined();
  });

  it("maps a region to an unknown-kind place resolved by name", () => {
    const bay: PlaceOption = {
      label: "Bay Area, California (region)",
      kind: "region",
      state: "California",
      text: "Bay Area",
      start: 20,
    };
    const d = jevDecision(
      { text: "housing stress in the Bay Area", context, candidates: [bay] },
      answers({ place_1: pick(bay.label) }),
    );
    expect(d.intent.places).toEqual([{ query: "Bay Area", kind: "unknown", stateHint: "California" }]);
  });

  it.each([
    ["a missing answer", { layer_2: undefined }],
    ["an unknown action", { action: pick("dance") }],
    ["an unknown layer", { layer_1: pick("crime_rate") }],
    ["a place never offered", { place_1: pick("Atlantis") }],
  ])("throws on %s so the function falls back", (_name, over) => {
    expect(() => jevDecision(HEADLINE, answers(over as Partial<JevAnswers>))).toThrow();
  });
});

describe("confidence gating", () => {
  const springfields: PlaceOption[] = ["Illinois", "Massachusetts", "Missouri"].map((state) => ({
    label: `Springfield, ${state} (city)`,
    kind: "city",
    state,
    text: "Springfield",
    start: 0,
  }));
  const req: CommandRequest = { text: "Springfield", context, candidates: springfields };

  it("asks about an unsure place, offering every place the same words matched", () => {
    const [il, ma, mo] = springfields.map((s) => s.label) as [string, string, string];
    const d = jevDecision(req, answers({ place_1: pick(il, 0.47, { [ma]: 0.42, [mo]: 0.05, [NONE]: 0.06 }) }));
    expect(d.ask).toEqual({ kind: "place", index: 0, options: [il, ma, mo] });
    expect(d.picks).toEqual([il]); // the best guess stays in the intent
  });

  it("holds a pick with same-named places to 0.9, and any other pick to 0.6", () => {
    const [il, ma, mo] = springfields.map((s) => s.label) as [string, string, string];
    expect(jevDecision(req, answers({ place_1: pick(il, 0.85, { [ma]: 0.1, [mo]: 0.05 }) })).ask).toEqual({
      kind: "place",
      index: 0,
      options: [il, ma, mo],
    });
    expect(jevDecision(req, answers({ place_1: pick(il, 0.95, { [ma]: 0.05 }) })).ask).toBeUndefined();
    const texas: PlaceOption = { label: "Texas", kind: "state", text: "Texas", start: 0 };
    const county: PlaceOption = {
      label: "Texas County, Missouri",
      kind: "county",
      state: "Missouri",
      text: "Texas",
      start: 0,
    };
    const other = { text: "Texas", context, candidates: [texas, county] };
    expect(jevDecision(other, answers({ place_1: pick("Texas", 0.7, { [county.label]: 0.3 }) })).ask).toBeUndefined();
  });

  it("does not ask when only one option is left", () => {
    const [il] = springfields.map((s) => s.label) as [string];
    const alone = { ...req, candidates: [springfields[0]!] };
    expect(jevDecision(alone, answers({ place_1: pick(il, 0.55, { [NONE]: 0.45 }) })).ask).toBeUndefined();
  });

  it("asks about an unsure layer with the likely layers only", () => {
    const d = jevDecision(
      req,
      answers({ layer_1: pick("economic", 0.45, { poverty: 0.4, health: 0.05, [NONE]: 0.1 }) }),
    );
    expect(d.ask).toEqual({ kind: "layer", index: 0, options: ["economic", "poverty"] });
  });

  it("asks to add a layer when 'no measure' is unsure", () => {
    const d = jevDecision(
      req,
      answers({ layer_1: pick(NONE, 0.6, { composite: 0.14, poverty: 0.13, single_parent: 0.12 }) }),
    );
    expect(d.intent.layers).toEqual([]);
    expect(d.ask).toEqual({ kind: "layer", index: 0, options: ["composite", "poverty", "single_parent"] });
    expect(jevDecision(req, answers({ layer_1: pick(NONE, 0.8, { poverty: 0.2 }) })).ask).toBeUndefined();
  });

  it("asks about a place before a layer", () => {
    const [il, ma] = springfields.map((s) => s.label) as [string, string];
    const d = jevDecision(
      req,
      answers({ place_1: pick(il, 0.5, { [ma]: 0.5 }), layer_1: pick("economic", 0.45, { poverty: 0.45 }) }),
    );
    expect(d.ask?.kind).toBe("place");
  });
});
