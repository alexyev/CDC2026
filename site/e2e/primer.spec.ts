// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { expect, test, type Page } from "@playwright/test";

// SPEC.md 3.15: the primer's landing before the map on every visit to the bare URL, the guided tour, and reopening from About.

test("the bare URL opens on the primer, which says what stress means", async ({ page }) => {
  await page.goto("/");
  const primer = page.getByTestId("primer");
  await expect(primer).toBeVisible();
  await expect(primer).toContainText("Stress measures the conditions in the neighborhood around each school");
  await expect(primer).toContainText("It describes the community, not the school or its students");
  // The guide to reading the map opens on demand, below the actions.
  const guide = page.getByRole("button", { name: "How to read the map" });
  await expect(page.getByRole("heading", { name: "Reading two layers" })).toBeHidden();
  await guide.click();
  await expect(guide).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("heading", { name: "Reading two layers" })).toBeInViewport();
  await page.getByRole("button", { name: "Take me there" }).click();
  await expect(primer).toBeHidden();
  // The live map always carries its camera, so a reload stays on the map.
  await expect(page).toHaveURL(/\?v=3\.6\/38\.5\/-96\.5$/);

  await page.reload();
  await expect(page.getByTestId("slot-top-bar")).toBeVisible();
  await expect(primer).toBeHidden();

  // A later visit to the bare URL is potentially someone new, so it opens on the primer again.
  await page.goto("/");
  await expect(primer).toBeVisible();
});

test("the landing fills the page, then gives way to the map with every panel in place", async ({ page }) => {
  await page.goto("/");
  const primer = page.getByTestId("primer");
  await expect(primer).toBeVisible();
  expect(await primer.boundingBox()).toEqual({ x: 0, y: 0, width: 1440, height: 900 });
  // The map is already there underneath, waiting behind the landing.
  await expect(page.locator("main")).toHaveAttribute("data-landing", "true");
  await expect(page.getByTestId("map-container")).toBeAttached();

  await page.keyboard.press("Escape");
  await expect(primer).toBeHidden();
  await expect(page.locator("main")).not.toHaveAttribute("data-landing");
  await expect(page.getByTestId("slot-layer-dock")).toBeVisible();
  // Once the transition ends, the panels rest exactly at their 16 px margins, and the map is sharp.
  await expect
    .poll(async () => {
      const dock = await page.getByTestId("slot-layer-dock").boundingBox();
      const legend = await page.getByTestId("slot-legend").boundingBox();
      return [dock?.x, dock?.y, legend && 1440 - (legend.x + legend.width), legend && 900 - (legend.y + legend.height)];
    })
    .toEqual([16, 72, 16, 16]);
  await expect
    .poll(() =>
      page.locator(".shell-map").evaluate((el) => [getComputedStyle(el).filter, getComputedStyle(el).transform]),
    )
    .toEqual(["none", "none"]);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the landing crossfades to the map without moving anything", async ({ page }) => {
    await page.goto("/");
    // Nothing waits off its place: the panels only fade.
    await expect(page.locator("aside").first()).toHaveCSS("transform", "none");
    await page.getByRole("button", { name: "Take me there" }).click();
    await expect(page.getByTestId("primer")).toBeHidden();
    await expect(page.locator("aside").first()).toHaveCSS("opacity", "1");
  });
});

test("a shared link goes straight to the map", async ({ page }) => {
  await page.goto("/?l=crime,education");
  await expect(page.getByTestId("slot-top-bar")).toBeVisible();
  await expect(page.getByTestId("primer")).toBeHidden();
});

/** The panels folded into their chips right now, in the order the shell lays them out. */
async function folded(page: Page) {
  return page.locator("[data-minimized]").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.panel));
}

