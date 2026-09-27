// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// Dev-only harness for the pin overlay (served by `npm run dev` at /dev/pins.html; not part of the build).
// It stands in for M1's MapCanvas with a plain OpenFreeMap dark map so pins can be checked and profiled alone.
// Query: the usual view parameters (v, l, d, fav, ...) plus `tile=1` to tile the 200-school fixture to 23,595 pins.
// window.__pins.runPanPerf() pans for 3 s at the current zoom and reports frame times (SPEC.md 10.1).

import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/styles/globals.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setupHarness } from "./harness";
import { PinsHarness } from "./PinsHarness";

await setupHarness();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PinsHarness />
  </StrictMode>,
);
