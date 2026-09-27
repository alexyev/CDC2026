// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import catalogJson from "../../data/catalog.json";
import type { CatalogFile } from "@/lib/dataTypes";
import type { Histogram, InsightRequest, InsightResult, LayerDef, PairStats } from "@/lib/types";
import { clearDataCache } from "@/lib/dataCache";
import { MapContext } from "@/map/mapContext";
import { DEFAULT_VIEW, useStore } from "@/store/useStore";
import { InsightView, type InsightViewProps, type UnitSet } from "./InsightPanel";

// The container's worker is mocked: it answers with fixed statistics so the test checks wiring, not math (S1's job).
const { requests } = vi.hoisted(() => ({ requests: [] as InsightRequest[] }));
vi.mock("@/stats/client", () => {
  let id = 0;
  return {
    nextRequestId: () => ++id,
    requestInsight: (req: InsightRequest) => {
      requests.push(req);
      const part = (p: { x: (number | null)[]; y?: (number | null)[] }) => ({
        spearman: pair("spearman", 0.52, p.x.length),
        pearson: pair("pearson", 0.44, p.x.length),
        histA: hist([p.x.length]),
        histB: p.y ? hist([p.x.length]) : undefined,
      });
      return Promise.resolve({
        requestId: req.requestId,
        areas: req.areas ? part(req.areas) : undefined,
        schools: part(req.schools),
        ms: 1,
      });
    },
  };
});

const LAYERS = new Map((catalogJson as CatalogFile).layers.map((l) => [l.id, l]));
const layer = (id: string) => LAYERS.get(id) as LayerDef;

function pair(method: PairStats["method"], r: number | null, n: number, ci: [number, number] | null = null): PairStats {
  return {
    method,
    r,
    ci,
    ciMethod: ci ? (n > 5000 ? "approx" : "bootstrap") : null,
    n,
    nMissing: 0,
    tooFew: n < 10,
  };
}

function hist(counts: number[]): Histogram {
  return { bins: counts.map((_, i) => i * 5), counts, median: null };
}

function units(noun: UnitSet["noun"], count: number, withY = true): UnitSet {
  const ids = Array.from({ length: count }, (_, i) => `${noun}-${i}`);
  return {
    noun,
    ids,
    names: ids.map((id) => `Name ${id}`),
    parents: ids.map(() => "Parent"),
    n: ids.map((_, i) => i + 1),
    x: ids.map((_, i) => 10 + i),
    y: withY ? ids.map((_, i) => 60 - i) : undefined,
  };
}

/** Section 6.3's example: 2,211 counties and 20,201 schools. */
function sectionSixThree(): InsightResult {
  return {
    requestId: 1,
    areas: {
      spearman: pair("spearman", 0.4, 2211, [0.36, 0.43]),
      pearson: pair("pearson", 0.26, 2211),
      histA: hist([1, 2]),
      histB: hist([1, 2]),
    },
    schools: {
      spearman: pair("spearman", 0.24, 20201, [0.23, 0.26]),
      pearson: pair("pearson", 0.07, 20201),
      histA: hist([3, 4]),
      histB: hist([3, 4]),
    },
    ms: 3,
  };
}

function renderView(props: Partial<InsightViewProps>) {
  const all: InsightViewProps = {
    level: "state",
    layerA: layer("crime"),
    layerB: layer("education"),
    areas: units("counties", 40),
    schools: units("schools", 60),
    result: sectionSixThree(),
    ...props,
  };
  return render(<InsightView {...all} />, { wrapper: Providers });
}

