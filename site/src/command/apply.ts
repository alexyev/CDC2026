// Turns an Intent into view state (SPEC.md 14.5). The intent never carries ids or coordinates: places are resolved
// here, against the gazetteer and school names, and the result is a store patch plus a camera move.
//
// Order of application: layers, display, then places. Two places at the same level arm compare mode and pin both;
// a county (or a city, district, or school, via its county) with a state pins the county and shows the state as the
// viewport, so "LA County vs California" becomes pin A = LA County against the California viewport. One place is
// selected and flown to, turning off compare pins left from an earlier request; a school opens its profile.

import type { Map as MapLibreMap } from "maplibre-gl";
import catalogFile from "../../data/catalog.json";
import { DEFAULT_VIEW } from "@/store/useStore";
import { cameraForBBox, unitLevelZoom } from "@/map/camera";
import { COUNTY_DRILL_MIN_ZOOM, INITIAL_BOUNDS, MAP_PADDING, STATE_DRILL_MIN_ZOOM } from "@/map/levels";
import type { BBox, Camera, Intent, LayerDef, PlaceRef, ViewState } from "@/lib/types";
import { parseLocally } from "./localParser";
import { findPlaceCandidates, type PlaceOption } from "./candidates";
import { requestIntent, type Ask, type CommandContext, type Engine } from "./remote";
import type { PlaceCandidate, Resolver } from "./resolver";

const layerLabels = new Map((catalogFile.layers as LayerDef[]).map((l) => [l.id, l.label]));

/** Zoom used to center a school (SPEC.md 3.11). */
export const SCHOOL_ZOOM = 12;
/** Closest a place fit may zoom, so single-school cities do not land at street level. */
export const MAX_FIT_ZOOM = 12;

export type CameraMove =
  | { kind: "fit"; bbox: BBox; minZoom?: number; maxZoom?: number }
  | { kind: "center"; center: [number, number]; zoom: number };

/** Outcome of one command: CommandOutcome (SPEC.md Appendix A) plus what the UI needs to render it. */
export type CommandResult =
  | { status: "applied"; summary: string; note?: string }
  | { status: "degraded"; summary: string; note?: string }
  | { status: "needs-choice"; place: string; placeIndex: number; candidates: PlaceRef[]; labels: string[] }
  | { status: "needs-layer"; layerIndex: number; layers: string[]; labels: string[] }
  | { status: "no-match"; place?: string };

export interface Plan {
  result: CommandResult;
  patch?: Partial<ViewState>;
  move?: CameraMove;
}

/** Places already chosen from needs-choice chips, by index in `intent.places`. */
export type Choices = Record<number, PlaceRef>;

const union = (boxes: BBox[]): BBox =>
  boxes.reduce<BBox>(
    (u, b) => [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])],
    [Infinity, Infinity, -Infinity, -Infinity],
  );

/** Fit that keeps the camera at the level where `kind` units are drawn (SPEC.md 3.3). */
function fitAtUnitLevel(boxes: BBox[], kind: "state" | "county"): CameraMove {
  return { kind: "fit", bbox: union(boxes), ...unitLevelZoom(kind) };
}

function flyToPlace(c: PlaceCandidate): CameraMove | undefined {
  if (c.center && c.kind === "school") return { kind: "center", center: c.center, zoom: SCHOOL_ZOOM };
  if (!c.bbox) return undefined;
  switch (c.kind) {
    case "county":
      return { kind: "fit", bbox: c.bbox, minZoom: COUNTY_DRILL_MIN_ZOOM, maxZoom: MAX_FIT_ZOOM };
    case "city":
    case "district":
      return { kind: "fit", bbox: c.bbox, minZoom: COUNTY_DRILL_MIN_ZOOM, maxZoom: MAX_FIT_ZOOM };
    case "state":
      return { kind: "fit", bbox: c.bbox, minZoom: STATE_DRILL_MIN_ZOOM, maxZoom: MAX_FIT_ZOOM };
    default:
      return { kind: "fit", bbox: c.bbox, maxZoom: MAX_FIT_ZOOM };
  }
}

