// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Data and profiling helpers for the dev-only pins harness (see main.tsx).

import type * as maplibregl from "maplibre-gl";
import { cached } from "@/lib/dataCache";
import type { SchoolsFile } from "@/lib/dataTypes";
import { dataPath } from "@/lib/loaders";
import "@/lib/favorites";
import { decodeView } from "@/lib/urlCodec";
import { useStore } from "@/store/useStore";

const TILED_COUNT = 23_595;

/** Tiles the fixture into a dense grid around each school, drawing values from other schools for variety. */
export function tileSchools(src: SchoolsFile, count: number): SchoolsFile {
  const n = src.ids.length;
  const out: SchoolsFile = {
    ids: [],
    name: [],
    district: [],
    st: [],
    stfp: [],
    county: [],
    countyName: [],
    city: [],
    zip: [],
    sab: [],
    lat: [],
    lon: [],
    flags: [],
    values: Object.fromEntries(Object.keys(src.values).map((k) => [k, []])),
  };
  const side = Math.ceil(Math.sqrt(Math.ceil(count / n)));
  for (let t = 0; t < count; t++) {
    const i = t % n;
    const k = Math.floor(t / n);
    const v = (i * 7 + k * 13) % n;
    // Copies get synthetic 12-digit ids so U7's favorites accept them like real NCESSCH ids.
    out.ids.push(k === 0 ? src.ids[i]! : String(900_000_000_000 + t));
    for (const key of ["name", "district", "st", "stfp", "county", "countyName", "city", "zip"] as const) {
      out[key].push(src[key][i]!);
    }
    out.sab.push(src.sab[i]!);
    out.flags.push(src.flags[i]!);
    out.lat.push(src.lat[i]! + (Math.floor(k / side) - side / 2) * 0.025);
    out.lon.push(src.lon[i]! + ((k % side) - side / 2) * 0.03);
    for (const key of Object.keys(src.values)) out.values[key]!.push(src.values[key]![v]!);
  }
  return out;
}

export async function runPanPerf(ms = 3000): Promise<{ frames: number; maxMs: number; p95Ms: number; fps: number }> {
  const map = window.__pins.map!;
  const start = map.getCenter();
  const deltas: number[] = [];
  return new Promise((resolve) => {
    const t0 = performance.now();
    let last = t0;
    const step = (now: number) => {
      deltas.push(now - last);
      last = now;
      const t = (now - t0) / ms;
      // A figure-eight around the start so the pan covers dense and empty areas at a steady speed.
      map.jumpTo({
        center: [start.lng + 0.6 * Math.sin(t * 2 * Math.PI), start.lat + 0.3 * Math.sin(t * 4 * Math.PI)],
      });
      if (now - t0 < ms) requestAnimationFrame(step);
      else {
        map.jumpTo({ center: start });
        const sorted = deltas.slice(1).sort((a, b) => a - b);
        resolve({
          frames: sorted.length,
          maxMs: Math.round(sorted.at(-1)! * 10) / 10,
          p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)]! * 10) / 10,
          fps: Math.round((sorted.length / (now - t0)) * 1000 * 10) / 10,
        });
      }
    };
    requestAnimationFrame((now) => {
      last = now;
      requestAnimationFrame(step);
    });
  });
}

declare global {
  interface Window {
    __pins: { map: maplibregl.Map | null; runPanPerf: typeof runPanPerf; store: typeof useStore };
  }
}

/** Decodes the URL into the store, installs the U5/U7 stand-ins, and seeds the tiled schools when asked. */
export async function setupHarness(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  useStore.getState().setView(decodeView(window.location.search));
  // Stand-in for the profile actions until I1 wires U5's drawer, so a pin click shows its selected ring here.
  useStore.setState({
    openProfile: (profile) => useStore.setState({ profile }),
    closeProfile: () => useStore.setState({ profile: undefined }),
  });
  if (params.get("tile") === "1") {
    const fixture = (await import("@/test/fixtures/schools/all.json")).default as SchoolsFile;
    await cached(dataPath("schools"), async () => tileSchools(fixture, TILED_COUNT));
  }
  window.__pins = { map: null, runPanPerf, store: useStore };
}
