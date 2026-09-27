// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Favorites (SPEC.md 3.12): starred schools persisted in localStorage and merged with `fav` from the URL.
//
// useStore.ts is frozen after T0, so this module supplies the favorites slice (toggleFavorite, setFavoritesPanel,
// setShowOnlyStarred) and installs it into the store at import time. I1 can fold `favoritesActions` into the store.
// Favorites are the user's data rather than view state: `setView` merges incoming ids instead of replacing them, so
// decoding a URL (on load or on popstate) or applying a preset never drops a star.

import catalog from "../../data/catalog.json";
import type { LayerDef } from "@/lib/types";
import { useStore, type Store } from "@/store/useStore";
import type { SchoolsFile } from "./dataTypes";

export const FAVORITES_KEY = "schoolscape.favorites.v1";

/** The compare table shows at most this many schools, the first by star order (SPEC.md 3.12). */
export const MAX_COMPARE_SCHOOLS = 6;

/** Zoom the map flies to when a favorite is clicked outside the local level (SPEC.md 3.12). */
export const FAVORITE_FLY_ZOOM = 12;

const NCESSCH = /^\d{12}$/;

export function isNcessch(id: unknown): id is string {
  return typeof id === "string" && NCESSCH.test(id);
}

/** Keeps valid NCESSCH ids, first occurrence wins. */
export function cleanIds(ids: readonly unknown[]): string[] {
  return [...new Set(ids.filter(isNcessch))];
}

/** Local favorites first, in star order, then ids from the URL that are not starred yet. */
export function mergeFavorites(local: readonly string[], incoming: readonly string[]): string[] {
  return cleanIds([...local, ...incoming]);
}

/** Adds `id` at the end, or removes it when already starred. */
export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** localStorage, or null where it is unavailable or throws (private mode, blocked site data). */
export function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function parseStored(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? cleanIds(parsed) : [];
  } catch {
    return [];
  }
}

export function readFavorites(storage: Storage | null = browserStorage()): string[] {
  try {
    return parseStored(storage?.getItem(FAVORITES_KEY) ?? null);
  } catch {
    return [];
  }
}

export function writeFavorites(ids: readonly string[], storage: Storage | null = browserStorage()): void {
  try {
    storage?.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    // Quota or blocked storage: favorites still work for this session.
  }
}

type StoreApi = typeof useStore;
type FavoritesActions = Pick<Store, "toggleFavorite" | "setFavoritesPanel" | "setShowOnlyStarred">;

/** The favorites slice of the store (SPEC.md Appendix A action names). */
export function favoritesActions(set: StoreApi["setState"], get: StoreApi["getState"]): FavoritesActions {
  return {
    toggleFavorite: (id) => {
      if (!isNcessch(id)) return;
      set({ favorites: toggleId(get().favorites, id) });
    },
    setFavoritesPanel: (favoritesPanel) => set({ favoritesPanel }),
    setShowOnlyStarred: (showOnlyStarred) => set({ showOnlyStarred }),
  };
}

/**
 * Installs the favorites slice into `store`: loads stored favorites and merges the ids already in the store (decoded
 * from the URL), persists every change, follows edits made in other tabs, and makes `setView` merge favorites.
 * Returns a function that undoes all of it.
 */
