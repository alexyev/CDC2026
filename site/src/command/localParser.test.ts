// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { describe, expect, it } from "vitest";
import { planIntent } from "./apply";
import { parseLocally } from "./localParser";
import { fixtureResolver } from "./testUtils";
import { UTTERANCES } from "./utterances.fixture";

const resolver = fixtureResolver();

describe("local parser", () => {
  it("matches the function's view on all 12 utterances (SPEC.md 14.7 target: 9 of 12)", () => {
    const misses: string[] = [];
    for (const u of UTTERANCES) {
      const local = planIntent(parseLocally(u.text, resolver), resolver);
      const remote = planIntent(u.intent, resolver);
      if (JSON.stringify(local) !== JSON.stringify(remote)) misses.push(u.text);
    }
    expect(misses, `local parse differs for: ${misses.join(" | ")}`).toHaveLength(0);
  });

  it("parses the bar's lead typewriter example into a county pin against the state", () => {
    const text = "compare education and health in LA County and California";
    expect(parseLocally(text, resolver)).toEqual({
      action: "compare",
      layers: ["education", "health"],
      places: [
        { query: "LA County", kind: "county" },
        { query: "California", kind: "unknown" },
      ],
    });
  });

  it("parses the headline example into the same intent shape", () => {
    expect(parseLocally("compare crime and education in LA County and California", resolver)).toEqual({
      action: "compare",
      layers: ["crime", "education"],
      places: [
        { query: "LA County", kind: "county" },
        { query: "California", kind: "unknown" },
      ],
    });
  });

  it("prefers the longest layer phrase", () => {
    expect(parseLocally("violent crime in Texas", resolver).layers).toEqual(["violent_crime"]);
    expect(parseLocally("housing stress", resolver).layers).toEqual(["housing"]);
    expect(parseLocally("less than high school", resolver).layers).toEqual(["less_than_hs"]);
  });

  it("keeps at most two layers, in the order written", () => {
    expect(parseLocally("poverty, crime and health", resolver).layers).toEqual(["poverty", "crime"]);
  });

  it("tolerates typos in layer names", () => {
    expect(parseLocally("educaton in Texas", resolver).layers).toEqual(["education"]);
  });

  it("does not read a county named after a layer word as a layer", () => {
    expect(parseLocally("poverty in White County", resolver).layers).toEqual(["poverty"]);
    expect(parseLocally("white share in Orange County", resolver)).toEqual({
      action: "explore",
      layers: ["ctx_white"],
      places: [{ query: "Orange County", kind: "county" }],
    });
  });

  it("recognizes clear, percentile, and profile", () => {
    expect(parseLocally("Start over", resolver).action).toBe("clear");
    expect(parseLocally("rank of crime in Texas", resolver).display).toBe("pct");
    expect(parseLocally("Albertville High School", resolver).action).toBe("profile");
  });

  it("returns an empty intent when nothing matches", () => {
    expect(parseLocally("tell me a joke", resolver)).toEqual({ action: "explore", layers: [], places: [] });
  });

  it("never reads a stray one- or two-letter word as a place", () => {
    expect(parseLocally("what's healthcare access like here", resolver).places).toEqual([]);
    expect(parseLocally("poverty in Texas as percentiles", resolver)).toEqual({
      action: "explore",
      layers: ["poverty"],
      places: [{ query: "Texas", kind: "unknown" }],
      display: "pct",
    });
  });
});
