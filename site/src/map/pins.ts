// School pins (SPEC.md 5.3, 3.5, 3.12, 9.3): a deck.gl MapboxOverlay interleaved with MapLibre, drawing
// - every school as a ScatterplotLayer circle colored by the active scale, hidden below z8,
// - starred schools in their own layer at every zoom, above ordinary pins,
// - the selected school's ring and the hovered pin on top.
// Every pin layer carries beforeId = the start of the basemap's trailing label block (pinBeforeId), so road and place
// labels stay above the pins while road lines stay below them.
// deck.gl and schools/all.json are loaded after the first paint (SPEC.md 10.1 steps 2 and 4).

import type { PickingInfo } from "@deck.gl/core";
import type { ScatterplotLayer, ScatterplotLayerProps } from "@deck.gl/layers";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import type { Map as MapLibreMap } from "maplibre-gl";
import { createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BreaksFile, SchoolsFile } from "@/lib/dataTypes";
import { load } from "@/lib/loaders";
import { useStore, type StoreState } from "@/store/useStore";
import { PinsOverlay } from "./PinsOverlay";
import {
  HOVER_GROW,
  HOVER_STROKE_WIDTH,
  PIN_COLORS,
  pinAttributes,
  pinRadius,
  pinsOpacity,
  pinsVisible,
  STAR_RADIUS,
  STAR_STROKE_WIDTH,
  type PinAttributes,
  pinBeforeId,
  type RGBA,
} from "./pinStyle";
import { useMap } from "./useMap";

export const PIN_LAYER_IDS = {
  pins: "school-pins",
  starred: "school-pins-starred",
  selectedGlow: "school-pins-selected-glow",
  selected: "school-pins-selected",
  hover: "school-pins-hover",
} as const;

const PICKABLE_LAYERS: string[] = [PIN_LAYER_IDS.pins, PIN_LAYER_IDS.starred];

/** How long a tooltip survives after the pointer leaves its pin, so it can move onto the star button. */
const TOOLTIP_GRACE_MS = 150;

export type PinsStatus = "loading" | "ready" | "error";

/** A tooltip anchored to a pin, in pixels relative to the map container. */
export interface PinTip {
  index: number;
  x: number;
  y: number;
}

export interface PinsUiState {
  status: PinsStatus;
  tip: PinTip | null;
}

interface DeckModules {
  MapboxOverlay: typeof MapboxOverlay;
  ScatterplotLayer: typeof ScatterplotLayer;
}

interface Loaded {
  deck: DeckModules;
  schools: SchoolsFile;
  breaks: BreaksFile;
  /** NCESSCH -> row index in schools. */
  index: Map<string, number>;
  positions: Float64Array;
}

interface BinaryAttribute {
  value: Float64Array | Float32Array | Uint8Array;
  size: number;
  /** Uint8 colors are 0-255 values that the shader reads as 0-1. */
  normalized?: boolean;
}

interface PinData {
  length: number;
  attributes: Record<"getPosition" | "getFillColor" | "getLineColor" | "getLineWidth", BinaryAttribute>;
}

type PinFields = Pick<
  StoreState,
  "layers" | "display" | "favorites" | "showOnlyStarred" | "hovered" | "profile" | "selected"
>;

function pinFields(s: StoreState): PinFields {
  return {
    layers: s.layers,
    display: s.display,
    favorites: s.favorites,
    showOnlyStarred: s.showOnlyStarred,
    hovered: s.hovered,
    profile: s.profile,
    selected: s.selected,
  };
}

