// @vitest-environment node
// Live accuracy run for the command engines on both utterance sets (SPEC.md 14.7), against the real data in
// public/data/v1. Spends real tokens, so it runs only on request, with whichever keys are set:
//   COMMAND_LIVE=1 TYPESAFE_API_KEY=... [ANTHROPIC_API_KEY=...] npx vitest run src/command/engines.live.test.ts
// Each utterance goes through the whole path: candidates in the browser, /api/command, then the planner. A case
// passes when the planned view equals the view of the expected intent; the local parser runs on the same set.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import handler from "../../api/command";
import { resetRateLimit } from "../../api/_lib/ratelimit";
import contract from "../../api/_lib/utterances.json";
import type { GazetteerFile, SchoolsFile } from "@/lib/dataTypes";
import type { Intent, PlaceRef } from "@/lib/types";
import { executeCommand, planIntent, type Execution } from "./apply";
import { parseLocally } from "./localParser";
import { createResolver } from "./resolver";
import { recordingTarget } from "./testUtils";
import { UTTERANCES } from "./utterances.fixture";

const enabled =
  process.env.COMMAND_LIVE === "1" && Boolean(process.env.TYPESAFE_API_KEY || process.env.ANTHROPIC_API_KEY);

const readData = <T>(path: string): T =>
  JSON.parse(readFileSync(join(process.cwd(), "public/data/v1", path), "utf8")) as T;

type Place = Intent["places"][number];
const st = (query: string): Place => ({ query, kind: "state" });
const co = (query: string, stateHint: string): Place => ({ query, kind: "county", stateHint });
const city = (query: string, stateHint: string): Place => ({ query, kind: "city", stateHint });
const explore = (layers: string[], places: Place[], display?: "pct"): Intent => ({
  action: "explore",
  layers,
  places,
  ...(display ? { display } : {}),
});
const compare = (layers: string[], places: Place[]): Intent => ({ action: "compare", layers, places });

/** Held out from every prompt and fixture: paraphrases, synonyms, typos, and a pointer at the selected place. */
const HELD_OUT: { text: string; expected: Intent; selected?: PlaceRef }[] = [
  { text: "how safe is Chicago", expected: explore(["crime"], [city("Chicago", "Illinois")]) },
  { text: "jobless rate in Detroit", expected: explore(["unemployment"], [city("Detroit", "Michigan")]) },
  { text: "kids growing up poor in Alabama", expected: explore(["poverty"], [st("Alabama")]) },
  { text: "which parts of Arizona have the worst internet", expected: explore(["broadband"], [st("Arizona")]) },
  {
    text: "uninsured people in Texas vs Florida",
    expected: compare(["healthcare_access"], [st("Texas"), st("Florida")]),
  },
  {
    text: "zoom to Fulton County Georgia and show food stamps",
    expected: explore(["snap"], [co("Fulton County", "Georgia")]),
  },
  { text: "rank everywhere by overall stress", expected: explore(["composite"], [], "pct") },
  { text: "Missisippi poverty", expected: explore(["poverty"], [st("Mississippi")]) },
  {
    text: "compare Orleans Parish with East Baton Rouge Parish",
    expected: compare([], [co("Orleans Parish", "Louisiana"), co("East Baton Rouge Parish", "Louisiana")]),
  },
  { text: "infant deaths in Georgia", expected: explore(["infant_mortality"], [st("Georgia")]) },
  {
    text: "how does rent burden compare between Los Angeles County and Orange County, California",
    expected: compare(["affordability"], [co("Los Angeles County", "California"), co("Orange County", "California")]),
  },
  { text: "clear everything", expected: { action: "clear", layers: [], places: [] } },
  {
    text: "show me prison rates in Louisiana as percentiles",
    expected: explore(["incarceration"], [st("Louisiana")], "pct"),
  },
  {
    text: "education levels in Kings County New York",
    expected: explore(["education"], [co("Kings County", "New York")]),
  },
  { text: "native american share in Apache County", expected: explore(["ctx_aian"], [co("Apache County", "Arizona")]) },
  { text: "Seattle", expected: explore([], [city("Seattle", "Washington")]) },
  {
    text: "bachelor's degrees vs grad degrees in Massachusetts",
    expected: explore(["college_4yr", "grad_degree"], [st("Massachusetts")]),
  },
  {
    text: "is housing more of a problem in Ohio or Indiana",
    expected: compare(["housing"], [st("Ohio"), st("Indiana")]),
  },
  {
    text: "what's healthcare access like here",
    expected: explore(["healthcare_access"], [co("Wake County", "North Carolina")]),
    selected: { kind: "county", id: "37183" },
  },
  {
    text: "Philly vs Pittsburgh on violent crime",
    expected: compare(
      ["violent_crime"],
      [{ query: "Philadelphia", kind: "unknown" }, city("Pittsburgh", "Pennsylvania")],
    ),
  },
];

