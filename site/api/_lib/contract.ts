// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import fixture from "./utterances.json" with { type: "json" };
import type { Intent } from "./schema.js";

// The 12-utterance contract fixture (SPEC.md section 14.7), shared by the function's real-API
// smoke run and the client's local-parser parity test.

export interface UtteranceCase {
  text: string;
  expected: Intent;
}

export const UTTERANCES = fixture.cases as UtteranceCase[];

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// A place matches when the kind agrees, one normalized query contains the other (so "Wayne County"
// matches "Wayne County, Michigan"), and an expected stateHint is present and equal.
function placeMatches(actual: Intent["places"][number], expected: Intent["places"][number]): boolean {
  const a = norm(actual.query);
  const e = norm(expected.query);
  if (actual.kind !== expected.kind || !(a.includes(e) || e.includes(a))) return false;
  return expected.stateHint === undefined || norm(actual.stateHint ?? "") === norm(expected.stateHint);
}

// Returns the list of mismatches; empty means the intent matches. `note` is never compared.
export function compareIntent(actual: Intent, expected: Intent): string[] {
  const problems: string[] = [];
  if (actual.action !== expected.action) problems.push(`action ${actual.action} != ${expected.action}`);
  if (actual.layers.join(",") !== expected.layers.join(",")) {
    problems.push(`layers [${actual.layers.join(", ")}] != [${expected.layers.join(", ")}]`);
  }
  if ((actual.display ?? null) !== (expected.display ?? null)) {
    problems.push(`display ${actual.display ?? "-"} != ${expected.display ?? "-"}`);
  }
  if (actual.places.length !== expected.places.length) {
    problems.push(`${actual.places.length} places != ${expected.places.length}`);
  } else {
    expected.places.forEach((place, i) => {
      if (!placeMatches(actual.places[i], place)) {
        problems.push(`place ${i + 1} ${JSON.stringify(actual.places[i])} != ${JSON.stringify(place)}`);
      }
    });
  }
  return problems;
}