function scheduleIdle(cb: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(cb, { timeout: 1000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(cb, 300);
  return () => window.clearTimeout(id);
}

/** Owns the overlay, its data, and the tooltip root for one map instance. */
export class PinsController {
  readonly map: MapLibreMap;
  private data: Loaded | null = null;
  private overlay: MapboxOverlay | null = null;
  private attrs: PinAttributes | null = null;
  /** Binary data of the ordinary pin layer; replaced only on recolor so zoom frames reuse the GPU buffers. */
  private pinData: PinData | null = null;
  private starred: number[] = [];
  private fields: PinFields;
  private beforeId: string | undefined;
  private destroyed = false;
  private cancelIdle: (() => void) | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private frame = 0;

  // Tooltip and the overlay's small React root.
  private ui: PinsUiState = { status: "loading", tip: null };
  private readonly listeners = new Set<() => void>();
  private readonly host: HTMLDivElement;
  private readonly root: Root;
  private hideTimer = 0;
  private pointerInTip = false;
  /** Store hover id this controller set, so leaving a pin never clears a hover owned by the scatter. */
  private ownHover: string | null = null;

  constructor(map: MapLibreMap) {
    this.map = map;
    this.fields = pinFields(useStore.getState());
    this.beforeId = pinsBeforeLayer(map);

    this.host = document.createElement("div");
    this.host.className = "schoolscape-pins-ui";
    // Above the floating panels and drawers (z-10 to z-40), below dialogs and popovers (z-50), so a hover card near a
    // panel edge is never cut off (SPEC.md 3.5).
    Object.assign(this.host.style, { position: "absolute", inset: "0", pointerEvents: "none", zIndex: "45" });
    map.getContainer().appendChild(this.host);
    this.root = createRoot(this.host);
    this.root.render(createElement(PinsOverlay, { controller: this }));

    map.on("zoom", this.onZoom);
    map.on("move", this.onMove);
    map.on("style.load", this.onStyleLoad);
    this.cancelIdle = scheduleIdle(() => void this.load());
  }

  destroy(): void {
    this.destroyed = true;
    this.cancelIdle?.();
    this.unsubscribeStore?.();
    cancelAnimationFrame(this.frame);
    window.clearTimeout(this.hideTimer);
    this.map.off("zoom", this.onZoom);
    this.map.off("move", this.onMove);
    this.map.off("style.load", this.onStyleLoad);
    this.releaseHover();
    if (this.overlay) this.map.removeControl(this.overlay);
    this.overlay = null;
    this.map.getCanvas().style.cursor = "";
    // Unmounting synchronously inside a React commit warns; the host is detached right away either way.
    const root = this.root;
    queueMicrotask(() => root.unmount());
    this.host.remove();
  }

  // ---- external store for PinsOverlay (useSyncExternalStore) ----

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): PinsUiState => this.ui;

  get schools(): SchoolsFile | null {
    return this.data?.schools ?? null;
  }

  private setUi(patch: Partial<PinsUiState>): void {
    this.ui = { ...this.ui, ...patch };
    for (const l of this.listeners) l();
  }

  retry = (): void => {
    this.setUi({ status: "loading" });
    void this.load();
  };

  /** The tooltip keeps itself open while the pointer is on it (the star button lives there). */
  setPointerInTip = (inside: boolean): void => {
    this.pointerInTip = inside;
    if (inside) window.clearTimeout(this.hideTimer);
    else this.scheduleHide();
  };

  // ---- loading ----

  private async load(): Promise<void> {
    try {
      const [mapbox, layers, schools, breaks] = await Promise.all([
        import("@deck.gl/mapbox"),
        import("@deck.gl/layers"),
        load("schools"),
        load("breaks"),
      ]);
      if (this.destroyed) return;
      const n = schools.ids.length;
      const positions = new Float64Array(n * 2);
      for (let i = 0; i < n; i++) {
        positions[i * 2] = schools.lon[i]!;
        positions[i * 2 + 1] = schools.lat[i]!;
      }
      this.data = {
        deck: { MapboxOverlay: mapbox.MapboxOverlay, ScatterplotLayer: layers.ScatterplotLayer },
        schools,
        breaks,
        index: new Map(schools.ids.map((id, i) => [id, i])),
        positions,
      };
      this.recolor();
      this.restar();
      ensureDeckTransform(this.map);
      this.overlay = new mapbox.MapboxOverlay({
        interleaved: true,
        pickingRadius: 4,
        layers: this.buildLayers(),
        onHover: this.onHover,
        onClick: this.onClick,
        // deck.gl writes this to the map canvas on every pointer move. Its default ("grab") would hide the area
        // hover cursor, which MapCanvas sets on the canvas container; "" lets the canvas inherit that one.
        getCursor: ({ isHovering }) => (isHovering ? "pointer" : ""),
      });
      this.map.addControl(this.overlay);
      this.unsubscribeStore = useStore.subscribe(this.onStore);
      this.setUi({ status: "ready" });
    } catch (err) {
      if (this.destroyed) return;
      console.error(err);
      this.setUi({ status: "error" });
    }
  }

  // ---- reacting to the store and the map ----

  private onStore = (state: StoreState): void => {
    const next = pinFields(state);
    const prev = this.fields;
    this.fields = next;
    if (next.layers !== prev.layers || next.display !== prev.display) this.recolor();
    if (next.favorites !== prev.favorites) this.restar();
    const changed = (Object.keys(next) as (keyof PinFields)[]).some((k) => next[k] !== prev[k]);
    if (changed) this.render();
    // The tooltip re-renders from the store itself; a star toggle may also have hidden its pin.
    if (this.ui.tip && !this.isShown(this.ui.tip.index)) this.setUi({ tip: null });
  };

  private onZoom = (): void => {
    this.render();
    if (this.ui.tip && !this.isShown(this.ui.tip.index)) this.hideTip();
  };

  private onMove = (): void => {
    const tip = this.ui.tip;
    if (!tip || !this.data) return;
    const p = this.project(tip.index);
    this.setUi({ tip: { ...tip, ...p } });
  };

  private onStyleLoad = (): void => {
    this.beforeId = pinsBeforeLayer(this.map);
    this.render();
  };

  /** Coalesces updates into one setProps per animation frame. */
  private render(): void {
    if (!this.overlay || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.overlay?.setProps({ layers: this.buildLayers() });
    });
  }

  private recolor(): void {
    if (!this.data) return;
    const { schools, breaks } = this.data;
    const attrs = pinAttributes(this.fields.layers, this.fields.display, schools, breaks);
    this.attrs = attrs;
    this.pinData = {
      length: schools.ids.length,
      attributes: {
        getPosition: { value: this.data.positions, size: 2 },
        getFillColor: { value: attrs.fill, size: 4, normalized: true },
        getLineColor: { value: attrs.line, size: 4, normalized: true },
        getLineWidth: { value: attrs.lineWidth, size: 1 },
      },
    };
  }

  private restar(): void {
    if (!this.data) return;
    const { index } = this.data;
    this.starred = this.fields.favorites.map((id) => index.get(id)).filter((i): i is number => i !== undefined);
  }

  // ---- layers ----

  private isStarred(i: number): boolean {
    return this.starred.includes(i);
  }

  /** Whether pin `i` is on the map at the current zoom. */
  private isShown(i: number): boolean {
    return pinsVisible(this.map.getZoom()) || this.isStarred(i);
  }

  private buildLayers() {
    const data = this.data;
    const attrs = this.attrs;
    const pinData = this.pinData;
    if (!data || !attrs || !pinData) return [];
    const { ScatterplotLayer } = data.deck;
    // beforeId is read by MapboxOverlay's interleaved mode but is not part of the layer prop types.
    const scatter = <D>(props: ScatterplotLayerProps<D> & { beforeId?: string }) => new ScatterplotLayer<D>(props);
    const zoom = this.map.getZoom();
    const visible = pinsVisible(zoom);
    const radius = pinRadius(zoom);
    const { positions } = data;
    const beforeId = this.beforeId;
    const palette = PIN_COLORS;
    const position = (i: number): [number, number] => [positions[i * 2]!, positions[i * 2 + 1]!];
    const fillOf = (i: number): RGBA => [
      attrs.fill[i * 4]!,
      attrs.fill[i * 4 + 1]!,
      attrs.fill[i * 4 + 2]!,
      attrs.fill[i * 4 + 3]!,
    ];

    const pins = scatter<unknown>({
      id: PIN_LAYER_IDS.pins,
      beforeId,
      data: pinData,
      visible,
      pickable: visible,
      opacity: pinsOpacity(zoom, this.fields.showOnlyStarred),
      stroked: true,
      radiusUnits: "pixels",
      getRadius: 1,
      radiusScale: radius,
      radiusMinPixels: 3,
      radiusMaxPixels: 7,
      lineWidthUnits: "pixels",
    });

    const starred = scatter<number>({
      id: PIN_LAYER_IDS.starred,
      beforeId,
      data: this.starred,
      pickable: true,
      stroked: true,
      getPosition: position,
      radiusUnits: "pixels",
      getRadius: STAR_RADIUS,
      getFillColor: palette.star,
      getLineColor: palette.selection,
      lineWidthUnits: "pixels",
      getLineWidth: STAR_STROKE_WIDTH,
    });

    // Highlights draw only for pins that are currently on the map.
    const sizeOf = (i: number) => (this.isStarred(i) ? STAR_RADIUS : radius);
    const selectedId =
      this.fields.profile ?? (this.fields.selected?.kind === "school" ? this.fields.selected.id : null);
    const selected = selectedId === null ? undefined : data.index.get(selectedId);
    const selectedData = selected !== undefined && this.isShown(selected) ? [selected] : [];
    const hovered = this.fields.hovered === null ? undefined : data.index.get(this.fields.hovered);
    const hoverData = hovered !== undefined && this.isShown(hovered) ? [hovered] : [];

    // Selected: white 2 px ring with a 6 px accent glow, as for selected polygons (SPEC.md 9.3).
    const ring = (id: string, color: RGBA, width: number) =>
      scatter<number>({
        id,
        beforeId,
        data: selectedData,
        filled: false,
        stroked: true,
        getPosition: position,
        radiusUnits: "pixels",
        getRadius: (i) => sizeOf(i) + 3.5,
        getLineColor: color,
        lineWidthUnits: "pixels",
        getLineWidth: width,
        updateTriggers: { getRadius: [radius, this.starred] },
      });

    const hover = scatter<number>({
      id: PIN_LAYER_IDS.hover,
      beforeId,
      data: hoverData,
      stroked: true,
      getPosition: position,
      radiusUnits: "pixels",
      getRadius: (i) => sizeOf(i) + HOVER_GROW,
      radiusMaxPixels: STAR_RADIUS + HOVER_GROW,
      getFillColor: (i) => (this.isStarred(i) ? palette.star : fillOf(i)),
      getLineColor: palette.selection,
      lineWidthUnits: "pixels",
      getLineWidth: HOVER_STROKE_WIDTH,
      updateTriggers: { getRadius: [radius, this.starred], getFillColor: [attrs, this.starred] },
    });

    return [
      pins,
      starred,
      ring(PIN_LAYER_IDS.selectedGlow, palette.glow, 6),
      ring(PIN_LAYER_IDS.selected, palette.selection, 2),
      hover,
    ];
  }

  // ---- picking ----

  /** Row index of the school under a picking result, or -1. */
  private pickedIndex(info: PickingInfo): number {
    if (info.layer?.id === PIN_LAYER_IDS.pins) return info.index;
    if (info.layer?.id === PIN_LAYER_IDS.starred && typeof info.object === "number") return info.object;
    return -1;
  }

  private project(i: number): { x: number; y: number } {
    const positions = this.data!.positions;
    const p = this.map.project([positions[i * 2]!, positions[i * 2 + 1]!]);
    return { x: p.x, y: p.y };
  }

  private onHover = (info: PickingInfo): void => {
    const data = this.data;
    if (!data) return;
    const i = this.pickedIndex(info);
    if (i < 0) {
      this.releaseHover();
      this.scheduleHide();
      return;
    }
    window.clearTimeout(this.hideTimer);
    const id = data.schools.ids[i]!;
    if (this.ownHover !== id) {
      this.ownHover = id;
      useStore.getState().hoverUnit(id);
    }
    if (this.ui.tip?.index !== i) this.setUi({ tip: { index: i, ...this.project(i) } });
  };

  private onClick = (info: PickingInfo): boolean => {
    const data = this.data;
    const i = data ? this.pickedIndex(info) : -1;
    if (!data || i < 0) return false;
    const id = data.schools.ids[i]!;
    const store = useStore.getState();
    store.select({ kind: "school", id });
    store.openProfile(id);
    return true;
  };

  private releaseHover(): void {
    if (this.ownHover !== null && useStore.getState().hovered === this.ownHover) useStore.getState().hoverUnit(null);
    this.ownHover = null;
  }

  private scheduleHide(): void {
    if (!this.ui.tip || this.pointerInTip) return;
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      if (!this.pointerInTip) this.setUi({ tip: null });
    }, TOOLTIP_GRACE_MS);
  }

  private hideTip(): void {
    window.clearTimeout(this.hideTimer);
    this.pointerInTip = false;
    this.releaseHover();
    this.setUi({ tip: null });
  }

  /** NCESSCH of the pin under a map container pixel, or null (lets map click handlers skip drills under pins). */
  pinAt(x: number, y: number): string | null {
    if (!this.overlay || !this.data) return null;
    let info: PickingInfo | null;
    try {
      info = this.overlay.pickObject({ x, y, radius: 4, layerIds: PICKABLE_LAYERS });
    } catch {
      // deck.gl asserts when picking before its first frame has set up the picker; no pin is drawn yet.
      return null;
    }
    const i = info ? this.pickedIndex(info) : -1;
    return i < 0 ? null : (this.data.schools.ids[i] ?? null);
  }
}

