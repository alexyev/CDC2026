// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { describe, expect, it } from "vitest";
import countiesFixture from "@/test/fixtures/counties.json";
import schoolsFixture from "@/test/fixtures/schools/all.json";
import statesFixture from "@/test/fixtures/states.json";
import { CT_NOTE } from "@/components/profileData";
import type { CountiesFile, SchoolsFile, StatesFile } from "@/lib/dataTypes";
import {
  areaCard,
  cardLayers,
  cardSummary,
  OVERVIEW_LAYERS,
  pctLabel,
  percentileAmong,
  placeCard,
  schoolCard,
} from "./overview";

const states = statesFixture as unknown as StatesFile;
const counties = countiesFixture as unknown as CountiesFile;
const schools = schoolsFixture as unknown as SchoolsFile;
const src = { states, counties };
const score = { display: "score" as const };
const schoolAt = (id: string) => schools.ids.indexOf(id);

describe("cardLayers", () => {
  it("leads with the active layer, then the rest of the composite and five domains", () => {
    expect(cardLayers(["composite"]).map((r) => [r.layer.id, r.slot])).toEqual([
      ["composite", "A"],
      ["economic", null],
      ["education", null],
      ["health", null],
      ["housing", null],
      ["crime", null],
    ]);
  });

  it("puts two active layers first in A, B order and keeps indicators and context", () => {
    expect(cardLayers(["crime", "poverty"]).map((r) => [r.layer.id, r.slot])).toEqual([
      ["crime", "A"],
      ["poverty", "B"],
      ["composite", null],
      ["economic", null],
      ["education", null],
      ["health", null],
      ["housing", null],
    ]);
  });

  it("skips unknown ids and lists the overview with no active layer", () => {
    expect(cardLayers(["nope"]).map((r) => r.layer.id)).toEqual([...OVERVIEW_LAYERS]);
    expect(cardLayers([]).every((r) => r.slot === null)).toBe(true);
  });
});

describe("percentileAmong", () => {
  const means = [10, 20, 30, 40, null];

  it("ranks among the non-null values with ties at their midpoint", () => {
    expect(percentileAmong(means, 40)).toBe(87.5);
    expect(percentileAmong(means, 10)).toBe(12.5);
    expect(percentileAmong([5, 5, 5, 5], 5)).toBe(50);
    expect(percentileAmong(means, 25)).toBe(50);
  });

  it("is null for a column with no values", () => {
    expect(percentileAmong([null, null], 3)).toBeNull();
  });

  it("labels percentiles as ordinals", () => {
    expect(pctLabel(87.5)).toBe("88th");
    expect(pctLabel(1)).toBe("1st");
    expect(pctLabel(null)).toBe("–");
  });
});

describe("areaCard", () => {
  it("summarizes a state against all states", () => {
    const card = areaCard("state", "48", ["composite"], src, score)!;
    expect(card.title).toBe("Texas");
    expect(card.subtitle).toBe("United States");
    expect(card.count).toBe("1,918 schools");
    expect(card.pctHeading).toBe("vs. all states");
    expect(card.rows.map((r) => r.id)).toEqual([...OVERVIEW_LAYERS]);
    const composite = card.rows[0]!;
    expect(composite.slot).toBe("A");
    expect(composite.value).toBe(states.measures.composite!.mean[1]!.toFixed(1));
    expect(composite.pct).toBe(percentileAmong(states.measures.composite!.mean, states.measures.composite!.mean[1]!));
    expect(card.rows.find((r) => r.id === "crime")?.countyLevel).toBe(true);
    expect(card.flags).toContain("County-level measures are school-weighted means of county values");
    expect(card.hint).toBe("Click to zoom into Texas");
    expect(card.lead).toBe("value");
  });

  it("names the county's state and ranks it among US counties", () => {
    const card = areaCard("county", "06037", ["education", "crime"], src, { display: "pct" })!;
    expect(card.title).toBe("Los Angeles County");
    expect(card.subtitle).toBe("California");
    expect(card.count).toBe("509 schools");
    expect(card.pctHeading).toBe("vs. US counties");
    expect(card.rows.slice(0, 2).map((r) => [r.id, r.slot])).toEqual([
      ["education", "A"],
      ["crime", "B"],
    ]);
    expect(card.flags).toEqual([]);
    expect(card.lead).toBe("pct");
    expect(card.hint).toBe("Click to zoom in to its schools");
  });

  it("explains missing crime and carries the Connecticut note", () => {
    const card = areaCard("county", "09110", ["composite"], src, score)!;
    const crime = card.rows.find((r) => r.id === "crime")!;
    expect(crime.value).toBeNull();
    expect(crime.pct).toBeNull();
    expect(crime.note).toBe("ODIS has no crime inputs for this state");
    expect(card.flags).toContain(CT_NOTE);
    expect(areaCard("county", "72127", [], src, score)!.rows.find((r) => r.id === "crime")?.note).toBe(
      "ODIS has no crime inputs for this state",
    );
  });

  it("flags few schools once for the whole area and no schools for an empty county", () => {
    const thin = areaCard("county", "48007", ["composite"], src, score)!;
    expect(thin.count).toBe("1 school");
    expect(thin.flags).toEqual(["Few schools (n = 1)"]);
    expect(thin.rows.every((r) => r.note === undefined)).toBe(true);

    const empty = areaCard("county", "48301", ["composite"], src, score)!;
    expect(empty.flags).toEqual(["No ODIS high schools in this county"]);
    // An empty county has no schools to zoom in to.
    expect(empty.hint).toBe("Click to zoom in");
    expect(empty.rows.every((r) => r.value === null && r.note === undefined)).toBe(true);
  });

  it("says a click pins the area while compare is armed", () => {
    expect(areaCard("state", "06", [], src, { display: "score", compareArmed: true })!.hint).toBe(
      "Click to pin for compare",
    );
  });

  it("is null for an id that is not loaded", () => {
    expect(areaCard("county", "99999", [], src, score)).toBeNull();
    expect(areaCard("county", "06037", [], { states }, score)).toBeNull();
  });
});

