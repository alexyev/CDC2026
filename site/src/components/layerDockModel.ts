// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Layer dock logic (SPEC.md 3.6, 3.8, 3.14), kept pure so it is unit-tested apart from the component.
// I1 can implement the store's setLayerA / setLayerB / clearLayerB with these functions unchanged.

import catalog from "../../data/catalog.json";
import type { Domain, LayerDef, ViewState } from "@/lib/types";
import { decodeView } from "@/lib/urlCodec";
import type { Preset } from "@/lib/dataTypes";

export type Layers = ViewState["layers"];

export const LAYERS = catalog.layers as LayerDef[];
export const PRIMARY_LAYERS = LAYERS.filter((l) => l.group === "score");
export const CONTEXT_LAYERS = LAYERS.filter((l) => l.group === "context");

export const INDICATOR_DOMAINS: { domain: Domain; label: string; layers: LayerDef[] }[] = (
  [
    ["economic", "Economic"],
    ["education", "Education"],
    ["health", "Health"],
    ["housing", "Housing"],
    ["crime", "Crime"],
  ] as const
).map(([domain, label]) => ({
  domain,
  label,
  layers: LAYERS.filter((l) => l.group === "indicator" && l.domain === domain),
}));

export const COUNTY_BADGE_NOTE =
  "This measure is only available per county. Every school in a county shares the same value.";
export const CONTEXT_NOTE =
  "Race and ethnicity shares are included by ODIS for context only and do not enter any score.";

/**
 * A chip click (SPEC.md 3.6): the first click sets A; a click on another layer sets B (replacing any B);
 * clicking B removes it; clicking A while B exists promotes B to A. Clicking a lone A keeps it,
 * because the map always shows at least one layer once one is chosen.
 */
export function toggleLayer(layers: Layers, id: string): Layers {
  const [a, b] = layers;
  if (a === undefined) return [id];
  if (id === a) return b === undefined ? layers : [b];
  if (id === b) return [a];
  return [a, id];
}

/** Sets the primary layer (keyboard `1`..`7`). Choosing the current B swaps A and B. */
export function setLayerA(layers: Layers, id: string): Layers {
  const [a, b] = layers;
  if (id === a) return layers;
  if (id === b && a !== undefined) return [id, a];
  return b === undefined ? [id] : [id, b];
}

/** Sets the secondary layer (keyboard `Shift+1`..`Shift+7`). Choosing the current A swaps A and B; with no A, it becomes A. */
export function setLayerB(layers: Layers, id: string): Layers {
  const [a, b] = layers;
  if (a === undefined) return [id];
  if (id === b) return layers;
  if (id === a) return b === undefined ? layers : [b, a];
  return [a, id];
}

/** Removes the secondary layer. */
export function clearLayerB(layers: Layers): Layers {
  const [a] = layers;
  return a === undefined ? [] : [a];
}

export type LayerKeyAction = { slot: "A" | "B"; id: string };

/**
 * Maps a keydown to a layer action (SPEC.md 3.14): `1`..`7` set A to the nth primary chip, `Shift` variants set B.
 * Uses `event.code` so `Shift+1` works on every keyboard layout. Returns null for any other key.
 */
export function layerKeyAction(e: Pick<KeyboardEvent, "code" | "shiftKey" | "metaKey" | "ctrlKey" | "altKey">) {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const m = /^(?:Digit|Numpad)([1-7])$/.exec(e.code);
  if (!m) return null;
  const layer = PRIMARY_LAYERS[Number(m[1]) - 1];
  if (!layer) return null;
  return { slot: e.shiftKey ? "B" : "A", id: layer.id } satisfies LayerKeyAction;
}

/** True when keyboard shortcuts must stay out of the way (SPEC.md 3.14: ignored while an input has focus). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (target as HTMLInputElement).type;
  return !["button", "checkbox", "radio", "range", "reset", "submit", "color", "file", "image"].includes(type);
}

/**
 * The full view state a preset produces (SPEC.md 3.8): its URL parameters decoded like a permalink, tagged with
 * the preset id. Favorites and the starred-only toggle are the visitor's own and carry over.
 */
export function presetView(preset: Preset, current: Pick<ViewState, "favorites" | "showOnlyStarred">): ViewState {
  const q = new URLSearchParams(preset.view);
  q.set("p", preset.id);
  q.delete("fav");
  return { ...decodeView(q.toString()), favorites: current.favorites, showOnlyStarred: current.showOnlyStarred };
}

/** A preset chip reads as active while the view still shows the preset's layers. */
export function isPresetActive(preset: Preset, view: Pick<ViewState, "preset" | "layers">): boolean {
  if (view.preset !== preset.id) return false;
  return presetView(preset, { favorites: [], showOnlyStarred: false }).layers.join(",") === view.layers.join(",");
}
