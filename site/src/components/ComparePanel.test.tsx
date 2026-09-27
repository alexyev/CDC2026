// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { InsightResult, PairStats } from "@/lib/types";

const pair = (r: number, n: number): PairStats => ({
  method: "spearman",
  r,
  ci: [r - 0.1, r + 0.08],
  ciMethod: "bootstrap",
  n,
  nMissing: 0,
  tooFew: n < 10,
});

const { requestCompareStats } = vi.hoisted(() => ({
  requestCompareStats: vi.fn(),
}));
vi.mock("@/lib/compareStats", () => ({ requestCompareStats }));

const mockResult = (): InsightResult => ({
  requestId: 1,
  areas: { spearman: pair(0.55, 49), pearson: pair(0.5, 49), histA: { bins: [], counts: [], median: null } },
  schools: { spearman: pair(-0.21, 18), pearson: pair(-0.2, 18), histA: { bins: [], counts: [], median: null } },
  ms: 1,
});

const originalGetContext = HTMLCanvasElement.prototype.getContext;

beforeAll(() => {
  vi.stubEnv("VITE_USE_FIXTURES", "1");
  // jsdom has no canvas; the scatter draws nothing.
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

afterAll(() => {
  vi.unstubAllEnvs();
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

async function setup() {
  const { ComparePanel } = await import("./ComparePanel");
  const { MapProvider } = await import("@/map/MapProvider");
  const { DEFAULT_VIEW, useStore } = await import("@/store/useStore");
  const { useCompareToast } = await import("@/store/compareSlice");
  return { ComparePanel, MapProvider, DEFAULT_VIEW, useStore, useCompareToast };
}

describe("ComparePanel (SPEC.md 3.9)", () => {
  beforeEach(async () => {
    requestCompareStats.mockImplementation(async () => mockResult());
    const { useStore, DEFAULT_VIEW, useCompareToast } = await setup();
    act(() => {
      useStore.setState({ ...DEFAULT_VIEW, layers: ["composite", "education"] });
      useCompareToast.setState({ message: null, seq: 0 });
    });
  });

  afterEach(() => {
    cleanup();
    requestCompareStats.mockClear();
  });

  async function renderPanel() {
    const mod = await setup();
    render(
      <mod.MapProvider>
        <mod.ComparePanel />
      </mod.MapProvider>,
    );
    return mod;
  }

  it("arms from the toggle and shows the level hint", async () => {
    const { useStore } = await renderPanel();
    const toggle = screen.getByRole("button", { name: /compare/i });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(useStore.getState().compare).toEqual({ armed: true, pins: [] });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Click up to two states to pin them.")).toBeTruthy();
  });

  it("toggles with the c key, and turning compare off clears pins", async () => {
    const { useStore } = await renderPanel();
    fireEvent.keyDown(window, { key: "c" });
    expect(useStore.getState().compare.armed).toBe(true);
    act(() => useStore.getState().pinCompare({ kind: "state", id: "06" }));
    fireEvent.keyDown(window, { key: "c" });
    expect(useStore.getState().compare).toEqual({ armed: false, pins: [] });
  });

  it("shows A, B, and the nation with correlations for the schools inside each area", async () => {
    const { useStore } = await renderPanel();
    act(() => {
      useStore.getState().pinCompare({ kind: "state", id: "06" });
      useStore.getState().pinCompare({ kind: "state", id: "17" });
    });

    const a = await screen.findByTestId("compare-card-a");
    const b = screen.getByTestId("compare-card-b");
    const us = screen.getByTestId("compare-card-nation");
    expect(within(a).getByText("California")).toBeTruthy();
    expect(within(b).getByText("Illinois")).toBeTruthy();
    await waitFor(() => expect(within(a).getByText("0.55")).toBeTruthy());
    expect(within(a).getByText("0.45 to 0.63")).toBeTruthy();
    expect(within(a).getByText("49 schools")).toBeTruthy();
    expect(within(b).getByText("−0.21")).toBeTruthy();
    expect(within(b).getByText("small")).toBeTruthy();
    expect(within(us).getByText("nationwide")).toBeTruthy();

    // The request carries A's schools in `areas` and B's in `schools`.
    const [layerA, layerB, first, second] = requestCompareStats.mock.calls.at(-1) as unknown as [
      string,
      string,
      { ids: string[] },
      { ids: string[] },
    ];
    expect([layerA, layerB]).toEqual(["composite", "education"]);
    expect(first.ids).toHaveLength(49);
    expect(second.ids).toHaveLength(18);

    // Pin colors: A amber, B coral.
    expect(within(a).getByText("A").getAttribute("style")).toContain("rgb(255, 209, 102)");
    expect(within(b).getByText("B").getAttribute("style")).toContain("rgb(255, 122, 89)");
    expect(screen.getAllByRole("img", { name: /median/ })).toHaveLength(6);
  });

  it("removing A promotes B, and a single pin compares with the viewport", async () => {
    const { useStore } = await renderPanel();
    act(() => {
      useStore.getState().pinCompare({ kind: "state", id: "06" });
      useStore.getState().pinCompare({ kind: "state", id: "17" });
    });
    const a = await screen.findByTestId("compare-card-a");
    fireEvent.click(within(a).getByRole("button", { name: "Remove California" }));
    expect(useStore.getState().compare.pins).toEqual([{ kind: "state", id: "17" }]);
    expect(within(screen.getByTestId("compare-card-a")).getByText("Illinois")).toBeTruthy();
    const view = screen.getByTestId("compare-card-view");
    expect(within(view).getByText("Viewport")).toBeTruthy();
    expect(within(view).getByText("200 schools")).toBeTruthy();
  });

  it("toasts when a pin at another level resets the pins", async () => {
    const { useStore } = await renderPanel();
    act(() => {
      useStore.getState().pinCompare({ kind: "county", id: "06037" });
      useStore.getState().pinCompare({ kind: "county", id: "06075" });
    });
    expect(await screen.findByText("Los Angeles County, CA")).toBeTruthy();
    act(() => useStore.getState().pinCompare({ kind: "state", id: "06" }));
    expect(useStore.getState().compare.pins).toEqual([{ kind: "state", id: "06" }]);
    expect(await screen.findByText("Compare pins reset to state level")).toBeTruthy();
  });

  it("shows means instead of correlations with one layer", async () => {
    const { useStore } = await renderPanel();
    act(() => {
      useStore.setState({ layers: ["composite"] });
      useStore.getState().pinCompare({ kind: "county", id: "06037" });
    });
    const a = await screen.findByTestId("compare-card-a");
    expect(within(a).getByText(/^median /)).toBeTruthy();
    expect(requestCompareStats).not.toHaveBeenCalled();
    expect(screen.getAllByRole("img", { name: /median|no data/ })).toHaveLength(3);
  });
});
