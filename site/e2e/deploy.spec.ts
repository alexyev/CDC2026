// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { expect, test, type Page } from "@playwright/test";

// SPEC.md 3.15: a tab opened before a deploy picks up the new build the next time the landing shows, so the guide it
// walks through is the deployed one. Runs against the production build (vite preview), where index.html names built
// files.

/** Marks the running page, so a reload shows as the mark being gone. */
async function markPage(page: Page) {
  await page.evaluate(() => ((window as unknown as { loadedBefore?: boolean }).loadedBefore = true));
}

/** Whether the mark is still there; undefined while a reload is swapping the page, so a poll simply asks again. */
async function marked(page: Page) {
  return page
    .evaluate(() => (window as unknown as { loadedBefore?: boolean }).loadedBefore === true)
    .catch((error: Error) => {
      if (/Execution context was destroyed/.test(error.message)) return undefined;
      throw error;
    });
}

/** A deploy lands: the page's own check for the deployed index.html now finds a build that names other files. */
async function deploy(page: Page) {
  await page.route("/", async (route) => {
    if (route.request().resourceType() !== "fetch") return route.continue();
    const response = await route.fetch();
    const body = (await response.text()).replace(/\/assets\/index-[^"]+\.js/, "/assets/index-next.js");
    await route.fulfill({ response, body });
  });
}

test("an open tab reloads into a new deploy when the landing reopens, and opens on the landing", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("schoolscape.panels.v1", '["insight"]'));
  await page.goto("/?l=crime,education");
  await expect(page.getByTestId("slot-top-bar")).toBeVisible();
  await markPage(page);

  // With nothing deployed, reopening the landing is the same page.
  await page.getByTestId("brand").click();
  await expect(page.getByTestId("primer")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("primer")).toBeHidden();
  expect(await marked(page)).toBe(true);

  await deploy(page);
  await page.getByTestId("brand").click();
  await expect.poll(() => marked(page)).toBe(false);
  // The reload opens on the landing over the same view, and the walkthrough runs from there.
  await expect(page.getByTestId("primer")).toBeVisible();
  await expect(page).toHaveURL(/\?l=crime,education/);
  // Still told of a newer build after the reload (a CDN serving two builds), it does not reload again.
  await markPage(page);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(500);
  expect(await marked(page)).toBe(true);
  await page.getByRole("button", { name: "Walk me through an example" }).click();
  await expect(page.getByTestId("guided-tour")).toContainText("Read one layer");
  await expect(page.getByTestId("slot-insight-panel")).toBeHidden();

  // A later reload of the map stays on the map.
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByTestId("slot-top-bar")).toBeVisible();
  await expect(page.getByTestId("primer")).toBeHidden();
});

test("a new deploy found while the landing shows reloads it when the window regains focus", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("primer")).toBeVisible();
  await markPage(page);
  await deploy(page);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => marked(page)).toBe(false);
  await expect(page.getByTestId("primer")).toBeVisible();
});

test("a new deploy never reloads the live map or a running tour", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Walk me through an example" }).click();
  await expect(page.getByTestId("guided-tour")).toBeVisible();
  await markPage(page);
  await deploy(page);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByTestId("guided-tour").getByRole("button", { name: "Next" }).click();
  await expect(page.getByTestId("guided-tour")).toContainText("Add a second layer");
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(500);
  expect(await marked(page)).toBe(true);
});
