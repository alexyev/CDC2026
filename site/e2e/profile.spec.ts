// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { expect, test, type Page } from "@playwright/test";
import type { Map as MapLibreMap } from "maplibre-gl";

declare global {
  interface Window {
    /** Exposed by MapCanvas in dev and fixture builds. */
    __schoolscapeMap?: MapLibreMap;
  }
}

// SPEC.md 3.5 and 3.10: the school profile drawer opens from every entry point, and closes by its X, Escape, and a
// click on the map away from the pins, with `s` leaving the URL each time. Albertville High School is the Ask the
// map example that once opened a drawer nothing could close.

const ALBERTVILLE = "010000500871";
const ALBERTVILLE_LON_LAT: [number, number] = [-86.2049, 34.2622];

async function openMap(page: Page, search = "") {
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  // The live map's own address (SPEC.md 3.15): a bare URL would open on the primer.
  await page.goto(`/${search || "?v=3.6/38.5/-96.5"}`);
  await page.waitForFunction(() => performance.getEntriesByName("schoolscape:first-paint").length > 0);
}

function drawer(page: Page) {
  return page.getByTestId("profile-drawer");
}

async function expectOpen(page: Page) {
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).getByRole("heading", { name: "Albertville High School" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`[?&]s=${ALBERTVILLE}`));
}

async function expectClosed(page: Page) {
  await expect(drawer(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]s=/);
}

async function mapIdle(page: Page) {
  await page.waitForFunction(() => {
    const m = window.__schoolscapeMap;
    return !!m && !m.isMoving() && m.loaded();
  });
}

async function askTheMap(page: Page, text: string) {
  const input = page.getByRole("textbox", { name: "Ask the map" });
  await input.fill(text);
  await input.press("Enter");
  await expectOpen(page);
  await mapIdle(page);
}

/** A point on the map clear of the floating panels, the drawer, and the fixture's Alabama pins around the school. */
async function emptyMapPoint(page: Page) {
  return page.evaluate(() => {
    const c = window.__schoolscapeMap!.project([-86.2049, 34.2622]);
    return { x: c.x - 180, y: c.y + 160 };
  });
}

test("Ask the map opens Albertville High School, and its X closes it", async ({ page }) => {
  await openMap(page);
  await askTheMap(page, "Albertville High School");
  await drawer(page).getByRole("button", { name: "Close profile" }).click();
  await expectClosed(page);
  // The school stays selected; only the drawer closed.
  await expect(page).toHaveURL(new RegExp(`[?&]sel=school:${ALBERTVILLE}`));
});

test("Escape closes the drawer once the Ask the map input lets go of it", async ({ page }) => {
  await openMap(page);
  await askTheMap(page, "Albertville High School");
  // The first Escape clears the command, the second leaves the input, the third reaches the drawer.
  const input = page.getByRole("textbox", { name: "Ask the map" });
  await input.press("Escape");
  await input.press("Escape");
  await expect(input).not.toBeFocused();
  await expectOpen(page);
  await page.keyboard.press("Escape");
  await expectClosed(page);
});

test("a click on the map away from the pins closes the drawer", async ({ page }) => {
  await openMap(page);
  await askTheMap(page, "Albertville High School");
  const point = await emptyMapPoint(page);
  await page.mouse.click(point.x, point.y);
  await expectClosed(page);
});

test("the typewriter example accepted with Tab opens the drawer, which then closes", async ({ page }) => {
  // The typewriter reaches the Albertville example about 23 s in.
  test.setTimeout(90_000);
  await openMap(page);
  await expect(page.getByTestId("command-typewriter")).toContainText("Albertville", { timeout: 60_000 });
  const input = page.getByRole("textbox", { name: "Ask the map" });
  await input.focus();
  await input.press("Tab");
  await expect(input).toHaveValue("Albertville High School");
  await input.press("Enter");
  await expectOpen(page);
  await drawer(page).getByRole("button", { name: "Close profile" }).click();
  await expectClosed(page);
});

test("choosing the school in search opens the drawer, which then closes", async ({ page }) => {
  await openMap(page);
  const search = page.getByRole("combobox", { name: "Search places and schools" });
  await search.click();
  await search.pressSequentially("Albertville High");
  await expect(page.getByRole("option", { name: /Albertville High School/ }).first()).toBeVisible();
  await search.press("Enter");
  await expectOpen(page);
  await page.keyboard.press("Escape");
  await expectClosed(page);
});

test("clicking the school's pin opens the drawer, which then closes", async ({ page }) => {
  await openMap(page, `?v=12/${ALBERTVILLE_LON_LAT[1]}/${ALBERTVILLE_LON_LAT[0]}`);
  await mapIdle(page);
  const pin = await page.evaluate((lonLat) => {
    const p = window.__schoolscapeMap!.project(lonLat);
    return { x: p.x, y: p.y };
  }, ALBERTVILLE_LON_LAT);
  // The pins layer loads once the first paint is on screen and the browser is idle; keep nudging the pointer until the pin answers with its card.
  let nudge = 0;
  await expect
    .poll(
      async () => {
        await page.mouse.move(pin.x + (nudge++ % 2), pin.y);
        return page
          .getByTestId("pin-tooltip")
          .textContent({ timeout: 250 })
          .catch(() => "");
      },
      { timeout: 20_000 },
    )
    .toContain("Albertville High School");
  await page.mouse.click(pin.x, pin.y);
  await expectOpen(page);
  const point = await emptyMapPoint(page);
  await page.mouse.click(point.x, point.y);
  await expectClosed(page);
});

test("a shared profile link opens the drawer, and Back reopens it after closing", async ({ page }) => {
  await openMap(page, `?sel=school:${ALBERTVILLE}&s=${ALBERTVILLE}`);
  await expectOpen(page);
  await drawer(page).getByRole("button", { name: "Close profile" }).click();
  await expectClosed(page);
  await page.goBack();
  await expectOpen(page);
});

test("from the landing, Ask the map opens a drawer that closes", async ({ page }) => {
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Take me there" }).click();
  await expect(page.getByTestId("primer")).toBeHidden();
  await askTheMap(page, "Albertville High School");
  await drawer(page).getByRole("button", { name: "Close profile" }).click();
  await expectClosed(page);
});
