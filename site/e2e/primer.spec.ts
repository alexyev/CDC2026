// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { expect, test } from "@playwright/test";

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

test("the guided tour walks a two-layer view and ends on the live map", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Walk me through an example" }).click();
  const tour = page.getByTestId("guided-tour");
  await expect(tour).toContainText("Read one layer");
  await expect(page.getByTestId("tour-spotlight")).toBeVisible();

  await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour).toContainText("Add a second layer");
  await expect(page).toHaveURL(/\?l=composite,gini$/);
  await expect(page.getByTestId("legend-grid")).toBeVisible();

  for (let i = 0; i < 3; i++) await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour).toContainText("Your turn");
  await tour.getByRole("button", { name: "Start exploring" }).click();
  await expect(tour).toBeHidden();
  await expect(page).toHaveURL(/\?l=composite,gini$/);
  await expect(page.getByTestId("first-run-hint")).toBeVisible();
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