function summarize(intent: Intent, names: string[], action: Intent["action"]): string {
  const parts: string[] = [];
  if (intent.layers.length) parts.push(intent.layers.map((id) => layerLabels.get(id) ?? id).join(" × "));
  if (names.length) parts.push(names.join(action === "compare" ? " vs " : ", "));
  if (intent.display) parts.push(intent.display === "pct" ? "percentile" : "score");
  if (action === "compare" || action === "profile") parts.push(action);
  return parts.join(" · ");
}

/** Chip label that tells same-named places apart: "Cook County, IL", "Springfield, MO", "Texas". */
function choiceLabel(c: PlaceCandidate, resolver: Resolver): string {
  return (c.kind === "county" || c.kind === "school") && c.st ? `${c.name}, ${c.st}` : resolver.label(c);
}

function displayName(c: PlaceCandidate, resolver: Resolver): string {
  // Cities and districts share names across states ("Springfield"), so they carry the state code.
  return c.kind === "city" || c.kind === "district" ? resolver.label(c) : c.name;
}

/** Pure planning step: what the intent changes, or why it cannot be applied. */
export function planIntent(intent: Intent, resolver: Resolver, choices: Choices = {}): Plan {
  if (intent.action === "clear") {
    // Everything back to the default view except favorites; the camera follows the move.
    const { layers, display, selected, profile, favoritesPanel, showOnlyStarred, about, preset } = DEFAULT_VIEW;
    return {
      result: { status: "applied", summary: "Reset to the national view", note: intent.note },
      patch: {
        layers,
        display,
        selected,
        compare: { armed: false, pins: [] },
        profile,
        favoritesPanel,
        showOnlyStarred,
        about,
        preset,
      },
      move: { kind: "fit", bbox: [...INITIAL_BOUNDS[0], ...INITIAL_BOUNDS[1]] },
    };
  }

  const resolved: PlaceCandidate[] = [];
  for (const [i, place] of intent.places.entries()) {
    const chosen = choices[i] ? resolver.lookup(choices[i]) : undefined;
    if (chosen) {
      resolved.push(chosen);
      continue;
    }
    const decision = resolver.decide(resolver.resolve(place));
    if (decision.kind === "none") return { result: { status: "no-match", place: place.query } };
    if (decision.kind === "choice") {
      const refs = decision.candidates.flatMap((c) => (c.ref ? [c] : []));
      return {
        result: {
          status: "needs-choice",
          place: place.query,
          placeIndex: i,
          candidates: refs.map((c) => c.ref!),
          labels: refs.map((c) => choiceLabel(c, resolver)),
        },
      };
    }
    resolved.push(decision.candidate);
  }

  const layers = [...new Set(intent.layers)].slice(0, 2);
  if (layers.length === 0 && resolved.length === 0 && !intent.display) return { result: { status: "no-match" } };

  const patch: Partial<ViewState> = { preset: undefined };
  if (layers.length) patch.layers = layers as ViewState["layers"];
  if (intent.display) patch.display = intent.display;
  let move: CameraMove | undefined;
  let action = intent.action;

  // A request that goes to one place asks a new question, so compare pins left from an earlier one would describe
  // somewhere else; a request that only changes layers keeps them.
  const OFF: ViewState["compare"] = { armed: false, pins: [] };
  const single = resolved.length === 1 ? resolved[0] : undefined;
  if (single?.kind === "school" && single.ref && action !== "compare") {
    action = "profile";
    patch.compare = OFF;
    patch.profile = single.ref.id;
    patch.selected = single.ref;
    move = flyToPlace(single);
  } else if (resolved.length > 0 && (action === "compare" || resolved.length === 2)) {
    // Compare pins are states or counties; cities, districts, and schools pin their county.
    const states: PlaceCandidate[] = [];
    const counties: { id: string; bbox?: BBox }[] = [];
    const views: PlaceCandidate[] = [];
    for (const c of resolved) {
      if (c.kind === "state") states.push(c);
      else if (c.kind === "region") views.push(c);
      else {
        const id = resolver.countyOf(c);
        const bbox = id ? resolver.lookup({ kind: "county", id })?.bbox : undefined;
        if (id && !counties.some((k) => k.id === id)) counties.push({ id, bbox: bbox ?? c.bbox });
        else if (!id) views.push(c);
      }
    }
    if (counties.length > 0) {
      action = "compare";
      const view = states[0] ?? views[0];
      patch.compare = { armed: true, pins: counties.map((k) => ({ kind: "county", id: k.id })) };
      patch.selected = states[0]?.ref;
      const boxes = view?.bbox ? [view.bbox] : counties.flatMap((k) => (k.bbox ? [k.bbox] : []));
      if (boxes.length) move = fitAtUnitLevel(boxes, "county");
    } else if (states.length > 0) {
      action = "compare";
      patch.compare = { armed: true, pins: states.flatMap((s) => (s.ref ? [s.ref] : [])) };
      patch.selected = undefined;
      move = fitAtUnitLevel(
        states.flatMap((s) => (s.bbox ? [s.bbox] : [])),
        "state",
      );
    } else {
      action = "explore";
      patch.compare = OFF;
      move = views[0] ? flyToPlace(views[0]) : undefined;
    }
  } else if (single) {
    action = "explore";
    patch.compare = OFF;
    patch.selected = single.ref;
    move = flyToPlace(single);
  }

  const summary = summarize(
    { ...intent, layers },
    resolved.map((c) => displayName(c, resolver)),
    action,
  );
  return { result: { status: "applied", summary, note: intent.note }, patch, move };
}

