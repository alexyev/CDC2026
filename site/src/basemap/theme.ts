// Basemap theme (SPEC.md 9.7): fetches the OpenFreeMap dark style and patches it into the Schoolscape palette
// before the map is created, so the basemap recedes behind the data fills.

import type { Map as MapLibreMap } from "maplibre-gl";

export type StyleSpec = Exclude<Parameters<MapLibreMap["setStyle"]>[0], string | null>;
type StyleLayer = StyleSpec["layers"][number];

export const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

/** Past this, the style fetch gives up and the fallback style keeps first paint inside the 2 s budget. */
export const BASEMAP_FETCH_TIMEOUT_MS = 3000;

export const BASEMAP_COLORS = {
  background: "#0b0d12",
  water: "#0f141c",
  roadMinor: "#1a1f28",
  roadMajor: "#242a35",
  boundary: "#2a303c",
  label: "#8b93a3",
  labelHalo: "#0b0d12",
  labelOpacity: 0.75,
} as const;

/** Layers hidden outright, by id prefix. */
const HIDDEN_PREFIXES = ["poi", "building", "housenumber", "landcover", "landuse"];
/**
 * Road-like layers by id prefix. SPEC.md 9.7 names `road`; the OpenFreeMap dark style also draws roads as
 * `highway_*`, rails as `railway*`, and airports as `aeroway*`, which get the same dimming.
 */
const ROAD_PREFIXES = ["road", "highway", "railway", "aeroway"];
const MAJOR_ROAD = /(major|motorway)/;

const hasPrefix = (id: string, prefixes: readonly string[]) => prefixes.some((p) => id.startsWith(p));

function hide(layer: StyleLayer): StyleLayer {
  return { ...layer, layout: { ...layer.layout, visibility: "none" } } as StyleLayer;
}

function withPaint(layer: StyleLayer, paint: Record<string, unknown>): StyleLayer {
  return { ...layer, paint: { ...("paint" in layer ? layer.paint : {}), ...paint } } as StyleLayer;
}

function patchLayer(layer: StyleLayer): StyleLayer {
  const { id } = layer;
  if (layer.type === "background") return withPaint(layer, { "background-color": BASEMAP_COLORS.background });
  if (hasPrefix(id, HIDDEN_PREFIXES)) return hide(layer);
  if (layer.type === "raster" || layer.type === "hillshade") return hide(layer);

  if (layer.type === "symbol") {
    // Icon-only symbols (one-way arrows) carry no label and only add noise under the fills.
    if (!layer.layout?.["text-field"]) return hide(layer);
    return withPaint(layer, {
      "text-color": BASEMAP_COLORS.label,
      "text-halo-color": BASEMAP_COLORS.labelHalo,
      "text-opacity": BASEMAP_COLORS.labelOpacity,
    });
  }

  if (id.startsWith("water")) {
    if (layer.type === "fill") return withPaint(layer, { "fill-color": BASEMAP_COLORS.water });
    if (layer.type === "line") return withPaint(layer, { "line-color": BASEMAP_COLORS.water });
    return layer;
  }

  if (hasPrefix(id, ROAD_PREFIXES)) {
    if (layer.type !== "line") return hide(layer);
    // Dash overlays draw the gaps of a dashed rail in the background color.
    if (id.endsWith("dashline")) return withPaint(layer, { "line-color": BASEMAP_COLORS.background });
    return withPaint(layer, {
      "line-color": MAJOR_ROAD.test(id) ? BASEMAP_COLORS.roadMajor : BASEMAP_COLORS.roadMinor,
    });
  }

  if (id.startsWith("boundary") && layer.type === "line") {
    return withPaint(layer, { "line-color": BASEMAP_COLORS.boundary });
  }

  return layer;
}

/** Returns a patched copy of the OpenFreeMap dark style; the input is not modified. */
export function patchStyle(style: StyleSpec): StyleSpec {
  return { ...style, layers: style.layers.map(patchLayer) };
}

/** Minimal style used when the basemap cannot be fetched: fills still render over the dark background. */
export function fallbackStyle(): StyleSpec {
  return {
    version: 8,
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": BASEMAP_COLORS.background } }],
  };
}

/** Id of the first symbol layer, used as `beforeId` so labels stay above Schoolscape fills and pins. */
export function firstSymbolLayerId(style: StyleSpec): string | undefined {
  return style.layers.find((l) => l.type === "symbol" && l.layout?.visibility !== "none")?.id;
}

export interface BasemapStyle {
  style: StyleSpec;
  /** True when the fetch failed and the fallback style is in use. */
  fallback: boolean;
}

/** Fetches and patches the basemap style, falling back to a background-only style on any failure or timeout. */
export async function loadBasemapStyle(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = BASEMAP_FETCH_TIMEOUT_MS,
): Promise<BasemapStyle> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(BASEMAP_STYLE_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const style = (await res.json()) as StyleSpec;
    if (!Array.isArray(style?.layers)) throw new Error("not a style");
    return { style: patchStyle(style), fallback: false };
  } catch (err) {
    console.warn("Schoolscape: basemap style unavailable, using the fallback style", err);
    return { style: fallbackStyle(), fallback: true };
  } finally {
    clearTimeout(timer);
  }
}
