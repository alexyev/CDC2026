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
