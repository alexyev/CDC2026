import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "@/store/useStore";
import { levelForZoom } from "./levels";
import { MapContext, type MapContextValue } from "./mapContext";

/** Holds the map instance, its `ready` flag, and the current level for every component under it. */
export function MapProvider({ children }: { children: ReactNode }) {
  const [{ map, ready }, setRegistered] = useState<{ map: MapLibreMap | null; ready: boolean }>({
    map: null,
    ready: false,
  });
  const registerMap = useCallback(
    (m: MapLibreMap | null, isReady = false) => setRegistered({ map: m, ready: isReady }),
    [],
  );
  const storeZoom = useStore((s) => s.camera.zoom);
  const [mapLevel, setMapLevel] = useState(() => levelForZoom(storeZoom));

  useEffect(() => {
    if (!map) return;
    const onZoom = () => setMapLevel(levelForZoom(map.getZoom()));
    onZoom();
    map.on("zoom", onZoom);
    return () => {
      map.off("zoom", onZoom);
    };
  }, [map]);

  // Before the map exists, the level follows the store camera (e.g. decoded from the URL).
  const level = map ? mapLevel : levelForZoom(storeZoom);

  const value = useMemo<MapContextValue>(() => ({ map, ready, level, registerMap }), [map, ready, level, registerMap]);
  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}
