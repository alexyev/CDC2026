import { AboutDialog } from "@/components/AboutDialog";
import { Breadcrumb } from "@/components/Breadcrumb";
import { FavoritesPanel } from "@/components/FavoritesPanel";
import { FirstRunHint } from "@/components/FirstRunHint";
import { InsightPanel } from "@/components/InsightPanel";
import { LayerDock } from "@/components/LayerDock";
import { Legend } from "@/components/Legend";
import { ProfileDrawer } from "@/components/ProfileDrawer";
import { QuickJump } from "@/components/QuickJump";
import { TopBar } from "@/components/TopBar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUrlSync } from "@/lib/urlSync";
import { MapCanvas } from "@/map/MapCanvas";
import { MapProvider } from "@/map/MapProvider";
import { usePins } from "@/map/pins";

/** Hooks that need the map context. */
function MapEffects() {
  usePins();
  return null;
}

/**
 * The shell (SPEC.md 3.2): a full-bleed map with glass panels floating over it at 16 px margins.
 * Each panel lives in its own component file so wave-1 tasks replace files, not this layout.
 */
export function App() {
  useUrlSync();
  return (
    <TooltipProvider delayDuration={120}>
      <MapProvider>
        <main className="relative h-full w-full overflow-hidden bg-bg-0">
          <MapCanvas />
          <MapEffects />
          <TopBar />

          <aside aria-label="Layers" className="absolute top-[72px] left-4 z-10 w-[300px]">
            <LayerDock />
          </aside>

          <aside aria-label="Insight" className="absolute top-[72px] right-4 z-10 w-[380px]">
            <InsightPanel />
          </aside>

          <div className="pointer-events-none absolute top-[88px] left-1/2 z-10 -translate-x-1/2 [&>*]:pointer-events-auto">
            <FirstRunHint />
          </div>

          <nav aria-label="Place" className="absolute bottom-4 left-4 z-10 flex items-end gap-2">
            <Breadcrumb />
            <QuickJump />
          </nav>

          <div className="absolute right-4 bottom-4 z-10">
            <Legend />
          </div>

          <ProfileDrawer />
          <FavoritesPanel />
          <AboutDialog />
        </main>
      </MapProvider>
    </TooltipProvider>
  );
}