export function installFavorites(store: StoreApi = useStore, storage: Storage | null = browserStorage()): () => void {
  const baseSetView = store.getState().setView;
  const merged = mergeFavorites(readFavorites(storage), store.getState().favorites);
  store.setState({
    ...favoritesActions(store.setState, store.getState),
    favorites: merged,
    setView: (view) => baseSetView({ ...view, favorites: mergeFavorites(store.getState().favorites, view.favorites) }),
  });
  writeFavorites(merged, storage);

  const unsubscribe = store.subscribe((s, prev) => {
    if (s.favorites !== prev.favorites) writeFavorites(s.favorites, storage);
  });

  const onStorage = (e: StorageEvent) => {
    if (e.key !== FAVORITES_KEY || e.storageArea !== storage) return;
    const next = parseStored(e.newValue);
    if (!sameIds(next, store.getState().favorites)) store.setState({ favorites: next });
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

  return () => {
    unsubscribe();
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
    store.setState({ setView: baseSetView });
  };
}

const uninstallFavorites = installFavorites();
import.meta.hot?.dispose(uninstallFavorites);

// ---------------------------------------------------------------------------------------------------------------
// School rows and compare table model

export const LAYERS = catalog.layers as LayerDef[];
const LAYER_BY_ID = new Map(LAYERS.map((l) => [l.id, l]));

export function layerDef(id: string): LayerDef {
  const def = LAYER_BY_ID.get(id);
  if (!def) throw new Error(`Unknown layer ${id}`);
  return def;
}

export interface FavoriteSchool {
  id: string;
  /** False when the id is not in the schools data (a stale or hand-edited id); only `id` is meaningful then. */
  found: boolean;
  name: string;
  district: string;
  city: string;
  st: string;
  countyName: string;
  lat: number;
  lon: number;
  flags: number;
  /** Catalog layer id or "<id>_pct" -> value. */
  values: Record<string, number | null>;
}

const indexCache = new WeakMap<SchoolsFile, Map<string, number>>();

function schoolIndex(schools: SchoolsFile): Map<string, number> {
  let index = indexCache.get(schools);
  if (!index) {
    index = new Map(schools.ids.map((id, i) => [id, i]));
    indexCache.set(schools, index);
  }
  return index;
}

export function favoriteSchool(schools: SchoolsFile, id: string): FavoriteSchool {
  const i = schoolIndex(schools).get(id);
  if (i === undefined) {
    return {
      id,
      found: false,
      name: "",
      district: "",
      city: "",
      st: "",
      countyName: "",
      lat: 0,
      lon: 0,
      flags: 0,
      values: {},
    };
  }
  const values: Record<string, number | null> = {};
  for (const [key, column] of Object.entries(schools.values)) values[key] = column[i] ?? null;
  return {
    id,
    found: true,
    name: schools.name[i] ?? id,
    district: schools.district[i] ?? "",
    city: schools.city[i] ?? "",
    st: schools.st[i] ?? "",
    countyName: schools.countyName[i] ?? "",
    lat: schools.lat[i] ?? 0,
    lon: schools.lon[i] ?? 0,
    flags: schools.flags[i] ?? 0,
    values,
  };
}

export function favoriteSchools(schools: SchoolsFile, ids: readonly string[]): FavoriteSchool[] {
  return ids.map((id) => favoriteSchool(schools, id));
}

export interface CompareRow {
  layer: LayerDef;
  /** One value per school, aligned with the table's columns. */
  values: (number | null)[];
  /** National percentile per school, for the score layers that have one. */
  pcts?: (number | null)[];
  /** Column indexes of the highest-stress cells; empty for neutral layers, ties at the top, or fewer than two values. */
  highest: number[];
}

export interface CompareGroup {
  id: string;
  title: string;
  note?: string;
  rows: CompareRow[];
}

const DOMAIN_TITLES: Record<string, string> = {
  economic: "Economic",
  education: "Education",
  health: "Health",
  housing: "Housing",
  crime: "Crime",
};

/** Columns holding the highest stress value in a row; none when the row cannot single out a highest cell. */
export function highestStress(layer: LayerDef, values: readonly (number | null)[]): number[] {
  if (layer.polarity !== "stress") return [];
  const present = values.filter((v): v is number => v !== null);
  if (present.length < 2) return [];
  const max = Math.max(...present);
  if (max === Math.min(...present)) return [];
  return values.flatMap((v, i) => (v === max ? [i] : []));
}

function compareRow(layer: LayerDef, schools: readonly FavoriteSchool[]): CompareRow {
  const values = schools.map((s) => s.values[layer.id] ?? null);
  const pcts = layer.pctColumn ? schools.map((s) => s.values[`${layer.id}_pct`] ?? null) : undefined;
  return { layer, values, pcts, highest: highestStress(layer, values) };
}

/** Rows grouped as scores, indicators by domain, and context (SPEC.md 3.12), in catalog order. */
export function compareGroups(schools: readonly FavoriteSchool[]): CompareGroup[] {
  const rows = (layers: LayerDef[]) => layers.map((l) => compareRow(l, schools));
  const indicators = LAYERS.filter((l) => l.group === "indicator");
  const domains = [...new Set(indicators.map((l) => l.domain))];
  return [
    { id: "score", title: "Scores", rows: rows(LAYERS.filter((l) => l.group === "score")) },
    ...domains.map((d) => ({
      id: `indicator-${d}`,
      title: `${DOMAIN_TITLES[d ?? ""] ?? d} indicators`,
      rows: rows(indicators.filter((l) => l.domain === d)),
    })),
    {
      id: "context",
      title: "Context",
      note: "Not in the index",
      rows: rows(LAYERS.filter((l) => l.group === "context")),
    },
  ];
}

/** Display text for a value of `layer`: gini with two decimals, percents with a sign, other units as integers. */
export function formatValue(layer: LayerDef, v: number | null): string {
  if (v === null) return "No data";
  if (layer.unit === "gini") return v.toFixed(2);
  const text = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return layer.unit === "percent" ? `${text}%` : text;
}

/** 1 -> "1st", 12 -> "12th", 63 -> "63rd". */
export function ordinal(n: number): string {
  const r = Math.round(n);
  const teen = r % 100 >= 11 && r % 100 <= 13;
  const suffix = teen ? "th" : (({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[r % 10] ?? "th");
  return `${r}${suffix}`;
}
