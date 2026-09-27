// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { PANEL_IDS, type PanelId, type PanelOverride } from "@/lib/panels";
import type { BBox, Camera, ViewState } from "@/lib/types";
import { decodeView } from "@/lib/urlCodec";
import { INITIAL_BOUNDS } from "@/map/levels";

// Steps of the guided tour (SPEC.md 3.15, components/GuidedTour.tsx): a short walk through one real two-layer view on the live map, Composite Score by
// Gini index at the national view. Each step sets its layers, frames the nation as the map first opens, opens and
// rings the panels it talks about, and says what to notice. State names and numbers come from the shipped data: states.json
// means, breaks.json nation breaks, and national.json correlations (Composite by Gini, Spearman: 0.50 across states,
// 0.36 across counties, 0.33 across schools, the insight panel's "Nationwide" line).

/** Each ringed panel's data-testid. */
export const PANEL_SLOTS: Record<PanelId, string> = {
  layers: "slot-layer-dock",
  command: "slot-command",
  insight: "slot-insight-panel",
  search: "slot-search-bar",
  legend: "slot-legend",
};

export interface TourStep {
  title: string;
  /** Where to look, shown next to the step counter. */
  where: string;
  /**
   * The panels the step explains: ringed while it shows, and the first step to name a panel introduces it, opening it
   * from its chip (the tour starts with every panel folded). The card sits beside the first; none for the map itself.
   */
  panels?: readonly PanelId[];
  /** The layers the step shows, as a URL query string (SPEC.md 3.10); the camera frames the nation. */
  view: string;
  body: string;
  notice: string;
}

/** The initial national view's bounds (SPEC.md 3.3), which the tour returns to. */
export const NATION_BBOX: BBox = [
  INITIAL_BOUNDS[0][0],
  INITIAL_BOUNDS[0][1],
  INITIAL_BOUNDS[1][0],
  INITIAL_BOUNDS[1][1],
];

export const TOUR_STEPS: readonly TourStep[] = [
  {
    title: "Read one layer",
    where: "Layers, left",
    panels: ["layers"],
    view: "l=composite",
    body: "Layers picks what the map shows. Here it is the Composite Score: each state is colored by the average of its schools, and brighter means more adverse community conditions.",
    notice:
      "The brightest states form a band across the South, from New Mexico and Oklahoma to Georgia and South Carolina.",
  },
  {
    title: "Add a second layer",
    where: "Legend, bottom right",
    panels: ["legend"],
    view: "l=composite,gini",
    body: "Gini index, income inequality, is now layer B. The legend splits each layer into thirds, and every state falls in one of the nine cells.",
    notice:
      "Pale states are high on both: most of the South. Dark states are low on both, like Minnesota, Iowa, Utah, and Vermont.",
  },
  {
    title: "Spot the exceptions",
    where: "The map",
    view: "l=composite,gini",
    body: "Colors off that pale-to-dark diagonal break the pattern, and they are often the most interesting places to look.",
    notice:
      "Teal states are unequal but lower in stress: New York, New Jersey, Massachusetts, and Rhode Island. Magenta ones are the reverse: Alaska and Indiana. Hover a state for its values.",
  },
  {
    title: "Read the correlation",
    where: "Insight panel, right",
    panels: ["insight"],
    view: "l=composite,gini",
    body: "ρ (Spearman) runs from −1 to +1, and about 0.5 is a moderate link. The top row uses the states on screen, the next the schools inside them; n is how many each used.",
    notice:
      "Nationwide, this pair gives ρ = 0.50 across states, 0.36 across counties, and 0.33 across schools: the level you measure at changes the answer.",
  },
  {
    title: "Your turn",
    where: "Ask the map and search, top",
    panels: ["command", "search"],
    view: "l=composite,gini",
    body: "Ask the map for any two layers in plain words, pick them in Layers or start from a story there, or search a place by name. Click a state to dive in: counties appear from zoom 5, schools from zoom 8.",
    notice:
      "A correlation is not a cause. Inequality and stress rising together does not show that one drives the other.",
  },
];

/**
 * The panel layout the tour lays over the viewer's own while `index` shows (lib/panels.ts): panels introduced so far
 * open, later ones folded, so Back folds a panel again. A panel the viewer folded or restored themselves during the
 * tour has left the override (`current`) and keeps their choice, unless the showing step explains it.
 */
export function tourOverride(index: number, current: PanelOverride | null): PanelOverride {
  const out: PanelOverride = {};
  for (const id of PANEL_IDS) {
    const introduced = TOUR_STEPS.findIndex((s) => s.panels?.includes(id));
    if (TOUR_STEPS[index]?.panels?.includes(id)) out[id] = false;
    else if (current === null || id in current) out[id] = introduced > index;
  }
  return out;
}

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** The map padding's left edge (SPEC.md 3.2), where the card waits while a step talks about the map itself. */
const MAP_LEFT = 332;
const GAP = 16;

/**
 * Where the tour card goes (its top-left corner): beside the panel the step explains, on the map side (above the
 * legend), or at the bottom of the map area beside the layer dock for the map itself; always inside the viewport.
 */
export function cardPlacement(
  panel: PanelId | undefined,
  anchor: Rect | null,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
): { top: number; left: number } {
  let top = viewport.height - GAP - card.height;
  let left = MAP_LEFT;
  if (panel && anchor) {
    const right = anchor.left + anchor.width;
    const bottom = anchor.top + anchor.height;
    if (panel === "layers") {
      left = right + GAP;
      top = anchor.top;
    } else if (panel === "insight") {
      left = anchor.left - GAP - card.width;
      top = anchor.top;
    } else if (panel === "legend") {
      // Stacked above the legend, over the ocean, so it keeps the southern states its step points at in view.
      left = right - card.width;
      top = anchor.top - GAP - card.height;
    } else {
      // The top bar's panels: centered under the panel.
      left = anchor.left + anchor.width / 2 - card.width / 2;
      top = bottom + GAP;
    }
  }
  return {
    left: Math.max(GAP, Math.min(left, viewport.width - GAP - card.width)),
    top: Math.max(GAP, Math.min(top, viewport.height - GAP - card.height)),
  };
}

/** The view a step shows: its layers and nothing else open, keeping the viewer's camera and favorites. */
export function stepView(step: TourStep, current: ViewState): ViewState {
  return {
    ...decodeView(step.view),
    camera: current.camera,
    favorites: current.favorites,
    showOnlyStarred: current.showOnlyStarred,
  };
}

/** Whether the camera is far enough from `target` to fly back; a small nudge from the viewer is left alone. */
export function cameraOff(target: Camera, current: Camera): boolean {
  return (
    Math.abs(target.zoom - current.zoom) > 0.3 ||
    Math.abs(target.lat - current.lat) > 2 ||
    Math.abs(target.lon - current.lon) > 4
  );
}
