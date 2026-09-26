import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "@/store/useStore";
import { levelForZoom } from "./levels";
import { MapContext, type MapContextValue } from "./mapContext";

/** Holds the map instance, its `ready` flag, and the current level for every component under it. */
export function MapProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const storeZoom = useStore((s) => s.camera.zoom);
  const [mapLevel, setMapLevel] = useState(() => levelForZoom(storeZoom));

  useEffect(() => {
    if (!map) return;
    const onLoad = () => setReady(true);
    const onZoom = () => setMapLevel(levelForZoom(map.getZoom()));
    if (map.loaded()) onLoad();
    onZoom();
    map.on("load", onLoad);
    map.on("zoom", onZoom);
    return () => {
      map.off("load", onLoad);
      map.off("zoom", onZoom);
      setReady(false);
    };
  }, [map]);

  // Before the map exists, the level follows the store camera (e.g. decoded from the URL).
  const level = map ? mapLevel : levelForZoom(storeZoom);

  const value = useMemo<MapContextValue>(() => ({ map, ready, level, registerMap: setMap }), [map, ready, level]);
  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}
