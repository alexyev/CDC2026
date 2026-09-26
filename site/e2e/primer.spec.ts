import { expect, test } from "@playwright/test";

// SPEC.md 3.15: the primer before the map on a first visit, the guided tour, and reopening from About.

test("a first visit opens on the primer, which says what stress means", async ({ page }) => {
  await page.goto("/");
  const primer = page.getByTestId("primer");
  await expect(primer).toBeVisible();
  await expect(primer).toContainText("What “stress” means.");
  await expect(primer).toContainText("It is not psychological stress");
  await page.getByRole("button", { name: "Explore the map" }).click();
  await expect(primer).toBeHidden();

  await page.reload();
  await expect(page.getByTestId("slot-top-bar")).toBeVisible();
  await expect(primer).toBeHidden();
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
  await page.addInitScript(() => window.localStorage.setItem("schoolscape.primerSeen.v1", "1"));
  await page.goto("/");
  await expect(page.getByTestId("primer")).toBeHidden();
  await page.getByRole("button", { name: "About and data" }).click();
  await page.getByRole("button", { name: "How to read the map" }).click();
  await expect(page.getByTestId("slot-about-dialog")).toBeHidden();
  await expect(page.getByTestId("primer")).toBeVisible();
});