export interface ApplyTarget {
  update(patch: Partial<ViewState>): void;
  move(move: CameraMove): void;
}

export function applyPlan(plan: Plan, target: ApplyTarget): void {
  if (plan.patch) target.update(plan.patch);
  if (plan.move) target.move(plan.move);
}

/** Web Mercator camera for a move on a viewport of `width` x `height` px with the standard padding. */
export function cameraForMove(move: CameraMove, width: number, height: number): Camera {
  if (move.kind === "center") return { lon: move.center[0], lat: move.center[1], zoom: move.zoom };
  const [w, s, e, n] = move.bbox;
  const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const spanX = Math.max(e - w, 1e-6) / 360;
  const spanY = Math.max(mercY(n) - mercY(s), 1e-6) / (2 * Math.PI);
  const availW = Math.max(width - MAP_PADDING.left - MAP_PADDING.right, 1);
  const availH = Math.max(height - MAP_PADDING.top - MAP_PADDING.bottom, 1);
  let zoom = Math.log2(Math.min(availW / (512 * spanX), availH / (512 * spanY)));
  if (move.minZoom !== undefined) zoom = Math.max(zoom, move.minZoom);
  if (move.maxZoom !== undefined) zoom = Math.min(zoom, move.maxZoom);
  const midY = (mercY(n) + mercY(s)) / 2;
  const lat = (Math.atan(Math.sinh(midY)) * 180) / Math.PI;
  return { lon: (w + e) / 2, lat, zoom };
}

