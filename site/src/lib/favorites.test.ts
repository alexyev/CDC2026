import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schoolsFixture from "@/test/fixtures/schools/all.json";
import type { SchoolsFile } from "./dataTypes";
import {
  cleanIds,
  compareGroups,
  favoriteSchools,
  FAVORITES_KEY,
  formatValue,
  highestStress,
  layerDef,
  mergeFavorites,
  ordinal,
  parseStored,
  toggleId,
} from "./favorites";

const schools = schoolsFixture as SchoolsFile;
const AL = "010000500871";
const CA = "060000103278";
const CT = "090000201136";
const HI = "150003000007";

/** A fresh page load: new store and favorites modules over the current localStorage, like a reload. */
async function reload() {
  vi.resetModules();
  const { useStore } = await import("@/store/useStore");
  await import("./favorites");
  const { decodeView } = await import("./urlCodec");
  return { useStore, decodeView };
}

describe("favorites storage and merge helpers", () => {
  it("keeps valid NCESSCH ids once, in order", () => {
    expect(cleanIds([AL, "junk", CA, AL, 42, null, "06000010327"])).toEqual([AL, CA]);
  });

  it("parses stored favorites defensively", () => {
    expect(parseStored(JSON.stringify([AL, CA]))).toEqual([AL, CA]);
    expect(parseStored(null)).toEqual([]);
    expect(parseStored("{not json")).toEqual([]);
    expect(parseStored(JSON.stringify({ ids: [AL] }))).toEqual([]);
  });

  it("merges URL ids after local favorites without duplicates", () => {
    expect(mergeFavorites([AL, CA], [CA, CT, "bad"])).toEqual([AL, CA, CT]);
    expect(mergeFavorites([], [HI])).toEqual([HI]);
  });

  it("toggles an id at the end of the star order", () => {
    expect(toggleId([AL], CA)).toEqual([AL, CA]);
    expect(toggleId([AL, CA], AL)).toEqual([CA]);
  });
});

describe("favorites in the store", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("persists a star across reloads", async () => {
    let { useStore } = await reload();
    useStore.getState().toggleFavorite(AL);
    useStore.getState().toggleFavorite(CA);
    expect(JSON.parse(localStorage.getItem(FAVORITES_KEY)!)).toEqual([AL, CA]);

    ({ useStore } = await reload());
    expect(useStore.getState().favorites).toEqual([AL, CA]);

    useStore.getState().toggleFavorite(AL);
    ({ useStore } = await reload());
    expect(useStore.getState().favorites).toEqual([CA]);
  });

  it("ignores ids that are not NCESSCH", async () => {
    const { useStore } = await reload();
    useStore.getState().toggleFavorite("not-a-school");
    expect(useStore.getState().favorites).toEqual([]);
  });

  it("merges `fav` from the URL into local favorites on load", async () => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([AL, CA]));
    const { useStore, decodeView } = await reload();
    // main.tsx decodes the URL into the store after the app modules load.
    useStore.getState().setView(decodeView(`?fav=${CA},${CT}`));
    expect(useStore.getState().favorites).toEqual([AL, CA, CT]);
    expect(JSON.parse(localStorage.getItem(FAVORITES_KEY)!)).toEqual([AL, CA, CT]);
  });

  it("merges when the URL was decoded before favorites installed", async () => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([AL]));
    vi.resetModules();
    const { useStore } = await import("@/store/useStore");
    const { decodeView } = await import("./urlCodec");
    useStore.getState().setView(decodeView(`?fav=${HI}`));
    await import("./favorites");
    expect(useStore.getState().favorites).toEqual([AL, HI]);
  });

  it("keeps favorites when a view without `fav` replaces the state", async () => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([AL]));
    const { useStore, decodeView } = await reload();
    useStore.getState().setView(decodeView("?l=crime,education"));
    expect(useStore.getState().favorites).toEqual([AL]);
    expect(useStore.getState().layers).toEqual(["crime", "education"]);
  });

  it("follows changes made in another tab", async () => {
    const { useStore } = await reload();
    useStore.getState().toggleFavorite(AL);
    const newValue = JSON.stringify([CA]);
    localStorage.setItem(FAVORITES_KEY, newValue);
    window.dispatchEvent(new StorageEvent("storage", { key: FAVORITES_KEY, newValue, storageArea: localStorage }));
    expect(useStore.getState().favorites).toEqual([CA]);
  });

  it("drives the panel and show-only-starred flags", async () => {
    const { useStore } = await reload();
    useStore.getState().setFavoritesPanel(true);
    useStore.getState().setShowOnlyStarred(true);
    expect(useStore.getState().favoritesPanel).toBe(true);
    expect(useStore.getState().showOnlyStarred).toBe(true);
  });
});

describe("compare table model", () => {
  const rows = favoriteSchools(schools, [AL, CA, CT, HI, "999999999999"]);

  it("reads every value of a favorite from the schools file and marks unknown ids", () => {
    expect(rows[0]).toMatchObject({ id: AL, found: true, name: "Albertville High School", st: "AL" });
    expect(rows[0]!.values.composite).toBe(31);
    expect(rows[0]!.values.composite_pct).toBe(63);
    expect(rows[4]).toMatchObject({ id: "999999999999", found: false });
  });

  it("groups rows as scores, indicators by domain, and context", () => {
    const groups = compareGroups(rows);
    expect(groups.map((g) => [g.id, g.rows.length])).toEqual([
      ["score", 7],
      ["indicator-economic", 4],
      ["indicator-education", 6],
      ["indicator-health", 5],
      ["indicator-housing", 3],
      ["indicator-crime", 2],
      ["context", 8],
    ]);
    const composite = groups[0]!.rows[0]!;
    expect(composite.values).toEqual([31, 26, 39, 24, null]);
    expect(composite.pcts).toHaveLength(5);
    expect(composite.highest).toEqual([2]);
    expect(groups[0]!.rows.find((r) => r.layer.id === "gini")!.pcts).toBeUndefined();
  });

  it("tints the highest-stress cells only where the row has a clear maximum", () => {
    const stress = layerDef("crime");
    expect(highestStress(stress, [50, 28, null, 12])).toEqual([0]);
    expect(highestStress(stress, [50, 50, 12])).toEqual([0, 1]);
    expect(highestStress(stress, [50, 50])).toEqual([]);
    expect(highestStress(stress, [50, null])).toEqual([]);
    expect(highestStress(layerDef("ctx_hispanic"), [10, 80])).toEqual([]);
  });

  it("formats values by unit", () => {
    expect(formatValue(layerDef("composite"), 31)).toBe("31");
    expect(formatValue(layerDef("gini"), 0.46)).toBe("0.46");
    expect(formatValue(layerDef("ctx_hispanic"), 27)).toBe("27%");
    expect(formatValue(layerDef("poverty"), 12.34)).toBe("12.3");
    expect(formatValue(layerDef("composite"), null)).toBe("No data");
  });

  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 63, 100].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "63rd",
      "100th",
    ]);
  });
});
