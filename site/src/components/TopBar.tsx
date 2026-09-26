import { Info, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store/useStore";
import { CommandBar } from "./CommandBar";
import { SearchBox } from "./SearchBox";

/** Top bar (SPEC.md 3.2): brand at left, command bar centered at 560 px, search, favorites, and About at right. */
export function TopBar() {
  const favoritesPanel = useStore((s) => s.favoritesPanel);
  const setFavoritesPanel = useStore((s) => s.setFavoritesPanel);
  const setAbout = useStore((s) => s.setAbout);

  return (
    <header
      data-testid="slot-top-bar"
      className="pointer-events-none absolute inset-x-0 top-4 z-20 grid h-14 grid-cols-[1fr_560px_1fr] items-center gap-4 px-4"
    >
      <div className="pointer-events-auto flex items-center gap-2 justify-self-start">
        <span aria-hidden className="size-2.5 rounded-full bg-accent-brand shadow-[0_0_12px_var(--accent)]" />
        <span className="text-title font-semibold tracking-tight text-text-1">Schoolscape</span>
      </div>
      <div className="glass pointer-events-auto p-1">
        <CommandBar />
      </div>
      <div className="pointer-events-auto flex items-center gap-2 justify-self-end">
        <div className="glass p-1">
          <SearchBox />
        </div>
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