test("the guided tour opens each panel as it explains it and ends on the live map", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Walk me through an example" }).click();
  const tour = page.getByTestId("guided-tour");
  await expect(tour).toContainText("Read one layer");
  // The map opens with only the layer dock showing; every other panel waits as its chip.
  await expect(page.getByTestId("slot-layer-dock")).toBeVisible();
  expect((await folded(page)).sort()).toEqual(["command", "insight", "legend", "search"]);
  await expect(page.getByTestId("tour-spotlight")).toBeVisible();

  const next = tour.getByRole("button", { name: "Next" });
  await next.click();
  await expect(tour).toContainText("Add a second layer");
  await expect(page).toHaveURL(/\?l=composite,gini$/);
  await expect(page.getByTestId("legend-grid")).toBeVisible();
  expect((await folded(page)).sort()).toEqual(["command", "insight", "search"]);

  // Back folds the legend again, and Next brings it back.
  await tour.getByRole("button", { name: "Back" }).click();
  await expect(tour).toContainText("Read one layer");
  await expect(page.getByTestId("slot-legend")).toBeHidden();
  await next.click();

  await next.click();
  await expect(tour).toContainText("Spot the exceptions");
  await next.click();
  await expect(tour).toContainText("Read the correlation");
  await expect(page.getByTestId("slot-insight-panel")).toBeVisible();
  await next.click();
  await expect(tour).toContainText("Your turn");
  await expect(page.getByTestId("slot-command")).toBeVisible();
  await expect(page.getByTestId("slot-search-bar")).toBeVisible();
  await expect(page.getByTestId("tour-spotlight")).toHaveCount(2);
  expect(await folded(page)).toEqual([]);

  await tour.getByRole("button", { name: "Start exploring" }).click();
  await expect(tour).toBeHidden();
  await expect(page).toHaveURL(/\?l=composite,gini$/);
  await expect(page.getByTestId("first-run-hint")).toBeVisible();
  expect(await folded(page)).toEqual([]);
  // The tour's layout was never the viewer's to keep.
  expect(await page.evaluate(() => localStorage.getItem("schoolscape.panels.v1"))).toBeNull();
});

test("ending the tour early brings back the viewer's own layout at once", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("schoolscape.panels.v1", '["search"]'));
  await page.goto("/");
  await page.getByRole("button", { name: "Walk me through an example" }).click();
  const tour = page.getByTestId("guided-tour");
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour).toContainText("Add a second layer");
  expect((await folded(page)).sort()).toEqual(["command", "insight", "search"]);

  await page.keyboard.press("Escape");
  await expect(tour).toBeHidden();
  await expect(page.getByTestId("slot-insight-panel")).toBeVisible();
  expect(await folded(page)).toEqual(["search"]);
  expect(await page.evaluate(() => localStorage.getItem("schoolscape.panels.v1"))).toBe('["search"]');
});

test("Take me there opens the map with every panel showing", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Take me there" }).click();
  await expect(page.getByTestId("slot-legend")).toBeVisible();
  expect(await folded(page)).toEqual([]);
});

test("the About dialog reopens the primer", async ({ page }) => {
  await page.goto("/?v=3.6/38.5/-96.5");
  await expect(page.getByTestId("primer")).toBeHidden();
  await page.getByRole("button", { name: "About and data" }).click();
  await page.getByRole("button", { name: "How to read the map" }).click();
  await expect(page.getByTestId("slot-about-dialog")).toBeHidden();
  await expect(page.getByTestId("primer")).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("data-landing", "true");
});

test("map shortcuts do not act behind the landing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("primer")).toBeVisible();
  await page.getByTestId("primer").focus();
  for (const key of ["f", "2", "Shift+3", "c", "?", "/"]) await page.keyboard.press(key);
  await expect(page.getByTestId("slot-about-dialog")).toHaveCount(0);
  await expect(page.getByTestId("favorites-panel")).toHaveCount(0);
  expect(new URL(page.url()).search).toBe("");
  // Escape still leaves the landing for the map.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("primer")).toBeHidden();
});