export interface ExecuteOptions {
  context: CommandContext;
  /** The selected place, offered to Jev so "here" or "this county" can point at it. */
  selected?: PlaceRef;
  resolver: Promise<Resolver>;
  target: ApplyTarget;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface Execution {
  intent: Intent;
  /** The function was unavailable and the local parser produced the intent. */
  degraded: boolean;
  engine: Engine;
  /** Places already pinned to exact refs: Jev's picks, then any chips the user chose. */
  choices: Choices;
  result: CommandResult;
}

/** Jev picks places by candidate label; each label maps back to the ref the browser found it under. */
export function choicesForPicks(picks: string[], candidates: PlaceOption[]): Choices {
  const choices: Choices = {};
  picks.forEach((label, i) => {
    const ref = candidates.find((c) => c.label === label)?.ref;
    if (ref) choices[i] = ref;
  });
  return choices;
}

/** A low-confidence Jev answer as chips; null when fewer than two options can be offered. */
export function askResult(
  ask: Ask,
  intent: Intent,
  candidates: PlaceOption[],
  resolver: Resolver,
): CommandResult | null {
  if (ask.kind === "layer") {
    const layers = ask.options.filter((id) => layerLabels.has(id));
    if (layers.length < 2) return null;
    return { status: "needs-layer", layerIndex: ask.index, layers, labels: layers.map((id) => layerLabels.get(id)!) };
  }
  // Regions have no ref to pin, so they are never offered as chips.
  const options = ask.options.flatMap((label) => {
    const ref = candidates.find((c) => c.label === label)?.ref;
    const c = ref && resolver.lookup(ref);
    return c ? [{ ref: ref!, label: choiceLabel(c, resolver) }] : [];
  });
  if (options.length < 2) return null;
  const place = intent.places[ask.index];
  return {
    status: "needs-choice",
    place: place?.query ?? "place",
    placeIndex: ask.index,
    candidates: options.map((o) => o.ref),
    labels: options.map((o) => o.label),
  };
}

/** The intent with one layer swapped for the one the user chose from needs-layer chips. */
export function withLayer(intent: Intent, index: number, id: string): Intent {
  const layers = [...intent.layers];
  layers[index] = id;
  return { ...intent, layers: [...new Set(layers)] };
}

/**
 * Finds place candidates in the text, asks the command function for an intent (falling back to the local parser),
 * then plans and applies it; a low-confidence Jev answer comes back as chips and changes nothing yet.
 */
export async function executeCommand(text: string, opts: ExecuteOptions): Promise<Execution> {
  const resolver = await opts.resolver;
  opts.signal?.throwIfAborted();
  const candidates = findPlaceCandidates(text, resolver, opts.selected);
  const remote = await requestIntent(text, opts.context, candidates, {
    signal: opts.signal,
    fetchImpl: opts.fetchImpl,
    timeoutMs: opts.timeoutMs,
  });
  opts.signal?.throwIfAborted();
  if (!remote.ok) {
    const intent = parseLocally(text, resolver);
    return {
      intent,
      degraded: true,
      engine: "local",
      choices: {},
      result: runPlan(intent, resolver, opts.target, true),
    };
  }
  const { intent, engine } = remote;
  const choices = engine === "jev" ? choicesForPicks(remote.picks, candidates) : {};
  const asked = remote.ask && askResult(remote.ask, intent, candidates, resolver);
  const result = asked ?? runPlan(intent, resolver, opts.target, false, choices);
  return { intent, degraded: false, engine, choices, result };
}

/** Plans and applies an intent, e.g. again after the user picks a needs-choice chip. */
export function runPlan(
  intent: Intent,
  resolver: Resolver,
  target: ApplyTarget,
  degraded: boolean,
  choices: Choices = {},
): CommandResult {
  const plan = planIntent(intent, resolver, choices);
  applyPlan(plan, target);
  return degraded && plan.result.status === "applied" ? { ...plan.result, status: "degraded" } : plan.result;
}

/** Runs a camera move on the MapLibre map: flyTo 1,200 ms with curve 1.42 (SPEC.md 9.6), jumpTo under reduced motion. */
export function moveMap(map: MapLibreMap, move: CameraMove, reducedMotion: boolean): void {
  let center: [number, number];
  let zoom: number;
  if (move.kind === "center") {
    [center, zoom] = [move.center, move.zoom];
  } else {
    // cameraForBBox always hands MapLibre a numeric maxZoom: an explicit undefined made cameraForBounds throw
    // "Invalid LngLat (NaN, NaN)", so "reset" never flew back to the nation.
    const cam = cameraForBBox(map, move.bbox, { minZoom: move.minZoom, maxZoom: move.maxZoom });
    const fallback = cameraForMove(move, map.getContainer().clientWidth, map.getContainer().clientHeight);
    center = cam ? [cam.lon, cam.lat] : [fallback.lon, fallback.lat];
    zoom = cam?.zoom ?? fallback.zoom;
    if (move.minZoom !== undefined) zoom = Math.max(zoom, move.minZoom);
    if (move.maxZoom !== undefined) zoom = Math.min(zoom, move.maxZoom);
  }
  if (reducedMotion) map.jumpTo({ center, zoom });
  else map.flyTo({ center, zoom, duration: 1200, curve: 1.42, essential: true });
}
