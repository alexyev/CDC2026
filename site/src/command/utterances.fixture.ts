// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// The 12-utterance command fixture (SPEC.md 14.7), resolved against the bundled test fixtures
// (src/test/fixtures/gazetteer.json and schools/all.json). `intent` is what the command function returns for the
// text; `expect` is the view state and chip after the client applies it.

import type { Display, Intent } from "@/lib/types";

export interface UtteranceCase {
  text: string;
  intent: Intent;
  expect: {
    status: "applied" | "needs-choice";
    summary?: string;
    layers?: string[];
    display?: Display;
    /** "kind:id", or null when the command leaves nothing selected. */
    selected?: string | null;
    compare?: string[];
    profile?: string;
    choices?: string[];
  };
}

export const UTTERANCES: UtteranceCase[] = [
  {
    text: "compare crime and education in LA County and California",
    intent: {
      action: "compare",
      layers: ["crime", "education"],
      places: [
        { query: "LA County", kind: "county" },
        { query: "California", kind: "state" },
      ],
    },
    expect: {
      status: "applied",
      summary: "Crime × Education · Los Angeles County vs California · compare",
      layers: ["crime", "education"],
      selected: "state:06",
      compare: ["county:06037"],
    },
  },
  {
    text: "show me poverty in Texas",
    intent: { action: "explore", layers: ["poverty"], places: [{ query: "Texas", kind: "state" }] },
    expect: { status: "applied", summary: "Poverty · Texas", layers: ["poverty"], selected: "state:48" },
  },
  {
    text: "where is housing stress worst in the Bay Area",
    intent: {
      action: "explore",
      layers: ["housing"],
      places: [{ query: "Bay Area", kind: "unknown", stateHint: "California" }],
    },
    expect: { status: "applied", summary: "Housing · Bay Area", layers: ["housing"], selected: null },
  },
  {
    text: "Albertville High School",
    intent: { action: "profile", layers: [], places: [{ query: "Albertville High School", kind: "school" }] },
    expect: {
      status: "applied",
      summary: "Albertville High School · profile",
      profile: "010000500871",
      selected: "school:010000500871",
    },
  },
  {
    text: "percentile view of composite in Cook County Illinois",
    intent: {
      action: "explore",
      layers: ["composite"],
      places: [{ query: "Cook County", kind: "county", stateHint: "Illinois" }],
      display: "pct",
    },
    expect: {
      status: "applied",
      summary: "Composite Score · Cook County · percentile",
      layers: ["composite"],
      display: "pct",
      selected: "county:17031",
    },
  },
  {
    text: "reset",
    intent: { action: "clear", layers: [], places: [] },
    expect: { status: "applied", summary: "Reset to the national view", layers: ["composite"], selected: null },
  },
  {
    text: "Springfield",
    intent: { action: "explore", layers: [], places: [{ query: "Springfield", kind: "unknown" }] },
    expect: { status: "needs-choice", choices: ["Springfield, IL", "Springfield, MO", "Springfield, MA"] },
  },
  {
    text: "Harris County vs Wake County on economic",
    intent: {
      action: "compare",
      layers: ["economic"],
      places: [
        { query: "Harris County", kind: "county" },
        { query: "Wake County", kind: "county" },
      ],
    },
    expect: {
      status: "applied",
      summary: "Economic · Harris County vs Wake County · compare",
      layers: ["economic"],
      compare: ["county:48201", "county:37183"],
    },
  },
  {
    text: "unemployment and single parent households in North Carolina",
    intent: {
      action: "explore",
      layers: ["unemployment", "single_parent"],
      places: [{ query: "North Carolina", kind: "state" }],
    },
    expect: {
      status: "applied",
      summary: "Unemployment × Single-parent households · North Carolina",
      layers: ["unemployment", "single_parent"],
      selected: "state:37",
    },
  },
  {
    text: "health in Mecklenburg County percentile",
    intent: {
      action: "explore",
      layers: ["health"],
      places: [{ query: "Mecklenburg County", kind: "county" }],
      display: "pct",
    },
    expect: {
      status: "applied",
      summary: "Health · Mecklenburg County · percentile",
      layers: ["health"],
      display: "pct",
      selected: "county:37119",
    },
  },
  {
    text: "Texas versus California education",
    intent: {
      action: "compare",
      layers: ["education"],
      places: [
        { query: "Texas", kind: "state" },
        { query: "California", kind: "state" },
      ],
    },
    expect: {
      status: "applied",
      summary: "Education · Texas vs California · compare",
      layers: ["education"],
      compare: ["state:48", "state:06"],
    },
  },
  {
    text: "broadband access in Hawaii County",
    intent: { action: "explore", layers: ["broadband"], places: [{ query: "Hawaii County", kind: "county" }] },
    expect: {
      status: "applied",
      summary: "Access to broadband internet · Hawaii County",
      layers: ["broadband"],
      selected: "county:15001",
    },
  },
];
