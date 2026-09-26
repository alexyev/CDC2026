import { z } from "zod";
import catalog from "../../data/catalog.json" with { type: "json" };

// Shared by the function and the client (SPEC.md section 14.2).
export const LayerIdSchema = z.enum(catalog.layers.map((l) => l.id) as [string, ...string[]]);

export const PlaceQuerySchema = z.object({
  query: z.string().min(1).max(80), // the place as written, e.g. "LA County"
  kind: z.enum(["state", "county", "city", "district", "school", "unknown"]),
  stateHint: z.string().max(40).optional(), // e.g. "California" when the user said it
});

export const IntentSchema = z.object({
  action: z.enum(["explore", "compare", "profile", "clear"]),
  layers: z.array(LayerIdSchema).max(2), // [] means keep current layers
  places: z.array(PlaceQuerySchema).max(2), // [] means keep current place
  display: z.enum(["score", "pct"]).optional(),
  note: z.string().max(140).optional(), // one short sentence the UI may show, e.g. why a layer was chosen
});
export type Intent = z.infer<typeof IntentSchema>;

// A place the browser found in the text (or the selected place); Jev picks among these by label.
export const PlaceOptionSchema = z.object({
  label: z.string().min(1).max(160), // unique option name, e.g. "Cook County, Illinois"
  kind: z.enum(["state", "county", "city", "district", "school", "region"]),
  state: z.string().max(40).optional(), // full state name for places inside one state
  text: z.string().max(300), // the words that name it, as typed; "" for the selected place when not named
  start: z.number().int().min(-1).max(300), // offset of `text` in the request; -1 when not in the text
  selected: z.boolean().optional(), // the place selected on the map now
});
export type PlaceOption = z.infer<typeof PlaceOptionSchema>;

export const MAX_CANDIDATES = 20;

// What the browser sends to /api/command.
export const CommandRequestSchema = z.object({
  text: z.string().min(1).max(300),
  context: z.object({
    level: z.enum(["nation", "state", "local"]),
    layers: z.array(z.string().max(40)).max(2),
    selected: z.string().max(120).optional(), // human-readable name of the selected place
  }),
  candidates: z
    .array(PlaceOptionSchema)
    .max(MAX_CANDIDATES)
    .refine((list) => new Set(list.map((c) => c.label)).size === list.length, "labels must be unique")
    .optional(),
});
export type CommandRequest = z.infer<typeof CommandRequestSchema>;

export type CommandError =
  | "bad_request"
  | "rate_limited"
  | "not_configured"
  | "no_parse"
  | "upstream_rate_limited"
  | "upstream_unreachable"
  | "upstream_error"
  | "unknown";

// A low-confidence Jev answer: the browser shows these options as chips instead of guessing.
// `index` points into intent.places (place labels from the candidates) or intent.layers (layer ids); a layer index
// equal to intent.layers.length adds a layer the answer was unsure about.
export type Ask = { kind: "place" | "layer"; index: number; options: string[] };

// What /api/command answers; any non-200 sends the client to its local parser.
// Jev answers carry `picks`: the candidate label behind each of intent.places, in order.
export type CommandResponse =
  | { ok: true; engine: "claude"; model: string; intent: Intent }
  | { ok: true; engine: "jev"; model: string; intent: Intent; picks: string[]; ask?: Ask }
  | { ok: false; error: CommandError };