describe("schoolCard", () => {
  it("names the school and gives each score with its national percentile", () => {
    const card = schoolCard(schools, 0, ["composite"], score);
    expect(card.kind).toBe("school");
    expect(card.id).toBe(schools.ids[0]);
    expect(card.title).toBe("Albertville High School");
    expect(card.subtitle).toBe(`${schools.district[0]} · Albertville, AL`);
    expect(card.count).toBe("");
    expect(card.rows.map((r) => r.id)).toEqual([...OVERVIEW_LAYERS]);
    const composite = card.rows[0]!;
    expect(composite.value).toBe(String(schools.values.composite![0]));
    expect(composite.pct).toBe(schools.values.composite_pct![0]);
    expect(card.flags).toEqual([]);
    expect(card.hint).toBe("Click pin for full profile");
  });

  it("gives indicators without a percentile no percentile", () => {
    const row = schoolCard(schools, 0, ["poverty"], score).rows[0]!;
    expect(row.slot).toBe("A");
    expect(row.pct).toBeNull();
  });

  it("carries the Connecticut note, the approx badge, and the crime reason", () => {
    const i = schoolAt("090000201137");
    const card = schoolCard(schools, i, ["lead_risk"], score);
    expect(card.flags).toEqual([CT_NOTE]);
    expect(card.rows[0]).toMatchObject({ id: "lead_risk", badge: "approx" });
    expect(card.rows.find((r) => r.id === "crime")).toMatchObject({
      value: null,
      note: "ODIS has no crime inputs for this state",
    });
  });

  it("explains lead risk missing for about half of schools", () => {
    const row = schoolCard(schools, schoolAt("720003000364"), ["lead_risk"], score).rows[0]!;
    expect(row.value).toBeNull();
    expect(row.note).toBe("Not available for about half of schools nationally");
  });

  it("summarizes for the live region", () => {
    const summary = cardSummary(schoolCard(schools, 0, ["composite"], score));
    expect(summary).toContain("Albertville High School");
    expect(summary).toMatch(/Composite Score \d+ \(\d+(st|nd|rd|th) percentile\)/);
  });
});

describe("placeCard", () => {
  const W = 1440;
  const H = 900;
  const covers = (x: number, y: number, p: { left: number; top: number }, w: number, h: number) =>
    x >= p.left && x <= p.left + w && y >= p.top && y <= p.top + h;

  it("opens right and below the anchor when it fits", () => {
    expect(placeCard(600, 400, 320, 280, W, H)).toEqual({ left: 614, top: 414 });
  });

  it("flips left near the right edge and above near the bottom", () => {
    expect(placeCard(1400, 850, 320, 280, W, H)).toEqual({ left: 1066, top: 556 });
  });

  it("centers on the anchor when neither above nor below fits, still beside it", () => {
    const p = placeCard(100, 450, 320, 800, W, H);
    expect(p).toEqual({ left: 114, top: 50 });
    expect(covers(100, 450, p, 320, 800)).toBe(false);
  });

  it("never covers the anchor or leaves the box anywhere on screen", () => {
    for (let x = 0; x <= W; x += 60) {
      for (let y = 0; y <= H; y += 60) {
        const p = placeCard(x, y, 320, 300, W, H);
        expect(covers(x, y, p, 320, 300)).toBe(false);
        expect(p.left).toBeGreaterThanOrEqual(8);
        expect(p.top).toBeGreaterThanOrEqual(8);
        expect(p.left + 320).toBeLessThanOrEqual(W - 8);
        expect(p.top + 300).toBeLessThanOrEqual(H - 8);
      }
    }
  });
});
