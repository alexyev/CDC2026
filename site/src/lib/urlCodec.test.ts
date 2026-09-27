// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW } from "@/store/useStore";
import type { ViewState } from "./types";
import { decodeView, encodeView } from "./urlCodec";

const FULL: ViewState = {
  camera: { zoom: 9.25, lat: 34.05, lon: -118.24 },
  layers: ["crime", "education"],
  display: "pct",
  selected: { kind: "county", id: "06037" },
  compare: {
    armed: true,
    pins: [
      { kind: "county", id: "06037" },
      { kind: "county", id: "06075" },
    ],
  },
  profile: "060000000001",
  favorites: ["060000000001", "010000500871"],
  favoritesPanel: true,
  showOnlyStarred: false,
  about: true,
  preset: "broadband-attainment",
};

describe("urlCodec", () => {
  it("encodes the default view as an empty query", () => {
    expect(encodeView(DEFAULT_VIEW)).toBe("");
    expect(decodeView("")).toEqual(DEFAULT_VIEW);
  });

  it("round-trips every parameter of SPEC.md 3.10", () => {
    const qs = encodeView(FULL, { includeFavorites: true });
    expect(qs).toBe(
      "v=9.25/34.05/-118.24&l=crime,education&d=pct&sel=county:06037&cmp=county:06037,county:06075" +
        "&s=060000000001&fav=060000000001,010000500871&fp=1&p=broadband-attainment&about=1",
    );
    expect(decodeView(`?${qs}`)).toEqual(FULL);
  });

  it.each<[string, Partial<ViewState>]>([
    ["v", { camera: { zoom: 5.5, lat: 35.5, lon: -79 } }],
    ["l (one layer)", { layers: ["education"] }],
    ["l (two layers)", { layers: ["economic", "education"] }],
    ["l (no layer)", { layers: [] }],
    ["d", { display: "pct" }],
    ["sel state", { selected: { kind: "state", id: "06" } }],
    ["sel school", { selected: { kind: "school", id: "060000000001" } }],
    ["sel city", { selected: { kind: "city", id: "CA:Los Angeles" } }],
    ["cmp armed without pins", { compare: { armed: true, pins: [] } }],
    ["cmp one pin", { compare: { armed: true, pins: [{ kind: "state", id: "37" }] } }],
    ["s", { profile: "010000500871" }],
    ["fp", { favoritesPanel: true }],
    ["p", { preset: "where-stress-concentrates" }],
    ["about", { about: true }],
  ])("round-trips %s", (_name, patch) => {
    const view: ViewState = { ...DEFAULT_VIEW, ...patch };
    expect(decodeView(encodeView(view))).toEqual(view);
  });

  it("round-trips fav only when asked, capped at 20", () => {
    const favorites = Array.from({ length: 25 }, (_, i) => String(100000000000 + i));
    const view: ViewState = { ...DEFAULT_VIEW, favorites };
    expect(encodeView(view)).toBe("");
    expect(decodeView(encodeView(view, { includeFavorites: true })).favorites).toEqual(favorites.slice(0, 20));
  });

  it("rounds the camera to two decimals", () => {
    const qs = encodeView({ ...DEFAULT_VIEW, camera: { zoom: 7.123, lat: 35.7777, lon: -78.6389 } });
    expect(qs).toBe("v=7.12/35.78/-78.64");
  });

  it("falls back to defaults for invalid values", () => {
    const view = decodeView("?v=abc&l=nope,composite&d=weird&sel=planet:3&cmp=county:06037,state:06,county:1,county:2");
    expect(view.camera).toEqual(DEFAULT_VIEW.camera);
    expect(view.layers).toEqual(["composite"]);
    expect(view.display).toBe("score");
    expect(view.selected).toBeUndefined();
    expect(view.compare).toEqual({ armed: true, pins: [{ kind: "county", id: "06037" }] });
  });

  it("drops a duplicate secondary layer", () => {
    expect(decodeView("?l=crime,crime").layers).toEqual(["crime"]);
  });
});
