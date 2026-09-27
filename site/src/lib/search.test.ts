// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { describe, expect, it } from "vitest";
import gazetteerJson from "@/test/fixtures/gazetteer.json";
import schoolsJson from "@/test/fixtures/schools/all.json";
import type { GazetteerFile, SchoolsFile } from "./dataTypes";
import { MAP_PADDING } from "@/map/levels";
import { MAX_RESULTS, SearchIndex, Tier, cameraForBBox, groupHits, highlightRanges, normalize } from "./search";

const gazetteer = gazetteerJson as unknown as GazetteerFile;
const schools = schoolsJson as unknown as SchoolsFile;
const index = new SearchIndex(gazetteer, schools);

const ids = (q: string, opts?: { fuzzy?: boolean }) => index.search(q, opts).map((h) => `${h.doc.kind}:${h.doc.id}`);

describe("normalize", () => {
  it("folds case, accents, and punctuation", () => {
    expect(normalize("  Doña Ana County ")).toBe("dona ana county");
    expect(normalize("St. Mary's  High-School")).toBe("st marys high school");
    expect(normalize("Arts & Sciences")).toBe("arts and sciences");
  });
});

describe("SearchIndex (SPEC.md 3.11 acceptance)", () => {
  it('returns Los Angeles County first for "los angeles"', () => {
    const hits = index.search("los angeles");
    expect(hits[0].doc).toMatchObject({ kind: "county", id: "06037", name: "Los Angeles County" });
    // The city and the district come right after, in their own groups.
    expect(ids("los angeles")).toContain("city:CA:Los Angeles");
    expect(ids("los angeles")).toContain("district:CA:Los Angeles Unified");
  });

  it('returns the school for "albertville high"', () => {
    const [first] = index.search("albertville high");
    expect(first.doc).toMatchObject({ kind: "school", id: "010000500871", name: "Albertville High School" });
    expect(first.doc.lonLat).toEqual([schools.lon[0], schools.lat[0]]);
    expect(first.doc.sub).toBe("Albertville, AL · Albertville City");
  });

  it("finds the school through typos with the fuzzy tier", () => {
    const hits = index.search("albertvile hgh");
    expect(hits.map((h) => h.doc.id)).toContain("010000500871");
    expect(hits.find((h) => h.doc.id === "010000500871")?.tier).toBe(Tier.fuzzy);
    expect(index.search("albertvile hgh", { fuzzy: false })).toEqual([]);
  });

  it("puts the bigger of same-name places first: most schools, or the largest bbox before schools load", () => {
    const cities = (idx: SearchIndex) =>
      idx
        .search("springfield")
        .filter((h) => h.doc.kind === "city")
        .map((h) => h.doc.st);
    // Fixture schools: 4 in Springfield, IL and MO each, 2 in MA; equal counts fall back to the state name.
    expect(cities(index)).toEqual(["IL", "MO", "MA"]);
    // Gazetteer only: IL has the largest bbox, then MO, then MA.
    expect(cities(new SearchIndex(gazetteer))).toEqual(["IL", "MO", "MA"]);
  });

  it("uses place context after a name", () => {
    expect(ids("springfield il")[0]).toBe("city:IL:Springfield");
    expect(ids("springfield, massachusetts")[0]).toBe("city:MA:Springfield");
    expect(index.search("springfield il")[0].tier).toBe(Tier.exactInPlace);
  });

  it("ranks states first on exact names and USPS codes", () => {
    expect(ids("california")[0]).toBe("state:06");
    expect(ids("CA")[0]).toBe("state:06");
    expect(ids("texas")[0]).toBe("state:48");
  });

  it("matches word prefixes in any order", () => {
    expect(ids("high albertville")).toContain("school:010000500871");
    expect(ids("los ang")[0]).toBe("county:06037");
  });

  it("returns at most eight hits, grouped by kind", () => {
    for (const q of ["high", "s", "county", "springfield"]) {
      const hits = index.search(q);
      expect(hits.length).toBeLessThanOrEqual(MAX_RESULTS);
      const kinds = hits.map((h) => h.doc.kind);
      // Each kind's hits are contiguous.
      const order = groupHits(hits).map((g) => g.kind);
      expect(kinds.filter((k, i) => k !== kinds[i - 1])).toEqual(order);
    }
    expect(index.search("high")).toHaveLength(MAX_RESULTS);
  });

  it("keeps room for other kinds when one kind has many matches", () => {
    const counties = Array.from({ length: 12 }, (_, i) => ({
      k: "county" as const,
      id: String(1000 + i),
      n: "Lincoln County",
      st: `S${i}`,
      bb: [0, 0, 1, 1] as [number, number, number, number],
    }));
    const lincoln = new SearchIndex({
      entries: [...counties, { k: "city", id: "NE:Lincoln", n: "Lincoln", st: "NE", bb: [0, 0, 1, 1] }],
    });
    const hits = lincoln.search("lincoln");
    expect(hits).toHaveLength(MAX_RESULTS);
    expect(hits.filter((h) => h.doc.kind === "county")).toHaveLength(MAX_RESULTS - 1);
    expect(hits.map((h) => h.doc.id)).toContain("NE:Lincoln");
    // Counties rank first, then the city fills the capped slot.
    expect(groupHits(hits).map((g) => g.kind)).toEqual(["county", "city"]);
  });

  it("returns nothing for empty or unmatched queries", () => {
    expect(index.search("")).toEqual([]);
    expect(index.search("   ")).toEqual([]);
    expect(index.search("zzqxv")).toEqual([]);
  });

  it("searches the gazetteer alone before schools load", () => {
    const partial = new SearchIndex(gazetteer);
    expect(partial.hasSchools).toBe(false);
    expect(partial.search("albertville high", { fuzzy: false })).toEqual([]);
    expect(partial.search("los angeles")[0].doc.id).toBe("06037");
    expect(index.hasSchools).toBe(true);
    expect(index.size).toBe(gazetteer.entries.length + schools.ids.length);
  });
});

