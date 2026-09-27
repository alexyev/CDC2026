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

interface PanelsStore {
  minimized: Minimized;
  setMinimized: (id: PanelId, minimized: boolean) => void;
}

export const usePanels = create<PanelsStore>()((set, get) => ({
  minimized: typeof window === "undefined" ? { ...NONE } : readPanels(),
  setMinimized: (id, value) => {
    if (get().minimized[id] === value) return;
    const minimized = { ...get().minimized, [id]: value };
    writePanels(minimized);
    set({ minimized });
  },
}));

export function useMinimized(id: PanelId): boolean {
  return usePanels((s) => s.minimized[id]);
}

/**
 * Restores a panel and commits the render synchronously, so a keyboard shortcut can focus an input inside it
 * right after the call (a `display: none` input cannot take focus).
 */
export function restorePanel(id: PanelId): void {
  if (!usePanels.getState().minimized[id]) return;
  flushSync(() => usePanels.getState().setMinimized(id, false));
}
