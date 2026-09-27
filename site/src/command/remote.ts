// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Client for the command function `POST /api/command` (SPEC.md 14.3). Any failure (non-200, a body that is not a
// valid intent, the 8 s cap, offline) comes back as { ok: false } so the caller can run the local parser instead.

import catalogFile from "../../data/catalog.json";
import type { Intent, Level } from "@/lib/types";
import type { PlaceOption } from "./candidates";

export const COMMAND_ENDPOINT = "/api/command";
export const COMMAND_TIMEOUT_MS = 8_000;

export interface CommandContext {
  level: Level;
  layers: string[];
  /** Human-readable name of the selected place. */
  selected?: string;
}

/** Which engine produced an intent: Jev or Claude behind the function, or the local parser in the browser. */
export type Engine = "jev" | "claude" | "local";

/**
 * A low-confidence Jev answer to ask about: `index` points into intent.places (candidate labels) or intent.layers
 * (layer ids, where index = layers.length adds a layer).
 */
export interface Ask {
  kind: "place" | "layer";
  index: number;
  options: string[];
}

export type RemoteResult =
  { ok: true; intent: Intent; engine: "jev" | "claude"; picks: string[]; ask?: Ask } | { ok: false; reason: string };

const LAYER_IDS = new Set(catalogFile.layers.map((l) => l.id));
const ACTIONS = new Set(["explore", "compare", "profile", "clear"]);
const KINDS = new Set(["state", "county", "city", "district", "school", "unknown"]);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const optionalString = (v: unknown, max: number) =>
  v === undefined || v === null || (typeof v === "string" && v.length <= max);

/** Validates an intent from the network against the schema of SPEC.md 14.2; null when it does not conform. */
export function parseIntent(value: unknown): Intent | null {
  if (!isRecord(value)) return null;
  const { action, layers, places, display, note } = value;
  if (typeof action !== "string" || !ACTIONS.has(action)) return null;
  if (!Array.isArray(layers) || layers.length > 2) return null;
  if (!layers.every((l) => typeof l === "string" && LAYER_IDS.has(l))) return null;
  if (!Array.isArray(places) || places.length > 2) return null;
  const parsedPlaces: Intent["places"] = [];
  for (const p of places) {
    if (!isRecord(p)) return null;
    if (typeof p.query !== "string" || p.query.length < 1 || p.query.length > 80) return null;
    if (typeof p.kind !== "string" || !KINDS.has(p.kind)) return null;
    if (!optionalString(p.stateHint, 40)) return null;
    parsedPlaces.push({
      query: p.query,
      kind: p.kind as Intent["places"][number]["kind"],
      ...(typeof p.stateHint === "string" && p.stateHint ? { stateHint: p.stateHint } : {}),
    });
  }
  if (display !== undefined && display !== null && display !== "score" && display !== "pct") return null;
  if (!optionalString(note, 140)) return null;
  const intent: Intent = { action: action as Intent["action"], layers: layers as string[], places: parsedPlaces };
  if (display) intent.display = display;
  if (typeof note === "string" && note) intent.note = note;
  return intent;
}

/** Jev's extras: one candidate label per place and an optional question; null when they do not fit the intent. */
function parseJevExtras(body: Record<string, unknown>, intent: Intent): { picks: string[]; ask?: Ask } | null {
  const { picks, ask } = body;
  if (!Array.isArray(picks) || picks.length !== intent.places.length) return null;
  if (!picks.every((p) => typeof p === "string")) return null;
  if (ask === undefined || ask === null) return { picks: picks as string[] };
  if (!isRecord(ask) || (ask.kind !== "place" && ask.kind !== "layer")) return null;
  // A layer question may add a layer (index = layers.length); a place question always replaces a place.
  const size = ask.kind === "place" ? intent.places.length : Math.min(intent.layers.length + 1, 2);
  if (typeof ask.index !== "number" || !Number.isInteger(ask.index) || ask.index < 0 || ask.index >= size) return null;
  const { options } = ask;
  if (!Array.isArray(options) || options.length < 2 || options.length > 3) return null;
  if (!options.every((o) => typeof o === "string" && (ask.kind === "place" || LAYER_IDS.has(o)))) return null;
  return { picks: picks as string[], ask: { kind: ask.kind, index: ask.index, options: options as string[] } };
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function requestIntent(
  text: string,
  context: CommandContext,
  candidates: PlaceOption[],
  opts: RequestOptions = {},
): Promise<RemoteResult> {
  const { signal, timeoutMs = COMMAND_TIMEOUT_MS, fetchImpl = fetch } = opts;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const res = await fetchImpl(COMMAND_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        context,
        // Only what Jev reads; refs and scores stay in the browser.
        candidates: candidates.map(({ label, kind, state, text, start, selected }) => ({
          label,
          kind,
          ...(state ? { state } : {}),
          text,
          start,
          ...(selected ? { selected } : {}),
        })),
      }),
      signal: combined,
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const body: unknown = await res.json();
    const intent = isRecord(body) && body.ok === true ? parseIntent(body.intent) : null;
    if (!intent || !isRecord(body)) return { ok: false, reason: "bad_response" };
    if (body.engine !== "jev") return { ok: true, intent, engine: "claude", picks: [] };
    const extras = parseJevExtras(body, intent);
    return extras ? { ok: true, intent, engine: "jev", ...extras } : { ok: false, reason: "bad_response" };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { ok: false, reason: timeout.aborted ? "timeout" : "unreachable" };
  }
}