describe("highlightRanges", () => {
  it("marks word-start matches in the display name", () => {
    expect(highlightRanges("Los Angeles County", ["los", "angeles"])).toEqual([
      [0, 3],
      [4, 11],
    ]);
    expect(highlightRanges("Albertville High School", ["albert"])).toEqual([[0, 6]]);
  });

  it("maps through accents and punctuation", () => {
    expect(highlightRanges("Doña Ana County", ["dona"])).toEqual([[0, 4]]);
    expect(highlightRanges("St. Mary's High", ["marys"])).toEqual([[4, 10]]);
    expect(highlightRanges("Anything", [])).toEqual([]);
  });

  it("gives every hit its highlight", () => {
    const [hit] = index.search("albertville high");
    expect(hit.ranges).toEqual([
      [0, 11],
      [12, 16],
    ]);
  });
});

describe("cameraForBBox", () => {
  const viewport = { width: 1440, height: 900 };

  it("fits the width-limited contiguous-US bounds like MapLibre's 512 px world", () => {
    const cam = cameraForBBox([-125, 24, -66.5, 49.5], viewport, MAP_PADDING);
    const availableWidth = 1440 - MAP_PADDING.left - MAP_PADDING.right;
    expect(cam.zoom).toBeCloseTo(Math.log2(availableWidth / ((58.5 / 360) * 512)), 6);
    expect(cam.lat).toBeGreaterThan(30);
    expect(cam.lat).toBeLessThan(45);
  });

  it("shifts the center so the box lands between the panels", () => {
    const bbox: [number, number, number, number] = [-118.9, 32.8, -117.6, 34.8];
    const padded = cameraForBBox(bbox, viewport, MAP_PADDING);
    const bare = cameraForBBox(bbox, viewport, { top: 0, right: 0, bottom: 0, left: 0 });
    // The right panel is wider than the left one, so the map center moves east of the box center.
    expect(padded.lon).toBeGreaterThan((bbox[0] + bbox[2]) / 2);
    expect(padded.zoom).toBeLessThan(bare.zoom);
    expect(bare.lon).toBeCloseTo((bbox[0] + bbox[2]) / 2, 6);
  });

  it("caps the zoom for a single-point box", () => {
    const cam = cameraForBBox([-86.2, 34.26, -86.2, 34.26], viewport, MAP_PADDING, 12);
    expect(cam.zoom).toBe(12);
  });
});
