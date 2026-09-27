// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

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
  const setGuide = useStore((s) => s.setGuide);

  return (
    <header
      data-testid="slot-top-bar"
      className="pointer-events-none absolute inset-x-0 top-4 z-20 grid h-14 grid-cols-[1fr_560px_1fr] items-center gap-4 px-4"
    >
      {/* The brand sits on the basemap land color so it stays legible over light choropleth fills. It opens the
          landing page (SPEC.md 3.15), the same way About's "How to read the map" does. */}
      <button
        type="button"
        aria-label="Schoolscape - about this map"
        data-testid="brand"
        onClick={() => setGuide("primer")}
        className="pointer-events-auto relative flex h-[50px] cursor-pointer items-center justify-self-start rounded-panel border border-border px-4 shadow-panel transition-colors duration-(--dur-hover) ease-ui after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-white/0 after:transition-colors after:duration-(--dur-hover) hover:border-border-strong hover:after:bg-white/[0.04] focus-visible:shadow-[var(--focus-ring)]"
        style={{ backgroundColor: BASEMAP_COLORS.background }}
      >
        <span className="text-title font-semibold tracking-tight text-text-1">Schoolscape</span>
      </button>
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
