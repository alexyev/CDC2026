// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import catalog from "../../data/catalog.json" with { type: "json" };
import type { CommandRequest, Intent } from "./schema.js";

// The system prompt is built once from the catalog (SPEC.md section 14.4).

const ROLE =
  "You convert one request about a map of US high-school community stress into a small JSON intent. " +
  "You never invent numbers, ids, or coordinates.";

const INPUT =
  "Each user message is JSON: {text, context}. `text` is what the person typed. " +
  "`context.level` is the map level (nation, state, or local), `context.layers` holds the layer ids on screen now, " +
  "and `context.selected` names the place selected now, if any. " +
  'When the text points at the current place ("here", "this county", "it"), use `context.selected` as the place.';

function layerGroup(layer: (typeof catalog.layers)[number]): string {
  return "domain" in layer && layer.domain ? `${layer.group}:${layer.domain}` : layer.group;
}

const LAYERS = [
  "Layers (id | label | group | aliases). Scores are the ODIS domain scores; indicators sit inside a domain;",
  "context layers are race and ethnicity shares that are not part of the index.",
  ...catalog.layers.map((l) => `${l.id} | ${l.label} | ${layerGroup(l)} | ${l.aliases.join(", ")}`),
].join("\n");

const RULES = [
  "Rules:",
  "- `layers`: at most two catalog ids, primary first, in the order the text mentions them. Leave `layers` empty when no measure is mentioned.",
  "- Prefer the most specific layer the text names: an indicator (poverty, unemployment, violent crime) over its domain score. " +
    "Use a domain score (economic, crime, ...) only when the text names the domain in general, and `composite` for overall or community stress.",
  '- `places`: at most two, each copied exactly as written (keep the user\'s spelling and abbreviations, drop only words like \'in\' or \'the\'); a state named after a county, city, district, or school moves into `stateHint` ("Cook County Illinois" is query "Cook County" with stateHint "Illinois").',
  "- `kind`: `county` when the text says county, parish, or borough or names a well-known county; `state` for US states; " +
    "`school` when it looks like a school name; `city` for a city or town; `district` for a school district; `unknown` for regions such as the Bay Area.",
  "- `stateHint`: the full state name when the text gives or clearly implies a state for a county, city, district, or school; omit it otherwise and never for a state.",
  "- `action`: `compare` when the text compares two places or uses vs, versus, compare, or against between two places; " +
    "`profile` when a single school is named; `clear` for reset, start over, or clear; `explore` otherwise. " +
    "Two layers with one place is `explore`, not `compare`.",
  "- `display`: `pct` when the text says percentile, rank, or ranking; `score` when it asks for raw scores; omit it otherwise.",
  "- `note`: optional, at most one short sentence, only when a layer choice needs explaining (for example an alias mapped to a different measure).",
  "- For `clear`, return empty `layers` and `places`.",
].join("\n");

const DEFAULT_CONTEXT: CommandRequest["context"] = { level: "nation", layers: ["composite"] };

const EXAMPLES: { text: string; intent: Intent }[] = [
  {
    text: "compare crime and education in LA County and California",
    intent: {
      action: "compare",
      layers: ["crime", "education"],
      places: [
        { query: "LA County", kind: "county", stateHint: "California" },
        { query: "California", kind: "state" },
      ],
    },
  },
  {
    text: "show me poverty in Texas",
    intent: { action: "explore", layers: ["poverty"], places: [{ query: "Texas", kind: "state" }] },
  },
  {
    text: "where is housing stress worst in the Bay Area",
    intent: {
      action: "explore",
      layers: ["housing"],
      places: [{ query: "Bay Area", kind: "unknown", stateHint: "California" }],
    },
  },
  {
    text: "Albertville High School",
    intent: { action: "profile", layers: [], places: [{ query: "Albertville High School", kind: "school" }] },
  },
  {
    text: "percentile view of composite in Cook County Illinois",
    intent: {
      action: "explore",
      layers: ["composite"],
      places: [{ query: "Cook County", kind: "county", stateHint: "Illinois" }],
      display: "pct",
    },
  },
  { text: "reset", intent: { action: "clear", layers: [], places: [] } },
];

const FEW_SHOT = [
  "Examples (user message, then the intent):",
  ...EXAMPLES.map(
    ({ text, intent }) => `${JSON.stringify({ text, context: DEFAULT_CONTEXT })}\n${JSON.stringify(intent)}`,
  ),
].join("\n\n");

export const SYSTEM_PROMPT = [ROLE, INPUT, LAYERS, RULES, FEW_SHOT].join("\n\n");

export const FEW_SHOT_EXAMPLES = EXAMPLES;
