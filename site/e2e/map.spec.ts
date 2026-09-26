import { expect, test, type Page } from "@playwright/test";
import type { Map as MapLibreMap } from "maplibre-gl";

declare global {
  interface Window {
    /** Exposed by MapCanvas in dev and fixture builds. */
    __schoolscapeMap?: MapLibreMap;
  }
}

// M1 acceptance (SPEC.md 17.3): states color at load and the first-paint mark fires; clicking a state flies to it
// and the breadcrumb updates; no-data areas carry the hatch state.
// The basemap is blocked so the test never depends on tiles.openfreemap.org; fills render over the fallback style.

async function openMap(page: Page) {
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  // A returning viewer: the primer (SPEC.md 3.15) would cover the map on a first visit.
  await page.addInitScript(() => window.localStorage.setItem("schoolscape.primerSeen.v1", "1"));
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("schoolscape:first-paint").length > 0);
}

test("fires the first-paint mark with states colored by Composite", async ({ page }) => {
  await openMap(page);
  const result = await page.evaluate(() => {
    const map = window.__schoolscapeMap!;
    return {
      mark: performance.getEntriesByName("schoolscape:first-paint")[0]!.startTime,
      california: map.getFeatureState({ source: "ss-states", id: "06" }),
      arizona: map.getFeatureState({ source: "ss-states", id: "04" }),
      zoom: map.getZoom(),
    };
  });
  expect(result.mark).toBeGreaterThan(0);
  // California's composite mean 29.2 is class 2 of the nation quintiles.
  expect(result.california).toMatchObject({ c: 2, nd: false });
  // Arizona is not in the fixture aggregates: no data, drawn with the hatch.
  expect(result.arizona.nd ?? true).toBe(true);
  expect(result.zoom).toBeLessThan(5);
  await expect(page.getByTestId("slot-breadcrumb")).toHaveText("Nation");
  await expect(page.getByTestId("map-notice")).toHaveCount(0);
  // With the basemap blocked, the attribution corner says so (SPEC.md 9.7).
  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText("Basemap unavailable");
});

test("clicking a state flies to it and updates the breadcrumb", async ({ page }) => {
  await openMap(page);
  const point = await page.evaluate(() => {
    const p = window.__schoolscapeMap!.project([-99.3, 31.4]);
    return { x: p.x, y: p.y };
  });
  await page.mouse.move(point.x, point.y);
  await expect(page.getByTestId("area-tooltip")).toContainText("Texas");
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId("slot-breadcrumb")).toHaveText(/Nation\s*Texas/);
  await page.waitForFunction(() => !window.__schoolscapeMap!.isMoving() && window.__schoolscapeMap!.getZoom() >= 5);
  const sel = await page.evaluate(() => window.__schoolscapeMap!.getFeatureState({ source: "ss-states", id: "48" }));
  expect(sel.sel).toBe(true);

  // Escape goes up one level, back to the nation.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("slot-breadcrumb")).toHaveText("Nation");
  await page.waitForFunction(() => !window.__schoolscapeMap!.isMoving() && window.__schoolscapeMap!.getZoom() < 5);
});

test("quick-jump flies to Hawaii", async ({ page }) => {
  await openMap(page);
  await page.getByRole("button", { name: "Fly to Hawaii" }).click();
  await page.waitForFunction(() => {
    const m = window.__schoolscapeMap!;
    const c = m.getCenter();
    return !m.isMoving() && c.lng < -150 && c.lat < 25;
  });
});

test("the national view fits Alaska, Hawaii, and Puerto Rico between the panels", async ({ page }) => {
  await openMap(page);
  const points = await page.evaluate(() => {
    const map = window.__schoolscapeMap!;
    const places: Record<string, [number, number]> = {
      attu: [172.46 - 360, 52.9],
      utqiagvik: [-156.8, 71.35],
      hawaii: [-155.7, 18.91],
      puertoRico: [-65.22, 17.88],
      maine: [-66.9, 44.8],
      capeFlattery: [-124.8, 48.4],
    };
    return Object.fromEntries(Object.entries(places).map(([k, p]) => [k, map.project(p)]));
  });
  // The standard padding (SPEC.md 3.2) on the 1440 x 900 test window.
  for (const [name, p] of Object.entries(points)) {
    expect(p.x, name).toBeGreaterThanOrEqual(332 - 1);
    expect(p.x, name).toBeLessThanOrEqual(1440 - 412 + 1);
    expect(p.y, name).toBeGreaterThanOrEqual(72 - 1);
    expect(p.y, name).toBeLessThanOrEqual(900 - 96 + 1);
  }
});

test("the map wraps: a state on a repeated world copy hovers and drills", async ({ page }) => {
  await openMap(page);
  // Drag a full world width east; the view comes back to where it started.
  const before = await page.evaluate(() => window.__schoolscapeMap!.getCenter().wrap().toArray());
  const world = await page.evaluate(() => 512 * 2 ** window.__schoolscapeMap!.getZoom());
  for (let moved = 0; moved < world; moved += 400) {
    const dx = Math.min(400, world - moved);
    await page.mouse.move(500, 820);
    await page.mouse.down();
    await page.mouse.move(500 + dx, 820, { steps: 5 });
    await page.mouse.up();
  }
  await page.waitForFunction(() => !window.__schoolscapeMap!.isMoving());
  const after = await page.evaluate(() => window.__schoolscapeMap!.getCenter().wrap().toArray());
  // Drag tolerance and inertia shift it by a few pixels; a clamped world would stop hundreds of pixels short.
  expect(Math.abs(after[0] - before[0])).toBeLessThan(5);
  expect(Math.abs(after[1] - before[1])).toBeLessThan(2);

  // Center the map one world east of Texas, so Texas is drawn only by the next world copy.
  await page.evaluate(() => window.__schoolscapeMap!.jumpTo({ center: [-99.3 + 360, 35], zoom: 3.5 }));
  const point = await page.evaluate(() => {
    const map = window.__schoolscapeMap!;
    const p = map.project([-99.3 + 360, 31.4]);
    return { x: p.x, y: p.y };
  });
  await page.mouse.move(point.x, point.y);
  await expect(page.getByTestId("area-tooltip")).toContainText("Texas");
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId("slot-breadcrumb")).toHaveText(/Nation\s*Texas/);
});
