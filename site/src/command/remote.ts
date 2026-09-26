// Client for the command function `POST /api/command` (SPEC.md 14.3). Any failure (non-200, a body that is not a
// valid intent, the 8 s cap, offline) comes back as { ok: false } so the caller can run the local parser instead.

import catalogFile from "../../data/catalog.json";
import type { Intent, Level } from "@/lib/types";

export const COMMAND_ENDPOINT = "/api/command";
export const COMMAND_TIMEOUT_MS = 8_000;

export interface CommandContext {
  level: Level;
  layers: string[];
  /** Human-readable name of the selected place. */
  selected?: string;
}

export type RemoteResult = { ok: true; intent: Intent } | { ok: false; reason: string };

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

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function requestIntent(
  text: string,
  context: CommandContext,
  opts: RequestOptions = {},
): Promise<RemoteResult> {
  const { signal, timeoutMs = COMMAND_TIMEOUT_MS, fetchImpl = fetch } = opts;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const res = await fetchImpl(COMMAND_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, context }),
      signal: combined,
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const body: unknown = await res.json();
    const intent = isRecord(body) && body.ok === true ? parseIntent(body.intent) : null;
    return intent ? { ok: true, intent } : { ok: false, reason: "bad_response" };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { ok: false, reason: timeout.aborted ? "timeout" : "unreachable" };
  }
}
