// Encodes and decodes ViewState to and from the URL query string (SPEC.md 3.10).
// Every parameter is optional; an absent parameter means the default, and parameters equal to the default are omitted.
// Invalid values decode to the default rather than throwing, so a hand-edited link still opens.

import catalog from "../../data/catalog.json";
import { DEFAULT_VIEW } from "@/store/useStore";
import type { Camera, PlaceKind, PlaceRef, ViewState } from "./types";

export const MAX_URL_FAVORITES = 20;

const LAYER_IDS = new Set(catalog.layers.map((l) => l.id));
const PLACE_KINDS: ReadonlySet<string> = new Set<PlaceKind>(["state", "county", "city", "district", "school"]);

export interface EncodeOptions {
  /** Append `fav` (the first 20 favorites). Only the share button sets this (SPEC.md 3.12). */
  includeFavorites?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function encodeCamera(c: Camera): string {
  return `${round2(c.zoom)}/${round2(c.lat)}/${round2(c.lon)}`;
}

export function decodeCamera(v: string | null): Camera | undefined {
  if (!v) return undefined;
  const parts = v.split("/").map(Number);
  if (parts.length !== 3 || parts.some((p) => !Number.isFinite(p))) return undefined;
  const [zoom, lat, lon] = parts as [number, number, number];
  if (zoom < 0 || zoom > 24 || Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;
  return { zoom, lat, lon };
}

export function encodePlace(p: PlaceRef): string {
  return `${p.kind}:${p.id}`;
}

export function decodePlace(s: string): PlaceRef | undefined {
  const i = s.indexOf(":");
  if (i <= 0 || i === s.length - 1) return undefined;
  const kind = s.slice(0, i);
  if (!PLACE_KINDS.has(kind)) return undefined;
  return { kind: kind as PlaceKind, id: s.slice(i + 1) };
}

function sameCamera(a: Camera, b: Camera): boolean {
  return encodeCamera(a) === encodeCamera(b);
}

/** ViewState -> query string without the leading "?". */
export function encodeView(view: ViewState, opts: EncodeOptions = {}): string {
  const q = new URLSearchParams();
  if (!sameCamera(view.camera, DEFAULT_VIEW.camera)) q.set("v", encodeCamera(view.camera));
  if (view.layers.join(",") !== DEFAULT_VIEW.layers.join(",")) q.set("l", view.layers.join(","));
  if (view.display !== DEFAULT_VIEW.display) q.set("d", view.display);
  if (view.selected) q.set("sel", encodePlace(view.selected));
  if (view.compare.armed) q.set("cmp", view.compare.pins.map(encodePlace).join(","));
  if (view.profile) q.set("s", view.profile);
  if (opts.includeFavorites && view.favorites.length > 0) {
    q.set("fav", view.favorites.slice(0, MAX_URL_FAVORITES).join(","));
  }
  if (view.favoritesPanel) q.set("fp", "1");
  if (view.preset) q.set("p", view.preset);
  if (view.about) q.set("about", "1");
  // Commas and colons are legal in a query string; keep them readable in shared links.
  return q.toString().replace(/%2C/gi, ",").replace(/%3A/gi, ":").replace(/%2F/gi, "/");
}

function decodeLayers(l: string | null): ViewState["layers"] {
  if (l === null) return DEFAULT_VIEW.layers;
  if (l === "") return [];
  const ids = l.split(",").filter((id) => LAYER_IDS.has(id));
  const [a, b] = ids;
  if (a === undefined) return DEFAULT_VIEW.layers;
  if (b === undefined || b === a) return [a];
  return [a, b];
}

function decodeCompare(cmp: string | null): ViewState["compare"] {
  if (cmp === null) return { armed: false, pins: [] };
  const pins = cmp
    .split(",")
    .filter(Boolean)
    .map(decodePlace)
    .filter((p): p is PlaceRef => p !== undefined)
    .slice(0, 2);
  // Compare pins must be the same kind (SPEC.md 3.9); keep the first pin's kind.
  const kind = pins[0]?.kind;
  return { armed: true, pins: pins.filter((p) => p.kind === kind) };
}

/** Query string (with or without "?") -> ViewState. `showOnlyStarred` is not carried in the URL. */
export function decodeView(search: string): ViewState {
  const q = new URLSearchParams(search);
  const fav = q.get("fav");
  const s = q.get("s");
  const sel = q.get("sel");
  const p = q.get("p");
  return {
    camera: decodeCamera(q.get("v")) ?? DEFAULT_VIEW.camera,
    layers: decodeLayers(q.get("l")),
    display: q.get("d") === "pct" ? "pct" : "score",
    selected: sel ? decodePlace(sel) : undefined,
    compare: decodeCompare(q.get("cmp")),
    profile: s || undefined,
    favorites: fav ? [...new Set(fav.split(",").filter(Boolean))].slice(0, MAX_URL_FAVORITES) : [],
    favoritesPanel: q.get("fp") === "1",
    showOnlyStarred: false,
    about: q.get("about") === "1",
    preset: p || undefined,
  };
}
