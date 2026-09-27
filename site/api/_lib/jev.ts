// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import type { ChoiceQuestion, NoulQuestion } from "@typesafe-ai/sdk";
import catalog from "../../data/catalog.json" with { type: "json" };
import type { Ask, CommandRequest, Intent, PlaceOption } from "./schema.js";

// Jev (TypeSafe's System One model) as the command engine (SPEC.md section 14.3).
// Jev returns typed decisions with calibrated probabilities instead of text, so the request is one set of closed
// questions answered in parallel: the action, two layers from the catalog, two places from the candidates the
// browser found in the text, and whether the user asked for percentiles. Code owns everything Jev should not judge:
// ordering places by where they appear, dropping a state that only says where a county is, and gating on confidence.

export const NONE = "none";

/** Below this top probability a place or layer answer becomes "did you mean" chips. Tuned on the utterance sets. */
export const PLACE_CONFIDENT = 0.6;
/**
 * A pick with same-named places in other states must be surer: Jev knows the famous one (Cook County, Illinois at
 * 0.99; Orange County, California at 0.97) but leans on a coin flip for "Jefferson County" (0.85) or "Springfield".
 */
export const NAMESAKE_CONFIDENT = 0.9;
export const LAYER_CONFIDENT = 0.5;
/** "No measure" must be surer than a measure: a request like "family struggles in Ohio" hints at several. */
export const NO_LAYER_CONFIDENT = 0.7;
/** Options under this probability are not worth a chip. */
const CHIP_FLOOR = 0.1;
const MAX_CHIPS = 3;
/** Noul probability above which the request asks for the percentile view. */
const PCT_YES = 0.5;

type Layer = (typeof catalog.layers)[number];

function layerCriterion(l: Layer): string {
  const called = `Also called: ${l.aliases.join(", ")}.`;
  if (l.id === "composite") {
    return `Overall community stress, the composite of every domain. Choose it when the request asks about stress, the overall index, or the composite in general. ${called}`;
  }
  if (l.group === "score" && l.id !== "gini") {
    return `The ${l.label.toLowerCase()} domain score as a whole. Choose it only when the request names this domain in general, not one specific measure inside it. ${called}`;
  }
  if (l.group === "context") return `Share of residents who are ${l.label}. ${called}`;
  const domain = "domain" in l && l.domain ? ` It is one measure inside the ${l.domain} domain.` : "";
  return `${l.label}.${domain} ${called}`;
}

const LAYER_CRITERIA: Record<string, string> = {
  ...Object.fromEntries(catalog.layers.map((l) => [l.id, layerCriterion(l)])),
  [NONE]: "The request names no measure, only places, a school, or a reset.",
};

function placeCriterion(c: PlaceOption): Record<string, string> {
  const kind = c.kind === "district" ? "school district" : c.kind;
  const out: Record<string, string> = { kind, ...(c.state ? { state: c.state } : {}) };
  if (c.text) out["named in the request as"] = c.text;
  if (c.selected) {
    out.note =
      "This is the place selected on the map now. Choose it when the request points at it with words like here, this county, this state, or it.";
  }
  return out;
}

