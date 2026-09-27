// Map core (SPEC.md 3.3 to 3.5, 9.3, 9.7, 10.1): MapLibre on the themed OpenFreeMap dark style, the state and
// county choropleth, the level machine (crossfades are zoom expressions in choropleth.ts), hover tooltips,
// click-to-drill, store <-> camera sync, and the first-paint mark.

import "maplibre-gl/dist/maplibre-gl.css";
import "./map.css";

import { Map as MapLibreMap, setWorkerUrl, type MapMouseEvent } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef, useState } from "react";
import { loadBasemapStyle, firstSymbolLayerId } from "@/basemap/theme";
import type { BreaksFile, CountiesFile, StatesFile } from "@/lib/dataTypes";
import { load, loadCritical } from "@/lib/loaders";
import type { Camera, PlaceRef } from "@/lib/types";
import { encodeCamera } from "@/lib/urlCodec";
import { cn } from "@/lib/utils";
import { DEFAULT_CAMERA, useStore } from "@/store/useStore";
import { flyToBBox, flyToCamera, flyToNation, mapPadding } from "./camera";
import {
  COUNTY_LEVEL_FLOOR,
  FILL_LAYER,
  allCountyLevel,
  applyAreaStates,
  computeAreaStates,
  installChoropleth,
  kindOfUnitId,
  moveFlag,
  setAreaGeometry,
  setCountyFloor,
  topoToGeoJSON,
  type AreaKind,
} from "./choropleth";
import { COUNTY_DRILL_MIN_ZOOM, INITIAL_BOUNDS, levelForZoom, minZoomForWidth } from "./levels";
import { AreaTooltip, type HoverInfo } from "./AreaTooltip";
import { pinAt } from "./pins";
import { useMap } from "./useMap";

// MapLibre resolves its worker next to its own module, which Vite's dependency bundling moves; point it at a
// worker chunk Vite builds instead.
setWorkerUrl(maplibreWorkerUrl);

export const FIRST_PAINT_MARK = "schoolscape:first-paint";
/** The basemap's vector source in the OpenFreeMap style; its errors mean tiles failed, not our data. */
const BASEMAP_SOURCES = new Set(["openmaptiles", "ne2_shaded"]);

declare global {
  interface Window {
    /** The map instance, exposed in dev and fixture builds for end-to-end tests. */
    __schoolscapeMap?: MapLibreMap;
  }
}

interface AreaData {
  states?: StatesFile;
  counties?: CountiesFile;
  breaks?: BreaksFile;
}

const sameCamera = (a: Camera, b: Camera) => encodeCamera(a) === encodeCamera(b);

function cameraOf(map: MapLibreMap): Camera {
  // With world copies on, the center can leave [-180, 180] (after a jumpTo, for one); the URL accepts only that range.
  const c = map.getCenter().wrap();
  return { lon: c.lng, lat: c.lat, zoom: map.getZoom() };
}

type AreaRef = { kind: AreaKind; id: string };

/** The polygon a place or hovered unit id refers to, if it is a state or county. */
function areaRef(p: PlaceRef | string | null | undefined): AreaRef | null {
  if (!p) return null;
  if (typeof p === "string") {
    const kind = kindOfUnitId(p);
    return kind ? { kind, id: p } : null;
  }
  return p.kind === "state" || p.kind === "county" ? { kind: p.kind, id: p.id } : null;
}

function schedule(fn: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout: 300 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, 300);
  return () => window.clearTimeout(id);
}

