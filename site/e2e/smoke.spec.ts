import { expect, test } from "@playwright/test";

test("shell renders every panel slot without overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("map-container")).toBeVisible();
  for (const slot of ["top-bar", "layer-dock", "insight-panel", "breadcrumb", "legend", "quick-jump"]) {
    await expect(page.getByTestId(`slot-${slot}`)).toBeVisible();
  }
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - window.innerWidth,
    y: document.documentElement.scrollHeight - window.innerHeight,
  }));
  expect(overflow).toEqual({ x: 0, y: 0 });
});

test("glass panels blur the map behind them in the production build", async ({ page }) => {
  await page.goto("/");
  const panel = page.locator(".glass").first();
  await expect(panel).toBeVisible();
  // The CSS build once kept only the -webkit- copy of backdrop-filter, which Chromium ignores, so map labels showed
  // crisply through every panel.
  expect(await panel.evaluate((el) => getComputedStyle(el).backdropFilter)).toContain("blur(");
});
