import { describe, expect, it } from "vitest";
import schoolsFixture from "@/test/fixtures/schools/all.json";
import type { SchoolsFile } from "@/lib/dataTypes";
import { catalogLayer } from "@/lib/scales";
import { formatValue, ordinal, tooltipModel, tooltipRow, tooltipSummary } from "./pinFormat";

const schools = schoolsFixture as SchoolsFile;
const layer = (id: string) => catalogLayer(id)!;

describe("ordinal", () => {
  it("handles the teens and the usual suffixes", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 63, 100].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "63rd",
      "100th",
    ]);
  });
});

describe("formatValue", () => {
  it("formats by unit", () => {
    expect(formatValue(layer("composite"), 31)).toBe("31");
    expect(formatValue(layer("composite"), 31.26)).toBe("31.3");
    expect(formatValue(layer("gini"), 0.4567)).toBe("0.46");
    expect(formatValue(layer("ctx_hispanic"), 45.25)).toBe("45.3%");
  });
});

describe("tooltip", () => {
  const i = 0;

  it("shows the score with its national percentile", () => {
    const row = tooltipRow(layer("composite"), schools, i, "score");
    const score = schools.values.composite![i]!;
    const pct = schools.values.composite_pct![i]!;
    expect(row.value).toBe(formatValue(layer("composite"), score));
    expect(row.aside).toBe(`${ordinal(pct)} pct`);
    expect(row.countyLevel).toBe(false);
  });

  it("leads with the percentile in percentile display", () => {
    const row = tooltipRow(layer("composite"), schools, i, "pct");
    expect(row.value).toBe(`${ordinal(schools.values.composite_pct![i]!)} pct`);
    expect(row.aside).toMatch(/^score /);
  });

  it("marks county-level layers and layers without a percentile", () => {
    const row = tooltipRow(layer("gini"), schools, i, "pct");
    expect(row.countyLevel).toBe(true);
    expect(row.aside).toBeNull();
  });

  it("says no data for a missing value", () => {
    const j = schools.values.crime!.findIndex((v) => v === null);
    const row = tooltipRow(layer("crime"), schools, j, "score");
    expect(row.value).toBeNull();
  });

  it("names the school, district, city, and state", () => {
    const model = tooltipModel(schools, i, [layer("composite"), layer("education")], "score");
    expect(model.id).toBe(schools.ids[i]);
    expect(model.name).toBe("Albertville High School");
    expect(model.place).toBe(`${schools.district[i]} · Albertville, AL`);
    expect(model.rows.map((r) => r.id)).toEqual(["composite", "education"]);
    expect(tooltipSummary(model)).toContain("Albertville High School");
  });
});
