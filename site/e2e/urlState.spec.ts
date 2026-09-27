// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

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

test("loading ?p=broadband-attainment reproduces the story", async ({ page }) => {
  await page.goto("/?p=broadband-attainment");
  await expect(page).toHaveURL(/[?&]l=broadband,college_2yr_plus&p=broadband-attainment$/);
  await expect(page.getByTestId("story-card")).toContainText("Story 2 of 6");
});

test("the story card steps through every story and hands the map back", async ({ page }) => {
  await page.goto("/?p=where-stress-concentrates");
  const card = page.getByTestId("story-card");
  await expect(card).toContainText("Story 1 of 6");
  for (const id of ["broadband-attainment", "education-health-by-region", "west-housing", "one-formula"]) {
    await card.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`p=${id}$`));
  }
  await card.getByRole("button", { name: "Next", exact: true }).click();
  await expect(card).toContainText("Story 6 of 6");
  await card.getByRole("button", { name: "Back", exact: true }).click();
  await expect(card).toContainText("Story 5 of 6");
  await card.getByRole("button", { name: "Story 6: Where a lawmaker would look first" }).click();
  await card.getByRole("button", { name: "Explore on your own" }).click();
  await expect(card).toBeHidden();
  await expect(page).toHaveURL(/[?&]l=health$/);
});

test("the first-run hint shows once", async ({ page }) => {
  await page.goto("/");
  const hint = page.getByTestId("first-run-hint");
  // The hint waits for the primer (SPEC.md 3.15) to close.
  await expect(page.getByTestId("primer")).toBeVisible();
  await expect(hint).toBeHidden();
  await page.getByRole("button", { name: "Take me there" }).click();
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
