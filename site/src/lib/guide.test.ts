import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initialGuide,
  LANDING_EXIT_MS,
  landingExitRemainingMs,
  markPrimerSeen,
  noteLandingExit,
  PRIMER_SEEN_KEY,
  primerSeen,
} from "./guide";

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

describe("landing exit timing", () => {
  afterEach(() => vi.useRealTimers());

  it("counts down the rest of the landing's exit", () => {
    vi.useFakeTimers();
    noteLandingExit();
    expect(landingExitRemainingMs(false)).toBe(LANDING_EXIT_MS.full);
    vi.advanceTimersByTime(300);
    expect(landingExitRemainingMs(false)).toBe(LANDING_EXIT_MS.full - 300);
    expect(landingExitRemainingMs(true)).toBe(0);
    vi.advanceTimersByTime(LANDING_EXIT_MS.full);
    expect(landingExitRemainingMs(false)).toBe(0);
  });
});
