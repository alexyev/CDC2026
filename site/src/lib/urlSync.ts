// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Store <-> URL sync (SPEC.md 3.10), the story preset loader (3.8), and the share link (3.12).
// The store is the source of truth. A camera-only change replaces the current history entry after a 300 ms
// debounce, so panning never adds history; any other change to a URL-carried field (layers, display, selection,
// compare pins, drawers, About, preset) pushes one entry, so Back undoes it. Changes made in the same task are
// coalesced into one entry. Back and Forward restore the entry's view but keep the camera where it is (camera
// moves are not history) and keep favorites (they live in localStorage, not in history).
// Contract: useUrlSync() is mounted once by App. The initial URL is already decoded into the store by main.tsx;
// this module resolves `p` against presets.json and then keeps the URL in step.

import { useEffect } from "react";
import { DEFAULT_CAMERA, selectView, useStore, type StoreState } from "@/store/useStore";
import type { Preset } from "./dataTypes";
import { load } from "./loaders";
import type { ViewState } from "./types";
import { decodeView, encodeCamera, encodeView } from "./urlCodec";

export const CAMERA_DEBOUNCE_MS = 300;

let presetsById: ReadonlyMap<string, Preset> | undefined;
let presetsLoading: Promise<ReadonlyMap<string, Preset>> | undefined;

/** Loads presets.json once and indexes it by id. A failed load can be retried. */
export function loadPresets(): Promise<ReadonlyMap<string, Preset>> {
  presetsLoading ??= load("presets").then(
    (file) => (presetsById = new Map(file.presets.map((p) => [p.id, p]))),
    (err: unknown) => {
      presetsLoading = undefined;
      throw err;
    },
  );
  return presetsLoading;
}

/** The query string that opens `preset`: its view parameters plus `p`. */
export function presetSearch(preset: Preset): string {
  const q = new URLSearchParams(preset.view);
  q.set("p", preset.id);
  return q.toString();
}

/**
 * Decodes a query string, filling the parameters it lacks from the preset named by its `p`.
 * So `?p=broadband-attainment` opens the story, and a permalink made after panning a preset view keeps its layers.
 */
export function resolveView(search: string, presets: ReadonlyMap<string, Preset> | undefined): ViewState {
  const q = new URLSearchParams(search);
  const id = q.get("p");
  const preset = id ? presets?.get(id) : undefined;
  if (!preset) return decodeView(q.toString());
  const merged = new URLSearchParams(preset.view);
  for (const [key, value] of q) merged.set(key, value);
  return decodeView(merged.toString());
}

/** The full view state a preset opens; the viewer's favorites and starred-only toggle are kept. */
export function presetView(preset: Preset, current: ViewState): ViewState {
  return {
    ...resolveView(presetSearch(preset), undefined),
    favorites: current.favorites,
    showOnlyStarred: current.showOnlyStarred,
  };
}

/** Opens a story preset's view in the store. */
export function openPreset(preset: Preset) {
  const { setView, ...state } = useStore.getState();
  setView(presetView(preset, selectView(state)));
}

/** Applies a story preset by id (the store's `applyPreset`). Resolves false for an unknown id. */
export async function applyPreset(id: string): Promise<boolean> {
  const preset = (await loadPresets()).get(id);
  if (!preset) return false;
  openPreset(preset);
  return true;
}

/** The link the share button copies: the current view plus the first 20 favorites as `fav` (SPEC.md 3.12). */
export function shareUrl(
  view: ViewState = selectView(useStore.getState()),
  loc: Pick<Location, "origin" | "pathname"> = window.location,
): string {
  const search = encodeView(view, { includeFavorites: true });
  return `${loc.origin}${loc.pathname}${search ? `?${search}` : ""}`;
}

/** Everything the URL carries except the camera and the informational preset id. */
function stateKey(view: ViewState): string {
  return encodeView({ ...view, camera: DEFAULT_CAMERA, preset: undefined });
}

function viewChanged(a: StoreState, b: StoreState): boolean {
  const va = selectView(a);
  const vb = selectView(b);
  return (Object.keys(va) as (keyof ViewState)[]).some((k) => va[k] !== vb[k]);
}

/**
 * The address bar's query for `view`. Once the landing is closed it is never bare: the default view writes its camera
 * `v`, so a reload of the national view stays on the map, and only a bare URL opens the landing (SPEC.md 3.15).
 */
function addressSearch(view: ViewState): string {
  const search = encodeView(view);
  if (search || useStore.getState().guide === "primer") return search;
  return `v=${encodeCamera(view.camera)}`;
}