export function jevQuestions(req: CommandRequest): {
  state: { request: string };
  questions: Record<string, ChoiceQuestion | NoulQuestion>;
} {
  const candidates = req.candidates ?? [];
  const questions: Record<string, ChoiceQuestion | NoulQuestion> = {
    action: {
      type: "choice",
      instructions: "What does `request` ask the map to do?",
      criteria: {
        explore:
          "Show one or two measures, a place, or both. Two measures in one place, such as 'violent crime versus incarceration in Florida', is explore.",
        compare:
          "Compare two different places with each other, such as 'Texas vs Oklahoma' or 'compare Harris County and Dallas County'.",
        profile: "Open one specific school by its name.",
        clear: "Reset or clear the map, or start over.",
      },
    },
    layer_1: {
      type: "choice",
      instructions:
        "Which measure does `request` ask to see? If it names two different measures, choose the one named first.",
      criteria: LAYER_CRITERIA,
    },
    layer_2: {
      type: "choice",
      instructions:
        "Does `request` name a second, different measure after the first one? Choose that second measure, or none when the request names one measure or none.",
      criteria: LAYER_CRITERIA,
    },
    percentile: {
      type: "noul",
      instructions: "Does `request` ask to see the map as national percentiles or ranks?",
      criteria: {
        true: "The request uses a word like percentile, rank, ranking, or ranked.",
        false: "The request only asks about a measure or compares places, without asking for percentiles or ranks.",
      },
    },
  };
  if (candidates.length) {
    const selected = candidates.some((c) => c.selected);
    const places = {
      ...Object.fromEntries(candidates.map((c) => [c.label, placeCriterion(c)])),
      [NONE]: selected
        ? "The request neither names a place nor points at the selected place with words like here or this county."
        : "The request names no place.",
    };
    questions.place_1 = {
      type: "choice",
      instructions: selected
        ? "Which place does `request` name or point at? If it has two different places, choose the first one."
        : "Which place does `request` name? If it names two different places, choose the one named first.",
      criteria: places,
    };
    questions.place_2 = {
      type: "choice",
      instructions:
        "Does `request` name a second, different place to compare with the first one? A state written right after a county, city, or school only to say where it is (as in 'Cook County, Illinois') is not a second place. Choose the second place, or none.",
      criteria: places,
    };
  }
  return { state: { request: req.text }, questions };
}

/** The part of a Jev choice answer this module reads. */
export interface ChoiceAnswer {
  choice: string;
  probabilities: Record<string, number>;
}

export interface JevAnswers {
  action?: ChoiceAnswer;
  layer_1?: ChoiceAnswer;
  layer_2?: ChoiceAnswer;
  place_1?: ChoiceAnswer;
  place_2?: ChoiceAnswer;
  percentile?: { noul: number };
}

export interface JevDecision {
  intent: Intent;
  picks: string[];
  ask?: Ask;
}

const ACTIONS = new Set<Intent["action"]>(["explore", "compare", "profile", "clear"]);
const LAYER_IDS = new Set(catalog.layers.map((l) => l.id));

/**
 * Options worth offering as chips, best first; fewer than two means there is nothing to ask. `alike` keeps an
 * unlikely option that is still a real reading of the words, such as every place the text "Springfield" matched.
 */
