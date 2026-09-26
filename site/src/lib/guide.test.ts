import { beforeEach, describe, expect, it } from "vitest";
import { initialGuide, markPrimerSeen, PRIMER_SEEN_KEY, primerSeen } from "./guide";

beforeEach(() => window.localStorage.clear());

describe("map guide (SPEC.md 3.15)", () => {
  it("opens the primer on a first visit to a URL without parameters", () => {
    expect(initialGuide("")).toBe("primer");
  });

  it("goes straight to the map for a shared view", () => {
    expect(initialGuide("?l=crime,education")).toBeNull();
    expect(initialGuide("?p=broadband-attainment")).toBeNull();
  });

  it("opens the primer by itself only once", () => {
    expect(primerSeen()).toBe(false);
    markPrimerSeen();
    expect(window.localStorage.getItem(PRIMER_SEEN_KEY)).toBe("1");
    expect(primerSeen()).toBe(true);
    expect(initialGuide("")).toBeNull();
  });
});