function Providers({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider>{children}</TooltipPrimitive.Provider>;
}

const panel = () => screen.getByTestId("slot-insight-panel");

const LA_BBOX = [-118.9, 32.8, -117.6, 34.8];
const SF_BBOX = [-122.5, 37.7, -122.4, 37.8];

beforeAll(() => {
  // jsdom has no canvas; the scatter skips drawing and keeps its hit testing.
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

beforeEach(() => {
  useStore.setState({ ...DEFAULT_VIEW, hovered: null });
});

afterEach(() => {
  cleanup();
});

describe("InsightView states (SPEC.md 3.7)", () => {
  it("loading: skeleton lines while the worker result is pending", () => {
    renderView({ result: null });
    expect(panel().dataset.state).toBe("loading");
    expect(screen.getByTestId("insight-skeleton")).toBeTruthy();
  });

  it("one-layer: areas heading, both histograms, national median", () => {
    const result = sectionSixThree();
    renderView({
      level: "nation",
      layerA: layer("composite"),
      layerB: undefined,
      areas: units("states", 48, false),
      schools: units("schools", 21000, false),
      result,
      national: {
        layers: ["composite"],
        schools: { n: 23595, mean: { composite: 28.3 }, median: { composite: 28 }, spearman: [[1]], pearson: [[1]] },
        counties: { n: 3167, spearman: [[1]], pearson: [[1]] },
        states: { n: 52, spearman: [[1]], pearson: [[1]] },
      },
    });
    expect(panel().dataset.state).toBe("one-layer");
    expect(panel().textContent).toContain("Composite Score across 48 states on screen");
    expect(panel().textContent).toContain("and 21,000 schools inside them");
    expect(screen.getAllByTestId("distribution")).toHaveLength(2);
    expect(screen.getAllByTestId("national-median")).toHaveLength(2);
    expect(panel().textContent).toContain("National median 28");
  });

  it("one-layer at local level: schools only, with the counties-in-view note", () => {
    renderView({
      level: "local",
      layerA: layer("education"),
      layerB: undefined,
      areas: undefined,
      schools: units("schools", 37, false),
      countiesInView: 3,
      result: { ...sectionSixThree(), areas: undefined },
    });
    expect(panel().textContent).toContain("Education across 37 schools on screen");
    expect(panel().textContent).toContain("3 counties in view");
    expect(screen.getAllByTestId("distribution")).toHaveLength(1);
  });

  it("two-layers: the correlation block copy matches SPEC.md 6.3 exactly", () => {
    renderView({});
    expect(panel().dataset.state).toBe("two-layers");
    const areas = screen.getByTestId("row-areas");
    const schools = screen.getByTestId("row-schools");
    for (const text of ["Areas on screen", "ρ = 0.40", "95% CI 0.36 to 0.43", "n = 2,211 counties"]) {
      expect(within(areas).getByText(text)).toBeTruthy();
    }
    for (const text of ["Schools inside them", "ρ = 0.24", "95% CI 0.23 to 0.26", "n = 20,201 schools"]) {
      expect(within(schools).getByText(text)).toBeTruthy();
    }
    expect(screen.getByTestId("correlation-note").textContent).toBe(
      "Correlations across areas and across schools answer different questions. An area-level number says nothing about any individual school (the ecological fallacy).",
    );
    expect(screen.getByTestId("scatter")).toBeTruthy();
  });

  it("two-layers: details show Pearson, r², pairwise counts, and the method line", () => {
    renderView({});
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    const details = screen.getByTestId("insight-details");
    expect(details.textContent).toContain("Pearson r0.26");
    expect(details.textContent).toContain("r²0.07");
    expect(details.textContent).toContain("2,211 of 40 counties have both values");
    expect(details.textContent).toContain("Seed42");
    expect(details.textContent).toContain("Bonett and Wright approximation (approx.)");
  });

  it("too-few: the thin half says so, the other half still renders", () => {
    const result = sectionSixThree();
    result.areas!.spearman = pair("spearman", null, 7);
    renderView({ level: "nation", areas: units("states", 7), result });
    expect(screen.getByTestId("too-few-areas").textContent).toBe(
      "Too few states to correlate (n = 7). Zoom out or pick a larger area.",
    );
    expect(within(screen.getByTestId("row-schools")).getByText("ρ = 0.24")).toBeTruthy();
    expect(screen.getByTestId("correlation-note").textContent).toBe("Only schools can be correlated at this zoom.");
  });

  it("small sample tag for 10 ≤ n < 30", () => {
    const result = sectionSixThree();
    result.areas!.spearman = pair("spearman", -0.31, 12, [-0.7, 0.2]);
    renderView({ result });
    const row = screen.getByTestId("row-areas");
    expect(within(row).getByText("small sample")).toBeTruthy();
    expect(within(row).getByText("ρ = −0.31")).toBeTruthy();
    expect(within(row).getByText("95% CI −0.70 to 0.20")).toBeTruthy();
  });

  it("compare: one column frame per pinned area with remove buttons", () => {
    useStore.setState({
      compare: {
        armed: true,
        pins: [
          { kind: "county", id: "06037" },
          { kind: "county", id: "06075" },
        ],
      },
    });
    renderView({ pinNames: { "06037": "Los Angeles County", "06075": "San Francisco County" } });
    expect(panel().dataset.state).toBe("compare");
    expect(screen.getByRole("button", { name: "Remove Los Angeles County" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove San Francisco County" })).toBeTruthy();
  });

  it("compare: X removes that pin and Done leaves compare mode", () => {
    const pins = [
      { kind: "state" as const, id: "06" },
      { kind: "state" as const, id: "48" },
    ];
    useStore.setState({ compare: { armed: true, pins } });
    renderView({ level: "nation", pinNames: { "06": "California", "48": "Texas" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove California" }));
    expect(useStore.getState().compare).toEqual({ armed: true, pins: [pins[1]] });
    expect(screen.queryByRole("button", { name: "Remove California" })).toBeNull();

    useStore.setState({ compare: { armed: true, pins } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(useStore.getState().compare).toEqual({ armed: false, pins: [] });
    expect(panel().dataset.state).not.toBe("compare");
  });

  it("compare: Done frames the pinned areas on the map", async () => {
    vi.stubGlobal("fetch", async (path: string) =>
      path.endsWith("counties.json")
        ? new Response(JSON.stringify({ ids: ["06037", "06075"], bbox: [LA_BBOX, SF_BBOX] }))
        : new Response("", { status: 404 }),
    );
    const map = {
      cameraForBounds: vi.fn(() => ({ center: { lng: -120, lat: 35.3 }, zoom: 6.2 })),
      flyTo: vi.fn(),
      jumpTo: vi.fn(),
      getZoom: () => 9,
      getBounds: () => ({ getWest: () => -125, getSouth: () => 32, getEast: () => -114, getNorth: () => 42 }),
      on: vi.fn(),
      off: vi.fn(),
    };
    const context = { map: map as never, ready: true, level: "local" as const, registerMap: () => {} };
    useStore.setState({
      compare: {
        armed: true,
        pins: [
          { kind: "county", id: "06037" },
          { kind: "county", id: "06075" },
        ],
      },
    });
    render(
      <MapContext.Provider value={context}>
        <InsightView level="local" layerA={layer("crime")} schools={null} result={null} pinNames={{}} />
      </MapContext.Provider>,
      { wrapper: Providers },
    );
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(useStore.getState().compare).toEqual({ armed: false, pins: [] });
    await waitFor(() => expect(map.flyTo).toHaveBeenCalled());
    expect(map.cameraForBounds).toHaveBeenCalledWith(
      [
        [SF_BBOX[0], LA_BBOX[1]],
        [LA_BBOX[2], SF_BBOX[3]],
      ],
      expect.objectContaining({ maxZoom: 7.9 }),
    );
    vi.unstubAllGlobals();
    clearDataCache();
  });
});

describe("scope: a selected state or county (SPEC.md 3.7)", () => {
  const TEXAS = { kind: "state", id: "48", name: "Texas" } as const;
  const COOK = { kind: "county", id: "17031", name: "Cook County, IL" } as const;

  it("on screen: a dashed On screen chip and the viewport copy", () => {
    renderView({});
    expect(screen.getByTestId("insight-scope").textContent).toBe("On screen");
    expect(within(screen.getByTestId("row-areas")).getByText("Areas on screen")).toBeTruthy();
  });

  it("state, one layer: the heading names the state, with its counties and schools", () => {
    renderView({
      scope: TEXAS,
      level: "nation",
      layerA: layer("composite"),
      layerB: undefined,
      areas: units("counties", 229, false),
      schools: units("schools", 1918, false),
    });
    expect(screen.getByTestId("insight-scope").textContent).toBe("Selected state");
    expect(screen.getByTestId("scope-heading").textContent).toBe("Composite Score in Texas");
    expect(panel().textContent).toContain("229 counties · 1,918 schools");
    expect(panel().textContent).not.toContain("on screen");
    expect(screen.getAllByTestId("distribution")).toHaveLength(2);
  });

  it("state, two layers: county and school rows, whatever the map level", () => {
    renderView({ scope: TEXAS, level: "local", areas: units("counties", 229), schools: units("schools", 1918) });
    expect(screen.getByTestId("scope-heading").textContent).toBe("229 counties and 1,918 schools in Texas");
    expect(within(screen.getByTestId("row-areas")).getByText("Counties in this state")).toBeTruthy();
    expect(within(screen.getByTestId("row-schools")).getByText("Schools inside them")).toBeTruthy();
  });

  it("county, one layer: schools only, since one county cannot be correlated across counties", () => {
    renderView({
      scope: COOK,
      level: "state",
      layerA: layer("composite"),
      layerB: undefined,
      areas: undefined,
      schools: units("schools", 265, false),
      result: { ...sectionSixThree(), areas: undefined },
    });
    expect(screen.getByTestId("insight-scope").textContent).toBe("Selected county");
    expect(screen.getByTestId("scope-heading").textContent).toBe("Composite Score in Cook County, IL");
    expect(panel().textContent).toContain("265 schools");
    expect(screen.getAllByTestId("distribution")).toHaveLength(1);
  });

  it("county, two layers: one schools row, and a too-few row points at the selection", () => {
    const result = { ...sectionSixThree(), areas: undefined };
    result.schools.spearman = pair("spearman", null, 7);
    renderView({ scope: COOK, level: "state", areas: undefined, schools: units("schools", 7), result });
    expect(screen.getByTestId("scope-heading").textContent).toBe("7 schools in Cook County, IL");
    expect(screen.queryByTestId("row-areas")).toBeNull();
    expect(screen.getByTestId("too-few-schools").textContent).toBe(
      "Too few schools to correlate (n = 7). Clear the selection or pick a larger area.",
    );
  });

  it("county with a county-level layer: explains that every school shares one value", () => {
    const result = { ...sectionSixThree(), areas: undefined };
    result.schools.spearman = pair("spearman", null, 14);
    const schools = { ...units("schools", 14), y: Array.from({ length: 14 }, () => 0.46) };
    renderView({ scope: COOK, layerA: layer("composite"), layerB: layer("gini"), areas: undefined, schools, result });
    expect(screen.getByTestId("row-schools").textContent).toContain("A layer does not vary across these schools");
    expect(screen.getByTestId("correlation-note").textContent).toBe(
      "Gini index is only available per county, so every school here shares one value.",
    );
  });

  it("county with two county-level layers: names both", () => {
    const result = { ...sectionSixThree(), areas: undefined };
    renderView({ scope: COOK, layerB: layer("gini"), areas: undefined, schools: units("schools", 14), result });
    expect(screen.getByTestId("correlation-note").textContent).toBe(
      "Crime and Gini index are only available per county, so every school here shares one value of each.",
    );
  });

  it("county with no schools: no note that its schools share one value", () => {
    const result = { ...sectionSixThree(), areas: undefined };
    result.schools.spearman = pair("spearman", null, 0);
    renderView({ scope: COOK, layerB: layer("gini"), areas: undefined, schools: units("schools", 0), result });
    expect(screen.getByTestId("too-few-schools").textContent).toContain("(n = 0)");
    expect(screen.queryByTestId("correlation-note")).toBeNull();
  });

  it("the chip's X clears the selection, back to what is on screen", () => {
    useStore.setState({ selected: { kind: "state", id: "48" } });
    renderView({ scope: TEXAS });
    fireEvent.click(screen.getByRole("button", { name: "Clear selection and show what is on screen" }));
    expect(useStore.getState().selected).toBeUndefined();
  });

  it("the data table lists the selected area's units", () => {
    renderView({ scope: TEXAS, level: "nation", areas: units("counties", 3) });
    fireEvent.click(screen.getByRole("button", { name: "Data table" }));
    expect(screen.getByTestId("data-table").textContent).toContain("3 counties in Texas");
  });
});

describe("scatter and map linking (SPEC.md 6.4)", () => {
  // One point: the scatter centers it at (M.left + plotW / 2, M.top + plotH / 2) = (185, 78) on a 348 x 168 canvas.
  const single = (): Partial<InsightViewProps> => {
    const one: UnitSet = {
      noun: "schools",
      ids: ["060000000001"],
      names: ["Lincoln High"],
      parents: ["LA, CA"],
      n: [1],
      x: [50],
      y: [40],
    };
    const result = sectionSixThree();
    result.schools.spearman = pair("spearman", 0.24, 20201, [0.23, 0.26]);
    return { level: "local", areas: undefined, schools: one, result: { ...result, areas: undefined } };
  };

  it("hovering a point sets the store's hovered unit, and leaving clears it", () => {
    renderView(single());
    const hit = screen.getByTestId("scatter-hit");
    fireEvent.pointerMove(hit, { clientX: 185, clientY: 78 });
    expect(useStore.getState().hovered).toBe("060000000001");
    expect(screen.getByTestId("scatter-tip").textContent).toContain("Lincoln High");
    fireEvent.pointerLeave(hit);
    expect(useStore.getState().hovered).toBeNull();
  });

  it("a unit hovered on the map highlights its point", () => {
    renderView(single());
    expect(screen.queryByTestId("scatter-tip")).toBeNull();
    act(() => useStore.getState().hoverUnit("060000000001"));
    expect(screen.getByTestId("scatter-tip").textContent).toContain("Lincoln High");
  });
});

describe("data table (SPEC.md 10.3)", () => {
  it("opens the on-screen units as a sortable table", () => {
    renderView({ level: "nation", areas: units("states", 3) });
    fireEvent.click(screen.getByRole("button", { name: "Data table" }));
    const dialog = screen.getByTestId("data-table");
    const firstCells = () =>
      within(dialog)
        .getAllByRole("row")
        .slice(1)
        .map((r) => r.querySelector("td")?.textContent);

    // Default: layer A, highest first.
    expect(firstCells()).toEqual(["Name states-2", "Name states-1", "Name states-0"]);
    const header = within(dialog).getByRole("columnheader", { name: /Crime/ });
    expect(header.getAttribute("aria-sort")).toBe("descending");
    fireEvent.click(within(header).getByRole("button"));
    expect(header.getAttribute("aria-sort")).toBe("ascending");
    expect(firstCells()).toEqual(["Name states-0", "Name states-1", "Name states-2"]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Education" }));
    expect(firstCells()).toEqual(["Name states-0", "Name states-1", "Name states-2"]);
    fireEvent.click(within(dialog).getByRole("tab", { name: "schools" }));
    expect(within(dialog).getAllByRole("row")).toHaveLength(61);
  });
});

describe("InsightPanel container with fixtures", () => {
  it("gathers the states on screen and the schools inside them, and asks the worker", async () => {
    vi.stubEnv("VITE_USE_FIXTURES", "1");
    vi.resetModules();
    const { InsightPanel: Panel } = await import("./InsightPanel");
    const { MapProvider: Provider } = await import("@/map/MapProvider");
    const { useStore: store } = await import("@/store/useStore");
    store.setState({ layers: ["composite", "education"] });
    render(
      <Provider>
        <Providers>
          <Panel />
        </Providers>
      </Provider>,
    );
    await waitFor(() => expect(within(screen.getByTestId("row-schools")).getByText("ρ = 0.52")).toBeTruthy(), {
      timeout: 3000,
    });
    const last = requests[requests.length - 1];
    expect(last.layerA).toBe("composite");
    expect(last.layerB).toBe("education");
    // The default camera over a 1024 x 768 jsdom window: every fixture state except Hawaii and Puerto Rico.
    expect(last.areas?.ids.sort()).toEqual(["01", "06", "09", "17", "25", "29", "37", "48"]);
    expect(last.schools.ids.length).toBeGreaterThan(100);
    expect(screen.getByTestId("too-few-areas").textContent).toContain("(n = 8)");
    expect(within(screen.getByTestId("row-schools")).getByText("ρ = 0.52")).toBeTruthy();
    vi.unstubAllEnvs();
  });

  it("with a state or county selected, gathers that area whatever the camera, and panning asks nothing", async () => {
    vi.stubEnv("VITE_USE_FIXTURES", "1");
    vi.resetModules();
    const { InsightPanel: Panel } = await import("./InsightPanel");
    const { MapProvider: Provider } = await import("@/map/MapProvider");
    const { useStore: store } = await import("@/store/useStore");
    store.setState({ layers: ["composite", "education"], selected: { kind: "state", id: "06" } });
    render(
      <Provider>
        <Providers>
          <Panel />
        </Providers>
      </Provider>,
    );
    // California in the fixtures: three counties with schools and 49 schools.
    await waitFor(() => expect(screen.getByTestId("scope-heading").textContent).toContain("in California"), {
      timeout: 3000,
    });
    await waitFor(() => expect(requests[requests.length - 1].schools.ids.length).toBe(49), { timeout: 3000 });
    let last = requests[requests.length - 1];
    expect(last.areas?.ids.sort()).toEqual(["06019", "06037", "06075"]);
    expect(screen.getByTestId("scope-heading").textContent).toBe("3 counties and 49 schools in California");

    // Pan and zoom far away: nothing is recomputed.
    const asked = requests.length;
    act(() => store.getState().setCamera({ lon: -72.5, lat: 41.4, zoom: 9 }));
    await new Promise((r) => setTimeout(r, 400));
    expect(requests.length).toBe(asked);
    expect(screen.getByTestId("scope-heading").textContent).toBe("3 counties and 49 schools in California");

    // A county: its schools alone.
    act(() => store.getState().select({ kind: "county", id: "06037" }));
    await waitFor(
      () => expect(screen.getByTestId("scope-heading").textContent).toBe("37 schools in Los Angeles County, CA"),
      {
        timeout: 3000,
      },
    );
    last = requests[requests.length - 1];
    expect(last.areas).toBeUndefined();
    expect(last.schools.ids).toHaveLength(37);

    // Clearing the selection goes back to what is on screen.
    act(() => store.getState().clearSelection());
    await waitFor(() => expect(screen.getByTestId("insight-scope").textContent).toBe("On screen"), { timeout: 3000 });
    vi.unstubAllEnvs();
  });
});
