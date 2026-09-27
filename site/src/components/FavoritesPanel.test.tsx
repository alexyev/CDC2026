// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Seven fixture schools in seven states, in star order.
const IDS = [
  "010000500871", // Albertville High School, AL
  "060000103278", // Vasquez High, CA
  "090000201136", // A. I. Prince Technical High School, CT (no crime data)
  "150003000007", // Kahuku High & Intermediate School, HI
  "170000603793", // Iyc Chicago, IL
  "250001301782", // Southwick Regional School, MA
  "290000800821", // Graff Career Center, MO
];

async function renderPanel(favorites: string[]) {
  vi.resetModules();
  vi.stubEnv("VITE_USE_FIXTURES", "1");
  const { useStore } = await import("@/store/useStore");
  const { FavoritesPanel } = await import("./FavoritesPanel");
  const { useFavoritesKeys } = await import("./appShortcuts");
  // App mounts the shortcut once, apart from the drawer, which loads on first use.
  function Keys() {
    useFavoritesKeys();
    return null;
  }
  const { MapProvider } = await import("@/map/MapProvider");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  act(() => useStore.setState({ favorites, favoritesPanel: true }));
  render(
    <TooltipProvider>
      <MapProvider>
        <Keys />
        <FavoritesPanel />
      </MapProvider>
    </TooltipProvider>,
  );
  return { useStore };
}

function openCompare() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: /Compare starred/ }), { button: 0 });
}

describe("FavoritesPanel", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  it("lists starred schools with city, state, and composite", async () => {
    await renderPanel(IDS.slice(0, 2));
    const list = await screen.findByRole("list", { name: "Starred schools" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("Albertville High School");
    expect(items[0]!.textContent).toContain("Albertville, AL");
    expect(items[0]!.textContent).toContain("31");
    expect(items[0]!.textContent).toContain("63rd pct");
  });

  it("removes a school from the list", async () => {
    const { useStore } = await renderPanel(IDS.slice(0, 2));
    fireEvent.click(await screen.findByRole("button", { name: "Remove Vasquez High from favorites" }));
    expect(useStore.getState().favorites).toEqual([IDS[0]]);
  });

  it("compares the first six schools with highest-stress cells tinted and county badges", async () => {
    await renderPanel(IDS);
    await screen.findByRole("list", { name: "Starred schools" });
    openCompare();
    const table = await screen.findByTestId("favorites-compare");

    const headers = table.querySelectorAll("thead th");
    expect(headers).toHaveLength(7); // measure column + six schools
    expect(headers[1]!.textContent).toContain("Albertville High School");
    expect(within(table).queryByText("Graff Career Center")).toBeNull();
    expect(screen.getByText(/Showing the first 6 of 7 starred schools/)).not.toBeNull();

    expect(table.querySelectorAll("tbody tr[data-layer]")).toHaveLength(35);
    expect(table.querySelectorAll("[data-county-badge]")).toHaveLength(8);

    // Composite: 31, 26, 39, 24, 31, 22 -> the Connecticut school is highest.
    const composite = table.querySelector('tr[data-layer="composite"]')!;
    const cells = composite.querySelectorAll("td");
    expect([...cells].map((c) => c.hasAttribute("data-highest"))).toEqual([false, false, true, false, false, false]);
    expect(cells[0]!.textContent).toContain("63rd");

    // Crime is missing for Connecticut: the no-data glyph, never a number.
    const crime = table.querySelector('tr[data-layer="crime"]')!.querySelectorAll("td");
    expect(crime[2]!.querySelector("[data-nodata]")).not.toBeNull();
    expect(crime[2]!.textContent).toContain("No data");

    // Context rows are neutral and never tinted.
    expect(table.querySelector('tr[data-layer^="ctx_"] td[data-highest]')).toBeNull();
  });

  it("sets the show-only-starred store flag", async () => {
    const { useStore } = await renderPanel(IDS.slice(0, 1));
    fireEvent.click(screen.getByRole("switch"));
    expect(useStore.getState().showOnlyStarred).toBe(true);
  });

  it("shows the empty state and disables compare with no favorites", async () => {
    await renderPanel([]);
    expect(screen.getByText("No starred schools yet")).not.toBeNull();
    expect((screen.getByRole("tab", { name: /Compare starred/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("switch") as HTMLButtonElement).disabled).toBe(true);
  });

  it("toggles with `f` and closes with Escape, but not while typing", async () => {
    const { useStore } = await renderPanel([]);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useStore.getState().favoritesPanel).toBe(false);
    fireEvent.keyDown(window, { key: "f" });
    expect(useStore.getState().favoritesPanel).toBe(true);

    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "f" });
    expect(useStore.getState().favoritesPanel).toBe(true);
    input.remove();
  });

  it("moves the store camera to a favorite before the map exists", async () => {
    const { useStore } = await renderPanel(IDS.slice(0, 1));
    fireEvent.click(await screen.findByRole("button", { name: /^Albertville High School/ }));
    const camera = useStore.getState().camera;
    expect(camera.zoom).toBe(12);
    expect(camera.lat).toBeCloseTo(34.26, 1);
  });
});
