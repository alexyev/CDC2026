// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { describe, expect, it } from "vitest";
import type { CountiesFile, StatesFile } from "@/lib/dataTypes";
import { insightScope, unitLevel } from "./insightScope";

const STATES = { ids: ["17", "48"], names: ["Illinois", "Texas"], usps: ["IL", "TX"] } as StatesFile;
const COUNTIES = { ids: ["17031", "48201"], names: ["Cook County", "Harris County"], st: ["17", "48"] } as CountiesFile;

describe("insightScope (SPEC.md 3.7)", () => {
  it("a selected state is the scope, named as the state", () => {
    expect(insightScope({ kind: "state", id: "48" }, STATES, COUNTIES)).toEqual({
      kind: "state",
      id: "48",
      name: "Texas",
    });
  });

  it("a selected county is the scope, named with its state's postal code", () => {
    expect(insightScope({ kind: "county", id: "17031" }, STATES, COUNTIES)).toEqual({
      kind: "county",
      id: "17031",
      name: "Cook County, IL",
    });
  });

  it("no selection, a school, a city, a district, or an unknown area keeps the on-screen view", () => {
    expect(insightScope(undefined, STATES, COUNTIES)).toBeNull();
    expect(insightScope({ kind: "school", id: "480000000001" }, STATES, COUNTIES)).toBeNull();
    expect(insightScope({ kind: "city", id: "TX:Austin" }, STATES, COUNTIES)).toBeNull();
    expect(insightScope({ kind: "district", id: "TX:Austin ISD" }, STATES, COUNTIES)).toBeNull();
    expect(insightScope({ kind: "state", id: "99" }, STATES, COUNTIES)).toBeNull();
    expect(insightScope({ kind: "county", id: "99999" }, STATES, COUNTIES)).toBeNull();
  });

  it("is pending (undefined) until the files that name the area have loaded", () => {
    expect(insightScope({ kind: "state", id: "48" }, undefined, undefined)).toBeUndefined();
    expect(insightScope({ kind: "county", id: "17031" }, STATES, undefined)).toBeUndefined();
    expect(insightScope({ kind: "state", id: "48" }, STATES, undefined)).toEqual({
      kind: "state",
      id: "48",
      name: "Texas",
    });
  });
});

describe("unitLevel", () => {
  it("a state is described by its counties, a county by its schools, on screen by the map level", () => {
    const state = { kind: "state", id: "48", name: "Texas" } as const;
    const county = { kind: "county", id: "17031", name: "Cook County, IL" } as const;
    for (const level of ["nation", "state", "local"] as const) {
      expect(unitLevel(state, level)).toBe("state");
      expect(unitLevel(county, level)).toBe("local");
      expect(unitLevel(null, level)).toBe(level);
      expect(unitLevel(undefined, level)).toBe(level);
    }
  });
});