interface Written {
  search: string;
  key: string;
  preset: string | undefined;
}

/**
 * Starts keeping `win`'s URL in step with the store and returns the stop function.
 * Exported for tests; the app mounts it through useUrlSync().
 */
export function startUrlSync(win: Window = window): () => void {
  const { history, location } = win;
  let ready = false;
  let stopped = false;
  let flushQueued = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let written: Written = { search: "", key: "", preset: undefined };

  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const write = (mode: "push" | "replace", view: ViewState) => {
    const search = addressSearch(view);
    written = { search, key: stateKey(view), preset: view.preset };
    const url = `${location.pathname}${search ? `?${search}` : ""}${location.hash}`;
    if (mode === "push") history.pushState(null, "", url);
    else history.replaceState(history.state, "", url);
  };

  // `p` names the preset that produced the view. Once anything but the camera changes, or the URL would no
  // longer reproduce the view through the preset, the id is dropped so a permalink never reopens a stale preset.
  const isStalePreset = (view: ViewState): boolean => {
    if (!view.preset) return false;
    if (view.preset === written.preset && stateKey(view) !== written.key) return true;
    if (!presetsById) {
      loadPresets().then(schedule, () => {});
      return false;
    }
    if (!presetsById.has(view.preset)) return true;
    const search = encodeView(view);
    return encodeView(resolveView(search, presetsById)) !== search;
  };

  const currentView = (): ViewState => {
    const view = selectView(useStore.getState());
    if (!isStalePreset(view)) return view;
    useStore.setState({ preset: undefined });
    return { ...view, preset: undefined };
  };

  function flush() {
    flushQueued = false;
    if (!ready || stopped) return;
    const view = currentView();
    const search = addressSearch(view);
    clearTimer();
    if (search === written.search) return;
    if (stateKey(view) !== written.key || view.preset !== written.preset) {
      write("push", view);
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      if (!stopped) write("replace", currentView());
    }, CAMERA_DEBOUNCE_MS);
  }

  function schedule() {
    if (flushQueued) return;
    flushQueued = true;
    queueMicrotask(flush);
  }

  const onPopState = () => {
    if (!ready) return;
    clearTimer();
    const current = selectView(useStore.getState());
    const view: ViewState = {
      ...resolveView(location.search, presetsById),
      camera: current.camera,
      favorites: current.favorites,
      showOnlyStarred: current.showOnlyStarred,
    };
    const search = addressSearch(view);
    written = { search, key: stateKey(view), preset: view.preset };
    useStore.getState().setView(view);
    if (location.search.replace(/^\?/, "") !== search) write("replace", view);
  };

  const unsubscribe = useStore.subscribe((state, prev) => {
    if (viewChanged(state, prev) || state.guide !== prev.guide) schedule();
  });
  win.addEventListener("popstate", onPopState);

  const storeApplyPreset = useStore.getState().applyPreset;
  const ownApplyPreset = (id: string) => {
    applyPreset(id).catch((err: unknown) => console.warn(`Schoolscape: preset "${id}" could not be loaded`, err));
  };
  useStore.setState({ applyPreset: ownApplyPreset });

  // Canonicalize the address bar (drops `fav`, which only the share button writes) and start syncing.
  const begin = () => {
    if (stopped) return;
    ready = true;
    write("replace", currentView());
  };

  const initialPreset = new URLSearchParams(location.search).get("p");
  if (initialPreset) {
    const initialKey = stateKey(selectView(useStore.getState()));
    loadPresets().then(
      (presets) => {
        if (stopped) return;
        const current = selectView(useStore.getState());
        // Fill in the preset unless the viewer already changed the view while presets.json loaded.
        if (presets.has(initialPreset) && stateKey(current) === initialKey) {
          useStore.getState().setView({
            ...resolveView(location.search, presets),
            favorites: current.favorites,
            showOnlyStarred: current.showOnlyStarred,
          });
        }
        begin();
      },
      (err: unknown) => {
        console.warn("Schoolscape: presets could not be loaded", err);
        begin();
      },
    );
  } else {
    begin();
  }

  return () => {
    stopped = true;
    clearTimer();
    unsubscribe();
    win.removeEventListener("popstate", onPopState);
    if (useStore.getState().applyPreset === ownApplyPreset) useStore.setState({ applyPreset: storeApplyPreset });
  };
}

/** Keeps the URL and the store in step for the lifetime of the app. */
export function useUrlSync(): void {
  useEffect(() => startUrlSync(window), []);
}
