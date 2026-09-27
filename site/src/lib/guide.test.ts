// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  initialGuide,
  LANDING_AFTER_RELOAD_KEY,
  LANDING_EXIT_MS,
  landingExitRemainingMs,
  noteLandingExit,
  takeLandingAfterReload,
} from "./guide";

describe("map guide (SPEC.md 3.15)", () => {
  it("opens the primer on every visit to a URL without parameters", () => {
    expect(initialGuide("")).toBe("primer");
  });

  it("goes straight to the map for a shared view", () => {
    expect(initialGuide("?l=crime,education")).toBeNull();
    expect(initialGuide("?p=broadband-attainment")).toBeNull();
  });

  it("opens the primer over the view after a reload made from the landing, once", () => {
    expect(initialGuide("?l=crime,education", true)).toBe("primer");
    sessionStorage.setItem(LANDING_AFTER_RELOAD_KEY, "1");
    expect(takeLandingAfterReload()).toBe(true);
    expect(takeLandingAfterReload()).toBe(false);
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