export function MapCanvas() {
  const { registerMap } = useMap();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [styled, setStyled] = useState(false);
  const [data, setData] = useState<AreaData>({});
  const [basemapNotice, setBasemapNotice] = useState<string | null>(null);
  const [dataError, setDataError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const dataRef = useRef<AreaData>({});
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const layers = useStore((s) => s.layers);
  const display = useStore((s) => s.display);

  // --- Map creation: fetch and theme the style, then construct the map with it (SPEC.md 9.7). -------------------
  useEffect(() => {
    let disposed = false;
    let instance: MapLibreMap | null = null;
    void loadBasemapStyle().then(({ style, fallback }) => {
      if (disposed || !containerRef.current) return;
      const camera = useStore.getState().camera;
      const initial = sameCamera(camera, DEFAULT_CAMERA)
        ? { bounds: INITIAL_BOUNDS, fitBoundsOptions: { padding: mapPadding() } }
        : { center: [camera.lon, camera.lat] as [number, number], zoom: camera.zoom };
      instance = new MapLibreMap({
        container: containerRef.current,
        style,
        ...initial,
        minZoom: minZoomForWidth(containerRef.current.clientWidth),
        maxZoom: 14.5,
        // The world repeats horizontally, so panning past either edge wraps around (SPEC.md 3.3).
        renderWorldCopies: true,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maplibreLogo: false,
        attributionControl: { compact: false, customAttribution: fallback ? "Basemap unavailable" : undefined },
        fadeDuration: 150,
      });
      instance.touchZoomRotate.disableRotation();
      instance.keyboard.disableRotation();
      const m = instance;
      // The zoom floor follows the window width so no place is ever drawn twice (SPEC.md 3.3).
      m.on("resize", () => m.setMinZoom(minZoomForWidth(m.getContainer().clientWidth)));
      m.on("load", () => {
        installChoropleth(m, firstSymbolLayerId(style));
        setStyled(true);
      });
      m.on("error", (e: { sourceId?: string; error?: unknown }) => {
        if (e.sourceId && BASEMAP_SOURCES.has(e.sourceId)) setBasemapNotice("Basemap tiles unavailable");
      });
      if (import.meta.env.DEV || import.meta.env.VITE_USE_FIXTURES) window.__schoolscapeMap = m;
      setMap(m);
      registerMap(m);
    });
    return () => {
      disposed = true;
      registerMap(null);
      instance?.remove();
      setMap(null);
      setStyled(false);
    };
  }, [registerMap]);

  // --- Data: the critical files first, counties once the first paint is on screen (SPEC.md 10.1). ----------------
  useEffect(() => {
    let cancelled = false;
    loadCritical()
      .then(([statesTopo, states, breaks]) => {
        if (cancelled) return;
        setData((d) => ({ ...d, states, breaks }));
        if (map && styled) setAreaGeometry(map, "state", topoToGeoJSON(statesTopo, "states"));
      })
      .catch((err: unknown) => {
        console.error(err);
        if (!cancelled) setDataError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [map, styled, attempt]);

  const firstPaintDone = useRef(false);
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    if (!map || !styled || !painted) return;
    let cancelled = false;
    const cancel = schedule(() => {
      Promise.all([load("countiesTopo"), load("counties")])
        .then(([topo, counties]) => {
          if (cancelled) return;
          setAreaGeometry(map, "county", topoToGeoJSON(topo, "counties"));
          setData((d) => ({ ...d, counties }));
        })
        .catch((err: unknown) => {
          console.error(err);
          if (!cancelled) setDataError(true);
        });
    });
    return () => {
      cancelled = true;
      cancel();
    };
  }, [map, styled, painted, attempt]);

  // --- Classes: one feature-state pass per level whenever the layers or data change. ---------------------------
  useEffect(() => {
    if (!map || !styled || !data.states || !data.breaks) return;
    applyAreaStates(map, "state", computeAreaStates(data.states, layers, data.breaks, "state"));
    if (!firstPaintDone.current) {
      firstPaintDone.current = true;
      map.once("idle", () => {
        performance.mark(FIRST_PAINT_MARK);
        containerRef.current?.setAttribute("data-first-paint", "1");
        setPainted(true);
      });
      map.triggerRepaint();
    }
  }, [map, styled, data.states, data.breaks, layers]);

  useEffect(() => {
    if (!map || !styled || !data.counties || !data.breaks) return;
    applyAreaStates(map, "county", computeAreaStates(data.counties, layers, data.breaks, "county"));
  }, [map, styled, data.counties, data.breaks, layers]);

  useEffect(() => {
    if (!map || !styled) return;
    setCountyFloor(map, allCountyLevel(layers) ? COUNTY_LEVEL_FLOOR : 0);
  }, [map, styled, layers]);

  // --- Selection, compare pins, and linked hover as feature-state outlines. -------------------------------------
  const selected = useStore((s) => s.selected);
  const pins = useStore((s) => s.compare.pins);
  const hovered = useStore((s) => s.hovered);
  const selRef = useRef<AreaRef | null>(null);
  const hoverRef = useRef<AreaRef | null>(null);
  const pinRefs = useRef<(AreaRef | null)[]>([null, null]);

  const selKey = selected ? `${selected.kind}:${selected.id}` : "";
  useEffect(() => {
    if (!map || !styled) return;
    const next = areaRef(useStore.getState().selected);
    moveFlag(map, "sel", selRef.current, next);
    selRef.current = next;
  }, [map, styled, selKey, data.counties]);

  const pinKey = pins.map((p) => `${p.kind}:${p.id}`).join(",");
  useEffect(() => {
    if (!map || !styled) return;
    const current = useStore.getState().compare.pins;
    for (const slot of [0, 1]) {
      const next = areaRef(current[slot]);
      moveFlag(map, "cmp", pinRefs.current[slot] ?? null, next, slot + 1);
      pinRefs.current[slot] = next;
    }
  }, [map, styled, pinKey, data.counties]);

  useEffect(() => {
    if (!map || !styled) return;
    const next = areaRef(hovered);
    moveFlag(map, "hover", hoverRef.current, next);
    hoverRef.current = next;
  }, [map, styled, hovered]);

  // --- Pointer: hover tooltips and click-to-drill at the level being drawn (SPEC.md 3.4, 3.5). -------------------
  useEffect(() => {
    if (!map || !styled) return;
    // The cursor goes on the canvas container, which the canvas inherits; the pin overlay owns the canvas's own.
    const container = map.getCanvasContainer();
    const drawnKind = (): AreaKind | null => {
      const level = levelForZoom(map.getZoom());
      return level === "nation" ? "state" : level === "state" ? "county" : null;
    };
    const pick = (e: MapMouseEvent) => {
      const kind = drawnKind();
      if (!kind || (kind === "county" && !dataRef.current.counties)) return null;
      const f = map.queryRenderedFeatures(e.point, { layers: [FILL_LAYER[kind]] })[0];
      const id = f?.properties?.gid as string | undefined;
      return id ? { kind, id, name: String(f?.properties?.name ?? "") } : null;
    };

    let frame = 0;
    let lastEvent: MapMouseEvent | null = null;
    const onMove = (e: MapMouseEvent) => {
      lastEvent = e;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const ev = lastEvent;
        // No hover card while a button is down: the pointer is dragging the map.
        if (!ev || ev.originalEvent.buttons !== 0) return;
        const { hovered: current, hoverUnit } = useStore.getState();
        // A starred pin drawn over the polygons owns the hover, its card, and the cursor.
        if (pinAt(ev.point.x, ev.point.y)) {
          if (current && kindOfUnitId(current)) hoverUnit(null);
          setHover(null);
          return;
        }
        const hit = pick(ev);
        if (!hit) {
          container.style.cursor = "";
          if (current && kindOfUnitId(current)) hoverUnit(null);
          setHover(null);
          return;
        }
        container.style.cursor = "pointer";
        if (current !== hit.id) hoverUnit(hit.id);
        setHover({ ...hit, x: ev.point.x, y: ev.point.y });
      });
    };
    const onLeave = () => {
      lastEvent = null;
      container.style.cursor = "";
      const { hovered: current, hoverUnit } = useStore.getState();
      if (current && kindOfUnitId(current)) hoverUnit(null);
      setHover(null);
    };
    const onClick = (e: MapMouseEvent) => {
      // Clicking a starred pin opens its profile (pins.ts) and must not also drill the area under it.
      if (pinAt(e.point.x, e.point.y)) return;
      const store = useStore.getState();
      // A click on the map away from the pins dismisses an open profile drawer and does nothing else.
      if (store.profile) {
        store.closeProfile();
        return;
      }
      const hit = pick(e);
      if (!hit) return;
      const place: PlaceRef = { kind: hit.kind, id: hit.id };
      if (store.compare.armed) {
        store.pinCompare(place);
        return;
      }
      store.select(place);
      const file = hit.kind === "state" ? dataRef.current.states : dataRef.current.counties;
      const i = file?.ids.indexOf(hit.id) ?? -1;
      const bbox = i >= 0 ? file?.bbox[i] : undefined;
      if (bbox) flyToBBox(map, bbox, hit.kind === "county" ? { minZoom: COUNTY_DRILL_MIN_ZOOM } : {});
    };
    const onMoveStart = () => {
      container.style.cursor = "";
      setHover(null);
    };

    map.on("mousemove", onMove);
    map.on("mouseout", onLeave);
    map.on("click", onClick);
    map.on("movestart", onMoveStart);
    return () => {
      cancelAnimationFrame(frame);
      map.off("mousemove", onMove);
      map.off("mouseout", onLeave);
      map.off("click", onClick);
      map.off("movestart", onMoveStart);
    };
  }, [map, styled]);

  // --- Camera: the map writes the store on moveend; external store changes (presets, back button) fly the map. ---
  useEffect(() => {
    if (!map) return;
    const onMoveEnd = () => {
      const cam = cameraOf(map);
      if (!sameCamera(cam, useStore.getState().camera)) useStore.getState().setCamera(cam);
    };
    map.on("moveend", onMoveEnd);
    const unsubscribe = useStore.subscribe((s, prev) => {
      if (s.camera === prev.camera || sameCamera(s.camera, cameraOf(map))) return;
      // The default camera stands for the national view, framed to the window as on first load.
      if (sameCamera(s.camera, DEFAULT_CAMERA)) flyToNation(map);
      else flyToCamera(map, s.camera);
    });
    return () => {
      map.off("moveend", onMoveEnd);
      unsubscribe();
    };
  }, [map]);

  // --- Keyboard: + and - zoom from anywhere outside inputs (SPEC.md 3.14). --------------------------------------
  useEffect(() => {
    if (!map) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      // MapLibre's own keyboard handler already zooms when the map canvas has focus.
      if (t && map.getContainer().contains(t)) return;
      if (e.key === "+" || e.key === "=") map.zoomIn();
      else if (e.key === "-" || e.key === "_") map.zoomOut();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [map]);

  const liveText = hover ? `${hover.name}` : "";

  return (
    <div className="absolute inset-0 bg-bg-0">
      <div
        ref={containerRef}
        data-testid="map-container"
        aria-label="Map of community stress around US public high schools"
        className="ss-map"
      />
      {hover && data.states && (
        <AreaTooltip hover={hover} layers={layers} display={display} states={data.states} counties={data.counties} />
      )}
      <div aria-live="polite" className="sr-only">
        {liveText}
      </div>
      {(basemapNotice || dataError) && (
        <div
          role="status"
          data-testid="map-notice"
          className={cn(
            "glass glass-strong pointer-events-auto absolute z-10 flex items-center gap-3 px-3 py-2 text-caption text-text-2",
            dataError ? "top-[88px] left-1/2 -translate-x-1/2" : "right-[296px] bottom-11",
          )}
        >
          {dataError ? (
            <>
              <span>Some map data could not be loaded.</span>
              <button
                type="button"
                className="rounded-chip px-2 py-1 font-medium text-accent-strong hover:bg-accent-dim"
                onClick={() => {
                  setDataError(false);
                  setAttempt((a) => a + 1);
                }}
              >
                Retry
              </button>
            </>
          ) : (
            <span>{basemapNotice}</span>
          )}
        </div>
      )}
    </div>
  );
}
