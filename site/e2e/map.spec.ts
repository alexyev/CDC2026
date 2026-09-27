// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

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
  // The live map's own address (SPEC.md 3.15): a bare URL would open on the primer.
  await page.goto("/?v=3.6/38.5/-96.5");
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

test("Escape closes the data table without leaving the selected state", async ({ page }) => {
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  await page.goto("/?l=composite,education&sel=state:48");
  await expect(page.getByTestId("slot-breadcrumb")).toHaveText(/Nation\s*Texas/);
  await page.getByRole("button", { name: "Data table" }).click();
  await expect(page.getByRole("dialog", { name: "Data table" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Data table" })).toHaveCount(0);
  await expect(page.getByTestId("slot-breadcrumb")).toHaveText(/Nation\s*Texas/);
  expect(page.url()).toContain("sel=state:48");
});

test("on a 1280 x 800 window, clicking Texas still lands at the state level", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openMap(page);
  const point = await page.evaluate(() => {
    const p = window.__schoolscapeMap!.project([-99.3, 31.4]);
    return { x: p.x, y: p.y };
  });
  await page.mouse.move(point.x, point.y);
  await expect(page.getByTestId("area-tooltip")).toContainText("Texas");
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId("slot-breadcrumb")).toHaveText(/Nation\s*Texas/);
  await page.waitForFunction(() => !window.__schoolscapeMap!.isMoving());
  // Texas fits just below z5 between the panels here; the drill still opens it where its counties are drawn.
  expect(await page.evaluate(() => window.__schoolscapeMap!.getZoom())).toBeGreaterThanOrEqual(5);
  // The state's hover card does not ride along the flight.
  await expect(page.getByTestId("area-tooltip")).toHaveCount(0);
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
    // Hold still before releasing: MapLibre carries a drag on with inertia from the last 160 ms of movement.
    await page.waitForTimeout(200);
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

// With the world wrapping, the zoom floor follows the window width so no place is ever drawn twice (SPEC.md 3.3).
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test.describe(`at ${viewport.width} x ${viewport.height}`, () => {
    test.use({ viewport });

    /** States drawn more than once: a state's hits must all fall within one copy of the world. */
    async function statesDrawnTwice(page: Page): Promise<string[]> {
      return page.evaluate(() => {
        const map = window.__schoolscapeMap!;
        const { clientWidth: w, clientHeight: h } = map.getContainer();
        const lngs = new Map<string, number[]>();
        for (let x = 0; x < w; x += 8) {
          const lng = map.unproject([x + 4, h / 2]).lng;
          for (const f of map.queryRenderedFeatures(
            [
              [x, 0],
              [x + 8, h],
            ],
            { layers: ["ss-state-fill"] },
          )) {
            const gid = String(f.properties.gid);
            lngs.set(gid, [...(lngs.get(gid) ?? []), lng]);
          }
        }
        // One copy of Alaska, the widest state, spans 58 degrees; two copies' hits are at least 300 degrees apart.
        return [...lngs].filter(([, l]) => Math.max(...l) - Math.min(...l) > 180).map(([gid]) => gid);
      });
    }

    test("zooming out as far as possible never draws a state or pin twice", async ({ page }) => {
      await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
      // A starred school, drawn as a pin at every level.
      await page.goto("/?fav=010000500871");
      await page.waitForFunction(() => performance.getEntriesByName("schoolscape:first-paint").length > 0);

      // The national view still fits above the floor.
      const national = await page.evaluate(() => [
        window.__schoolscapeMap!.getZoom(),
        window.__schoolscapeMap!.getMinZoom(),
      ]);
      expect(national[0]).toBeGreaterThan(national[1]!);

      await page.mouse.move(viewport.width / 2, viewport.height / 2);
      for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 600);
      await page.waitForFunction(() => {
        const m = window.__schoolscapeMap!;
        return !m.isMoving() && Math.abs(m.getZoom() - m.getMinZoom()) < 1e-6;
      });

      // Pan a full world width in steps, across the antimeridian and back to the start.
      const world = await page.evaluate(() => 512 * 2 ** window.__schoolscapeMap!.getZoom());
      for (let moved = 0; moved < world; moved += 300) {
        expect(await statesDrawnTwice(page), `after ${moved} px`).toEqual([]);
        // The starred pin: at most one of its world copies is inside the viewport.
        const pinCopies = await page.evaluate(() => {
          const map = window.__schoolscapeMap!;
          const w = map.getContainer().clientWidth;
          return [-2, -1, 0, 1, 2].filter((k) => {
            const x = map.project([-86.2049 + 360 * k, 34.2622]).x;
            return x >= 0 && x <= w;
          }).length;
        });
        expect(pinCopies, `after ${moved} px`).toBeLessThanOrEqual(1);
        await page.mouse.move(viewport.width / 2, viewport.height - 40);
        await page.mouse.down();
        await page.mouse.move(viewport.width / 2 + 300, viewport.height - 40, { steps: 5 });
        await page.mouse.up();
        await page.waitForFunction(() => !window.__schoolscapeMap!.isMoving());
      }

      // Centered on the antimeridian, Alaska is on screen, once, and the view spans too little for a second copy.
      await page.evaluate(() => window.__schoolscapeMap!.jumpTo({ center: [-180, 55] }));
      const alaska = await page.evaluate(
        () =>
          window
            .__schoolscapeMap!.queryRenderedFeatures({ layers: ["ss-state-fill"] })
            .filter((f) => f.properties.gid === "02").length,
      );
      expect(alaska).toBeGreaterThan(0);
      expect(await statesDrawnTwice(page)).toEqual([]);
      const span = await page.evaluate(() => {
        const b = window.__schoolscapeMap!.getBounds();
        return b.getEast() - b.getWest();
      });
      expect(span).toBeLessThan(360 - 57.6);
    });
  });
}

test("on a first visit, the first-run hint does not cover the data-load notice's Retry", async ({ page }) => {
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  // The fixture build bundles states.json as its own chunk; the real build fetches /data/v1/states.json. A failed
  // chunk import stays failed, so this checks only that Retry takes the click, not that the reload succeeds.
  await page.route(/\/(states\.json|assets\/states-[^/]+\.js)$/, (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Take me there" }).click();
  const notice = page.getByTestId("map-notice");
  await expect(notice).toContainText("Some map data could not be loaded.");
  await expect(page.getByTestId("first-run-hint")).toBeVisible();
  // The hint sat on top of the notice, so a click there landed on the hint instead of Retry.
  await notice.getByRole("button", { name: "Retry" }).click({ timeout: 3000 });
});
