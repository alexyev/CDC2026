import { describe, expect, it } from "vitest";
import { findPlaceCandidates, MAX_CANDIDATES } from "./candidates";
import { createResolver } from "./resolver";
import { fixtureResolver } from "./testUtils";

const resolver = fixtureResolver();
const labels = (text: string, selected?: Parameters<typeof findPlaceCandidates>[2]) =>
  findPlaceCandidates(text, resolver, selected).map((c) => c.label);

describe("findPlaceCandidates", () => {
  it("finds the places in the headline example with their words and offsets", () => {
    const text = "compare crime and education in LA County and California";
    const [la, ca] = findPlaceCandidates(text, resolver);
    expect(la).toMatchObject({
      label: "Los Angeles County, California",
      kind: "county",
      state: "California",
      text: "LA County",
      ref: { kind: "county", id: "06037" },
    });
    expect(text.slice(la!.start, la!.end)).toBe("LA County");
    expect(ca).toMatchObject({
      label: "California",
      kind: "state",
      text: "California",
      ref: { kind: "state", id: "06" },
    });
    expect(ca!.state).toBeUndefined();
  });

  it("offers every place the same words name, labeled apart", () => {
    expect(labels("Springfield")).toEqual(
      expect.arrayContaining([
        "Springfield, Illinois (city)",
        "Springfield, Missouri (city)",
        "Springfield, Massachusetts (city)",
      ]),
    );
  });

  it("keeps the longest span and drops places found only inside it", () => {
    // "Illinois" only says where Cook County is; "Albertville" is part of the school's name.
    const cook = findPlaceCandidates("percentile view of composite in Cook County Illinois", resolver);
    expect(cook.map((c) => [c.label, c.text])).toEqual([["Cook County, Illinois", "Cook County Illinois"]]);
    expect(labels("Albertville High School")).toEqual(["Albertville High School, Alabama (school)"]);
  });

  it("skips measure words and filler that happen to name places", () => {
    expect(labels("show me poverty and health in Texas")).toEqual(["Texas"]);
    expect(labels("percentile ranks for housing")).toEqual([]);
  });

  it("skips a word only where it is part of a measure phrase", () => {
    const bb: [number, number, number, number] = [-1, -1, 1, 1];
    const tiny = createResolver({
      entries: [
        { k: "state", id: "02", n: "Alaska", st: "AK", bb },
        { k: "state", id: "56", n: "Wyoming", st: "WY", bb },
        { k: "county", id: "56029", n: "Park County", st: "WY", bb },
        { k: "city", id: "SD:Lead", n: "Lead", st: "SD", bb },
      ],
    });
    const found = (text: string) => findPlaceCandidates(text, tiny).map((c) => c.label);
    // "Alaska" is a word of the alias "Alaska Native", but alone it names the state.
    expect(found("show broadband access in Alaska")).toEqual(["Alaska"]);
    expect(found("lead exposure and park access in Alaska")).toEqual(["Alaska"]);
    expect(found("poverty in Park County")).toEqual(["Park County, Wyoming"]);
  });

  it("finds a misspelled place with the strict fuzzy pass, even next to a measure word", () => {
    expect(labels("Masachusetts poverty")).toEqual(["Massachusetts"]);
    expect(labels("tell me a joke")).toEqual([]);
  });

  it("finds a misspelled name that starts with a word naming another place", () => {
    // "north carolna" offered only North, South Carolina: the exact hit on "north" left "carolna" to fuzzy alone.
    // Here "newton" names a school district exactly, and "newton centr" is a typo for the city of Newton Centre.
    expect(labels("crime in newton centr")).toEqual([
      "Newton, Massachusetts (school district)",
      "Newton Centre, Massachusetts (city)",
    ]);
  });

  it("adds the selected place, marked, when the text does not name it", () => {
    const [county] = findPlaceCandidates("what about here", resolver, { kind: "county", id: "37119" });
    expect(county).toMatchObject({ label: "Mecklenburg County, North Carolina", selected: true, text: "", start: -1 });
    const named = findPlaceCandidates("poverty in Texas", resolver, { kind: "state", id: "48" });
    expect(named).toHaveLength(1);
    expect(named[0]).toMatchObject({ label: "Texas", selected: true, text: "Texas" });
  });

  it("caps the list and keeps labels unique", () => {
    const cities =
      "Acton Agawam Apex Bedford Bessemer Birmingham Boaz Bloomfield Bridgeport Cary Charlotte Chicago Clovis";
    const text = `${cities} Compton Coventry Covina Downey Fresno Glendora Hamden Hartford Hilo Honolulu Hoover Houston`
      .split(" ")
      .join(" and ");
    const found = findPlaceCandidates(text, resolver, { kind: "state", id: "48" });
    expect(found).toHaveLength(MAX_CANDIDATES);
    expect(new Set(found.map((c) => c.label)).size).toBe(found.length);
    expect(found.at(-1)?.selected).toBe(true);
  });
});
