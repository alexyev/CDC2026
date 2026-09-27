import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import gazetteer from "@/test/fixtures/gazetteer.json";
import schools from "@/test/fixtures/schools/all.json";
import { COUNTY_DRILL_MIN_ZOOM, MAP_PADDING } from "@/map/levels";
import { MapContext, type MapContextValue } from "@/map/mapContext";
import { DEFAULT_VIEW, useStore } from "@/store/useStore";
import { SearchBox } from "./SearchBox";

vi.mock("@/lib/loaders", () => ({
  load: (key: string) => {
    if (key === "gazetteer") return Promise.resolve(gazetteer);
    if (key === "schools") return Promise.resolve(schools);
    return Promise.reject(new Error(`unexpected load(${key})`));
  },
}));

beforeAll(() => {
  // Radix Popper measures its anchor with ResizeObserver, which jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const openProfile = vi.fn();
const toggleFavorite = vi.fn();

beforeEach(() => {
  useStore.setState({ ...DEFAULT_VIEW, openProfile, toggleFavorite });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithMap(map: Partial<MapLibreMap> | null = null) {
  const value: MapContextValue = {
    map: map as MapLibreMap | null,
    ready: Boolean(map),
    level: "nation",
    registerMap: () => {},
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MapContext.Provider value={value}>{children}</MapContext.Provider>
  );
  return render(<SearchBox />, { wrapper });
}

/** A map stub whose bbox fits land at `fitZoom`. */
function cameraMap(fitZoom: number) {
  return {
    cameraForBounds: vi.fn<MapLibreMap["cameraForBounds"]>(() => ({
      center: { lng: -100, lat: 35 },
      zoom: fitZoom,
      bearing: 0,
    })),
    flyTo: vi.fn(),
    jumpTo: vi.fn(),
    getZoom: () => 4,
  };
}

const input = () => screen.getByRole("combobox", { name: "Search places and schools" });

async function typeQuery(text: string) {
  fireEvent.focus(input());
  fireEvent.change(input(), { target: { value: text } });
  await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
}

const optionNames = () => screen.getAllByRole("option").map((o) => o.textContent);

describe("SearchBox (SPEC.md 3.11)", () => {
  it('lists Los Angeles County first for "los angeles", grouped by kind', async () => {
    renderWithMap();
    await typeQuery("los angeles");
    expect(optionNames()[0]).toContain("Los Angeles County");
    const groups = screen.getAllByRole("group").map((g) => g.getAttribute("aria-labelledby"));
    expect(groups.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Counties")).toBeTruthy();
    expect(screen.getByText("Cities")).toBeTruthy();
    expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(8);
  });

  it("selects a county and flies to its bbox with the standard padding, at the local level", async () => {
    const map = cameraMap(7.1);
    renderWithMap(map);
    await typeQuery("los angeles");
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(useStore.getState().selected).toEqual({ kind: "county", id: "06037" });
    expect(map.cameraForBounds).toHaveBeenCalledTimes(1);
    const [bounds, options] = map.cameraForBounds.mock.calls[0]!;
    expect(bounds).toEqual([
      [-118.94489, 32.8006],
      [-117.64637, 34.8233],
    ]);
    expect(options).toMatchObject({ padding: MAP_PADDING, maxZoom: 12 });
    // A county opens where its schools are drawn (SPEC.md 3.4), however large it is.
    expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: COUNTY_DRILL_MIN_ZOOM, duration: 1200 }));
    // The panel closes and the query clears.
    expect((input() as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it('opens the profile for "albertville high" and centers the map at z12', async () => {
    const flyTo = vi.fn();
    renderWithMap({ fitBounds: vi.fn(), flyTo });
    await typeQuery("albertville high");
    expect(optionNames()[0]).toContain("Albertville High School");
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(openProfile).toHaveBeenCalledWith("010000500871");
    expect(useStore.getState().selected).toEqual({ kind: "school", id: "010000500871" });
    expect(flyTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [schools.lon[0], schools.lat[0]], zoom: 12, padding: MAP_PADDING }),
    );
  });

  it("flies a city to the bbox of its schools and selects it for pin highlighting", async () => {
    const map = cameraMap(10.4);
    renderWithMap(map);
    await typeQuery("springfield il");
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(useStore.getState().selected).toEqual({ kind: "city", id: "IL:Springfield" });
    expect(map.cameraForBounds.mock.calls[0]![1]).toMatchObject({ maxZoom: 12 });
    expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 10.4 }));
  });

  it("moves through results with the arrow keys and wraps", async () => {
    renderWithMap();
    await typeQuery("los angeles");
    const options = screen.getAllByRole("option");
    expect(input().getAttribute("aria-activedescendant")).toBe(options[0].id);
    expect(options[0].getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().getAttribute("aria-activedescendant")).toBe(options[1].id);
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(input().getAttribute("aria-activedescendant")).toBe(options[options.length - 1].id);
    fireEvent.keyDown(input(), { key: "Home" });
    expect(input().getAttribute("aria-activedescendant")).toBe(options[0].id);

    fireEvent.keyDown(input(), { key: "ArrowDown" });
    const second = screen.getAllByRole("option")[1].textContent ?? "";
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(second).toContain("Los Angeles");
    expect(useStore.getState().selected?.kind).not.toBe("county");
  });

  it("chooses a result on click", async () => {
    renderWithMap();
    await typeQuery("texas");
    fireEvent.click(screen.getAllByRole("option")[0]);
    expect(useStore.getState().selected).toEqual({ kind: "state", id: "48" });
    // Without a map yet, the camera still moves in the store (and so the URL).
    await waitFor(() => expect(useStore.getState().camera.lon).toBeLessThan(-95));
  });

  it("stars a school from its result row without choosing it", async () => {
    renderWithMap();
    await typeQuery("albertville high");
    fireEvent.click(screen.getByRole("button", { name: "Star Albertville High School" }));
    expect(toggleFavorite).toHaveBeenCalledWith("010000500871");
    expect(openProfile).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("focuses on / unless another input has focus", () => {
    renderWithMap();
    act(() => {
      fireEvent.keyDown(window, { key: "/" });
    });
    expect(document.activeElement).toBe(input());

    const other = document.createElement("input");
    document.body.appendChild(other);
    other.focus();
    fireEvent.keyDown(other, { key: "/" });
    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it("clears on Escape without letting the app-level Escape run", async () => {
    const appEscape = vi.fn();
    window.addEventListener("keydown", appEscape);
    renderWithMap();
    await typeQuery("texas");
    fireEvent.keyDown(input(), { key: "Escape" });
    expect((input() as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(appEscape).not.toHaveBeenCalled();
    window.removeEventListener("keydown", appEscape);
  });

  it("says so when nothing matches", async () => {
    renderWithMap();
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "zzqxv" } });
    expect(await screen.findByText("No places or schools match “zzqxv”.")).toBeTruthy();
  });
});
