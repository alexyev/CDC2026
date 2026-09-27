// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles/globals.css";

import { Analytics } from "@vercel/analytics/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { holdUntilFirstPaint } from "./lib/firstPaint";
import { initialGuide, takeLandingAfterReload } from "./lib/guide";
import { decodeView } from "./lib/urlCodec";
import { useStore } from "./store/useStore";

// The URL is the initial view state (SPEC.md 3.10); U8's useUrlSync keeps them in step afterwards.
useStore.getState().setView(decodeView(window.location.search));
// Counties, schools, and search wait for the state fills to be on screen (SPEC.md 10.1).
holdUntilFirstPaint();
// A bare URL opens on the primer; a shared view goes straight to the map (SPEC.md 3.15).
useStore.getState().setGuide(initialGuide(window.location.search, takeLandingAfterReload()));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    {/* One page view per visit: a fixed route turns off the script's history tracking, so the view state that
        pan, zoom, and selection write into the query string never counts as a new page (README.md). */}
    {__VERCEL_ANALYTICS__ && <Analytics route="/" path="/" />}
  </StrictMode>,
);
