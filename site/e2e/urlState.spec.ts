import { expect, test } from "@playwright/test";

// SPEC.md 17.3 U8 acceptance: URL state, presets, first-run hint.

test("the back button closes a drawer", async ({ page }) => {
  await page.goto("/?l=health");
  const start = await page.evaluate(() => history.length);
  await page.getByRole("button", { name: "About and data" }).click();
  await expect(page).toHaveURL(/[?&]about=1/);
  await expect(page.getByTestId("slot-about-dialog")).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(start + 1);

  await page.goBack();
  await expect(page.getByTestId("slot-about-dialog")).toBeHidden();
  await expect(page).toHaveURL(/\?l=health$/);
});

test("loading ?p=crime-scale reproduces the preset", async ({ page }) => {
  await page.goto("/?p=crime-scale");
  await expect(page).toHaveURL(/\?l=crime,education&p=crime-scale$/);
});

test("the first-run hint shows once", async ({ page }) => {
  await page.goto("/");
  const hint = page.getByTestId("first-run-hint");
  // The hint waits for the primer (SPEC.md 3.15) to close.
  await expect(page.getByTestId("primer")).toBeVisible();
  await expect(hint).toBeHidden();
  await page.getByRole("button", { name: "Explore the map" }).click();
  await expect(hint).toHaveText(
    /Scroll to zoom\.\s*Click a state to dive in\.\s*Pick two layers to see how they relate\./,
  );
  await page.mouse.wheel(0, 200);
  await expect(hint).toBeHidden();
  await page.reload();
  await expect(page.getByTestId("slot-top-bar")).toBeVisible();
  await expect(hint).toBeHidden();
  await expect(page.getByTestId("primer")).toBeHidden();
});

test("a shared link hides the first-run hint", async ({ page }) => {
  await page.goto("/?l=crime,education");
  await expect(page.getByTestId("slot-top-bar")).toBeVisible();
  await expect(page.getByTestId("first-run-hint")).toBeHidden();
});
