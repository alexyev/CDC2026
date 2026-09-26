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

// What the browser sends to /api/command.
export const CommandRequestSchema = z.object({
  text: z.string().min(1).max(300),
  context: z.object({
    level: z.enum(["nation", "state", "local"]),
    layers: z.array(z.string().max(40)).max(2),
    selected: z.string().max(120).optional(), // human-readable name of the selected place
  }),
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

// What /api/command answers; any non-200 sends the client to its local parser.
export type CommandResponse = { ok: true; intent: Intent; model: string } | { ok: false; error: CommandError };
