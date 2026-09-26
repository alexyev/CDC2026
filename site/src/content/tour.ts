import type { PanelId } from "@/lib/panels";
import type { BBox, Camera, ViewState } from "@/lib/types";
import { decodeView } from "@/lib/urlCodec";
import { INITIAL_BOUNDS } from "@/map/levels";

// Steps of the guided tour (SPEC.md 3.15, components/GuidedTour.tsx): a short walk through one real two-layer view on the live map, Composite Score by
// Gini index at the national view. Each step sets its layers, frames the nation as the map first opens, rings the
// panel it talks about, and says what to notice. State names and numbers come from the shipped data: states.json
// means, breaks.json nation breaks, and national.json correlations (Composite by Gini, Spearman: 0.50 across states,
// 0.36 across counties, 0.33 across schools, the insight panel's "Nationwide" line).

export type TourPanel = Extract<PanelId, "legend" | "insight" | "layers">;

/** Each ringed panel's data-testid. */
export const PANEL_SLOTS: Record<TourPanel, string> = {
  legend: "slot-legend",
  insight: "slot-insight-panel",
  layers: "slot-layer-dock",
};

export interface TourStep {
  title: string;
  /** Where to look, shown next to the step counter. */
  where: string;
  /** The panel ringed (and restored if minimized) while the step shows; none for the map itself. */
  target?: TourPanel;
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
    where: "Legend, bottom right",
    target: "legend",
    view: "l=composite",
    body: "Each state is colored by the average Composite Score of its schools. Brighter means more adverse community conditions; the legend shows where each color starts.",
    notice:
      "The brightest states form a band across the South, from New Mexico and Oklahoma to Georgia and South Carolina.",
  },
  {
    title: "Add a second layer",
    where: "Legend, bottom right",
    target: "legend",
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
    where: "Insight panel, top right",
    target: "insight",
    view: "l=composite,gini",
    body: "ρ (Spearman) runs from −1 to +1, and about 0.5 is a moderate link. The top row uses the states on screen, the next the schools inside them; n is how many each used.",
    notice:
      "Nationwide, this pair gives ρ = 0.50 across states, 0.36 across counties, and 0.33 across schools: the level you measure at changes the answer.",
  },
  {
    title: "Your turn",
    where: "Layers, left",
    target: "layers",
    view: "l=composite,gini",
    body: "Pick any two layers here, or start from one of the stories below them. Click a state to dive in: counties appear from zoom 5, schools from zoom 8.",
    notice:
      "A correlation is not a cause. Inequality and stress rising together does not show that one drives the other.",
  },
];

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
