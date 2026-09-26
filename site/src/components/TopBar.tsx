import { Info, Search, Sparkles, Star } from "lucide-react";
import { BASEMAP_COLORS } from "@/basemap/theme";
import { Button } from "@/components/ui/button";
import { COMMAND_SHORTCUT } from "@/lib/shortcut";
import { useStore } from "@/store/useStore";
import { CommandBar } from "./CommandBar";
import { MinimizeButton, Minimizable } from "./Minimizable";
import { SearchBox } from "./SearchBox";

/**
 * Top bar (SPEC.md 3.2): brand at left, command bar centered at 560 px, search, favorites, and About at right.
 * The command bar and search can be minimized to chips; favorites and About always stay.
 */
export function TopBar() {
  const favoritesPanel = useStore((s) => s.favoritesPanel);
  const setFavoritesPanel = useStore((s) => s.setFavoritesPanel);
  const setAbout = useStore((s) => s.setAbout);

  return (
    <header
      data-testid="slot-top-bar"
      className="pointer-events-none absolute inset-x-0 top-4 z-20 grid h-14 grid-cols-[1fr_560px_1fr] items-center gap-4 px-4"
    >
      {/* The brand sits on the basemap land color so it stays legible over light choropleth fills. */}
      <div
        className="pointer-events-auto flex h-[50px] items-center justify-self-start rounded-panel border border-border px-4 shadow-panel"
        style={{ backgroundColor: BASEMAP_COLORS.background }}
      >
        <span className="text-title font-semibold tracking-tight text-text-1">Schoolscape</span>
      </div>
      <Minimizable
        panel="command"
        corner="top-center"
        restoreLabel="Show Ask the map"
        className="min-w-0"
        chip={
          <>
            <Sparkles aria-hidden className="text-accent-brand" />
            Ask the map
            <kbd className="flex h-6 items-center rounded-chip border border-border-strong px-1.5 font-sans text-badge tracking-[0.06em] text-text-3">
              {COMMAND_SHORTCUT}
            </kbd>
          </>
        }
        chipClassName="pr-2.5 pl-4"
      >
        <div className="glass p-1">
          <CommandBar />
        </div>
      </Minimizable>
      <div className="pointer-events-auto flex items-center gap-2 justify-self-end">
        <Minimizable
          panel="search"
          corner="top-right"
          restoreLabel="Show search places"
          chip={<Search aria-hidden />}
          chipClassName="size-12 justify-center px-0"
        >
          <div className="glass flex items-center gap-0.5 p-1 pr-2">
            <SearchBox />
            <MinimizeButton panel="search" label="search" />
          </div>
        </Minimizable>
        <Button
          variant="ghost"
          size="icon"
          className="glass size-12 text-text-2 hover:text-text-1"
          aria-label="Favorites"
          aria-pressed={favoritesPanel}
          onClick={() => setFavoritesPanel(!favoritesPanel)}
        >
          <Star />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="glass size-12 text-text-2 hover:text-text-1"
          aria-label="About and data"
          onClick={() => setAbout(true)}
        >
          <Info />
        </Button>
      </div>
    </header>
  );
}
