// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import type { Map as MapLibreMap } from "maplibre-gl";
import { createContext } from "react";
import type { Level } from "@/lib/types";

export interface MapContextValue {
  /** The MapLibre instance once MapCanvas (M1) has created it. */
  map: MapLibreMap | null;
  /** True after the map's `load` event. */
  ready: boolean;
  /** Level for the current zoom (SPEC.md 3.3); updates only when the level changes, not on every zoom frame. */
  level: Level;
  /**
   * MapCanvas calls this with the new map right after constructing it, again with `ready` true from the `load`
   * handler it attached at construction (so the event is never missed), and with null on unmount.
   */
  registerMap: (map: MapLibreMap | null, ready?: boolean) => void;
}

export const MapContext = createContext<MapContextValue | null>(null);