function chipOptions(
  answer: ChoiceAnswer,
  valid: (option: string) => boolean,
  alike?: (option: string) => boolean,
): string[] {
  return Object.entries(answer.probabilities)
    .filter(([option, p]) => option !== NONE && valid(option) && (p >= CHIP_FLOOR || alike?.(option)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CHIPS)
    .map(([option]) => option);
}

const topProbability = (a: ChoiceAnswer) => a.probabilities[a.choice] ?? 0;

/** The request's words between two places are only a comma or spaces ("Wayne County, Michigan"). */
function adjacent(text: string, first: PlaceOption, second: PlaceOption): boolean {
  if (first.start < 0 || second.start < 0) return false;
  return /^[\s,]*$/.test(text.slice(first.start + first.text.length, second.start));
}

/**
 * Jev's typed answers to an Intent, the candidate label behind each place, and at most one question to ask.
 * Throws when an answer is missing or names an option that was never offered, so the caller falls back.
 */
export function jevDecision(req: CommandRequest, answers: JevAnswers): JevDecision {
  const candidates = new Map((req.candidates ?? []).map((c) => [c.label, c]));
  const { action, layer_1, layer_2, percentile } = answers;
  if (!action || !ACTIONS.has(action.choice as Intent["action"]) || !layer_1 || !layer_2 || !percentile) {
    throw new Error("incomplete Jev answer");
  }
  if (action.choice === "clear") return { intent: { action: "clear", layers: [], places: [] }, picks: [] };

  // Layers: the first answer, then a different second one.
  const layerAnswers = [layer_1, layer_2].filter((a) => a.choice !== NONE);
  if (layerAnswers.some((a) => !LAYER_IDS.has(a.choice))) throw new Error("unknown layer id");
  const layerPicks = layerAnswers.filter((a, i) => i === 0 || a.choice !== layerAnswers[0]!.choice);

  // Places: distinct candidates, in the order the text names them.
  const placeAnswers = [answers.place_1, answers.place_2].filter(
    (a): a is ChoiceAnswer => a !== undefined && a.choice !== NONE,
  );
  if (placeAnswers.some((a) => !candidates.has(a.choice))) throw new Error("unknown place label");
  let placePicks = placeAnswers.filter((a, i) => i === 0 || a.choice !== placeAnswers[0]!.choice);
  if (placePicks.length === 2) {
    const [a, b] = placePicks.map((p) => candidates.get(p.choice)!) as [PlaceOption, PlaceOption];
    const overlap =
      a.start >= 0 && b.start >= 0 && a.start < b.start + b.text.length && b.start < a.start + a.text.length;
    // "Cook County, Illinois": the state only says where the county is, so it is not a second place.
    const stateOf = (place: PlaceOption, state: PlaceOption) =>
      state.kind === "state" && place.state === state.label && adjacent(req.text, place, state);
    if (overlap || stateOf(a, b)) placePicks = [placePicks[0]!];
    else if (stateOf(b, a)) placePicks = [placePicks[1]!];
    else if (a.start >= 0 && b.start >= 0 && b.start < a.start) placePicks = [placePicks[1]!, placePicks[0]!];
  }

  const picks = placePicks.map((p) => p.choice);
  const places = picks.map((label) => {
    const c = candidates.get(label)!;
    return {
      query: (c.text || label).slice(0, 80),
      kind: c.kind === "region" ? ("unknown" as const) : c.kind,
      ...(c.state ? { stateHint: c.state } : {}),
    };
  });
  let act = action.choice as Intent["action"];
  // Comparing takes two places; "food stamp usage in Kentucky ranked" is not a comparison.
  if (act === "compare" && places.length < 2) act = "explore";
  if (act === "profile" && places.length === 0) act = "explore";

  const intent: Intent = { action: act, layers: layerPicks.map((a) => a.choice), places };
  if (percentile.noul >= PCT_YES) intent.display = "pct";

  // Confidence gate: the first uncertain place, then the first uncertain layer, becomes a question.
  let ask: Ask | undefined;
  for (const [index, answer] of placePicks.entries()) {
    const picked = candidates.get(answer.choice)!;
    // Same words, same kind, another state: "Springfield" or "Jefferson County" alone does not say which.
    const namesake = (o: string) => {
      const c = candidates.get(o);
      return picked.text !== "" && c !== undefined && c.text === picked.text && c.kind === picked.kind;
    };
    const hasNamesakes = [...candidates.keys()].some((o) => o !== picked.label && namesake(o));
    if (topProbability(answer) >= (hasNamesakes ? NAMESAKE_CONFIDENT : PLACE_CONFIDENT)) continue;
    const options = chipOptions(answer, (o) => candidates.has(o), namesake);
    if (options.length >= 2) {
      ask = { kind: "place", index, options };
      break;
    }
  }
  if (!ask) {
    // An unsure "no measure" on the first layer ("family struggles in Ohio") asks too, adding the chosen layer.
    const layerQuestions = layer_1.choice === NONE ? [layer_1] : layerPicks;
    for (const [index, answer] of layerQuestions.entries()) {
      if (topProbability(answer) >= (answer.choice === NONE ? NO_LAYER_CONFIDENT : LAYER_CONFIDENT)) continue;
      const options = chipOptions(answer, (o) => LAYER_IDS.has(o));
      if (options.length >= 2) {
        ask = { kind: "layer", index, options };
        break;
      }
    }
  }
  return { intent, picks, ...(ask ? { ask } : {}) };
}
