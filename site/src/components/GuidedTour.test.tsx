import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LANDING_EXIT_MS } from "@/lib/guide";
import { usePanels } from "@/lib/panels";
import { DEFAULT_VIEW, useStore } from "@/store/useStore";
import { cameraOff, stepView, TOUR_STEPS } from "@/content/tour";
import { GuidedTour } from "./GuidedTour";

beforeEach(() => {
  useStore.getState().setView({ ...DEFAULT_VIEW, favorites: ["060000000001"] });
  useStore.getState().setGuide("tour");
});
afterEach(cleanup);

const card = () => screen.queryByTestId("guided-tour");

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

  it("restores the panel a step talks about when the viewer minimized it", () => {
    act(() => usePanels.getState().setMinimized("legend", true));
    render(<GuidedTour />);
    expect(TOUR_STEPS[0]!.target).toBe("legend");
    expect(usePanels.getState().minimized.legend).toBe(false);
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
});
