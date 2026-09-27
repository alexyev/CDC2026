// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Minimized panels (SPEC.md 3.2): which floating panels the visitor has folded into a restore chip.
// This is per-viewer layout, not view state: it lives in localStorage and never enters the shareable URL.

import { flushSync } from "react-dom";
import { create } from "zustand";

export const PANEL_IDS = ["layers", "command", "insight", "search", "legend"] as const;
export type PanelId = (typeof PANEL_IDS)[number];
export type Minimized = Record<PanelId, boolean>;

export const PANELS_KEY = "schoolscape.panels.v1";

const NONE: Minimized = { layers: false, command: false, insight: false, search: false, legend: false };

/** Reads the stored layout: a JSON list of minimized panel ids. Unknown ids and malformed values are ignored. */
export function parsePanels(raw: string | null): Minimized {
  const out = { ...NONE };
  if (!raw) return out;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed))
      for (const id of parsed) if ((PANEL_IDS as readonly unknown[]).includes(id)) out[id as PanelId] = true;
  } catch {
    // A corrupt value falls back to every panel open.
  }
  return out;
}

export function serializePanels(minimized: Minimized): string {
  return JSON.stringify(PANEL_IDS.filter((id) => minimized[id]));
}

function readPanels(): Minimized {
  try {
    return parsePanels(window.localStorage.getItem(PANELS_KEY));
  } catch {
    return { ...NONE };
  }
}

function writePanels(minimized: Minimized): void {
  try {
    window.localStorage.setItem(PANELS_KEY, serializePanels(minimized));
  } catch {
    // Private mode or blocked storage: the layout still holds for this session.
  }
}

/** A session-only layout laid over the stored one, e.g. the guided tour's; the ids it leaves out follow the stored layout. */
export type PanelOverride = Partial<Minimized>;

interface PanelsStore {
  /** The viewer's own layout, mirrored to localStorage. */
  minimized: Minimized;
  /** Set only while the guided tour runs (SPEC.md 3.15); never stored, so it cannot overwrite the viewer's layout. */
  override: PanelOverride | null;
  /** The viewer folds or restores a panel: stored, and it takes the panel back from any override. */
  setMinimized: (id: PanelId, minimized: boolean) => void;
  setOverride: (override: PanelOverride | null) => void;
}

/** Whether a panel shows as its chip right now: the override where it has a say, the stored layout otherwise. */
export function isMinimized(state: Pick<PanelsStore, "minimized" | "override">, id: PanelId): boolean {
  return state.override?.[id] ?? state.minimized[id];
}

export const usePanels = create<PanelsStore>()((set, get) => ({
  minimized: typeof window === "undefined" ? { ...NONE } : readPanels(),
  override: null,
  setMinimized: (id, value) => {
    const state = get();
    let override = state.override;
    if (override && id in override) {
      override = { ...override };
      delete override[id];
    }
    if (state.minimized[id] === value && override === state.override) return;
    const minimized = { ...state.minimized, [id]: value };
    if (state.minimized[id] !== value) writePanels(minimized);
    set({ minimized, override });
  },
  setOverride: (override) => set({ override }),
}));

export function useMinimized(id: PanelId): boolean {
  return usePanels((s) => isMinimized(s, id));
}

/**
 * Restores a panel and commits the render synchronously, so a keyboard shortcut can focus an input inside it
 * right after the call (a `display: none` input cannot take focus).
 */
export function restorePanel(id: PanelId): void {
  if (!isMinimized(usePanels.getState(), id)) return;
  flushSync(() => usePanels.getState().setMinimized(id, false));
}