/** Written after the thresholds and wording were tuned, and scored once without changes. */
const FRESH: { text: string; expected: Intent }[] = [
  { text: "show broadband access in Alaska", expected: explore(["broadband"], [st("Alaska")]) },
  {
    text: "compare Travis County and Bexar County on housing affordability",
    expected: compare(["affordability"], [co("Travis County", "Texas"), co("Bexar County", "Texas")]),
  },
  { text: "food stamp usage in Kentucky ranked", expected: explore(["snap"], [st("Kentucky")], "pct") },
  { text: "Denver", expected: explore([], [{ query: "Denver", kind: "unknown" }]) },
  { text: "start fresh", expected: { action: "clear", layers: [], places: [] } },
  {
    text: "low birth weight vs infant mortality in Alabama",
    expected: explore(["low_birth_weight", "infant_mortality"], [st("Alabama")]),
  },
  {
    text: "how does Nevada compare to Utah on unemployment",
    expected: compare(["unemployment"], [st("Nevada"), st("Utah")]),
  },
  {
    text: "limited english speakers in Imperial County",
    expected: explore(["linguistic_isolation"], [co("Imperial County", "California")]),
  },
  { text: "vacant homes in Wayne County Michigan", expected: explore(["vacancy"], [co("Wayne County", "Michigan")]) },
  {
    text: "show the asian population share in Santa Clara County",
    expected: explore(["ctx_asian"], [co("Santa Clara County", "California")]),
  },
  {
    text: "uninsured rate in Maine versus Vermont",
    expected: compare(["healthcare_access"], [st("Maine"), st("Vermont")]),
  },
  { text: "park access in Miami", expected: explore(["park_access"], [city("Miami", "Florida")]) },
];

const CASES: { set: string; text: string; expected: Intent; selected?: PlaceRef }[] = [
  ...(contract.cases as { text: string; expected: Intent }[]).map((c) => ({ set: "contract", ...c })),
  ...UTTERANCES.map((u) => ({ set: "fixture", text: u.text, expected: u.intent })),
  ...HELD_OUT.map((c) => ({ set: "held-out", ...c })),
  ...FRESH.map((c) => ({ set: "fresh", ...c })),
];

describe.skipIf(!enabled)("live engine accuracy", () => {
  it("reports accuracy for the function's engine and the local parser", { timeout: 300_000 }, async () => {
    const resolver = createResolver(
      readData<GazetteerFile>("gazetteer.json"),
      readData<SchoolsFile>("schools/all.json"),
    );
    const context = { level: "nation" as const, layers: ["composite"] };
    const view = (plan: ReturnType<typeof planIntent>) =>
      JSON.stringify({ status: plan.result.status, patch: plan.patch, move: plan.move });

    const lines: string[] = [];
    const sets = new Map<string, { n: number; remote: number; asked: number; local: number }>();
    const engines = new Map<string, number>();
    const latencies: number[] = [];
    for (const { set, text, expected, selected } of CASES) {
      const want = planIntent(expected, resolver);
      // A typo in an expected intent would make every engine fail the case, so check the key first.
      expect(want.result.status, `expected intent for "${text}"`).toMatch(/applied|needs-choice/);
      const score = sets.get(set) ?? { n: 0, remote: 0, asked: 0, local: 0 };
      sets.set(set, score);
      score.n++;
      resetRateLimit(); // the per-IP bucket (30 a minute) is for visitors, not this run
      const started = performance.now();
      const execution: Execution = await executeCommand(text, {
        context: selected ? { ...context, selected: resolver.label(resolver.lookup(selected)!) } : context,
        selected,
        resolver: Promise.resolve(resolver),
        target: recordingTarget(),
        timeoutMs: 15_000,
        fetchImpl: (async (url: string, init?: RequestInit) =>
          handler.fetch(new Request(`http://localhost${url}`, init))) as typeof fetch,
      });
      latencies.push(performance.now() - started);
      engines.set(execution.engine, (engines.get(execution.engine) ?? 0) + 1);

      const got = planIntent(execution.intent, resolver, execution.choices);
      const r = execution.result;
      let verdict: string;
      if (r.status === "needs-choice" || r.status === "needs-layer") {
        // Chips instead of a guess: right when the expected answer is one of them, or the expected view asks too.
        const asksToo = want.result.status === "needs-choice";
        const right =
          asksToo ||
          (r.status === "needs-layer"
            ? r.layers.includes(expected.layers[r.layerIndex] ?? "")
            : r.candidates.some((ref) => JSON.stringify(want.patch ?? {}).includes(`"id":"${ref.id}"`)));
        verdict = right ? "ASK+" : "ASK-";
        if (right && asksToo) score.remote++;
        else if (right) score.asked++;
      } else {
        verdict = view(got) === view(want) ? "PASS" : "FAIL";
        if (verdict === "PASS") score.remote++;
      }
      const local = view(planIntent(parseLocally(text, resolver), resolver)) === view(want);
      if (local) score.local++;
      lines.push(
        `${verdict} ${execution.engine.padEnd(6)} ${Math.round(latencies.at(-1)!)}ms  local ${local ? "PASS" : "FAIL"}  [${set}] ${text}`,
        `     intent ${JSON.stringify(execution.intent)}`,
        ...(verdict === "PASS" ? [] : [`     result ${JSON.stringify(r)}`, `     wanted ${JSON.stringify(expected)}`]),
      );
    }
    const sorted = [...latencies].sort((a, b) => a - b);
    const total = { n: 0, remote: 0, asked: 0, local: 0 };
    const rows = [...sets, ["all", total] as const].map(([set, k]) => {
      if (set !== "all") for (const key of ["n", "remote", "asked", "local"] as const) total[key] += k[key];
      return `  ${set.padEnd(9)} engine ${k.remote}/${k.n} (+${k.asked} asked with the right chip)   local parser ${k.local}/${k.n}`;
    });
    console.log(
      [
        `engines used: ${[...engines].map(([e, k]) => `${e} ${k}`).join(", ")}`,
        ...rows,
        `latency: median ${Math.round(sorted[Math.floor(sorted.length / 2)]!)}ms, max ${Math.round(sorted.at(-1)!)}ms`,
        ...lines,
      ].join("\n"),
    );
    expect(total.remote + total.asked).toBeGreaterThan(0);
  });
});
