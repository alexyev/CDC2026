// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LANDING_EXIT_MS } from "@/lib/guide";
import { isMinimized, PANEL_IDS, PANELS_KEY, usePanels } from "@/lib/panels";
import { DEFAULT_VIEW, useStore } from "@/store/useStore";
import { cameraOff, cardPlacement, stepView, tourOverride, TOUR_STEPS } from "@/content/tour";
import { GuidedTour } from "./GuidedTour";

beforeEach(() => {
  localStorage.clear();
  usePanels.setState({
    minimized: { layers: false, command: false, insight: false, search: false, legend: false },
    override: null,
  });
  useStore.getState().setView({ ...DEFAULT_VIEW, favorites: ["060000000001"] });
  useStore.getState().setGuide("tour");
});
afterEach(cleanup);

const card = () => screen.queryByTestId("guided-tour");
/** The panels showing open right now. */
const shown = () => PANEL_IDS.filter((id) => !isMinimized(usePanels.getState(), id));

describe("GuidedTour (SPEC.md 3.15)", () => {
  it("has three to five steps that end on a live two-layer view", () => {
    expect(TOUR_STEPS.length).toBeGreaterThanOrEqual(3);
    expect(TOUR_STEPS.length).toBeLessThanOrEqual(5);
    expect(stepView(TOUR_STEPS.at(-1)!, DEFAULT_VIEW).layers).toEqual(["composite", "gini"]);
  });

  it("walks the steps, setting each step's view and keeping favorites", () => {
    render(<GuidedTour />);
    expect(screen.getByRole("heading", { name: "Read one layer" })).toBeTruthy();
    expect(useStore.getState().layers).toEqual(["composite"]);

    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByRole("heading", { name: "Add a second layer" })).toBeTruthy();
    expect(useStore.getState().layers).toEqual(["composite", "gini"]);
    expect(useStore.getState().favorites).toEqual(["060000000001"]);

    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(useStore.getState().layers).toEqual(["composite"]);
  });

  it("finishes on the live map with the last step's view", () => {
    render(<GuidedTour />);
    for (let i = 1; i < TOUR_STEPS.length; i++) fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(card()?.dataset.step).toBe(String(TOUR_STEPS.length - 1));
    fireEvent.click(screen.getByRole("button", { name: "Start exploring" }));
    expect(useStore.getState().guide).toBeNull();
    expect(useStore.getState().layers).toEqual(["composite", "gini"]);
  });

  it("starts with every panel folded and opens each as the step that explains it shows", () => {
    render(<GuidedTour />);
    expect(TOUR_STEPS[0]!.panels).toEqual(["layers"]);
    expect(shown()).toEqual(["layers"]);

    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(shown()).toEqual(["layers", "legend"]);
    // Back folds the panel a later step introduced.
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(shown()).toEqual(["layers"]);

    for (let i = 1; i < TOUR_STEPS.length; i++) fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(shown()).toEqual([...PANEL_IDS]);
  });

  it("never writes its layout into the viewer's stored one, which comes back when the tour ends", () => {
    act(() => usePanels.getState().setMinimized("legend", true));
    render(<GuidedTour />);
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    // The legend step opens the legend over the viewer's choice, without storing it.
    expect(isMinimized(usePanels.getState(), "legend")).toBe(false);
    expect(localStorage.getItem(PANELS_KEY)).toBe('["legend"]');

    fireEvent.keyDown(window, { key: "Escape" });
    expect(usePanels.getState().override).toBeNull();
    expect(shown()).toEqual(PANEL_IDS.filter((id) => id !== "legend"));
  });

  it("leaves a panel the viewer opens during the tour open", () => {
    render(<GuidedTour />);
    act(() => usePanels.getState().setMinimized("search", false));
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(isMinimized(usePanels.getState(), "search")).toBe(false);
    expect(isMinimized(usePanels.getState(), "insight")).toBe(true);
  });

  it("ends from the close button and Escape", () => {
    render(<GuidedTour />);
    fireEvent.click(screen.getByRole("button", { name: "End the tour" }));
    expect(useStore.getState().guide).toBeNull();

    act(() => useStore.getState().setGuide("tour"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useStore.getState().guide).toBeNull();
  });

  it("waits for the primer's landing to give way before it enters", () => {
    vi.useFakeTimers();
    try {
      act(() => {
        useStore.getState().setGuide("primer");
        useStore.getState().setGuide("tour");
      });
      render(<GuidedTour />);
      expect(card()).toBeNull();
      // The view is already set, so the map settles on the step's layers as the landing fades.
      expect(useStore.getState().layers).toEqual(["composite"]);
      act(() => vi.advanceTimersByTime(LANDING_EXIT_MS.full));
      expect(card()).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the camera and the other layers' state out of each step's view", () => {
    const camera = { lon: -100, lat: 40, zoom: 3.2 };
    const view = stepView(TOUR_STEPS[1]!, { ...DEFAULT_VIEW, camera, about: true, layers: ["crime"] });
    expect(view).toMatchObject({ camera, about: false, layers: ["composite", "gini"] });
  });

  it("flies back only when the camera is far from the national view", () => {
    const nation = { lon: -96.5, lat: 38.5, zoom: 3.2 };
    expect(cameraOff(nation, nation)).toBe(false);
    expect(cameraOff(nation, { ...nation, lat: 39.5, zoom: 3.4 })).toBe(false);
    expect(cameraOff(nation, { ...nation, zoom: 6 })).toBe(true);
    expect(cameraOff(nation, { ...nation, lon: -118 })).toBe(true);
  });

  it("introduces every panel exactly once, and by the last step all are open", () => {
    const introduced = TOUR_STEPS.flatMap((s) => s.panels ?? []);
    expect([...introduced].sort()).toEqual([...PANEL_IDS].sort());
    expect(Object.values(tourOverride(TOUR_STEPS.length - 1, null)).every((m) => m === false)).toBe(true);
  });

  it("places the card beside the panel a step explains, inside the viewport", () => {
    const card = { width: 420, height: 240 };
    const viewport = { width: 1440, height: 900 };
    const layers = { top: 72, left: 16, width: 300, height: 600 };
    const insight = { top: 72, left: 1044, width: 380, height: 500 };
    const legend = { top: 700, left: 1180, width: 244, height: 184 };
    const command = { top: 16, left: 440, width: 560, height: 56 };
    expect(cardPlacement("layers", layers, card, viewport)).toEqual({ top: 72, left: 332 });
    expect(cardPlacement("insight", insight, card, viewport)).toEqual({ top: 72, left: 608 });
    expect(cardPlacement("legend", legend, card, viewport)).toEqual({ top: 444, left: 1004 });
    expect(cardPlacement("command", command, card, viewport)).toEqual({ top: 88, left: 510 });
    // The map itself: the bottom of the map area beside the layer dock.
    expect(cardPlacement(undefined, null, card, viewport)).toEqual({ top: 644, left: 332 });
    // Never off screen.
    expect(cardPlacement("insight", { ...insight, left: 200 }, card, viewport).left).toBe(16);
  });
});
