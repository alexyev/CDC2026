// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { Breadcrumb } from "@/components/Breadcrumb";
import { FirstRunHint } from "@/components/FirstRunHint";
import { InsightPanel } from "@/components/InsightPanel";
import { LayerDock } from "@/components/LayerDock";
import { LazyPanels } from "@/components/LazyPanels";
import { Legend } from "@/components/Legend";
import { Primer } from "@/components/Primer";
import { QuickJump } from "@/components/QuickJump";
import { StoryCard } from "@/components/StoryCard";
import { TopBar } from "@/components/TopBar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useNewDeploy } from "@/lib/deploy";
import { useUrlSync } from "@/lib/urlSync";
import { MapCanvas } from "@/map/MapCanvas";
import { MapProvider } from "@/map/MapProvider";
import { usePins } from "@/map/pins";
import type { CSSProperties } from "react";
import { useStore } from "@/store/useStore";

/** Hooks that need the map context. */
function MapEffects() {
  usePins();
  return null;
}

/** Where each panel waits while the landing covers the map, and when it settles in once the landing gives way. */
function shellPanel(from: string, delayMs: number) {
  return { "--shell-from": from, "--shell-delay": `${delayMs}ms` } as CSSProperties;
}

/**
 * The shell (SPEC.md 3.2): a full-bleed map with glass panels floating over it at 16 px margins.
 * Each panel lives in its own component file so wave-1 tasks replace files, not this layout.
 * While the primer's landing covers it (SPEC.md 3.15), the map waits blurred under it and the panels just off their
 * places; data-landing drives both transitions in globals.css.
 */
export function App() {
  useUrlSync();
  useNewDeploy();
  const landing = useStore((s) => s.guide === "primer");
  return (
    <TooltipProvider delayDuration={120}>
      <MapProvider>
        <main data-landing={landing || undefined} className="relative h-full w-full overflow-hidden bg-bg-0">
          <div className="shell-map absolute inset-0">
            <MapCanvas />
          </div>
          <MapEffects />
          <div className="shell-panel absolute inset-x-0 top-0 z-20" style={shellPanel("translateY(-12px)", 100)}>
            <TopBar />
          </div>

          <aside
            aria-label="Layers"
            className="shell-panel absolute top-[72px] left-4 z-10 w-[300px]"
            style={shellPanel("translateX(-24px)", 180)}
          >
            <LayerDock />
          </aside>

          <aside
            aria-label="Insight"
            className="shell-panel absolute top-[72px] right-4 z-10 w-[380px]"
            style={shellPanel("translateX(24px)", 180)}
          >
            <InsightPanel />
          </aside>

          {/* Centered in the gap between the layer dock and the insight panel (the map padding), never over either. */}
          <div className="pointer-events-none absolute top-[88px] right-[412px] left-[332px] z-10 flex justify-center [&>*]:pointer-events-auto">
            <FirstRunHint />
          </div>

          <nav
            aria-label="Place"
            className="shell-panel absolute bottom-4 left-4 z-10 flex items-end gap-2"
            style={shellPanel("translateY(16px)", 240)}
          >
            <Breadcrumb />
            <QuickJump />
          </nav>

          <div className="shell-panel absolute right-4 bottom-4 z-10" style={shellPanel("translateY(16px)", 240)}>
            <Legend />
          </div>

          <StoryCard />

          <LazyPanels />
          <Primer />
        </main>
      </MapProvider>
    </TooltipProvider>
  );
}
