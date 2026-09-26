// Compare pin outlines on the map (SPEC.md 3.9, 9.3): A in amber, B in coral, 2.5 px, on a dedicated GeoJSON
// source so they do not depend on the choropleth's sources or feature ids. While compare is armed, a click on the
// map pins the state or county under the cursor (by point-in-polygon on the TopoJSON, no rendered-feature query).
// I1: mount useCompareOutlines() once under <MapProvider>, and make M1's click-to-drill return early while
// useStore.getState().compare.armed is true so a pinning click does not also fly.

import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import type { GeoJSONSource, LineLayerSpecification, Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { areaKindForLevel } from "@/lib/compareData";
import { load } from "@/lib/loaders";
import type { PlaceRef } from "@/lib/types";
import { isAreaPlace, type AreaKind } from "@/store/compareSlice";
import { useStore } from "@/store/useStore";
import { levelForZoom } from "./levels";
import { useMap } from "./useMap";

export const COMPARE_SOURCE_ID = "schoolscape-compare";
export const COMPARE_CASING_LAYER_ID = "schoolscape-compare-casing";
export const COMPARE_LINE_LAYER_ID = "schoolscape-compare-line";

/** Mirrors --mark-a and --mark-b in styles/tokens.css (MapLibre paint needs literal colors); a test keeps them equal. */
export const COMPARE_COLORS = { a: "#ffd166", b: "#ff7a59" } as const;
export type CompareSlot = keyof typeof COMPARE_COLORS;

export const slotForIndex = (i: number): CompareSlot => (i === 0 ? "a" : "b");

/** Line layers for the outlines: a dark casing for contrast over bright classes, then the 2.5 px colored line. */
export function compareOutlineLayers(source = COMPARE_SOURCE_ID): LineLayerSpecification[] {
  return [
    {
      id: COMPARE_CASING_LAYER_ID,
      type: "line",
      source,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#0a0c10", "line-width": 5, "line-opacity": 0.55 },
    },
    {
      id: COMPARE_LINE_LAYER_ID,
      type: "line",
      source,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": ["match", ["get", "slot"], "a", COMPARE_COLORS.a, COMPARE_COLORS.b],
        "line-width": 2.5,
      },
    },
  ];
}

type AreaFeature = Feature<Polygon | MultiPolygon, { name?: string }>;
type AreaCollection = FeatureCollection<Polygon | MultiPolygon, { name?: string }>;

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

const featureCache = new WeakMap<Topology, AreaCollection>();

/** GeoJSON of a states or counties topology (its single object), converted once per topology. */
export function topoFeatures(topo: Topology): AreaCollection {
  let fc = featureCache.get(topo);
  if (!fc) {
    const object = Object.values(topo.objects)[0] as GeometryCollection;
    fc = feature(topo, object) as AreaCollection;
    featureCache.set(topo, fc);
  }
  return fc;
}

/** The outline features for the current pins, each tagged with its slot. Unknown ids are skipped. */
export function compareFeatures(
  pins: readonly PlaceRef[],
  topos: Partial<Record<AreaKind, Topology>>,
): FeatureCollection<Polygon | MultiPolygon, { slot: CompareSlot; id: string }> {
  const features: Feature<Polygon | MultiPolygon, { slot: CompareSlot; id: string }>[] = [];
  pins.forEach((pin, i) => {
    if (!isAreaPlace(pin)) return;
    const topo = topos[pin.kind];
    const f = topo ? topoFeatures(topo).features.find((x) => String(x.id) === pin.id) : undefined;
    if (f)
      features.push({
        type: "Feature",
        id: i,
        geometry: f.geometry,
        properties: { slot: slotForIndex(i), id: pin.id },
      });
  });
  return { type: "FeatureCollection", features };
}

function ringContains(ring: Position[], lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Even-odd point-in-polygon over every ring, so holes are excluded. */
export function geometryContains(geometry: Polygon | MultiPolygon, lon: number, lat: number): boolean {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let inside = false;
  for (const rings of polygons) for (const ring of rings) if (ringContains(ring, lon, lat)) inside = !inside;
  return inside;
}

/** Id of the area of a topology that contains the point, or null over water or unmapped land. */
export function pickArea(topo: Topology, lon: number, lat: number): string | null {
  const hit = topoFeatures(topo).features.find(
    (f: AreaFeature) => f.geometry && geometryContains(f.geometry, lon, lat),
  );
  return hit ? String(hit.id) : null;
}

function loadTopo(kind: AreaKind): Promise<Topology> {
  return load(kind === "state" ? "statesTopo" : "countiesTopo");
}

function firstSymbolLayerId(map: MapLibreMap): string | undefined {
  return map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
}

/** Adds the source and layers if missing (also after a style reload) and keeps them just under the labels. */
function ensureLayers(map: MapLibreMap, data: FeatureCollection): void {
  if (!map.getSource(COMPARE_SOURCE_ID)) map.addSource(COMPARE_SOURCE_ID, { type: "geojson", data });
  const before = firstSymbolLayerId(map);
  for (const layer of compareOutlineLayers()) {
    if (!map.getLayer(layer.id)) map.addLayer(layer, before);
  }
  if (!before) return;
  const order = map.getStyle().layers.map((l) => l.id);
  if (order.indexOf(COMPARE_LINE_LAYER_ID) + 1 !== order.indexOf(before)) {
    map.moveLayer(COMPARE_CASING_LAYER_ID, before);
    map.moveLayer(COMPARE_LINE_LAYER_ID, before);
  }
}

/** Draws the compare outlines and, while compare is armed, pins the area under a click. Mount once. */
export function useCompareOutlines(): void {
  const { map, ready } = useMap();
  const pins = useStore((s) => s.compare.pins);
  const armed = useStore((s) => s.compare.armed);
  const dataRef = useRef<FeatureCollection>(EMPTY);

  useEffect(() => {
    if (!map || !ready) return;
    // Not gated on isStyleLoaded(): it stays false while tiles load, which is exactly when the choropleth adds
    // its fill layers above these outlines and the reorder must run. Style edits only fail before the first load.
    const sync = () => {
      try {
        ensureLayers(map, dataRef.current);
      } catch {
        // Style not parsed yet; the next styledata event retries.
      }
    };
    sync();
    map.on("styledata", sync);
    return () => {
      map.off("styledata", sync);
    };
  }, [map, ready]);

  useEffect(() => {
    if (!map || !ready) return;
    let cancelled = false;
    const kinds = [...new Set(pins.filter(isAreaPlace).map((p) => p.kind))];
    Promise.all(kinds.map(async (k) => [k, await loadTopo(k)] as const))
      .then((entries) => {
        if (cancelled) return;
        dataRef.current = compareFeatures(pins, Object.fromEntries(entries));
        (map.getSource(COMPARE_SOURCE_ID) as GeoJSONSource | undefined)?.setData(dataRef.current);
      })
      .catch(() => {
        // Boundary load failures surface through the choropleth's retry toast; outlines just stay as they were.
      });
    return () => {
      cancelled = true;
    };
  }, [map, ready, pins]);

  useEffect(() => {
    if (!map || !armed) return;
    const onClick = (e: MapMouseEvent) => {
      const kind = areaKindForLevel(levelForZoom(map.getZoom()));
      const { lng, lat } = e.lngLat;
      loadTopo(kind)
        .then((topo) => {
          const id = pickArea(topo, lng, lat);
          const { compare, pinCompare } = useStore.getState();
          if (id && compare.armed) pinCompare({ kind, id });
        })
        .catch(() => {});
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, armed]);
}
