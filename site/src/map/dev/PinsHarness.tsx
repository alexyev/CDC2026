// Components of the dev-only pins harness (see main.tsx).

import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { MapProvider } from "../MapProvider";
import { usePins } from "../pins";
import { useMap } from "../useMap";
import { runPanPerf } from "./harness";

// Vite pre-bundles maplibre-gl, which breaks the worker URL it derives from import.meta.url.
maplibregl.setWorkerUrl(workerUrl);

function HarnessMap() {
  const { registerMap } = useMap();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const { camera } = useStore.getState();
    const map = new maplibregl.Map({
      container: ref.current!,
      style: "https://tiles.openfreemap.org/styles/dark",
      center: [camera.lon, camera.lat],
      zoom: camera.zoom,
      attributionControl: { compact: true },
    });
    window.__pins.map = map;
    registerMap(map);
    return () => {
      registerMap(null);
      map.remove();
    };
  }, [registerMap]);
  // maplibre-gl.css sets `position: relative` on the map element and beats Tailwind's layered utilities, so the
  // absolute positioning lives on a wrapper.
  return (
    <div data-testid="map-container" className="absolute inset-0 bg-bg-0">
      <div ref={ref} className="h-full w-full" />
    </div>
  );
}

function Pins() {
  usePins();
  return null;
}

function Controls() {
  const { map } = useMap();
  const [zoom, setZoom] = useState(() => useStore.getState().camera.zoom);
  const layers = useStore((s) => s.layers);
  const display = useStore((s) => s.display);
  const favorites = useStore((s) => s.favorites);
  const onlyStarred = useStore((s) => s.showOnlyStarred);
  const [perf, setPerf] = useState("");
  useEffect(() => {
    if (!map) return;
    const onZoom = () => setZoom(map.getZoom());
    map.on("zoom", onZoom);
    return () => void map.off("zoom", onZoom);
  }, [map]);

  const button = "rounded-chip border border-border-strong px-2 py-1 text-left hover:bg-secondary";
  return (
    <div className="glass absolute top-4 left-4 z-10 flex w-[260px] flex-col gap-1.5 p-3 text-caption text-text-2">
      <div className="text-chip font-semibold text-text-1">Pins harness</div>
      <div className="tabular">
        z {zoom.toFixed(2)} · {layers.join(" × ") || "no layer"} · {display} · {favorites.length} starred
      </div>
      <button className={button} onClick={() => map?.jumpTo({ center: [-118.25, 34.05], zoom: 9 })}>
        Los Angeles z9
      </button>
      <button className={button} onClick={() => map?.jumpTo({ center: [-96.5, 38.5], zoom: 3.6 })}>
        Nation z3.6
      </button>
      <button
        className={button}
        onClick={() => useStore.setState({ layers: layers.length === 2 ? ["composite"] : ["composite", "education"] })}
      >
        Toggle bivariate (Composite × Education)
      </button>
      <button className={button} onClick={() => useStore.setState({ layers: ["crime"] })}>
        Crime (county-level, has no-data pins)
      </button>
      <button className={button} onClick={() => useStore.setState({ display: display === "score" ? "pct" : "score" })}>
        Display: {display}
      </button>
      <button
        className={button}
        onClick={() => useStore.setState({ showOnlyStarred: !onlyStarred })}
        aria-pressed={onlyStarred}
      >
        Show only starred: {onlyStarred ? "on" : "off"}
      </button>
      <button
        className={button}
        onClick={async () => {
          setPerf("running…");
          const r = await runPanPerf();
          setPerf(`${r.fps} fps · max ${r.maxMs} ms · p95 ${r.p95Ms} ms · ${r.frames} frames`);
        }}
      >
        Run 3 s pan
      </button>
      {perf && <div className="tabular text-text-1">{perf}</div>}
    </div>
  );
}

export function PinsHarness() {
  return (
    <MapProvider>
      <main className="relative h-full w-full overflow-hidden bg-bg-0">
        <HarnessMap />
        <Pins />
        <Controls />
      </main>
    </MapProvider>
  );
}
