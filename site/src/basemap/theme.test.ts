// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { describe, expect, it, vi } from "vitest";
import saved from "./__fixtures__/openfreemap-dark.json";
import {
  BASEMAP_COLORS,
  BASEMAP_STYLE_URL,
  fallbackStyle,
  firstSymbolLayerId,
  loadBasemapStyle,
  patchStyle,
  type StyleSpec,
} from "./theme";

// A saved copy of https://tiles.openfreemap.org/styles/dark (2026-09-26).
const source = saved as unknown as StyleSpec;
const patched = patchStyle(source);
const layer = (id: string) => {
  const l = patched.layers.find((x) => x.id === id);
  if (!l) throw new Error(`no layer ${id}`);
  return l as { id: string; type: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> };
};
const hidden = (id: string) => layer(id).layout?.visibility === "none";

describe("patchStyle", () => {
  it("keeps every layer, in order, and does not mutate the input", () => {
    expect(patched.layers.map((l) => l.id)).toEqual(source.layers.map((l) => l.id));
    const water = source.layers.find((l) => l.id === "water") as { paint: Record<string, unknown> };
    expect(water.paint["fill-color"]).toBe("rgb(27 ,27 ,29)");
  });

  it("recolors the background and water", () => {
    expect(layer("background").paint?.["background-color"]).toBe(BASEMAP_COLORS.background);
    expect(layer("water").paint?.["fill-color"]).toBe(BASEMAP_COLORS.water);
    expect(layer("waterway").paint?.["line-color"]).toBe(BASEMAP_COLORS.water);
  });

  it("hides landcover, landuse, buildings, and icon-only symbols", () => {
    for (const id of [
      "landcover_wood",
      "landcover_glacier",
      "landuse_residential",
      "landuse_park",
      "building",
      "road_oneway",
    ]) {
      expect(hidden(id), id).toBe(true);
    }
    for (const l of patched.layers) {
      if (/^(poi|building|housenumber|landcover|landuse)/.test(l.id)) expect(hidden(l.id), l.id).toBe(true);
    }
  });

  it("dims roads, with majors one step brighter", () => {
    expect(layer("highway_minor").paint?.["line-color"]).toBe(BASEMAP_COLORS.roadMinor);
    expect(layer("highway_path").paint?.["line-color"]).toBe(BASEMAP_COLORS.roadMinor);
    expect(layer("highway_major_inner").paint?.["line-color"]).toBe(BASEMAP_COLORS.roadMajor);
    expect(layer("highway_motorway_inner").paint?.["line-color"]).toBe(BASEMAP_COLORS.roadMajor);
    expect(layer("railway").paint?.["line-color"]).toBe(BASEMAP_COLORS.roadMinor);
    expect(layer("railway_dashline").paint?.["line-color"]).toBe(BASEMAP_COLORS.background);
    // Other line paint (widths, dashes) is kept.
    expect(layer("highway_path").paint?.["line-dasharray"]).toEqual([1.5, 1.5]);
  });

  it("recolors boundaries", () => {
    for (const id of ["boundary_state", "boundary_country_z0-4", "boundary_country_z5-"]) {
      expect(layer(id).paint?.["line-color"]).toBe(BASEMAP_COLORS.boundary);
    }
  });

  it("gives every visible label the muted text style", () => {
    const labels = patched.layers.filter((l) => l.type === "symbol" && !hidden(l.id));
    expect(labels.map((l) => l.id)).toContain("place_city");
    for (const l of labels) {
      const paint = layer(l.id).paint;
      expect(paint?.["text-color"], l.id).toBe(BASEMAP_COLORS.label);
      expect(paint?.["text-halo-color"], l.id).toBe(BASEMAP_COLORS.labelHalo);
      expect(paint?.["text-opacity"], l.id).toBe(BASEMAP_COLORS.labelOpacity);
    }
  });
});

describe("firstSymbolLayerId", () => {
  it("skips hidden symbols and returns the first visible label layer", () => {
    expect(firstSymbolLayerId(patched)).toBe("water_name");
    expect(firstSymbolLayerId(fallbackStyle())).toBeUndefined();
  });
});

describe("loadBasemapStyle", () => {
  it("fetches and patches the style", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(source)));
    const { style, fallback } = await loadBasemapStyle(fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith(BASEMAP_STYLE_URL, expect.anything());
    expect(fallback).toBe(false);
    expect(style.layers.length).toBe(source.layers.length);
  });

  it("falls back on HTTP errors, network errors, and bad JSON", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const cases = [
      async () => new Response("nope", { status: 503 }),
      async () => {
        throw new TypeError("network");
      },
      async () => new Response(JSON.stringify({ hello: "world" })),
    ];
    for (const impl of cases) {
      const { style, fallback } = await loadBasemapStyle(impl as unknown as typeof fetch);
      expect(fallback).toBe(true);
      expect(style).toEqual(fallbackStyle());
    }
  });

  it("falls back when the fetch outlasts the timeout", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const hang = (_: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("abort"))));
    const { fallback } = await loadBasemapStyle(hang as unknown as typeof fetch, 10);
    expect(fallback).toBe(true);
  });
});

describe("patchStyle labels", () => {
  it("draws no sprite icon with a label, so nothing asks for the missing `circle-11`", () => {
    const sourceIcons = source.layers.filter((l) =>
      JSON.stringify((l.layout as Record<string, unknown> | undefined)?.["icon-image"] ?? "").includes("circle-11"),
    );
    expect(sourceIcons.map((l) => l.id)).toEqual(["place_town", "place_city", "place_city_large"]);
    for (const l of patched.layers) {
      if (l.type === "symbol" && !hidden(l.id)) expect(layer(l.id).layout?.["icon-image"], l.id).toBeUndefined();
    }
    expect(layer("place_city").layout?.["text-size"]).toEqual(
      (source.layers.find((l) => l.id === "place_city") as { layout: Record<string, unknown> }).layout["text-size"],
    );
  });

  it("labels places with one Latin-script name and keeps road shields' refs", () => {
    for (const id of ["place_city", "place_country_major", "place_state", "water_name", "highway_name_other"]) {
      expect(layer(id).layout?.["text-field"], id).toEqual([
        "coalesce",
        ["get", "name_en"],
        ["get", "name:latin"],
        ["get", "name"],
      ]);
    }
    expect(layer("highway_name_motorway").layout?.["text-field"]).toEqual(["to-string", ["get", "ref"]]);
  });
});