/**
 * deck.gl 9.4's interleaved mode reads `map.transform` (height, near and far planes), which MapLibre 6 moved to
 * `map._camera.transform`. Exposes it under the old name when it is missing; a no-op on MapLibre versions that have it.
 */
export function ensureDeckTransform(map: MapLibreMap): void {
  const m = map as unknown as { transform?: unknown; _camera?: { transform?: unknown } };
  if (m.transform !== undefined || !m._camera) return;
  Object.defineProperty(map, "transform", { configurable: true, get: () => m._camera?.transform });
}

/** The basemap layer pins are inserted before: the start of its trailing label block (see pinBeforeId). */
export function pinsBeforeLayer(map: MapLibreMap): string | undefined {
  try {
    return pinBeforeId(map.getLayersOrder().map((id) => ({ id, type: map.getLayer(id)?.type ?? "" })));
  } catch {
    return undefined;
  }
}

let active: PinsController | null = null;

/** NCESSCH of the pin under a map container pixel, or null; M1's click-to-drill checks this before drilling. */
export function pinAt(x: number, y: number): string | null {
  return active?.pinAt(x, y) ?? null;
}

/** Mounts the pin overlay on the map from MapProvider once the map has loaded. Mounted once by App. */
export function usePins(): void {
  const { map, ready } = useMap();
  useEffect(() => {
    if (!map || !ready) return;
    const controller = new PinsController(map);
    active = controller;
    return () => {
      controller.destroy();
      if (active === controller) active = null;
    };
  }, [map, ready]);
}
