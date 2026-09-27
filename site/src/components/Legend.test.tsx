// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BIVARIATE_COLORS, UNIVARIATE_COLORS } from "@/lib/scales";
import type { Camera } from "@/lib/types";
import { MapProvider } from "@/map/MapProvider";
import breaks from "@/test/fixtures/breaks.json";
import { DEFAULT_VIEW, useStore } from "@/store/useStore";
import { Legend } from "./Legend";

vi.mock("@/lib/loaders", () => ({ load: vi.fn(() => Promise.resolve(breaks)) }));

const ZOOM: Record<string, Camera> = {
  nation: { lon: -96.5, lat: 38.5, zoom: 3.6 },
  state: { lon: -118, lat: 34, zoom: 6 },
  local: { lon: -118, lat: 34, zoom: 9 },
};

async function renderLegend(view: Partial<typeof DEFAULT_VIEW>) {
  useStore.getState().setView({ ...DEFAULT_VIEW, ...view });
  render(
    <TooltipProvider>
      <MapProvider>
        <Legend />
      </MapProvider>
    </TooltipProvider>,
  );
  await act(async () => {});
  return screen.getByRole("region", { name: "Map legend" });
}

const rgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

beforeEach(() => useStore.getState().setView(DEFAULT_VIEW));
afterEach(cleanup);

describe("Legend", () => {
  it("shows the univariate ramp with break labels and level label", async () => {
    const legend = await renderLegend({ layers: ["composite"], camera: ZOOM.nation });
    expect(within(legend).getByRole("heading", { name: "Composite Score" })).toBeTruthy();
    expect(within(legend).getByTestId("legend-level").textContent).toBe("State means");
    const swatches = within(legend).getAllByRole("img", { name: /^Composite Score: / });
    expect(swatches.map((s) => s.getAttribute("aria-label"))).toEqual([
      "Composite Score: below 24.1",
      "Composite Score: 24.1 to under 25.8",
      "Composite Score: 25.8 to under 29.3",
      "Composite Score: 29.3 to under 34.0",
      "Composite Score: 34.0 and above",
    ]);
    expect(swatches.map((s) => s.style.backgroundColor)).toEqual(UNIVARIATE_COLORS.map(rgb));
    for (const tick of ["24.1", "25.8", "29.3", "34.0"]) expect(within(legend).getByText(tick)).toBeTruthy();
  });

  it("follows the level's breaks", async () => {
    const legend = await renderLegend({ layers: ["composite"], camera: ZOOM.local });
    expect(within(legend).getByTestId("legend-level").textContent).toBe("Schools");
    expect(within(legend).getByRole("img", { name: "Composite Score: 35 and above" })).toBeTruthy();
  });

  it("labels percentile mode on school values only", async () => {
    let legend = await renderLegend({ layers: ["composite"], display: "pct", camera: ZOOM.local });
    expect(within(legend).getByTestId("legend-level").textContent).toBe("Schools · national percentile");
    expect(within(legend).getByRole("img", { name: "Composite Score: 80 and above" })).toBeTruthy();
    cleanup();
    legend = await renderLegend({ layers: ["composite"], display: "pct", camera: ZOOM.state });
    expect(within(legend).getByTestId("legend-level").textContent).toBe("County means · scores");
  });

  it("titles context layers as a share of population", async () => {
    const legend = await renderLegend({ layers: ["ctx_hispanic"], camera: ZOOM.state });
    expect(within(legend).getByTestId("legend-level").textContent).toBe("Share of population · County means");
    expect(within(legend).getByText("Higher share")).toBeTruthy();
  });

  it("marks county-level layers", async () => {
    const legend = await renderLegend({ layers: ["crime"], camera: ZOOM.nation });
    expect(within(legend).getByLabelText(/^county-level measure/)).toBeTruthy();
  });

  it("draws the 3x3 grid with A on the vertical axis and B on the horizontal", async () => {
    const legend = await renderLegend({ layers: ["composite", "education"], camera: ZOOM.state });
    expect(within(legend).getByTestId("legend-axis-a").textContent).toContain("Composite Score");
    expect(within(legend).getByTestId("legend-axis-b").textContent).toContain("Education");

    const cells = within(within(legend).getByTestId("legend-grid")).getAllByRole("listitem");
    // Rows top to bottom are A high, middle, low; columns left to right are B low, middle, high.
    expect(cells.map((c) => Number(c.dataset.class))).toEqual([6, 7, 8, 3, 4, 5, 0, 1, 2]);
    expect(cells.map((c) => c.style.backgroundColor)).toEqual(
      [6, 7, 8, 3, 4, 5, 0, 1, 2].map((k) => rgb(BIVARIATE_COLORS[k]!)),
    );
    const topLeft = within(cells[0]!).getByRole("img").getAttribute("aria-label");
    expect(topLeft).toBe("Composite Score high (33.2 and above), Education low (below 20.4)");
  });

  it("always shows the no-data and few-schools swatches", async () => {
    let legend = await renderLegend({ layers: ["composite"], camera: ZOOM.nation });
    expect(within(legend).getByRole("img", { name: "No data: hatched area" })).toBeTruthy();
    expect(within(legend).getByRole("img", { name: "Few schools: dotted outline" })).toBeTruthy();
    cleanup();
    legend = await renderLegend({ layers: ["composite", "crime"], camera: ZOOM.local });
    expect(within(legend).getByRole("img", { name: "No data: dashed ring pin" })).toBeTruthy();
    expect(within(legend).getByText("Few schools (under 3)")).toBeTruthy();
  });

  it("prompts for a layer when none is active", async () => {
    const legend = await renderLegend({ layers: [] });
    expect(within(legend).getByText("Pick a layer to color the map.")).toBeTruthy();
  });
});
