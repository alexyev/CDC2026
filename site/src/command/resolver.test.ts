import { describe, expect, it } from "vitest";
import { normalize } from "./resolver";
import { fixtureResolver, refString } from "./testUtils";

const r = fixtureResolver();
const decide = (query: string, kind: Parameters<typeof r.resolve>[0]["kind"] = "unknown", stateHint?: string) =>
  r.decide(r.resolve({ query, kind, ...(stateHint ? { stateHint } : {}) }));

describe("normalize", () => {
  it("lowercases, strips punctuation and diacritics, and unifies word forms", () => {
    expect(normalize("  St. Louis  city ")).toBe("st louis city");
    expect(normalize("Saint Louis")).toBe("st louis");
    expect(normalize("Bayamón Municipio")).toBe("bayamon municipio");
    expect(normalize("Single-parent & poverty")).toBe("single parent and poverty");
  });
});

describe("resolver disambiguation (SPEC.md 14.7)", () => {
  it("offers Springfield in three states as choices", () => {
    const d = decide("Springfield");
    expect(d.kind).toBe("choice");
    if (d.kind !== "choice") return;
    expect(d.candidates.map((c) => r.label(c))).toEqual(["Springfield, IL", "Springfield, MO", "Springfield, MA"]);
    // The Springfield city and the Springfield district in Massachusetts collapse to one chip.
    expect(d.candidates.map((c) => c.kind)).toEqual(["city", "city", "city"]);
  });

  it("settles Springfield with a state hint or a trailing state", () => {
    const hinted = decide("Springfield", "city", "Illinois");
    expect(hinted.kind === "match" && r.label(hinted.candidate)).toBe("Springfield, IL");
    const trailing = decide("Springfield, MO");
    expect(trailing.kind === "match" && r.label(trailing.candidate)).toBe("Springfield, MO");
  });

  it('reads "LA" as Los Angeles County, not Louisiana or the city', () => {
    for (const [q, kind] of [
      ["LA", "unknown"],
      ["LA", "county"],
      ["LA County", "county"],
      ["los angeles", "unknown"],
    ] as const) {
      const d = decide(q, kind);
      expect(d.kind === "match" && refString(d.candidate.ref)).toBe("county:06037");
    }
    const city = decide("Los Angeles", "city");
    expect(city.kind === "match" && refString(city.candidate.ref)).toBe("city:CA:Los Angeles");
  });

  it("finds Cook County with the Illinois hint, in the hint or in the text", () => {
    for (const d of [decide("Cook County", "county", "Illinois"), decide("Cook County Illinois", "county")]) {
      expect(d.kind === "match" && refString(d.candidate.ref)).toBe("county:17031");
    }
  });

  it("finds a school by exact and by partial name", () => {
    for (const q of ["Albertville High School", "albertville high"]) {
      const d = decide(q, "school");
      expect(d.kind === "match" && refString(d.candidate.ref)).toBe("school:010000500871");
    }
  });

  it("tells Hawaii County from the state of Hawaii", () => {
    const county = decide("Hawaii County", "county");
    expect(county.kind === "match" && refString(county.candidate.ref)).toBe("county:15001");
    const state = decide("Hawaii", "state");
    expect(state.kind === "match" && refString(state.candidate.ref)).toBe("state:15");
  });

  it("reads a two-letter code as a state only when asked for a state", () => {
    const d = decide("TX", "state");
    expect(d.kind === "match" && refString(d.candidate.ref)).toBe("state:48");
  });

  it("resolves the Bay Area to a region with a bbox and no id", () => {
    const d = decide("the Bay Area", "unknown", "California");
    expect(d.kind).toBe("match");
    if (d.kind !== "match") return;
    expect(d.candidate.kind).toBe("region");
    expect(d.candidate.ref).toBeUndefined();
    expect(d.candidate.bbox).toBeDefined();
  });

  it("tolerates typos through the fuzzy fallback", () => {
    const d = decide("Mecklenberg County", "county");
    expect(d.kind === "match" && refString(d.candidate.ref)).toBe("county:37119");
  });

  it("returns nothing for places that do not exist", () => {
    expect(decide("Atlantis").kind).toBe("none");
  });

  it("maps cities, districts, and schools to their county", () => {
    expect(r.countyOf(r.lookup({ kind: "school", id: "010000500871" })!)).toBe("01095");
    expect(r.countyOf(r.lookup({ kind: "city", id: "CA:Los Angeles" })!)).toBe("06037");
    expect(r.countyOf(r.lookup({ kind: "county", id: "17031" })!)).toBe("17031");
  });

  it("finds state codes by name or code", () => {
    expect(r.stateCode("Illinois")).toBe("IL");
    expect(r.stateCode("nc")).toBe("NC");
    expect(r.stateCode("Narnia")).toBeUndefined();
  });
});
